import { motion } from 'framer-motion';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import './Learn.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

type LearningMode = 'audio' | 'image' | 'icons' | 'gesture' | 'simple';
type GestureType = 'open' | 'fist' | 'point' | 'wave' | '1' | '2' | '3' | '4' | 'thumbsUp' | 'thumbsDown' | 'pointLeft' | 'pointRight' | '-';

interface ModeStats {
  time: number;
  interactions: number;
  frustration: number;
  accuracy: number;
  responseTime: number[];
  attempts: number;
  successes: number;
}

export function Learn() {
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [savingReport, setSavingReport] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const saveInProgressRef = useRef(false); // Prevent duplicate saves
  
  // MediaPipe Hands and Webcam states
  const [mpStatus, setMpStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [detectStatus, setDetectStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [gesture, setGesture] = useState<GestureType>('-');
  const [gestureConfidence, setGestureConfidence] = useState(0);
  
  // Gesture state machine
  type GestureState = 'IDLE' | 'DETECTING' | 'CONFIRMED' | 'COOLDOWN';
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [lastConfirmedGesture, setLastConfirmedGesture] = useState<GestureType>('-');
  const [cooldownEndTime, setCooldownEndTime] = useState<number>(0);
  const [gestureDetectionEnabled, setGestureDetectionEnabled] = useState<boolean>(true);
  
  // Session tracking
  const [currentMode, setCurrentMode] = useState<LearningMode>('audio');
  const [modeStart, setModeStart] = useState<number>(Date.now());
  const [attempts, setAttempts] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [helpCount, setHelpCount] = useState(0);
  const [sessionOver, setSessionOver] = useState(false);
  
  // Adaptive learning features
  const [difficulty, setDifficulty] = useState<number>(1); // 1-5 scale (1=simplest, 5=most complex)
  const [autoSwitched, setAutoSwitched] = useState<boolean>(false); // Track if auto-switch happened
  const [_persistentProfile, setPersistentProfile] = useState<any>(null); // Loaded from Firestore (prefixed with _ to avoid unused warning)
  const [switchReason, setSwitchReason] = useState<string | null>(null); // Track reason for mode switch
  const [showSwitchTooltip, setShowSwitchTooltip] = useState<boolean>(false); // Show "Why am I seeing this?" tooltip
  
  // Math question content
  const question = {
    text: 'A teacher has 12 stickers and wants to share them evenly among 3 students. How many stickers will each student get?',
    answers: [
      { letter: 'A', value: '3' },
      { letter: 'B', value: '4' },
      { letter: 'C', value: '5' },
      { letter: 'D', value: '6' }
    ],
    correctAnswer: 'B' // 12 / 3 = 4
  };
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  
  // Simple content for audio/text modes - always the question text
  const content = question.text;
  
  // Mode statistics tracking
  const [modeStats, setModeStats] = useState<Record<LearningMode, ModeStats>>({
    audio: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    image: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    icons: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    gesture: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    simple: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 }
  });
  
  // Current question tracking for check-ins
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInQuestion, setCheckInQuestion] = useState('');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.4 }
    }
  };

  // Load persistent learning profile from Firestore
  useEffect(() => {
    async function loadPersistentProfile() {
      if (!currentUser) return;
      
      try {
        const profileDoc = await getDoc(doc(db, 'users', currentUser.uid, 'learningProfile', 'current'));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setPersistentProfile(profileData);
          
          // Initialize difficulty based on historical performance
          if (profileData.averageAccuracy !== undefined) {
            if (profileData.averageAccuracy >= 80) {
              setDifficulty(Math.min(5, (profileData.averageDifficulty || 1) + 1)); // Increase difficulty if doing well
            } else if (profileData.averageAccuracy < 50) {
              setDifficulty(Math.max(1, (profileData.averageDifficulty || 3) - 1)); // Decrease difficulty if struggling
            } else {
              setDifficulty(profileData.averageDifficulty || 3); // Maintain current difficulty
            }
          } else {
            setDifficulty(profileData.averageDifficulty || 1); // Start at easiest
          }
        } else {
          // First time user - start at easiest difficulty
          setDifficulty(1);
        }
        } catch (error) {
        console.error('Error loading persistent profile:', error);
        // Default to easiest difficulty on error
        setDifficulty(1);
      }
    }
    
    loadPersistentProfile();
  }, [currentUser]);

  // Content is now the question text, no need to update based on difficulty

  function goBack() {
    setNavigating(true);
    navigate('/home');
  }

  function resetGestureDetector() {
    setGesture('-');
    setGestureConfidence(0);
    setDetectStatus('idle');
    setGestureState('IDLE');
    setLastConfirmedGesture('-');
    setErrorMessage('');
    // Reinitialize MediaPipe Hands
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    setMpStatus('idle');
    setMediaReady(false);
    setTimeout(() => {
      setMediaReady(true);
    }, 100);
  }

  function toggleGestureDetection() {
    setGestureDetectionEnabled(!gestureDetectionEnabled);
    if (gestureDetectionEnabled) {
      // Stop detection
      setGesture('-');
      setGestureConfidence(0);
      setGestureState('IDLE');
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    } else {
      // Resume detection
      if (handsRef.current && webcamRef.current?.video) {
        const camera = new Camera(webcamRef.current.video, {
          onFrame: async () => {
            if (handsRef.current && webcamRef.current?.video) {
              await handsRef.current.send({ image: webcamRef.current.video });
            }
          },
          width: 640,
          height: 480
        });
        cameraRef.current = camera;
        camera.start();
      }
    }
  }

  // Smooth gesture detection using history buffer
  function getSmoothedGesture(history: Array<{ gesture: GestureType; confidence: number; time: number }>): { gesture: GestureType; confidence: number } {
    if (history.length === 0) return { gesture: '-', confidence: 0 };
    
    // Group by gesture type and calculate weighted confidence
    const gestureGroups: Record<string, { count: number; totalConfidence: number }> = {};
    
    for (const entry of history) {
      if (entry.gesture === '-') continue;
      
      const key = entry.gesture;
      if (!gestureGroups[key]) {
        gestureGroups[key] = { count: 0, totalConfidence: 0 };
      }
      gestureGroups[key].count++;
      gestureGroups[key].totalConfidence += entry.confidence;
    }
    
    // Find the most common gesture with highest confidence
    let bestGesture: GestureType = '-';
    let bestScore = 0;
    
    for (const [gesture, data] of Object.entries(gestureGroups)) {
      const avgConfidence = data.totalConfidence / data.count;
      const score = data.count * avgConfidence; // Weight by both frequency and confidence
      
      if (score > bestScore) {
        bestScore = score;
        bestGesture = gesture as GestureType;
      }
    }
    
    // Calculate final confidence
    if (bestGesture !== '-' && gestureGroups[bestGesture]) {
      const avgConfidence = gestureGroups[bestGesture].totalConfidence / gestureGroups[bestGesture].count;
      const frequencyBoost = (gestureGroups[bestGesture].count / history.length) * 10;
      return { gesture: bestGesture, confidence: Math.min(95, avgConfidence + frequencyBoost) };
    }
    
    return { gesture: bestGesture, confidence: 0 };
  }

  // Improved finger extension detection using distance and angle
  function isFingerExtended(tip: any, pip: any, mcp: any): boolean {
    // Method 1: Y-coordinate check (simple vertical) - finger tip must be clearly above PIP
    // Use stricter threshold - tip must be at least 0.02 units above PIP
    const verticalCheck = tip.y < pip.y - 0.02;
    
    // Method 2: Distance from MCP (more robust)
    const distFromMcp = Math.sqrt(
      Math.pow(tip.x - mcp.x, 2) + Math.pow(tip.y - mcp.y, 2)
    );
    const pipDistFromMcp = Math.sqrt(
      Math.pow(pip.x - mcp.x, 2) + Math.pow(pip.y - mcp.y, 2)
    );
    // Require tip to be at least 15% further from MCP than PIP (much stricter)
    const distanceCheck = distFromMcp > pipDistFromMcp * 1.15;
    
    // Method 3: Angle check (tip should be significantly further out from MCP than PIP)
    const angleCheck = distFromMcp > pipDistFromMcp * 1.2; // Require 20% more distance
    
    // Require ALL 3 checks to pass for finger to be considered extended (much stricter)
    // This prevents false positives where fingers appear extended when they're actually closed
    return verticalCheck && distanceCheck && angleCheck;
  }

  // Helper function to check if a single hand shows thumbs down
  function isThumbsDown(landmarks: any[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;
    
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const wrist = landmarks[0];
    
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const indexMcp = landmarks[5];
    
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const middleMcp = landmarks[9];
    
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const ringMcp = landmarks[13];
    
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const pinkyMcp = landmarks[17];
    
    // CRITICAL: Check if fingers are extended using the robust method
    // If 3 or 4 fingers are extended, this is NOT a thumbs down (it's a number gesture)
    const indexExtended = isFingerExtended(indexTip, indexPip, indexMcp);
    const middleExtended = isFingerExtended(middleTip, middlePip, middleMcp);
    const ringExtended = isFingerExtended(ringTip, ringPip, ringMcp);
    const pinkyExtended = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp);
    
    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;
    
    // STRICT: If 2 or more fingers are extended, this is definitely not a thumbs down
    // This prevents confusion with 4-finger gesture
    if (extendedCount >= 2) {
      return false; // Too many fingers extended - this is a number gesture, not thumbs down
    }
    
    // More lenient finger extension detection for thumbs down
    // Use simpler check: finger tip should be below or near PIP joint
    const isFingerClosed = (tip: any, pip: any) => {
      // Finger is closed if tip is at or below PIP joint (with some tolerance)
      return tip.y >= pip.y - 0.01; // Allow small tolerance
    };
    
    const indexClosed = isFingerClosed(indexTip, indexPip);
    const middleClosed = isFingerClosed(middleTip, middlePip);
    const ringClosed = isFingerClosed(ringTip, ringPip);
    const pinkyClosed = isFingerClosed(pinkyTip, pinkyPip);
    
    // All fingers should be closed (strict requirement for thumbs down)
    if (!indexClosed || !middleClosed || !ringClosed || !pinkyClosed) {
      return false; // At least one finger is extended
    }
    
    // Thumb must be extended downward (below IP joint)
    const thumbDownVertical = thumbTip.y > thumbIp.y;
    
    // Thumb should be clearly below the thumb IP
    const thumbDownDistance = thumbTip.y - thumbIp.y > 0.015;
    
    // Thumb should be relatively close to hand
    const thumbCloseToHand = Math.abs(thumbTip.x - thumbIp.x) < 0.15;
    
    // Additional check: thumb should be below wrist (for clearer thumbs down)
    const thumbBelowWrist = thumbTip.y > wrist.y - 0.05;
    
    // Require ALL checks to pass for thumbs down (strict to avoid false positives)
    return thumbDownVertical && thumbDownDistance && thumbCloseToHand && thumbBelowWrist;
  }

  // Classify gesture from hand landmarks
  function classifyGestureFromLandmarks(allLandmarks: any[] | any): { gesture: GestureType; confidence: number } {
    // Handle both single hand (backward compatibility) and multiple hands
    const landmarksArray = Array.isArray(allLandmarks) && allLandmarks.length > 0 && Array.isArray(allLandmarks[0]) 
      ? allLandmarks as any[][]  // Multiple hands
      : [allLandmarks as any[]]; // Single hand (convert to array for consistency)
    
    // CRITICAL: Check for two thumbs down FIRST when 2+ hands are detected
    // This must happen BEFORE checking for number gestures to avoid confusion
    if (landmarksArray.length >= 2) {
      console.log(`🔍 Detected ${landmarksArray.length} hands - checking for two thumbs down FIRST`);
      
      let thumbsDownCount = 0;
      let totalHands = landmarksArray.length;
      
      // Check each hand for thumbs down
      for (let i = 0; i < landmarksArray.length; i++) {
        const isDown = isThumbsDown(landmarksArray[i]);
        console.log(`  Hand ${i + 1}: ${isDown ? 'Thumbs Down' : 'Other gesture'}`);
        if (isDown) {
          thumbsDownCount++;
        }
      }
      
      // If 2 or more hands show thumbs down, prioritize this over any number gesture
      // This ensures "two thumbs down" is never confused with "4 fingers" from two hands
      if (thumbsDownCount >= 2) {
        console.log(`✅ Two thumbs down detected! (${thumbsDownCount}/${totalHands} hands) - PRIORITY`);
        const confidence = totalHands === 2 && thumbsDownCount === 2 ? 95 : Math.min(90, 80 + (thumbsDownCount / totalHands) * 10);
        return { gesture: 'thumbsDown', confidence };
      }
      
      // If we detected 2+ hands but not two thumbs down, we should NOT process as number gesture
      // Number gestures (1-4) are SINGLE HAND gestures only
      console.log(`  ⚠️ ${totalHands} hands detected but not two thumbs down - will check single hand gestures only`);
    }
    
    // Process single hand gestures (use first hand if multiple detected)
    const landmarks = landmarksArray[0];
    if (!landmarks || landmarks.length < 21) {
      return { gesture: '-', confidence: 0 };
    }

    // Get key points with MCP joints for better detection
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const indexMcp = landmarks[5];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const middleMcp = landmarks[9];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const ringMcp = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const pinkyMcp = landmarks[17];

    // Improved finger extension detection
    const indexExtended = isFingerExtended(indexTip, indexPip, indexMcp);
    const middleExtended = isFingerExtended(middleTip, middlePip, middleMcp);
    const ringExtended = isFingerExtended(ringTip, ringPip, ringMcp);
    const pinkyExtended = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp);

    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;
    
    // Debug logging to help diagnose detection issues
    if (extendedCount > 0) {
      console.log(`🔍 Finger extension check: ${extendedCount} fingers (index:${indexExtended}, middle:${middleExtended}, ring:${ringExtended}, pinky:${pinkyExtended})`);
    }
    
    // Improved thumb detection
    const thumbExtendedUp = thumbTip.y < thumbIp.y;
    const thumbExtendedDown = thumbTip.y > thumbIp.y && (thumbTip.y - thumbIp.y) > 0.02;
    const thumbHorizontal = Math.abs(thumbTip.x - thumbIp.x) > Math.abs(thumbTip.y - thumbIp.y);
    
    // Thumbs up: thumb extended upward, other fingers closed (single hand)
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended && 
        thumbExtendedUp && !thumbHorizontal && !thumbExtendedDown) {
      // Calculate confidence based on how clear the gesture is
      const thumbAngle = Math.abs(thumbTip.x - thumbIp.x);
      const confidence = Math.min(95, 75 + (1 - thumbAngle * 5) * 20);
      return { gesture: 'thumbsUp', confidence: Math.max(80, confidence) };
    }
    
    // Open hand: all 4 fingers extended AND thumb extended (5 digits total) - check BEFORE number gestures
    if (extendedCount === 4 && indexExtended && middleExtended && ringExtended && pinkyExtended && 
        thumbExtendedUp && !thumbHorizontal && !thumbExtendedDown) {
      console.log(`✅ Open hand detected (all 5 digits extended)`);
      return { gesture: 'open', confidence: 90 };
    }
    
    // Number gestures (1-4 fingers extended) - SINGLE HAND ONLY
    // CRITICAL: These gestures refer to ONE hand with 1-4 fingers extended, NOT combined across hands
    // This ensures "4 fingers" means one hand with 4 fingers, not two hands with 2 fingers each
    // IMPORTANT: Only check number gestures if thumb is NOT down (thumbs down is checked earlier)
    // and if we have at least 1 finger extended (to avoid false positives)
    if (!thumbExtendedDown && (thumbHorizontal || !thumbExtendedUp)) {
      // Debug: Log finger states
      console.log(`🔍 Checking number gestures - extendedCount: ${extendedCount}, fingers: [index:${indexExtended}, middle:${middleExtended}, ring:${ringExtended}, pinky:${pinkyExtended}]`);
      
      // Verify fingers are extended in sequence on THIS SINGLE HAND (for better accuracy)
      // Each check must verify the exact pattern - strict matching
      if (extendedCount === 1 && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        console.log(`✅ Single hand: 1 finger detected (index extended)`);
        return { gesture: '1', confidence: 90 };
      }
      
      if (extendedCount === 2 && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
        console.log(`✅ Single hand: 2 fingers detected (index + middle extended)`);
        return { gesture: '2', confidence: 90 };
      }
      
      if (extendedCount === 3 && indexExtended && middleExtended && ringExtended && !pinkyExtended) {
        console.log(`✅ Single hand: 3 fingers detected (index + middle + ring extended)`);
        return { gesture: '3', confidence: 90 };
      }
      
      if (extendedCount === 4 && indexExtended && middleExtended && ringExtended && pinkyExtended) {
        console.log(`✅ Single hand: 4 fingers detected (all 4 fingers extended)`);
        return { gesture: '4', confidence: 90 };
      }
      
      // If extendedCount > 0 but doesn't match patterns, log for debugging
      if (extendedCount > 0 && extendedCount <= 4) {
        console.log(`⚠️ Extended count doesn't match pattern: ${extendedCount} (index:${indexExtended}, middle:${middleExtended}, ring:${ringExtended}, pinky:${pinkyExtended})`);
      }
    }
    
    // Pointer finger pointing left/right (only index extended, pointing horizontally)
    // Only check this if we haven't already detected it as a number gesture
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended && extendedCount === 1) {
      // More robust horizontal detection - only if clearly horizontal
      const indexDirection = indexTip.x - indexMcp.x;
      const indexVertical = Math.abs(indexTip.y - indexPip.y);
      const indexHorizontal = Math.abs(indexDirection);
      
      // Check if pointing horizontally (horizontal movement must be clearly greater than vertical)
      // Use stricter threshold to avoid catching vertical pointing
      if (indexHorizontal > indexVertical * 2.0 && indexHorizontal > 0.05) {
        // Check if pointing left or right relative to MCP (wrist reference)
        if (indexDirection < -0.05) {
          return { gesture: 'pointLeft', confidence: 85 };
        } else if (indexDirection > 0.05) {
          return { gesture: 'pointRight', confidence: 85 };
        }
      }
      // If not clearly horizontal, fall through to return nothing (should have been caught by number gesture above)
    }
    
    // Legacy gestures (for backward compatibility)
    if (extendedCount === 0 && !thumbExtendedUp && !thumbExtendedDown) {
      // No fingers extended = fist
      return { gesture: 'fist', confidence: 85 };
    } else if (extendedCount >= 2 && extendedCount <= 3) {
      // Partially open = could be wave
      const handMoving = Math.abs(thumbTip.x - thumbIp.x) > 0.15;
      if (handMoving) {
        return { gesture: 'wave', confidence: 70 };
      }
    }

    return { gesture: '-', confidence: 0 };
  }

  const changeModeRef = useRef(currentMode);
  const modeStartRef = useRef(modeStart);
  
  useEffect(() => {
    changeModeRef.current = currentMode;
    modeStartRef.current = modeStart;
  }, [currentMode, modeStart]);

  const changeMode = useCallback((m: LearningMode) => {
    const now = Date.now();
    const prev = changeModeRef.current;
    const prevStart = modeStartRef.current;
    setModeStats((s) => ({
      ...s,
      [prev]: {
        ...s[prev],
        time: s[prev].time + (now - prevStart)
      }
    }));
    setCurrentMode(m);
    setModeStart(now);
    
    // Auto-play audio when switching to audio mode
    if (m === 'audio') {
      setTimeout(() => speakText(content), 300);
  }
  }, []);

  function speakText(t: string) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.rate = 0.9;
      u.pitch = 1;
      u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) {
      console.error('Speech synthesis error:', e);
    }
  }

  // Adaptive difficulty adjustment based on performance
  useEffect(() => {
    if (attempts < 3) return; // Need minimum attempts to assess
    
    const currentAccuracy = attempts > 0 ? (successes / attempts) * 100 : 0;
    const avgResponseTime = modeStats[currentMode].responseTime.length > 0
      ? modeStats[currentMode].responseTime.reduce((a, b) => a + b, 0) / modeStats[currentMode].responseTime.length
      : 0;
    
    // Increase difficulty if accuracy is high and response time is fast
    if (currentAccuracy >= 80 && avgResponseTime < 3000 && difficulty < 5) {
      setDifficulty((prev) => {
        const newDiff = Math.min(5, prev + 0.5);
        console.log(`🎯 Increasing difficulty to ${newDiff} (accuracy: ${currentAccuracy.toFixed(1)}%, response time: ${avgResponseTime.toFixed(0)}ms)`);
        return newDiff;
      });
    }
    // Decrease difficulty if accuracy is low or frustration is high
    else if ((currentAccuracy < 50 || modeStats[currentMode].frustration > 3) && difficulty > 1) {
      setDifficulty((prev) => {
        const newDiff = Math.max(1, prev - 0.5);
        console.log(`📉 Decreasing difficulty to ${newDiff} (accuracy: ${currentAccuracy.toFixed(1)}%, frustration: ${modeStats[currentMode].frustration})`);
        return newDiff;
      });
    }
  }, [successes, attempts, modeStats, currentMode, difficulty]);

  // Auto mode switching based on frustration
  useEffect(() => {
    const currentFrustration = modeStats[currentMode].frustration;
    const currentInteractions = modeStats[currentMode].interactions;
    
    // If frustration spikes in Audio mode (2+ help requests in short time), auto-switch to Icons or Simple
    if (currentMode === 'audio' && currentFrustration >= 2 && currentInteractions >= 3 && !autoSwitched) {
      // Choose between Icons and Simple based on which has lower frustration historically
      const iconsFrustration = modeStats.icons.frustration;
      const simpleFrustration = modeStats.simple.frustration;
      
      const targetMode = simpleFrustration < iconsFrustration ? 'simple' : 'icons';
      const reason = `We switched to ${targetMode === 'icons' ? 'Icons' : 'Simple'} Mode because you asked for help ${currentFrustration} time${currentFrustration > 1 ? 's' : ''}.`;
      
      console.log(`🔄 Auto-switching from Audio to ${targetMode} due to high frustration (${currentFrustration})`);
      changeMode(targetMode);
      setAutoSwitched(true);
      setSwitchReason(reason);
      setShowSwitchTooltip(true);
      speakText(`Switching to ${targetMode} mode to help you learn better.`);
      
      // Hide tooltip after 10 seconds, reset auto-switch flag after 30 seconds
      setTimeout(() => setShowSwitchTooltip(false), 10000);
      setTimeout(() => {
        setAutoSwitched(false);
        setSwitchReason(null);
      }, 30000);
    }
  }, [modeStats, currentMode, autoSwitched]);

  const recordSuccess = useCallback(() => {
    const now = Date.now();
    const responseTime = now - modeStart;
    setAttempts((a) => a + 1);
    setSuccesses((s) => s + 1);
    setModeStats((ms) => {
      const updated = {
        ...ms,
        [currentMode]: {
          ...ms[currentMode],
          interactions: ms[currentMode].interactions + 1,
          attempts: ms[currentMode].attempts + 1,
          successes: ms[currentMode].successes + 1,
          responseTime: [...ms[currentMode].responseTime, responseTime]
        }
      };
      // Derive accuracy from successes/attempts, don't store incrementally
      updated[currentMode].accuracy = updated[currentMode].attempts > 0
        ? (updated[currentMode].successes / updated[currentMode].attempts) * 100
        : 0;
      return updated;
    });
    showCheckInAfterDelay();
  }, [currentMode, modeStart]);

  const recordHelp = useCallback(() => {
    setHelpCount((h) => h + 1);
    setModeStats((ms) => ({
      ...ms,
      [currentMode]: {
        ...ms[currentMode],
        frustration: ms[currentMode].frustration + 1,
        interactions: ms[currentMode].interactions + 1
      }
    }));
  }, [currentMode]);

  const nextItem = useCallback(() => {
    const now = Date.now();
    const responseTime = now - modeStart;
    setAttempts((a) => a + 1);
    setModeStats((ms) => {
      const updated = {
        ...ms,
        [currentMode]: {
          ...ms[currentMode],
          interactions: ms[currentMode].interactions + 1,
          attempts: ms[currentMode].attempts + 1,
          responseTime: [...ms[currentMode].responseTime, responseTime]
        }
      };
      // Derive accuracy from successes/attempts
      updated[currentMode].accuracy = updated[currentMode].attempts > 0
        ? (updated[currentMode].successes / updated[currentMode].attempts) * 100
        : 0;
      return updated;
    });
  }, [currentMode, modeStart]);

  // Handle answer selection
  const handleAnswerSelection = useCallback((answer: string) => {
    setSelectedAnswer(answer);
    const isCorrect = answer === question.correctAnswer;
    
    if (isCorrect) {
      recordSuccess();
      setAnswerFeedback('✅ Correct! Great job!');
      speakText('Correct! Great job!');
      
      // Clear feedback after 5 seconds
      setTimeout(() => {
        setAnswerFeedback(null);
        setSelectedAnswer(null);
      }, 5000);
    } else {
      // Wrong answer - alert and encourage to try again
      setAttempts((a) => a + 1);
      setAnswerFeedback(`❌ Not quite. Try again!`);
      alert('Try again! You can do it!');
      speakText('Try again! You can do it!');
      
      // Update mode stats
      setModeStats((ms) => {
        const updated = {
          ...ms,
          [currentMode]: {
            ...ms[currentMode],
            interactions: ms[currentMode].interactions + 1,
            attempts: ms[currentMode].attempts + 1,
            responseTime: [...ms[currentMode].responseTime, Date.now() - modeStart]
          }
        };
        updated[currentMode].accuracy = updated[currentMode].attempts > 0
          ? (updated[currentMode].successes / updated[currentMode].attempts) * 100
          : 0;
        return updated;
      });
      
      // Clear selected answer after 2 seconds so they can try again
      setTimeout(() => {
        setSelectedAnswer(null);
        setAnswerFeedback(null);
      }, 2000);
    }
  }, [currentMode, modeStart, recordSuccess]);

  const showCheckInAfterDelay = useCallback(() => {
    setTimeout(() => {
      const questions = [
        'Did you understand that?',
        'Was that helpful?',
        'Do you want to continue?'
      ];
      setCheckInQuestion(questions[Math.floor(Math.random() * questions.length)]);
      setShowCheckIn(true);
    }, 2000);
  }, [currentMode]);

  const endSession = useCallback(async () => {
    // Prevent duplicate saves using ref (immediate check, no state delay)
    if (saveInProgressRef.current || savingReport || reportSaved || sessionOver) {
      console.log('Session already ended or saving in progress', { 
        saveInProgress: saveInProgressRef.current,
        savingReport, 
        reportSaved, 
        sessionOver 
      });
      return;
    }

    // Mark as in progress immediately using ref
    saveInProgressRef.current = true;
    const now = Date.now();
    
    // Mark as saving immediately to prevent duplicate calls
    setSavingReport(true);
    setSessionOver(true);
    
    // Capture current values before state update
    const currentAttempts = attempts;
    const currentSuccesses = successes;
    const currentHelpCount = helpCount;
    
    // Get current stats first
    let finalStats: Record<LearningMode, ModeStats>;
    let profile: { 
      bestModes: string; 
      leastEffective: string; 
      strengths: string; 
      needs: string; 
      recommended: string;
      explanations?: {
        leastEffectiveReason: string;
        recommendationReason: string;
        modeStruggles: string;
      };
    };
    
    // Update stats and compute final values
    setModeStats((currentStats) => {
      const updatedStats = { ...currentStats };
      updatedStats[currentMode] = {
        ...updatedStats[currentMode],
        time: updatedStats[currentMode].time + (now - modeStart)
      };
      
      // Generate profile with updated stats
      const modes: LearningMode[] = ['audio', 'image', 'icons', 'gesture', 'simple'];
      const sortedByInteractions = [...modes].sort((a, b) => 
        updatedStats[b].interactions - updatedStats[a].interactions
      );
      const sortedByFrustration = [...modes].sort((a, b) => 
        updatedStats[a].frustration - updatedStats[b].frustration
      );
      const sortedByAccuracy = [...modes].sort((a, b) => 
        updatedStats[b].accuracy - updatedStats[a].accuracy
      );
      
      const avgResponseTime = (mode: LearningMode) => {
        const times = updatedStats[mode].responseTime;
        return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      };
      const sortedBySpeed = [...modes].sort((a, b) => 
        avgResponseTime(a) - avgResponseTime(b)
      );

      // Assign to outer variables
      finalStats = updatedStats;
      
      // Generate explanations for why student struggles in certain modes
      const leastEffectiveMode = sortedByFrustration[sortedByFrustration.length - 1];
      const leastEffectiveStats = updatedStats[leastEffectiveMode];
      const frustrationReason = leastEffectiveStats.frustration > 0
        ? `Student showed frustration ${leastEffectiveStats.frustration} time${leastEffectiveStats.frustration > 1 ? 's' : ''} in ${leastEffectiveMode} mode with ${leastEffectiveStats.accuracy.toFixed(1)}% accuracy, suggesting this modality doesn't align with their learning style.`
        : `Student had low engagement in ${leastEffectiveMode} mode with minimal interactions, indicating this modality may not be effective for their learning preferences.`;
      
      // Generate recommendation explanations
      const bestMode = sortedByInteractions[0];
      const bestModeStats = updatedStats[bestMode];
      const recommendationReason = `Recommended ${bestMode} mode because student showed high engagement (${bestModeStats.interactions} interactions), ${bestModeStats.accuracy.toFixed(1)}% accuracy, and low frustration (${bestModeStats.frustration} help requests) in this mode.`;
      
      const supportMode = sortedByInteractions[1];
      const supportModeStats = updatedStats[supportMode];
      const supportReason = supportModeStats.interactions > 0
        ? `Including ${supportMode} as secondary support because student demonstrated ${supportModeStats.interactions} interactions with ${supportModeStats.accuracy.toFixed(1)}% accuracy, providing a complementary learning approach.`
        : '';
      
      profile = {
        bestModes: sortedByInteractions.slice(0, 2).join(' + '),
        leastEffective: sortedByFrustration[sortedByFrustration.length - 1],
        strengths: `Fast responses with ${sortedBySpeed[0]}, high accuracy with ${sortedByAccuracy[0]}`,
        needs: `Reduced frustration in ${sortedByFrustration[sortedByFrustration.length - 1]}, more support in text-heavy modes`,
        recommended: `${sortedByInteractions[0]} mode with ${sortedByInteractions[1]} support, gesture-based interactions`,
        explanations: {
          leastEffectiveReason: frustrationReason,
          recommendationReason: recommendationReason + (supportReason ? ' ' + supportReason : ''),
          modeStruggles: Object.entries(updatedStats).map(([mode, stats]) => {
            if (stats.frustration > 0 || stats.accuracy < 50) {
              const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);
              return `${modeName} Mode: ${stats.frustration} frustration event${stats.frustration !== 1 ? 's' : ''}, ${stats.accuracy.toFixed(1)}% accuracy. ${stats.frustration > 2 ? 'Significant struggle detected - consider alternative approaches.' : stats.accuracy < 50 ? 'Low accuracy suggests content difficulty or modality mismatch.' : 'Moderate challenges observed.'}`;
            }
            return null;
          }).filter(Boolean).join(' ')
        }
      };
      
      return updatedStats;
    });
    
    // Save to Firebase AFTER state update, outside of setModeStats
    // Use setTimeout to ensure state update completes first
    setTimeout(async () => {
      if (currentUser && finalStats && profile) {
        try {
          await saveReportToFirebase(finalStats, profile, currentAttempts, currentSuccesses, currentHelpCount);
        } catch (error) {
          console.error('Error saving report:', error);
          alert(`Failed to save report: ${error instanceof Error ? error.message : 'Unknown error'}`);
          saveInProgressRef.current = false;
          setSavingReport(false);
        }
      } else {
        saveInProgressRef.current = false;
        setSavingReport(false);
      }
    }, 0);
  }, [currentMode, modeStart, currentUser, attempts, successes, helpCount, savingReport, reportSaved, sessionOver]);
  
  const saveReportToFirebase = async (
    stats: Record<LearningMode, ModeStats>,
    profile: { 
      bestModes: string; 
      leastEffective: string; 
      strengths: string; 
      needs: string; 
      recommended: string;
      explanations?: {
        leastEffectiveReason: string;
        recommendationReason: string;
        modeStruggles: string;
      };
    },
    totalAttempts: number,
    totalSuccesses: number,
    totalHelpRequests: number
  ) => {
    if (!currentUser) {
      console.warn('Cannot save report: user not authenticated');
      setSavingReport(false);
          return;
        }
    
    // Prevent duplicate saves - double check
    if (reportSaved) {
      console.log('Report already saved, skipping duplicate save');
      return;
    }
    
    console.log('Saving report to Firebase...', { totalAttempts, totalSuccesses, totalHelpRequests });
    
    try {
      // Calculate session duration (approximate)
      const totalTime = Object.values(stats).reduce((sum, s) => sum + s.time, 0);
      
      // Prepare report data
      const reportData = {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        timestamp: serverTimestamp(),
        sessionDate: new Date().toISOString(),
        sessionDuration: totalTime,
        
        // Overall session metrics
        totalAttempts: totalAttempts,
        totalSuccesses: totalSuccesses,
        totalHelpRequests: totalHelpRequests,
        successRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0,
        
        // Detailed mode statistics
        modeStats: {
          audio: {
            timeSpent: stats.audio.time,
            interactions: stats.audio.interactions,
            frustration: stats.audio.frustration,
            accuracy: stats.audio.accuracy,
            averageResponseTime: stats.audio.responseTime.length > 0 
              ? stats.audio.responseTime.reduce((a, b) => a + b, 0) / stats.audio.responseTime.length 
              : 0,
            attempts: stats.audio.attempts,
            successes: stats.audio.successes
          },
          image: {
            timeSpent: stats.image.time,
            interactions: stats.image.interactions,
            frustration: stats.image.frustration,
            accuracy: stats.image.accuracy,
            averageResponseTime: stats.image.responseTime.length > 0 
              ? stats.image.responseTime.reduce((a, b) => a + b, 0) / stats.image.responseTime.length 
              : 0,
            attempts: stats.image.attempts,
            successes: stats.image.successes
          },
          icons: {
            timeSpent: stats.icons.time,
            interactions: stats.icons.interactions,
            frustration: stats.icons.frustration,
            accuracy: stats.icons.accuracy,
            averageResponseTime: stats.icons.responseTime.length > 0 
              ? stats.icons.responseTime.reduce((a, b) => a + b, 0) / stats.icons.responseTime.length 
              : 0,
            attempts: stats.icons.attempts,
            successes: stats.icons.successes
          },
          gesture: {
            timeSpent: stats.gesture.time,
            interactions: stats.gesture.interactions,
            frustration: stats.gesture.frustration,
            accuracy: stats.gesture.accuracy,
            averageResponseTime: stats.gesture.responseTime.length > 0 
              ? stats.gesture.responseTime.reduce((a, b) => a + b, 0) / stats.gesture.responseTime.length 
              : 0,
            attempts: stats.gesture.attempts,
            successes: stats.gesture.successes
          },
          simple: {
            timeSpent: stats.simple.time,
            interactions: stats.simple.interactions,
            frustration: stats.simple.frustration,
            accuracy: stats.simple.accuracy,
            averageResponseTime: stats.simple.responseTime.length > 0 
              ? stats.simple.responseTime.reduce((a, b) => a + b, 0) / stats.simple.responseTime.length 
              : 0,
            attempts: stats.simple.attempts,
            successes: stats.simple.successes
          }
        },
        
        // Generated profile summary
        profile: {
          bestModes: profile.bestModes,
          leastEffective: profile.leastEffective,
          strengths: profile.strengths,
          needs: profile.needs,
          recommended: profile.recommended,
          explanations: profile.explanations || {
            leastEffectiveReason: '',
            recommendationReason: '',
            modeStruggles: ''
          }
        }
      };
      
      // Save to Firestore in user-specific subcollection
      console.log('Attempting to save report to Firebase...', { 
        userId: currentUser.uid, 
        collection: `users/${currentUser.uid}/learningReports`,
        dataSize: JSON.stringify(reportData).length 
      });
      
      // Save to user-specific subcollection: users/{userId}/learningReports/{reportId}
      // Check one more time to prevent duplicate saves
      if (reportSaved) {
        console.log('Report already marked as saved, skipping duplicate save');
        setSavingReport(false);
        return;
      }
      
      const docRef = await addDoc(
        collection(db, 'users', currentUser.uid, 'learningReports'), 
        reportData
      );
      
      // Update persistent learning profile
      await updatePersistentProfile(stats, profile, totalAttempts, totalSuccesses);
      
      setReportSaved(true);
      setSavingReport(false);
      saveInProgressRef.current = false; // Reset ref after successful save
      console.log('Learning report saved successfully to Firebase with ID:', docRef.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code || 'unknown';
      
      console.error('Error saving learning report to Firebase:', {
        error,
        message: errorMessage,
        code: errorCode,
        userId: currentUser?.uid,
        userEmail: currentUser?.email
      });
      
      // More specific error messages
      let userMessage = 'Failed to save report to Firebase. ';
      if (errorCode === 'permission-denied') {
        userMessage += 'Permission denied. Please check Firestore security rules.';
      } else if (errorCode === 'unavailable') {
        userMessage += 'Firebase is unavailable. Please check your internet connection.';
            } else {
        userMessage += `Error: ${errorMessage}`;
      }
      
      alert(userMessage);
      saveInProgressRef.current = false; // Reset ref on error
    } finally {
      setSavingReport(false);
            }
          };

  // Update persistent learning profile with trends over time
  const updatePersistentProfile = async (
    stats: Record<LearningMode, ModeStats>,
    sessionProfile: { bestModes: string; leastEffective: string; strengths: string; needs: string; recommended: string },
    totalAttempts: number,
    totalSuccesses: number
  ) => {
    if (!currentUser) return;

    try {
      const profileRef = doc(db, 'users', currentUser.uid, 'learningProfile', 'current');
      const existingProfile = await getDoc(profileRef);
      
      const modes: LearningMode[] = ['audio', 'image', 'icons', 'gesture', 'simple'];
      const totalTime = Object.values(stats).reduce((sum, s) => sum + s.time, 0);
      const sessionAccuracy = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0;
      
      // Calculate learning style trends
      const visualModes = ['image', 'icons'];
      const auditoryModes = ['audio'];
      const kinestheticModes = ['gesture'];
      
      const visualTime = visualModes.reduce((sum, m) => sum + stats[m as LearningMode].time, 0);
      const auditoryTime = auditoryModes.reduce((sum, m) => sum + stats[m as LearningMode].time, 0);
      const kinestheticTime = kinestheticModes.reduce((sum, m) => sum + stats[m as LearningMode].time, 0);
      
      let learningStyle = 'mixed';
      if (visualTime > auditoryTime && visualTime > kinestheticTime) {
        learningStyle = 'visual';
      } else if (auditoryTime > visualTime && auditoryTime > kinestheticTime) {
        learningStyle = 'auditory';
      } else if (kinestheticTime > visualTime && kinestheticTime > auditoryTime) {
        learningStyle = 'kinesthetic';
      }
      
      // Check if gesture mode is used frequently (gesture reinforcement)
      const gestureUsagePercent = totalTime > 0 ? (stats.gesture.time / totalTime) * 100 : 0;
      const hasGestureReinforcement = gestureUsagePercent > 20;
      
      if (existingProfile.exists()) {
        // Update existing profile with rolling averages
        const existingData = existingProfile.data();
        const totalSessions = (existingData.totalSessions || 0) + 1;
        const previousAvgAccuracy = existingData.averageAccuracy || 0;
        const previousAvgDifficulty = existingData.averageDifficulty || 1;
        
        // Calculate rolling average (weighted toward recent sessions)
        const newAvgAccuracy = (previousAvgAccuracy * 0.7) + (sessionAccuracy * 0.3);
        const newAvgDifficulty = (previousAvgDifficulty * 0.7) + (difficulty * 0.3);
        
        // Update mode preferences
        const modePreferences = existingData.modePreferences || {};
        modes.forEach(mode => {
          const modeTimePercent = totalTime > 0 ? (stats[mode].time / totalTime) * 100 : 0;
          if (!modePreferences[mode]) {
            modePreferences[mode] = modeTimePercent;
          } else {
            modePreferences[mode] = (modePreferences[mode] * 0.7) + (modeTimePercent * 0.3);
          }
        });
        
        // Detect trend in learning style
        const previousLearningStyle = existingData.learningStyle || 'mixed';
        const learningStyleHistory = existingData.learningStyleHistory || [previousLearningStyle];
        learningStyleHistory.push(learningStyle);
        if (learningStyleHistory.length > 10) {
          learningStyleHistory.shift(); // Keep only last 10 sessions
        }
        
        // Determine dominant learning style from history
        const styleCounts: Record<string, number> = {};
        learningStyleHistory.forEach((style: string) => {
          styleCounts[style] = (styleCounts[style] || 0) + 1;
        });
        const dominantStyle = Object.keys(styleCounts).reduce((a, b) => 
          styleCounts[a] > styleCounts[b] ? a : b
        );
        
        await setDoc(profileRef, {
          ...existingData,
          lastUpdated: serverTimestamp(),
          totalSessions,
          averageAccuracy: newAvgAccuracy,
          averageDifficulty: newAvgDifficulty,
          lastSessionAccuracy: sessionAccuracy,
          lastSessionDifficulty: difficulty,
          modePreferences,
          learningStyle: dominantStyle,
          learningStyleHistory,
          hasGestureReinforcement: hasGestureReinforcement || existingData.hasGestureReinforcement,
          profileSummary: `${dominantStyle} learner${hasGestureReinforcement ? ' with gesture reinforcement' : ''}`,
          lastProfile: sessionProfile,
          // Trend detection
          trendAccuracy: sessionAccuracy > previousAvgAccuracy ? 'improving' : 
                        sessionAccuracy < previousAvgAccuracy ? 'declining' : 'stable',
          trendDifficulty: difficulty > previousAvgDifficulty ? 'increasing' : 
                          difficulty < previousAvgDifficulty ? 'decreasing' : 'stable'
        }, { merge: true });
      } else {
        // Create new profile
        const modePreferences: Record<string, number> = {};
        modes.forEach(mode => {
          modePreferences[mode] = totalTime > 0 ? (stats[mode].time / totalTime) * 100 : 0;
        });
        
        await setDoc(profileRef, {
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          totalSessions: 1,
          averageAccuracy: sessionAccuracy,
          averageDifficulty: difficulty,
          lastSessionAccuracy: sessionAccuracy,
          lastSessionDifficulty: difficulty,
          modePreferences,
          learningStyle,
          learningStyleHistory: [learningStyle],
          hasGestureReinforcement,
          profileSummary: `${learningStyle} learner${hasGestureReinforcement ? ' with gesture reinforcement' : ''}`,
          lastProfile: sessionProfile,
          trendAccuracy: 'new',
          trendDifficulty: 'new'
        });
      }
      
      console.log('Persistent learning profile updated successfully');
    } catch (error) {
      console.error('Error updating persistent learning profile:', error);
      // Don't fail the report save if profile update fails
    }
  };

  // Initialize MediaPipe Hands
  useEffect(() => {
    let mounted = true;
    
    async function initializeMediaPipe() {
      try {
        setMpStatus('loading');
        setErrorMessage('');
        
        const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
        
        if (!video || !canvas) {
          if (mounted) setMpStatus('error');
          return;
        }

        // Initialize MediaPipe Hands
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.8, // Increased for better quality
          minTrackingConfidence: 0.6 // Increased for more stable tracking
        });

        // Set up drawing on canvas
      const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (mounted) setMpStatus('error');
          return;
        }

        let lastActionTime = 0;
        let currentGestureState: GestureState = 'IDLE';
        let gestureDetectedTime = 0;
        let stableGestureCount = 0;
        let lastGestureType: GestureType = '-';
        // Improved thresholds for better detection
        const STABLE_THRESHOLD = 600; // Reduced for faster response
        const CONFIRMATION_THRESHOLD = 75; // Increased for more reliable detection
        const COOLDOWN_DURATION = 2000; // Reduced cooldown for better responsiveness
        const MIN_STABLE_FRAMES = 4; // Slightly reduced for smoother experience
        
        // Add gesture history buffer for smoothing
        const gestureHistory: Array<{ gesture: GestureType; confidence: number; time: number }> = [];
        const HISTORY_SIZE = 5;

        hands.onResults((results) => {
          if (!mounted || !gestureDetectionEnabled) {
            // If detection disabled, just show the video without processing
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.image) {
              ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            }
            ctx.restore();
            return;
          }
          
          // Clear canvas
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          const now = Date.now();
          const timeSinceLastAction = now - lastActionTime;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const allLandmarks = results.multiHandLandmarks;
            
            // Draw hand landmarks for all detected hands
            for (let handIdx = 0; handIdx < allLandmarks.length; handIdx++) {
              const landmarks = allLandmarks[handIdx];
              
              // Use different colors for each hand (helpful for debugging)
              const color = handIdx === 0 ? '#22c55e' : '#f59e0b';
              ctx.strokeStyle = currentGestureState === 'CONFIRMED' ? '#10b981' : 
                               currentGestureState === 'DETECTING' ? '#3b82f6' : color;
              ctx.fillStyle = currentGestureState === 'CONFIRMED' ? '#10b981' : '#1d4ed8';
              ctx.lineWidth = currentGestureState === 'CONFIRMED' ? 3 : 2;

              for (const landmark of landmarks) {
                const x = landmark.x * canvas.width;
                const y = landmark.y * canvas.height;
        ctx.beginPath();
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.fill();
              }

              // Connect landmarks with lines
              const connections = [
                [0, 1, 2, 3, 4], // Thumb
                [0, 5, 6, 7, 8], // Index
                [0, 9, 10, 11, 12], // Middle
                [0, 13, 14, 15, 16], // Ring
                [0, 17, 18, 19, 20] // Pinky
              ];

              ctx.strokeStyle = currentGestureState === 'CONFIRMED' ? '#10b981' : color;
              for (const connection of connections) {
          ctx.beginPath();
                for (let i = 0; i < connection.length; i++) {
                  const idx = connection[i];
                  const landmark = landmarks[idx];
                  const x = landmark.x * canvas.width;
                  const y = landmark.y * canvas.height;
                  if (i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
        }
                ctx.stroke();
              }
            }

            // Classify gesture from all landmarks (handles two hands for thumbs down)
            const { gesture: classification, confidence } = classifyGestureFromLandmarks(allLandmarks);
            
            // Add to gesture history for smoothing
            gestureHistory.push({ gesture: classification, confidence, time: now });
            if (gestureHistory.length > HISTORY_SIZE) {
              gestureHistory.shift();
            }
            
            // Use smoothed gesture (mode of recent gestures with confidence weighting)
            const smoothed = getSmoothedGesture(gestureHistory);
            const finalClassification = smoothed.gesture;
            const finalConfidence = smoothed.confidence;
            
            setDetectStatus('ready');
            setGesture(finalClassification);
            setGestureConfidence(finalConfidence);


            // Gesture State Machine (use smoothed gesture)
            if (finalClassification !== '-' && finalConfidence >= CONFIRMATION_THRESHOLD) {
              if (currentGestureState === 'IDLE') {
                if (timeSinceLastAction > COOLDOWN_DURATION) {
                  currentGestureState = 'DETECTING';
                  gestureDetectedTime = now;
                  stableGestureCount = 1;
                  lastGestureType = finalClassification;
                  setGestureState('DETECTING');
                }
              } else if (currentGestureState === 'DETECTING') {
                // Only count as stable if gesture matches (with smoothing, should be more stable)
                if (finalClassification === lastGestureType) {
                  stableGestureCount++;
                } else {
                  // Gesture changed, reset but allow quick transition for high confidence
                  if (finalConfidence >= 85) {
                    stableGestureCount = MIN_STABLE_FRAMES - 1; // Allow faster confirmation
                  } else {
                    stableGestureCount = 1;
                  }
                  gestureDetectedTime = now;
                  lastGestureType = finalClassification;
                }

                const stableDuration = now - gestureDetectedTime;
                if (stableDuration >= STABLE_THRESHOLD && stableGestureCount >= MIN_STABLE_FRAMES) {
                  currentGestureState = 'CONFIRMED';
                  setGestureState('CONFIRMED');
                  setLastConfirmedGesture(finalClassification);

                  const actions: Partial<Record<GestureType, () => void>> = {
                    // Answer selection gestures (1-4 fingers = A, B, C, D)
                    '1': () => {
                      handleAnswerSelection('A');
                    },
                    '2': () => {
                      handleAnswerSelection('B');
                    },
                    '3': () => {
                      handleAnswerSelection('C');
                    },
                    '4': () => {
                      handleAnswerSelection('D');
                    },
                    // Navigation and feedback gestures
                    thumbsUp: () => {
                      recordSuccess();
                      setAnswerFeedback('Great! You understand this.');
                      speakText('Great! You understand this.');
                    },
                    open: () => {
                      recordHelp();
                      setAnswerFeedback("I don't understand. Let me explain this again.");
                      speakText("I don't understand. Let me explain this again.");
                    },
                    pointLeft: () => {
                      nextItem();
                      speakText('Moving to next question.');
                    },
                    pointRight: () => {
                      nextItem();
                      speakText('Moving to next question.');
                    }
                  };

                  if (actions[classification]) {
                    actions[classification]!();
                    lastActionTime = now;
                    setCooldownEndTime(now + COOLDOWN_DURATION);

                    currentGestureState = 'COOLDOWN';
                    setGestureState('COOLDOWN');

                    setTimeout(() => {
                      if (mounted) {
                        currentGestureState = 'IDLE';
                        setGestureState('IDLE');
                        setCooldownEndTime(0);
                        lastGestureType = '-';
                      }
                    }, COOLDOWN_DURATION);
                  }
                }
              } else if (currentGestureState === 'COOLDOWN') {
                // Ignore during cooldown
        }
      } else {
              // Gesture lost or confidence too low
              if (currentGestureState === 'DETECTING' && (now - gestureDetectedTime) > 500) {
                currentGestureState = 'IDLE';
                setGestureState('IDLE');
                stableGestureCount = 0;
                lastGestureType = '-';
              }
            }
          } else {
            // No hand detected
            setDetectStatus('ready');
        setGesture('-');
            setGestureConfidence(0);
            
            if (currentGestureState === 'DETECTING' && (now - gestureDetectedTime) > 500) {
              currentGestureState = 'IDLE';
              setGestureState('IDLE');
            }
            
          }

          ctx.restore();
        });

        handsRef.current = hands;

        // Initialize camera
        const camera = new Camera(video, {
          onFrame: async () => {
            if (handsRef.current) {
              await handsRef.current.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });

        cameraRef.current = camera;
        camera.start();

        if (mounted) {
          setMpStatus('ready');
          setDetectStatus('ready');
        }
      } catch (error) {
        console.error('MediaPipe initialization error:', error);
        if (mounted) {
          const err = error as Error;
          setErrorMessage(`MediaPipe Hands failed to initialize: ${err.message}`);
          setMpStatus('error');
          setDetectStatus('error');
        }
      }
    }

    if (mediaReady) {
      initializeMediaPipe();
    }

    return () => {
      mounted = false;
      if (handsRef.current) {
        handsRef.current.close();
        handsRef.current = null;
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    };
  }, [mediaReady, currentMode, content, recordHelp, changeMode, nextItem, recordSuccess]);


  // Active adaptation: auto-switch modes based on frustration
  useEffect(() => {
    const currentFrustration = modeStats[currentMode].frustration;
    const currentAccuracy = modeStats[currentMode].accuracy;
    
    // If frustration is high (>= 3) and accuracy is low (< 50%), suggest switching
    if (currentFrustration >= 3 && currentAccuracy < 50 && modeStats[currentMode].attempts >= 3) {
      const modes: LearningMode[] = ['audio', 'image', 'icons', 'gesture', 'simple'];
      const bestAlternative = modes
        .filter(m => m !== currentMode)
        .sort((a, b) => {
          // Prefer modes with lower frustration and higher accuracy
          const frustrationDiff = modeStats[a].frustration - modeStats[b].frustration;
          if (frustrationDiff !== 0) return frustrationDiff;
          return modeStats[b].accuracy - modeStats[a].accuracy;
        })[0];
      
      if (bestAlternative) {
        // Auto-switch after a short delay
        setTimeout(() => {
          changeMode(bestAlternative);
          speakText(`Switching to ${bestAlternative} mode. This might work better for you!`);
        }, 2000);
      }
    }
  }, [modeStats, currentMode, changeMode, speakText]);

  // Calculate progress percentage
  const progress = attempts > 0 ? (successes / attempts) * 100 : 0;
  
  // Generate learning profile
  const generateProfile = () => {
    const modes: LearningMode[] = ['audio', 'image', 'icons', 'gesture', 'simple'];
    const sortedByInteractions = [...modes].sort((a, b) => 
      modeStats[b].interactions - modeStats[a].interactions
    );
    const sortedByFrustration = [...modes].sort((a, b) => 
      modeStats[a].frustration - modeStats[b].frustration
    );
    const sortedByAccuracy = [...modes].sort((a, b) => 
      modeStats[b].accuracy - modeStats[a].accuracy
    );
    
    const avgResponseTime = (mode: LearningMode) => {
      const times = modeStats[mode].responseTime;
      return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    };
    const sortedBySpeed = [...modes].sort((a, b) => 
      avgResponseTime(a) - avgResponseTime(b)
    );

    return {
      bestModes: sortedByInteractions.slice(0, 2).join(' + '),
      leastEffective: sortedByFrustration[sortedByFrustration.length - 1],
      strengths: `Fast responses with ${sortedBySpeed[0]}, high accuracy with ${sortedByAccuracy[0]}`,
      needs: `Reduced frustration in ${sortedByFrustration[sortedByFrustration.length - 1]}, more support in text-heavy modes`,
      recommended: `${sortedByInteractions[0]} mode with ${sortedByInteractions[1]} support, gesture-based interactions`
    };
  };

  const profile = sessionOver ? generateProfile() : null;

  // Audio confirmation messages for gestures
  const gestureMessages: Partial<Record<GestureType, string>> = {
    '1': '1 finger detected. Answer A selected.',
    '2': '2 fingers detected. Answer B selected.',
    '3': '3 fingers detected. Answer C selected.',
    '4': '4 fingers detected. Answer D selected.',
    'thumbsUp': 'Thumbs up detected. I understand.',
    'open': "Open hand detected. I don't understand.",
    'pointLeft': 'Pointing left detected. Next question.',
    'pointRight': 'Pointing right detected. Next question.',
    '-': ''
  };

  return (
    <motion.div 
      className="learn-container" 
      initial="hidden" 
      animate="visible" 
      variants={containerVariants}
    >
      {/* Accessibility: aria-live region for gesture feedback */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
        id="gesture-feedback"
      >
        {gestureState === 'CONFIRMED' && gesture !== '-' 
          ? gestureMessages[gesture] 
          : gestureState === 'DETECTING' 
          ? `Detecting ${gesture} gesture...` 
          : ''}
      </div>
      
      <motion.header className="learn-header" role="banner" variants={itemVariants}>
        <motion.h1 
          initial={{ scale: 0.95, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          Adaptive Learning 📚
        </motion.h1>
        <motion.button
          onClick={goBack}
          className="logout-button"
          aria-label="Go back to home"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Back to Home
        </motion.button>
      </motion.header>

      {sessionOver && profile && (
        <motion.div 
          className="profile-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div 
            className="profile-card"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
          >
            <h2>🎯 Personalized Learning Profile</h2>
            <div className="profile-content">
              <div className="profile-item">
                <strong>Best Learning Modes:</strong> {profile.bestModes}
              </div>
              <div className="profile-item">
                <strong>Least Effective Mode:</strong> {profile.leastEffective}
              </div>
              <div className="profile-item">
                <strong>Strengths:</strong> {profile.strengths}
              </div>
              <div className="profile-item">
                <strong>Needs:</strong> {profile.needs}
              </div>
              <div className="profile-item highlight">
                <strong>Recommended Setup:</strong> {profile.recommended}
              </div>
            </div>
            <button className="logout-button" onClick={() => setSessionOver(false)}>
              Continue Learning
            </button>
          </motion.div>
        </motion.div>
      )}

      <main id="main-content" className="learn-main" role="main">
        {mpStatus === 'error' && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3>⚠️ MediaPipe Loading Error</h3>
            <p>Failed to load MediaPipe Hands. Please refresh the page or check your internet connection.</p>
            <button className="logout-button" onClick={() => window.location.reload()}>
              Refresh Page
            </button>
          </motion.div>
        )}
        
        <div className="learn-panes">
          {/* Left Pane: Gesture & Interaction */}
          <motion.div className="learn-pane gesture-pane" variants={cardVariants}>
            <h2>👋 Gesture & Interaction</h2>
            
            {mpStatus === 'loading' && (
              <div className="loading-message">
                <p>⏳ Loading MediaPipe Hands...</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Initializing hand detection. Please wait...
                </p>
              </div>
            )}
            
            <div className="webcam-section">
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  onUserMedia={() => setMediaReady(true)}
                onUserMediaError={(error) => {
                  console.error('Webcam error:', error);
                  const err = error instanceof DOMException ? error : null;
                  const errorMsg = err?.name === 'NotAllowedError' 
                    ? 'Camera permission denied. Please allow camera access in Safari Settings > Websites > Camera.'
                    : err?.name === 'NotFoundError'
                    ? 'No camera found. Please connect a camera and refresh.'
                    : `Camera error: ${err?.message || err?.name || String(error)}. Check Safari Settings > Websites > Camera.`;
                  setErrorMessage(errorMsg);
                  setDetectStatus('error');
                }}
                  videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                className="webcam-feed"
                />
              <canvas 
                ref={canvasRef} 
                className="gesture-canvas"
              />
              <div className="detection-status">
                <span className={`status-indicator ${detectStatus === 'ready' ? 'ready' : detectStatus === 'error' ? 'error' : ''}`}>
                  {detectStatus === 'ready' ? '●' : detectStatus === 'error' ? '✗' : '○'}
                </span>
                {detectStatus === 'ready' ? 'Camera Ready' : detectStatus === 'error' ? 'Error' : 'Initializing...'}
              </div>
              {detectStatus === 'error' && errorMessage && (
                <div className="error-detail">
                  <p>{errorMessage}</p>
                  <details style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      How to fix camera permissions
                    </summary>
                    <ol style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                      <li>Open <strong>Safari</strong> menu → <strong>Settings</strong> (or Preferences)</li>
                      <li>Click the <strong>Websites</strong> tab</li>
                      <li>Select <strong>Camera</strong> from the left sidebar</li>
                      <li>Find <strong>localhost</strong> in the list</li>
                      <li>Change it to <strong>"Allow"</strong></li>
                      <li>If localhost isn't listed, go to <strong>System Settings</strong> → <strong>Privacy & Security</strong> → <strong>Camera</strong> → Enable <strong>Safari</strong></li>
                      <li>Refresh this page</li>
                    </ol>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <strong>Note:</strong> If OpenCV errors persist, try hard refresh (Cmd+Shift+R) or clear browser cache.
                    </p>
                  </details>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                {mpStatus === 'ready' && (
                  <>
                    <button
                      className={`reset-gesture-btn ${!gestureDetectionEnabled ? 'disabled' : ''}`}
                      onClick={toggleGestureDetection}
                      aria-label={gestureDetectionEnabled ? 'Stop gesture detection' : 'Start gesture detection'}
                      title={gestureDetectionEnabled ? 'Stop detecting gestures' : 'Start detecting gestures'}
                      style={{ 
                        background: gestureDetectionEnabled 
                          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      }}
                    >
                      {gestureDetectionEnabled ? '⏸️ Stop Detection' : '▶️ Start Detection'}
                    </button>
                    <button
                      className="reset-gesture-btn"
                      onClick={resetGestureDetector}
                      aria-label="Reset gesture detector"
                      title="Reset gesture detection"
                    >
                      🔄 Reset
                    </button>
                  </>
                )}
              </div>
              {!gestureDetectionEnabled && (
                <div className="detection-disabled-notice">
                  <p>⚠️ Gesture detection is paused. Click "Start Detection" to resume.</p>
                </div>
              )}
            </div>

            <div className="gesture-info">
              <div className="gesture-display">
                <div className="gesture-icon">
                  {gesture === '1' && '1️⃣'}
                  {gesture === '2' && '2️⃣'}
                  {gesture === '3' && '3️⃣'}
                  {gesture === '4' && '4️⃣'}
                  {gesture === 'thumbsUp' && '👍'}
                  {gesture === 'open' && '🖐️'}
                  {gesture === 'pointLeft' && '👈'}
                  {gesture === 'pointRight' && '👉'}
                  {gesture === '-' && '—'}
                </div>
                <div className="gesture-label">
                  {gesture === '1' && '1 Finger (Answer A)'}
                  {gesture === '2' && '2 Fingers (Answer B)'}
                  {gesture === '3' && '3 Fingers (Answer C)'}
                  {gesture === '4' && '4 Fingers (Answer D)'}
                  {gesture === 'thumbsUp' && 'Thumbs Up (I understand)'}
                  {gesture === 'open' && "Open Hand (I don't understand)"}
                  {gesture === 'pointLeft' && 'Point Left (Next question)'}
                  {gesture === 'pointRight' && 'Point Right (Next question)'}
                  {gesture === '-' && 'No Gesture Detected'}
                </div>
                <div className={`gesture-state ${gestureState.toLowerCase()}`}>
                  {gestureState === 'IDLE' && 'Ready - Show your gesture'}
                  {gestureState === 'DETECTING' && 'Hold gesture steady...'}
                  {gestureState === 'CONFIRMED' && '✓ Gesture confirmed!'}
                  {gestureState === 'COOLDOWN' && (() => {
                    const remaining = cooldownEndTime > 0 ? Math.max(0, Math.ceil((cooldownEndTime - Date.now()) / 1000)) : 0;
                    return `Please wait... (${remaining}s)`;
                  })()}
                </div>
                {gestureState === 'CONFIRMED' && lastConfirmedGesture !== '-' && (
                  <div className="confirmed-indicator" role="status" aria-live="polite">
                    ✓ {lastConfirmedGesture === '1' ? 'Answer A selected' :
                        lastConfirmedGesture === '2' ? 'Answer B selected' :
                        lastConfirmedGesture === '3' ? 'Answer C selected' :
                        lastConfirmedGesture === '4' ? 'Answer D selected' :
                        lastConfirmedGesture === 'thumbsUp' ? 'I understand' :
                        lastConfirmedGesture === 'open' ? "I don't understand" :
                        lastConfirmedGesture === 'pointLeft' || lastConfirmedGesture === 'pointRight' ? 'Next question' :
                        'Gesture confirmed'}
                  </div>
                )}
                {gestureConfidence > 0 && (
                  <div className="confidence-bar">
                    <div 
                      className="confidence-fill" 
                      style={{ width: `${gestureConfidence}%` }}
                    />
                    <span>{Math.round(gestureConfidence)}% confidence</span>
                  </div>
                )}
                {gestureState === 'CONFIRMED' && (
                  <div className="confirmed-indicator" role="status" aria-live="polite">
                    ✓ Gesture confirmed
                  </div>
                )}
              </div>

              <div className="gesture-guide">
                <h3>Gesture Guide</h3>
                <div className="guide-items">
                  <div className="guide-item">
                    <span className="guide-icon">1️⃣</span>
                    <span>1 Finger = Answer A</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">2️⃣</span>
                    <span>2 Fingers = Answer B</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">3️⃣</span>
                    <span>3 Fingers = Answer C</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">4️⃣</span>
                    <span>4 Fingers = Answer D</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">👍</span>
                    <span>Thumbs Up = I understand</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">🖐️</span>
                    <span>Open Hand = I don't understand</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">👉</span>
                    <span>Point Left/Right = Next question</span>
                  </div>
                </div>
              </div>

              <div className="progress-section">
                <h3>Progress</h3>
                <div className="progress-stats">
                  <div className="stat">
                    <span className="stat-label">Attempts:</span>
                    <span className="stat-value">{attempts}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Successes:</span>
                    <span className="stat-value">{successes}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Help Requests:</span>
                    <span className="stat-value">{helpCount}</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                  />
                  <span className="progress-text">{Math.round(progress)}% Success Rate</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Pane: Adaptive Learning */}
          <motion.div className="learn-pane learning-pane" variants={cardVariants}>
            <h2>📖 Adaptive Learning Content</h2>
            
            {/* Switch reason tooltip */}
            {showSwitchTooltip && switchReason && (
              <motion.div
                className="switch-tooltip"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                  marginBottom: 'var(--spacing-md)',
                  padding: 'var(--spacing-md)',
                  background: 'var(--primary-color)',
                  color: 'white',
                  borderRadius: 'var(--border-radius)',
                  border: '2px solid var(--primary-color)',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-sm)' }}>
              <div>
                    <strong style={{ fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 1.1)' }}>
                      💡 Why am I seeing this?
                    </strong>
                    <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))' }}>
                      {switchReason}
                    </p>
              </div>
                  <button
                    onClick={() => setShowSwitchTooltip(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      padding: '0',
                      lineHeight: '1',
                      flexShrink: 0
                    }}
                    aria-label="Close tooltip"
                  >
                    ✕
                  </button>
            </div>
          </motion.div>
            )}
            
            <div className="mode-selector">
              <div className="mode-selector-grid">
                <button 
                  className={`mode-button ${currentMode === 'audio' ? 'active' : ''}`}
                  onClick={() => changeMode('audio')}
                >
                  🔊 Audio
                </button>
                <button 
                  className={`mode-button ${currentMode === 'image' ? 'active' : ''}`}
                  onClick={() => changeMode('image')}
                >
                  🖼️ Image
                </button>
                <button 
                  className={`mode-button ${currentMode === 'icons' ? 'active' : ''}`}
                  onClick={() => changeMode('icons')}
                >
                  🎨 Icons
                </button>
                <button 
                  className={`mode-button ${currentMode === 'gesture' ? 'active' : ''}`}
                  onClick={() => changeMode('gesture')}
                >
                  👋 Gesture
                </button>
                <button 
                  className={`mode-button ${currentMode === 'simple' ? 'active' : ''}`}
                  onClick={() => changeMode('simple')}
                >
                  📝 Simple
                </button>
            </div>
            </div>

            <div className="content-display">
              <div className="mode-indicator">
                <span className="mode-indicator-badge">
                  {currentMode === 'audio' && '🔊 Audio Mode'}
                  {currentMode === 'image' && '🖼️ Visual Mode'}
                  {currentMode === 'icons' && '🎨 Interactive Mode'}
                  {currentMode === 'gesture' && '👋 Gesture Mode'}
                  {currentMode === 'simple' && '📝 Simple Mode'}
                </span>
              </div>
              
            {currentMode === 'audio' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="audio-mode">
                    <div className="mode-icon-large">🔊</div>
                    <div className="content-card">
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600 }}>
                        {question.text}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {question.answers.map((ans) => (
                          <div
                            key={ans.letter}
                            className={`answer-choice ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'var(--success-color)' : 'var(--error-color)') : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'transparent',
                              cursor: 'pointer',
                              fontWeight: selectedAnswer === ans.letter ? 600 : 400
                            }}
                            onClick={() => handleAnswerSelection(ans.letter)}
                          >
                            <strong>{ans.letter})</strong> {ans.value}
                          </div>
                        ))}
                      </div>
                      {answerFeedback && (
                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(102, 126, 234, 0.1)', fontWeight: 600 }}>
                          {answerFeedback}
              </div>
            )}
              </div>
                    <button 
                      className="play-button"
                      onClick={() => speakText(content)}
                      aria-label="Play voiceover"
                    >
                      <span className="play-icon">▶️</span>
                      <span>Play Voiceover</span>
                    </button>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> Listen to the question being read aloud. Use gestures: 1 finger = A, 2 = B, 3 = C, 4 = D
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

            {currentMode === 'image' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="image-mode">
                    <div className="visual-explanation">
                      <div className="visual-icons" style={{ fontSize: '2rem' }}>
                        🎁 → 👥 → 📊
              </div>
                      <p className="visual-caption">Stickers Sharing Visual</p>
                    </div>
                    <div className="content-card">
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600 }}>
                        {question.text}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {question.answers.map((ans) => (
                          <div
                            key={ans.letter}
                            className={`answer-choice ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'var(--success-color)' : 'var(--error-color)') : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'transparent',
                              cursor: 'pointer',
                              fontWeight: selectedAnswer === ans.letter ? 600 : 400
                            }}
                            onClick={() => handleAnswerSelection(ans.letter)}
                          >
                            <strong>{ans.letter})</strong> {ans.value}
                          </div>
                        ))}
                      </div>
                      {answerFeedback && (
                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(102, 126, 234, 0.1)', fontWeight: 600 }}>
                          {answerFeedback}
              </div>
            )}
                    </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> Visualize the problem! 12 stickers ÷ 3 students = ?
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

            {currentMode === 'icons' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="icons-mode">
                    <div className="content-card">
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600 }}>
                        {question.text}
                      </p>
                      <div className="answer-choices" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)' }}>
                        {question.answers.map((ans) => (
                          <motion.button
                            key={ans.letter}
                            className={`icon-button answer-choice ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                            onClick={() => handleAnswerSelection(ans.letter)}
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                              padding: 'var(--spacing-lg)',
                              border: `2px solid ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'var(--success-color)' : 'var(--error-color)') : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'transparent',
                              fontWeight: selectedAnswer === ans.letter ? 600 : 400,
                              fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))'
                            }}
                          >
                            <span className="icon-emoji" style={{ fontSize: '2rem' }}>
                              {ans.letter === 'A' ? '1️⃣' : ans.letter === 'B' ? '2️⃣' : ans.letter === 'C' ? '3️⃣' : '4️⃣'}
                            </span>
                            <span className="icon-text"><strong>{ans.letter})</strong> {ans.value}</span>
                          </motion.button>
                  ))}
                </div>
                      {answerFeedback && (
                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(102, 126, 234, 0.1)', fontWeight: 600 }}>
                          {answerFeedback}
              </div>

            )}
                    </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> Click answer choices or use gestures: 1 finger = A, 2 = B, 3 = C, 4 = D
                      </p>
              </div>
              </div>
                </motion.div>
            )}

            {currentMode === 'gesture' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="gesture-mode">
                    <div className="content-card">
                      <p className="content-text">{content}</p>
                    </div>
                    <div className="content-card" style={{ marginBottom: 'var(--spacing-md)' }}>
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600 }}>
                        {question.text}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {question.answers.map((ans) => (
                          <div
                            key={ans.letter}
                            className={`answer-choice ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'var(--success-color)' : 'var(--error-color)') : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'transparent',
                              fontWeight: selectedAnswer === ans.letter ? 600 : 400
                            }}
                          >
                            <strong>{ans.letter})</strong> {ans.value}
                          </div>
                        ))}
                      </div>
                      {answerFeedback && (
                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(102, 126, 234, 0.1)', fontWeight: 600 }}>
                          {answerFeedback}
                        </div>
                      )}
                    </div>
                    <div className="gesture-instructions">
                      <p className="instructions-title">✋ Answer using gestures:</p>
                      <div className="gesture-instructions-grid">
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">1️⃣</span>
              <div>
                            <strong>1 Finger</strong>
                            <span className="instruction-desc">Answer A</span>
              </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">2️⃣</span>
                          <div>
                            <strong>2 Fingers</strong>
                            <span className="instruction-desc">Answer B</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">3️⃣</span>
                          <div>
                            <strong>3 Fingers</strong>
                            <span className="instruction-desc">Answer C</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">4️⃣</span>
              <div>
                            <strong>4 Fingers</strong>
                            <span className="instruction-desc">Answer D</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">👍</span>
                          <div>
                            <strong>Thumbs Up</strong>
                            <span className="instruction-desc">I understand</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">🖐️</span>
                          <div>
                            <strong>Open Hand</strong>
                            <span className="instruction-desc">I don't understand</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">👉</span>
                          <div>
                            <strong>Point Left/Right</strong>
                            <span className="instruction-desc">Next question</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> No typing needed! Just use your hands to respond.
                      </p>
                    </div>
              </div>
                </motion.div>
            )}

            {currentMode === 'simple' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="simple-mode">
                    <div className="content-card simplified">
                      <p className="simple-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600, lineHeight: '1.6' }}>
                        {question.text}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {question.answers.map((ans) => (
                          <div
                            key={ans.letter}
                            className={`answer-choice ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'var(--success-color)' : 'var(--error-color)') : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: selectedAnswer === ans.letter ? (ans.letter === question.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'transparent',
                              cursor: 'pointer',
                              fontWeight: selectedAnswer === ans.letter ? 600 : 400,
                              fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 1.1)'
                            }}
                            onClick={() => handleAnswerSelection(ans.letter)}
                          >
                            <strong>{ans.letter})</strong> {ans.value}
                          </div>
                        ))}
                      </div>
                      {answerFeedback && (
                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius)', backgroundColor: 'rgba(102, 126, 234, 0.1)', fontWeight: 600 }}>
                          {answerFeedback}
              </div>
            )}
            </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> Click an answer or use gestures: 1 finger = A, 2 = B, 3 = C, 4 = D
                      </p>
            </div>
              </div>
                </motion.div>
            )}
            </div>

            <div className="action-buttons">
              <button 
                className="action-btn success-btn"
                onClick={recordSuccess}
              >
                ✅ I understand
              </button>
              <button 
                className="action-btn help-btn"
                onClick={recordHelp}
              >
                ❓ Please help
              </button>
              <button 
                className="action-btn next-btn"
                onClick={nextItem}
              >
                ⏭️ Next item
              </button>
            </div>

            {showCheckIn && (
              <motion.div 
                className="check-in"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="check-in-question">{checkInQuestion}</p>
                <div className="check-in-buttons">
                  <button 
                    className="action-btn success-btn"
                    onClick={() => {
                      recordSuccess();
                      setShowCheckIn(false);
                    }}
                  >
                    Yes! 👍
                  </button>
                  <button 
                    className="action-btn help-btn"
                    onClick={() => {
                      recordHelp();
                      setShowCheckIn(false);
                    }}
                  >
                    Not really 👎
                  </button>
              </div>
              </motion.div>
            )}

            <div className="session-controls">
              <button 
                className="end-session-btn"
                onClick={endSession}
                disabled={savingReport}
              >
                {savingReport ? '💾 Saving Report...' : reportSaved ? '✅ Report Saved! View Profile' : 'End Session & View Profile'}
              </button>
              {reportSaved && (
                <motion.p 
                  className="report-saved-message"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  ✓ Report saved to Firebase successfully!
                </motion.p>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </motion.div>
  );
}
