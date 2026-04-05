import { motion } from 'framer-motion';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Home.css';
import './Landing.css';
import './Practice.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BuddyButton } from '../components/BuddyButton';
import { BuddyPracticeGame } from '../components/BuddyPracticeGame';
import { BuddyHelpGuide } from '../components/BuddyHelpGuide';
import gestureIcon from '../assets/images/gestureicon.png';
import audioIcon from '../assets/images/audioicon.png';
import simplifyIcon from '../assets/images/simplifyimage.png';
import iconsModeImage from '../assets/images/iconimage.png';
import threeStickersIcon from '../assets/images/threestickers.png';
import fourStickersIcon from '../assets/images/fourstickers.png';
import fiveStickersIcon from '../assets/images/fivestickers.png';
import sixStickersIcon from '../assets/images/sixstickers.png';
import { StickerProgress } from '../components/StickerProgress';

type LearningMode = 'audio' | 'icons' | 'gesture' | 'simple';
type GestureType = 'open' | 'fist' | 'point' | 'wave' | '1' | '2' | '3' | '4' | 'thumbsUp' | 'thumbsDown' | '-';

interface ModeStats {
  time: number;
  interactions: number;
  frustration: number;
  accuracy: number;
  responseTime: number[];
  attempts: number;
  successes: number;
}

export function Practice() {
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignmentId');
  const [savingReport, setSavingReport] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const saveInProgressRef = useRef(false);
  
  // MediaPipe Hands and Webcam states
  const [mpStatus, setMpStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const [difficulty, setDifficulty] = useState<number>(1);
  const [autoSwitched, setAutoSwitched] = useState<boolean>(false);
  const [_persistentProfile, setPersistentProfile] = useState<any>(null);
  const [switchReason, setSwitchReason] = useState<string | null>(null);
  const [showSwitchTooltip, setShowSwitchTooltip] = useState<boolean>(false);
  
  // Assignment loading states
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);

  // Buddy Button states
  type BuddyMode = 'none' | 'try-me' | 'practice' | 'help';
  const [buddyMode, setBuddyMode] = useState<BuddyMode>('none');
  const [showPracticeGame, setShowPracticeGame] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  
  // Mode statistics tracking
  const [modeStats, setModeStats] = useState<Record<LearningMode, ModeStats>>({
    audio: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    icons: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    gesture: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 },
    simple: { time: 0, interactions: 0, frustration: 0, accuracy: 0, responseTime: [], attempts: 0, successes: 0 }
  });

  const getDifficultyTheme = (diff: number) => {
    const level = Math.max(1, Math.min(5, Math.round(diff))) as 1 | 2 | 3 | 4 | 5;
    const slate = ['#1e293b', '#1e293b', '#0f172a', '#0f172a', '#020617'][level - 1];
    return {
      primary: '#0891b2',
      secondary: 'rgba(255, 255, 255, 0.88)',
      accent: 'rgba(255, 255, 255, 0.78)',
      text: slate,
      border: '#e2e8f0',
      background: '#f8fafc'
    };
  };
  const theme = getDifficultyTheme(difficulty);
  
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

  // Load assignment and questions
  useEffect(() => {
    const loadAssignment = async () => {
      if (!assignmentId || !currentUser) {
        navigate('/home');
        return;
      }

      try {
        // Load assignment
        const assignmentDoc = await getDoc(doc(db, 'assignments', assignmentId));
        if (!assignmentDoc.exists()) {
          console.error('[Practice] Assignment document does not exist:', assignmentId);
          setLoading(false);
          alert('Assignment not found');
          navigate('/home');
          return;
        }

        console.log('[Practice] Assignment document found, reading data...');
        const assignmentData = assignmentDoc.data();
        console.log('[Practice] Assignment data:', {
          mcqSetId: assignmentData?.mcqSetId,
          assignedStudentIds: assignmentData?.assignedStudentIds
        });

        if (!assignmentData?.assignedStudentIds?.includes(currentUser.uid)) {
          console.error('[Practice] User not assigned to assignment');
          setLoading(false);
          alert('You are not assigned to this assignment');
          navigate('/home');
          return;
        }

        const mcqSetId = assignmentData.mcqSetId;
        if (!mcqSetId) {
          console.error('[Practice] Assignment missing mcqSetId');
          setLoading(false);
          alert('Assignment has no MCQ set');
          navigate('/home');
          return;
        }

        // Load MCQ set
        console.log('[Practice] Loading MCQ set:', mcqSetId);
        const mcqSetDoc = await getDoc(doc(db, 'mcqSets', mcqSetId));
        if (!mcqSetDoc.exists()) {
          console.error('[Practice] MCQ set document does not exist:', mcqSetId);
          setLoading(false);
          alert('MCQ set not found');
          navigate('/home');
          return;
        }

        console.log('[Practice] MCQ set document found, reading slides...');
        const mcqSetData = mcqSetDoc.data();
        const slides = mcqSetData?.slides || [];
        console.log('[Practice] Slides count:', slides.length);

        // Convert slides to questions
        const processedQuestions = slides
          .filter((slide: any) => slide?.question && Array.isArray(slide?.options))
          .map((slide: any, index: number) => {
            const options = slide.options.filter((opt: any) => opt && String(opt).trim() !== '');
            
            return {
              text: slide.question || `Question ${index + 1}`,
              answers: options.map((opt: string, idx: number) => ({
                letter: String.fromCharCode(65 + idx),
                value: String(opt).trim()
              })),
              correctAnswer: (slide.correctAnswer || '').trim(),
              correctAnswers: Array.isArray(slide.correctAnswers) 
                ? slide.correctAnswers.map((ca: any) => String(ca).trim()).filter(Boolean)
                : [],
              questionType: slide.questionType || 'multipleChoice',
              imageData: slide.imageData || null
            };
          })
          .filter((q: any) => q.answers.length > 0);

        console.log('[Practice] Processed questions count:', processedQuestions.length);

        if (processedQuestions.length === 0) {
          console.error('[Practice] No valid questions after processing');
          setLoading(false);
          alert('No valid questions found in this assignment');
          navigate('/home');
          return;
        }

        // Apply shuffle settings
        let finalQuestions = processedQuestions;
        if (assignmentData.settings?.shuffleQuestions) {
          for (let i = finalQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
          }
        }

        if (assignmentData.settings?.shuffleOptions) {
          finalQuestions = finalQuestions.map((q: any) => {
            const shuffledIndices = [...Array(q.answers.length).keys()];
            for (let i = shuffledIndices.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
            }

            const shuffledAnswers = shuffledIndices.map((idx) => q.answers[idx]);
            const originalCorrectAnswer = q.correctAnswer;
            const originalCorrectAnswers = q.correctAnswers;

            // Find new letter for correct answer(s)
            let newCorrectAnswer = '';
            let newCorrectAnswers: string[] = [];

            if (q.questionType === 'multipleChoice') {
              const correctIndex = q.answers.findIndex((a: any) => a.value === originalCorrectAnswer);
              if (correctIndex >= 0) {
                const newIndex = shuffledIndices.indexOf(correctIndex);
                newCorrectAnswer = shuffledAnswers[newIndex].letter;
              }
            } else {
              newCorrectAnswers = originalCorrectAnswers.map((correctValue: string) => {
                const correctIndex = q.answers.findIndex((a: any) => a.value === correctValue);
                if (correctIndex >= 0) {
                  const newIndex = shuffledIndices.indexOf(correctIndex);
                  return shuffledAnswers[newIndex].letter;
                }
                return '';
              }).filter(Boolean);
            }

            return {
              ...q,
              answers: shuffledAnswers,
              correctAnswer: newCorrectAnswer, // After shuffle, correctAnswer is a letter (A, B, C, D)
              correctAnswers: newCorrectAnswers
            };
          });
        }
        
        // Always convert correctAnswer to letter for consistency (even if not shuffled)
        finalQuestions = finalQuestions.map((q: any) => {
          // If correctAnswer is still a value (not shuffled), convert to letter
          if (q.correctAnswer && q.correctAnswer.length > 1) {
            const correctAnswerObj = q.answers.find((a: any) => a.value === q.correctAnswer);
            if (correctAnswerObj) {
              return {
                ...q,
                correctAnswer: correctAnswerObj.letter // Convert value to letter
              };
            }
          }
          return q;
        });

        setQuestions(finalQuestions);
        setCurrentQuestionIndex(0);
        setLoading(false);

      } catch (error) {
        console.error('Error loading assignment:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code,
          assignmentId,
          currentUserId: currentUser?.uid
        });
        setLoading(false);
        alert(`Failed to load assignment: ${error instanceof Error ? error.message : String(error)}`);
        navigate('/home');
      }
    };

    loadAssignment();
  }, [assignmentId, currentUser, navigate]);

  // Load persistent learning profile
  useEffect(() => {
    async function loadPersistentProfile() {
      if (!currentUser) return;
      
      try {
        const profileDoc = await getDoc(doc(db, 'users', currentUser.uid, 'learningProfile', 'current'));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setPersistentProfile(profileData);
          
          if (profileData.averageAccuracy !== undefined) {
            if (profileData.averageAccuracy >= 80) {
              setDifficulty(Math.min(5, (profileData.averageDifficulty || 1) + 1));
            } else if (profileData.averageAccuracy < 50) {
              setDifficulty(Math.max(1, (profileData.averageDifficulty || 3) - 1));
            } else {
              setDifficulty(profileData.averageDifficulty || 3);
            }
          } else {
            setDifficulty(profileData.averageDifficulty || 1);
          }
        } else {
          setDifficulty(1);
        }
      } catch (error) {
        console.error('Error loading persistent profile:', error);
        setDifficulty(1);
      }
    }
    
    loadPersistentProfile();
  }, [currentUser]);

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
      setGesture('-');
      setGestureConfidence(0);
      setGestureState('IDLE');
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    } else {
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

  // Smooth gesture detection
  function getSmoothedGesture(history: Array<{ gesture: GestureType; confidence: number; time: number }>): { gesture: GestureType; confidence: number } {
    if (history.length === 0) return { gesture: '-', confidence: 0 };
    
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
    
    let bestGesture: GestureType = '-';
    let bestScore = 0;
    
    for (const [gesture, data] of Object.entries(gestureGroups)) {
      const avgConfidence = data.totalConfidence / data.count;
      const score = data.count * avgConfidence;
      
      if (score > bestScore) {
        bestScore = score;
        bestGesture = gesture as GestureType;
      }
    }
    
    if (bestGesture !== '-' && gestureGroups[bestGesture]) {
      const avgConfidence = gestureGroups[bestGesture].totalConfidence / gestureGroups[bestGesture].count;
      const frequencyBoost = (gestureGroups[bestGesture].count / history.length) * 10;
      return { gesture: bestGesture, confidence: Math.min(95, avgConfidence + frequencyBoost) };
    }
    
    return { gesture: bestGesture, confidence: 0 };
  }

  // Improved finger extension detection
  function isFingerExtended(tip: any, pip: any, mcp: any): boolean {
    const verticalCheck = tip.y < pip.y - 0.02;
    const distFromMcp = Math.sqrt(
      Math.pow(tip.x - mcp.x, 2) + Math.pow(tip.y - mcp.y, 2)
    );
    const pipDistFromMcp = Math.sqrt(
      Math.pow(pip.x - mcp.x, 2) + Math.pow(pip.y - mcp.y, 2)
    );
    const distanceCheck = distFromMcp > pipDistFromMcp * 1.15;
    const angleCheck = distFromMcp > pipDistFromMcp * 1.2;
    
    return verticalCheck && distanceCheck && angleCheck;
  }

  // Helper function to check if a single hand shows thumbs down
  function isThumbsDown(landmarks: any[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;
    
    const thumbTip = landmarks[4];
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    
    // 1. Vertical Check: Is the thumb tip significantly lower than the knuckles?
    // Use index MCP as reference point (more stable than thumb IP)
    const isDown = thumbTip.y > indexMcp.y + 0.05;
    
    // 2. Fist Check: Are the other fingers curled?
    // (Comparing finger tips to their respective MCP joints)
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    
    const indexMcpJoint = landmarks[5];
    const middleMcpJoint = landmarks[9];
    const ringMcpJoint = landmarks[13];
    const pinkyMcpJoint = landmarks[17];
    
    const fingersCurled = [
      indexTip.y > indexMcpJoint.y,
      middleTip.y > middleMcpJoint.y,
      ringTip.y > ringMcpJoint.y,
      pinkyTip.y > pinkyMcpJoint.y
    ].every(curled => curled);
    
    // 3. Additional validation: thumb should be below wrist
    const thumbBelowWrist = thumbTip.y > wrist.y - 0.05;
    
    return isDown && fingersCurled && thumbBelowWrist;
  }

  // Classify gesture from hand landmarks
  function classifyGestureFromLandmarks(allLandmarks: any[] | any): { gesture: GestureType; confidence: number } {
    const landmarksArray = Array.isArray(allLandmarks) && allLandmarks.length > 0 && Array.isArray(allLandmarks[0]) 
      ? allLandmarks as any[][]
      : [allLandmarks as any[]];
    
    if (landmarksArray.length >= 2) {
      console.log(`🔍 Detected ${landmarksArray.length} hands - checking for two thumbs down FIRST`);
      
      let thumbsDownCount = 0;
      let totalHands = landmarksArray.length;
      
      for (let i = 0; i < landmarksArray.length; i++) {
        const isDown = isThumbsDown(landmarksArray[i]);
        console.log(`  Hand ${i + 1}: ${isDown ? 'Thumbs Down' : 'Other gesture'}`, {
          thumbTipY: landmarksArray[i][4]?.y,
          indexMcpY: landmarksArray[i][5]?.y,
          difference: landmarksArray[i][4]?.y - landmarksArray[i][5]?.y
        });
        if (isDown) {
          thumbsDownCount++;
        }
      }
      
      console.log(`📊 Thumbs down count: ${thumbsDownCount} out of ${landmarksArray.length} hands`);
      
      if (thumbsDownCount >= 2) {
        const confidence = totalHands === 2 && thumbsDownCount === 2 ? 95 : Math.min(90, 80 + (thumbsDownCount / totalHands) * 10);
        return { gesture: 'thumbsDown', confidence };
      }
    }
    
    const landmarks = landmarksArray[0];
    if (!landmarks || landmarks.length < 21) {
      return { gesture: '-', confidence: 0 };
    }

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

    const indexExtended = isFingerExtended(indexTip, indexPip, indexMcp);
    const middleExtended = isFingerExtended(middleTip, middlePip, middleMcp);
    const ringExtended = isFingerExtended(ringTip, ringPip, ringMcp);
    const pinkyExtended = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp);

    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;
    
    const thumbExtendedUp = thumbTip.y < thumbIp.y;
    const thumbExtendedDown = thumbTip.y > thumbIp.y && (thumbTip.y - thumbIp.y) > 0.02;
    const thumbHorizontal = Math.abs(thumbTip.x - thumbIp.x) > Math.abs(thumbTip.y - thumbIp.y);
    
    // Thumbs up
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended && 
        thumbExtendedUp && !thumbHorizontal && !thumbExtendedDown) {
      const thumbAngle = Math.abs(thumbTip.x - thumbIp.x);
      const confidence = Math.min(95, 75 + (1 - thumbAngle * 5) * 20);
      return { gesture: 'thumbsUp', confidence: Math.max(80, confidence) };
    }
    
    // Number gestures
    if (!thumbExtendedDown && (thumbHorizontal || !thumbExtendedUp)) {
      if (extendedCount === 1 && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        return { gesture: '1', confidence: 90 };
      }
      
      if (extendedCount === 2 && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
        return { gesture: '2', confidence: 90 };
      }
      
      if (extendedCount === 3 && indexExtended && middleExtended && ringExtended && !pinkyExtended) {
        return { gesture: '3', confidence: 90 };
      }
      
      if (extendedCount === 4 && indexExtended && middleExtended && ringExtended && pinkyExtended) {
        return { gesture: '4', confidence: 90 };
      }
    }
    
    // Pointer finger pointing left/right removed - using buttons for navigation instead
    
    // Legacy gestures
    if (extendedCount === 4 && thumbExtendedUp) {
      return { gesture: 'open', confidence: 90 };
    } else if (extendedCount === 0 && !thumbExtendedUp && !thumbExtendedDown) {
      return { gesture: 'fist', confidence: 85 };
    } else if (extendedCount >= 2 && extendedCount <= 3) {
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
    
    if (m === 'audio') {
      setTimeout(() => {
        const currentQuestion = questions[currentQuestionIndex];
        if (currentQuestion) {
          speakText(currentQuestion.text);
        }
      }, 300);
    }
  }, [currentQuestionIndex, questions]);

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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const playEarcon = useCallback((kind: 'tap' | 'success' | 'wrong') => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const mk = (freq: number, dur: number, vol: number, when: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = vol;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + dur);
      };
      if (kind === 'tap') mk(520, 0.04, 0.06, now);
      else if (kind === 'success') {
        mk(660, 0.08, 0.08, now);
        mk(880, 0.1, 0.07, now + 0.06);
      } else mk(220, 0.12, 0.05, now);
    } catch {
      /* ignore */
    }
  }, []);

  // Adaptive difficulty adjustment
  useEffect(() => {
    if (attempts < 3) return;
    
    const currentAccuracy = attempts > 0 ? (successes / attempts) * 100 : 0;
    const avgResponseTime = modeStats[currentMode].responseTime.length > 0
      ? modeStats[currentMode].responseTime.reduce((a, b) => a + b, 0) / modeStats[currentMode].responseTime.length
      : 0;
    
    if (currentAccuracy >= 80 && avgResponseTime < 3000 && difficulty < 5) {
      setDifficulty((prev) => Math.min(5, prev + 0.5));
    } else if ((currentAccuracy < 50 || modeStats[currentMode].frustration > 3) && difficulty > 1) {
      setDifficulty((prev) => Math.max(1, prev - 0.5));
    }
  }, [successes, attempts, modeStats, currentMode, difficulty]);

  // Auto mode switching
  useEffect(() => {
    const currentFrustration = modeStats[currentMode].frustration;
    const currentInteractions = modeStats[currentMode].interactions;
    
    if (currentMode === 'audio' && currentFrustration >= 2 && currentInteractions >= 3 && !autoSwitched) {
      const iconsFrustration = modeStats.icons.frustration;
      const simpleFrustration = modeStats.simple.frustration;
      
      const targetMode = simpleFrustration < iconsFrustration ? 'simple' : 'icons';
      const reason = `We switched to ${targetMode === 'icons' ? 'Icons' : 'Simple'} Mode because you asked for help ${currentFrustration} time${currentFrustration > 1 ? 's' : ''}.`;
      
      changeMode(targetMode);
      setAutoSwitched(true);
      setSwitchReason(reason);
      setShowSwitchTooltip(true);
      speakText(`Switching to ${targetMode} mode to help you learn better.`);
      
      setTimeout(() => setShowSwitchTooltip(false), 10000);
      setTimeout(() => {
        setAutoSwitched(false);
        setSwitchReason(null);
      }, 30000);
    }
  }, [modeStats, currentMode, autoSwitched, changeMode]);

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
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setSelectedAnswers([]);
      setAnswerFeedback(null);
      setModeStart(Date.now());
    } else {
      setSessionOver(true);
    }
  }, [currentQuestionIndex, questions.length]);

  const previousItem = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setSelectedAnswer(null);
      setSelectedAnswers([]);
      setAnswerFeedback(null);
      setModeStart(Date.now());
    }
  }, [currentQuestionIndex]);

  // Try Me Mode - Add/remove body class
  useEffect(() => {
    if (buddyMode === 'try-me') {
      document.body.classList.add('try-me-active');
    } else {
      document.body.classList.remove('try-me-active');
    }
    return () => {
      document.body.classList.remove('try-me-active');
    };
  }, [buddyMode]);

  // Buddy Button handlers
  const handleBuddyModeChange = useCallback((mode: BuddyMode) => {
    setBuddyMode(mode);
  }, []);

  const handleTryMeClick = useCallback(() => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        "Try Me mode is now active! Hover over any button to learn what it does. Click buttons to see demonstrations without actually performing the action."
      );
      utterance.rate = 0.85;
      speechSynthesis.speak(utterance);
    }
  }, []);

  const handlePracticeClick = useCallback(() => {
    setShowPracticeGame(true);
  }, []);

  const handleHelpClick = useCallback(() => {
    setShowHelpGuide(true);
  }, []);

  const handlePracticeComplete = useCallback(() => {
    setShowPracticeGame(false);
    setBuddyMode('none');
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance("Great job! You're now a gesture master!");
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  }, []);

  // Tooltip explanations for Try Me mode
  const getButtonExplanation = (buttonType: string): string => {
    const explanations: Record<string, string> = {
      'answer-a': 'This button selects Answer A. You can also use 1 finger gesture.',
      'answer-b': 'This button selects Answer B. You can also use 2 fingers gesture.',
      'answer-c': 'This button selects Answer C. You can also use 3 fingers gesture.',
      'answer-d': 'This button selects Answer D. You can also use 4 fingers gesture.',
      'understand': 'This button means "I understand". You can also use thumbs up gesture.',
      'help': 'This button asks for help. You can also use thumbs down gesture.',
      'next': 'This button moves to the next question.',
      'previous': 'This button moves to the previous question.',
      'mode-switch': 'This button changes the learning mode to help you learn better.',
    };
    return explanations[buttonType] || 'This button helps you interact with the learning interface.';
  };

  // Handle answer selection
  const handleAnswerSelection = useCallback((answer: string) => {
    // In Try Me mode, show explanation instead of actual action
    if (buddyMode === 'try-me') {
      const explanation = `This button would select Answer ${answer}. In real mode, this would check if your answer is correct.`;
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(explanation);
        utterance.rate = 0.85;
        speechSynthesis.speak(utterance);
      }
      alert(explanation);
      return;
    }
    if (questions.length === 0) return;
    
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    playEarcon('tap');
    
    if (currentQuestion.questionType === 'multipleChoice') {
      // Always set the selected answer first so it's visually selected
      setSelectedAnswer(answer);
      
      // Support both single correctAnswer and multiple correctAnswers
      const correctAnswers = currentQuestion.correctAnswers && currentQuestion.correctAnswers.length > 0
        ? currentQuestion.correctAnswers.map((ca: string) => ca.toUpperCase())
        : currentQuestion.correctAnswer
          ? [currentQuestion.correctAnswer.toUpperCase()]
          : [];
      
      const isCorrect = correctAnswers.includes(answer.toUpperCase());
      
      if (isCorrect) {
        playEarcon('success');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(25);
        }
        recordSuccess();
        const correctCount = correctAnswers.length;
        if (correctCount > 1) {
          setAnswerFeedback(`✅ Correct! ${correctCount > 1 ? 'This is one of the correct answers!' : 'Great job!'}`);
          speakText('Correct! This is one of the correct answers!');
        } else {
          setAnswerFeedback('✅ Correct! Great job!');
          speakText('Correct! Great job!');
        }
        
        // Keep the answer selected and visible - don't clear it immediately
        // Move to next question after showing feedback
        setTimeout(() => {
          setAnswerFeedback(null);
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setSelectedAnswer(null);
            setSelectedAnswers([]);
            setAnswerFeedback(null);
          } else {
            setAnswerFeedback('🎉 You completed all questions!');
            setSessionOver(true);
          }
        }, 2000);
      } else {
        playEarcon('wrong');
        setAttempts((a) => a + 1);
        setAnswerFeedback(`❌ Not quite. Try again!`);
        speakText('Try again! You can do it!');
        
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
        
        setTimeout(() => {
          setSelectedAnswer(null);
          setAnswerFeedback(null);
        }, 2000);
      }
    } else {
      const newSelected = selectedAnswers.includes(answer)
        ? selectedAnswers.filter(a => a !== answer)
        : [...selectedAnswers, answer];
      setSelectedAnswers(newSelected);
      
      const allCorrectSelected = currentQuestion.correctAnswers.every((ca: string) => newSelected.includes(ca));
      const noIncorrectSelected = newSelected.every(sel => currentQuestion.correctAnswers.includes(sel));
      
      if (allCorrectSelected && noIncorrectSelected && newSelected.length === currentQuestion.correctAnswers.length) {
        playEarcon('success');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(25);
        }
        recordSuccess();
        setAnswerFeedback('✅ Correct! Great job!');
        speakText('Correct! Great job!');
        
        setTimeout(() => {
          setAnswerFeedback(null);
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setSelectedAnswer(null);
            setSelectedAnswers([]);
            setAnswerFeedback(null);
          } else {
            setAnswerFeedback('🎉 You completed all questions!');
            setSessionOver(true);
          }
        }, 2000);
      }
    }
  }, [buddyMode, currentQuestionIndex, questions, selectedAnswers, currentMode, modeStart, playEarcon, recordSuccess]);

  const handleAnswerSelectionRef = useRef(handleAnswerSelection);
  handleAnswerSelectionRef.current = handleAnswerSelection;

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
    if (saveInProgressRef.current || savingReport || reportSaved || sessionOver) {
      return;
    }

    saveInProgressRef.current = true;
    const now = Date.now();
    
    setSavingReport(true);
    setSessionOver(true);
    
    const currentAttempts = attempts;
    const currentSuccesses = successes;
    const currentHelpCount = helpCount;
    
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
    
    setModeStats((currentStats) => {
      const updatedStats = { ...currentStats };
      updatedStats[currentMode] = {
        ...updatedStats[currentMode],
        time: updatedStats[currentMode].time + (now - modeStart)
      };
      
      const modes: LearningMode[] = ['audio', 'icons', 'gesture', 'simple'];
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

      finalStats = updatedStats;
      
      const leastEffectiveMode = sortedByFrustration[sortedByFrustration.length - 1];
      const leastEffectiveStats = updatedStats[leastEffectiveMode];
      const frustrationReason = leastEffectiveStats.frustration > 0
        ? `Student showed frustration ${leastEffectiveStats.frustration} time${leastEffectiveStats.frustration > 1 ? 's' : ''} in ${leastEffectiveMode} mode with ${leastEffectiveStats.accuracy.toFixed(1)}% accuracy, suggesting this modality doesn't align with their learning style.`
        : `Student had low engagement in ${leastEffectiveMode} mode with minimal interactions, indicating this modality may not be effective for their learning preferences.`;
      
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
      setSavingReport(false);
      return;
    }
    
    if (reportSaved) {
      return;
    }
    
    try {
      const totalTime = Object.values(stats).reduce((sum, s) => sum + s.time, 0);
      
      const reportData = {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        timestamp: serverTimestamp(),
        sessionDate: new Date().toISOString(),
        sessionDuration: totalTime,
        totalAttempts: totalAttempts,
        totalSuccesses: totalSuccesses,
        totalHelpRequests: totalHelpRequests,
        successRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0,
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
      
      await addDoc(
        collection(db, 'users', currentUser.uid, 'learningReports'), 
        reportData
      );
      
      await updatePersistentProfile(stats, profile, totalAttempts, totalSuccesses);
      
      setReportSaved(true);
      setSavingReport(false);
      saveInProgressRef.current = false;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code || 'unknown';
      
      let userMessage = 'Failed to save report to Firebase. ';
      if (errorCode === 'permission-denied') {
        userMessage += 'Permission denied. Please check Firestore security rules.';
      } else if (errorCode === 'unavailable') {
        userMessage += 'Firebase is unavailable. Please check your internet connection.';
      } else {
        userMessage += `Error: ${errorMessage}`;
      }
      
      alert(userMessage);
      saveInProgressRef.current = false;
    } finally {
      setSavingReport(false);
    }
  };

  // Update persistent learning profile
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
      
      const modes: LearningMode[] = ['audio', 'icons', 'gesture', 'simple'];
      const totalTime = Object.values(stats).reduce((sum, s) => sum + s.time, 0);
      const sessionAccuracy = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0;
      
      const visualModes = ['icons'];
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
      
      const gestureUsagePercent = totalTime > 0 ? (stats.gesture.time / totalTime) * 100 : 0;
      const hasGestureReinforcement = gestureUsagePercent > 20;
      
      if (existingProfile.exists()) {
        const existingData = existingProfile.data();
        const totalSessions = (existingData.totalSessions || 0) + 1;
        const previousAvgAccuracy = existingData.averageAccuracy || 0;
        const previousAvgDifficulty = existingData.averageDifficulty || 1;
        
        const newAvgAccuracy = (previousAvgAccuracy * 0.7) + (sessionAccuracy * 0.3);
        const newAvgDifficulty = (previousAvgDifficulty * 0.7) + (difficulty * 0.3);
        
        const modePreferences = existingData.modePreferences || {};
        modes.forEach(mode => {
          const modeTimePercent = totalTime > 0 ? (stats[mode].time / totalTime) * 100 : 0;
          if (!modePreferences[mode]) {
            modePreferences[mode] = modeTimePercent;
          } else {
            modePreferences[mode] = (modePreferences[mode] * 0.7) + (modeTimePercent * 0.3);
          }
        });
        
        const previousLearningStyle = existingData.learningStyle || 'mixed';
        const learningStyleHistory = existingData.learningStyleHistory || [previousLearningStyle];
        learningStyleHistory.push(learningStyle);
        if (learningStyleHistory.length > 10) {
          learningStyleHistory.shift();
        }
        
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
          trendAccuracy: sessionAccuracy > previousAvgAccuracy ? 'improving' : 
                        sessionAccuracy < previousAvgAccuracy ? 'declining' : 'stable',
          trendDifficulty: difficulty > previousAvgDifficulty ? 'increasing' : 
                          difficulty < previousAvgDifficulty ? 'decreasing' : 'stable'
        }, { merge: true });
      } else {
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
      
    } catch (error) {
      console.error('Error updating persistent learning profile:', error);
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
        const overlayCanvas = overlayCanvasRef.current;
        
        if (!video || !canvas || !overlayCanvas) {
          if (mounted) setMpStatus('error');
          return;
        }
        
        // Set overlay canvas size to match video
        const updateCanvasSize = () => {
          if (video && overlayCanvas && mounted) {
            const width = video.videoWidth || 640;
            const height = video.videoHeight || 480;
            overlayCanvas.width = width;
            overlayCanvas.height = height;
            const mainCanvas = canvasRef.current;
            if (mainCanvas) {
              mainCanvas.width = width;
              mainCanvas.height = height;
            }
          }
        };
        
        // Update canvas size when video metadata loads
        video.addEventListener('loadedmetadata', updateCanvasSize);
        updateCanvasSize(); // Initial size

        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 2, // Crucial for two-handed gestures
          modelComplexity: 1,
          minDetectionConfidence: 0.5, // Lower threshold for better two-hand detection
          minTrackingConfidence: 0.5 // Lower threshold for more stable tracking
        });

        const ctx = canvas.getContext('2d');
        const overlayCtx = overlayCanvas.getContext('2d');
        if (!ctx || !overlayCtx) {
          if (mounted) setMpStatus('error');
          return;
        }

        let lastActionTime = 0;
        let currentGestureState: GestureState = 'IDLE';
        let gestureDetectedTime = 0;
        let stableGestureCount = 0;
        let lastGestureType: GestureType = '-';
        const STABLE_THRESHOLD = 600;
        const CONFIRMATION_THRESHOLD = 75;
        const COOLDOWN_DURATION = 2000;
        const MIN_STABLE_FRAMES = 4;
        
        const gestureHistory: Array<{ gesture: GestureType; confidence: number; time: number }> = [];
        const HISTORY_SIZE = 5;

        hands.onResults((results) => {
          if (!mounted || !gestureDetectionEnabled) {
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.image) {
              ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            }
            ctx.restore();
            // Clear overlay
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            return;
          }
          
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          ctx.restore();

          // Clear overlay canvas
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          const now = Date.now();
          const timeSinceLastAction = now - lastActionTime;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const allLandmarks = results.multiHandLandmarks;
            
            // Debug: Log number of hands detected
            console.log(`👋 Hands detected: ${allLandmarks.length}`, {
              timestamp: new Date().toISOString(),
              handCount: allLandmarks.length
            });
            
            // Draw hand landmarks on overlay canvas (semi-transparent ghost hand)
            for (let handIdx = 0; handIdx < allLandmarks.length; handIdx++) {
              const landmarks = allLandmarks[handIdx];
              
              // Use different colors for each hand with transparency
              const baseColor = handIdx === 0 ? '#22c55e' : '#f59e0b';
              const confirmedColor = '#10b981';
              const detectingColor = '#3b82f6';
              
              // Set overlay canvas styles with transparency
              overlayCtx.globalAlpha = 0.7; // Semi-transparent
              overlayCtx.strokeStyle = currentGestureState === 'CONFIRMED' ? confirmedColor : 
                                       currentGestureState === 'DETECTING' ? detectingColor : baseColor;
              overlayCtx.fillStyle = currentGestureState === 'CONFIRMED' ? confirmedColor : baseColor;
              overlayCtx.lineWidth = currentGestureState === 'CONFIRMED' ? 3 : 2;

              // Draw landmarks (larger for visibility)
              for (const landmark of landmarks) {
                const x = landmark.x * overlayCanvas.width;
                const y = landmark.y * overlayCanvas.height;
                overlayCtx.beginPath();
                overlayCtx.arc(x, y, 6, 0, 2 * Math.PI);
                overlayCtx.fill();
              }

              // Connect landmarks with lines (hand skeleton)
              const connections = [
                [0, 1, 2, 3, 4],
                [0, 5, 6, 7, 8],
                [0, 9, 10, 11, 12],
                [0, 13, 14, 15, 16],
                [0, 17, 18, 19, 20]
              ];

              overlayCtx.strokeStyle = currentGestureState === 'CONFIRMED' ? confirmedColor : baseColor;
              overlayCtx.globalAlpha = 0.6; // Slightly more transparent for lines
              for (const connection of connections) {
                overlayCtx.beginPath();
                for (let i = 0; i < connection.length; i++) {
                  const idx = connection[i];
                  const landmark = landmarks[idx];
                  const x = landmark.x * overlayCanvas.width;
                  const y = landmark.y * overlayCanvas.height;
                  if (i === 0) overlayCtx.moveTo(x, y);
                  else overlayCtx.lineTo(x, y);
                }
                overlayCtx.stroke();
              }
              overlayCtx.globalAlpha = 0.7; // Reset for next hand
            }
            
            // Also draw on main canvas for compatibility
            for (let handIdx = 0; handIdx < allLandmarks.length; handIdx++) {
              const landmarks = allLandmarks[handIdx];
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

              const connections = [
                [0, 1, 2, 3, 4],
                [0, 5, 6, 7, 8],
                [0, 9, 10, 11, 12],
                [0, 13, 14, 15, 16],
                [0, 17, 18, 19, 20]
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

            const { gesture: classification, confidence } = classifyGestureFromLandmarks(allLandmarks);
            
            gestureHistory.push({ gesture: classification, confidence, time: now });
            if (gestureHistory.length > HISTORY_SIZE) {
              gestureHistory.shift();
            }
            
            const smoothed = getSmoothedGesture(gestureHistory);
            const finalClassification = smoothed.gesture;
            const finalConfidence = smoothed.confidence;
            
            setDetectStatus('ready');
            setGesture(finalClassification);
            setGestureConfidence(finalConfidence);

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
                if (finalClassification === lastGestureType) {
                  stableGestureCount++;
                } else {
                  if (finalConfidence >= 85) {
                    stableGestureCount = MIN_STABLE_FRAMES - 1;
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
                    '1': () => {
                      handleAnswerSelectionRef.current('A');
                    },
                    '2': () => {
                      handleAnswerSelectionRef.current('B');
                    },
                    '3': () => {
                      handleAnswerSelectionRef.current('C');
                    },
                    '4': () => {
                      handleAnswerSelectionRef.current('D');
                    },
                    thumbsUp: () => {
                      recordSuccess();
                      setAnswerFeedback('Great! You understand this.');
                      speakText('Great! You understand this.');
                    },
                    thumbsDown: () => {
                      recordHelp();
                      setAnswerFeedback("I don't understand. Let me explain this again.");
                      speakText("I don't understand. Let me explain this again.");
                    },
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
              }
            } else {
              if (currentGestureState === 'DETECTING' && (now - gestureDetectedTime) > 500) {
                currentGestureState = 'IDLE';
                setGestureState('IDLE');
                stableGestureCount = 0;
                lastGestureType = '-';
              }
            }
          } else {
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
  }, [mediaReady, currentMode, recordHelp, changeMode, nextItem, recordSuccess]);

  // Active adaptation
  useEffect(() => {
    const currentFrustration = modeStats[currentMode].frustration;
    const currentAccuracy = modeStats[currentMode].accuracy;
    
    if (currentFrustration >= 3 && currentAccuracy < 50 && modeStats[currentMode].attempts >= 3) {
      const modes: LearningMode[] = ['audio', 'icons', 'gesture', 'simple'];
      const bestAlternative = modes
        .filter(m => m !== currentMode)
        .sort((a, b) => {
          const frustrationDiff = modeStats[a].frustration - modeStats[b].frustration;
          if (frustrationDiff !== 0) return frustrationDiff;
          return modeStats[b].accuracy - modeStats[a].accuracy;
        })[0];
      
      if (bestAlternative) {
        setTimeout(() => {
          changeMode(bestAlternative);
          speakText(`Switching to ${bestAlternative} mode. This might work better for you!`);
        }, 2000);
      }
    }
  }, [modeStats, currentMode, changeMode]);

  // Calculate progress
  const progress = attempts > 0 ? (successes / attempts) * 100 : 0;
  
  // Generate learning profile
  const generateProfile = () => {
    const modes: LearningMode[] = ['audio', 'icons', 'gesture', 'simple'];
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
  const gestureMessages: Partial<Record<GestureType, string>> = {
    '1': '1 finger detected. Answer A selected.',
    '2': '2 fingers detected. Answer B selected.',
    '3': '3 fingers detected. Answer C selected.',
    '4': '4 fingers detected. Answer D selected.',
    'thumbsUp': 'Thumbs up detected. I understand.',
    'thumbsDown': "Two thumbs down detected. I don't understand.",
    '-': ''
  };

  // Loading state
  if (loading) {
    return (
      <div className="landing-wrapper brand-bg-light landing-loading-screen landing-loading-light">
        <p className="text-cyan-solid" style={{ fontWeight: 600, marginBottom: '1rem' }}>
          Loading practice session…
        </p>
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '4px solid rgba(8, 145, 178, 0.2)',
            borderTop: '4px solid var(--brand-cyan)',
            borderRadius: '50%',
            animation: 'practice-spin 1s linear infinite'
          }}
          aria-hidden
        />
        <style>{`
          @keyframes practice-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Error if no questions
  if (questions.length === 0) {
    return (
      <div className="landing-wrapper brand-bg-light" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <h1 className="hero-title-dark" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
          No questions available
        </h1>
        <p className="hero-subtitle-dark" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          This assignment doesn&apos;t have any questions yet.
        </p>
        <button type="button" onClick={() => navigate('/home')} className="btn-cyan-solid-lg">
          Back to home
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const content = currentQuestion?.text || '';

  // Return the UI (same as your Learn component but with dynamic questions)
  return (
    <motion.div 
      className="learn-container landing-wrapper brand-bg-light learn-page-brand" 
      initial="hidden" 
      animate="visible" 
      variants={containerVariants}
    >
      {/* Buddy Button */}
      <BuddyButton
        onModeChange={handleBuddyModeChange}
        onTryMeClick={handleTryMeClick}
        onPracticeClick={handlePracticeClick}
        onHelpClick={handleHelpClick}
      />

      {/* Practice Game */}
      {showPracticeGame && (
        <BuddyPracticeGame
          onComplete={handlePracticeComplete}
          onClose={() => {
            setShowPracticeGame(false);
            setBuddyMode('none');
          }}
        />
      )}

      {/* Help Guide */}
      {showHelpGuide && (
        <BuddyHelpGuide
          onClose={() => {
            setShowHelpGuide(false);
            setBuddyMode('none');
          }}
        />
      )}

      {/* Try Me Mode Tooltip */}
      {buddyMode === 'try-me' && hoveredElement && (
        <motion.div
          className="try-me-tooltip"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'fixed',
            zIndex: 10000,
            pointerEvents: 'none',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            marginTop: '2rem'
          }}
        >
          {getButtonExplanation(hoveredElement)}
        </motion.div>
      )}
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
      
      <motion.nav
        className="glass-nav glass-nav-light learn-top-nav"
        role="navigation"
        aria-label="Practice session"
        variants={itemVariants}
      >
        <motion.button
          type="button"
          onClick={goBack}
          className="btn-ghost-dark"
          aria-label="Go back to home"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          ← Back
        </motion.button>
        <div className="nav-actions learn-nav-actions">
          <span id="practice-nav-progress-label" className="visually-hidden">
            Question progress
          </span>
          <StickerProgress
            total={questions.length}
            currentIndex={currentQuestionIndex}
            labelId="practice-nav-progress-label"
          />
        </div>
      </motion.nav>

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

      <main id="main-content" className="learn-main learn-main--landing" role="main" style={{
        background: `linear-gradient(180deg, ${theme.background} 0%, #f1f5f9 45%, #e2e8f0 100%)`,
        transition: 'background-color 0.5s ease'
      }}>
        {mpStatus === 'error' && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3>⚠️ MediaPipe Loading Error</h3>
            <p>
              {errorMessage ||
                'Failed to load MediaPipe Hands. Please refresh the page or check your internet connection.'}
            </p>
            <button className="logout-button" onClick={() => window.location.reload()}>
              Refresh Page
            </button>
          </motion.div>
        )}
        
        <div className="learn-panes">
          {/* Left Pane: Gesture & Interaction */}
          <motion.div className="learn-pane gesture-pane learn-pane--glass" variants={cardVariants} style={{
            borderColor: theme.border,
            transition: 'background-color 0.5s ease, border-color 0.5s ease'
          }}>
            <h2 className="learn-pane-title" style={{ color: theme.text, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img src={gestureIcon} alt="" className="learn-pane-heading-icon" width={28} height={28} />
              Gesture & Interaction
            </h2>
            
            {mpStatus === 'loading' && (
              <div className="loading-message">
                <p>⏳ Loading MediaPipe Hands...</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Initializing hand detection. Please wait...
                </p>
              </div>
            )}
            
            {currentMode !== 'gesture' && (
            <div className="webcam-section">
              <div className="gesture-engine-container" aria-hidden="true">
                <div
                  className="webcam-wrapper"
                  style={{ position: 'relative', display: 'inline-block' }}
                >
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
                    ref={overlayCanvasRef} 
                    className="ghost-hand-overlay"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      borderRadius: '12px'
                    }}
                  />
                </div>
                <canvas 
                  ref={canvasRef} 
                  className="gesture-canvas"
                />
              </div>
              <div className="detection-status">
                <span className={`status-indicator ${detectStatus === 'ready' ? 'ready' : detectStatus === 'error' ? 'error' : ''}`}>
                  {detectStatus === 'ready' ? '●' : detectStatus === 'error' ? '✗' : '○'}
                </span>
                {detectStatus === 'ready' ? 'Camera Ready' : detectStatus === 'error' ? 'Error' : 'Initializing...'}
                {detectStatus === 'ready' && (
                  <span className="hand-indicator-badge" title="Camera is on for gestures">
                    ✋ Hand camera on
                  </span>
                )}
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
            )}

            <div className="gesture-info">
              <div className="gesture-display">
                <div className="gesture-icon">
                  {gesture === '1' && '1️⃣'}
                  {gesture === '2' && '2️⃣'}
                  {gesture === '3' && <img src={gestureIcon} alt="" style={{ width: '24px', height: '24px', display: 'inline-block' }} />}
                  {gesture === '4' && '4️⃣'}
                  {gesture === 'thumbsUp' && '👍'}
                  {gesture === 'thumbsDown' && '👎'}
                  {gesture === '-' && '—'}
                </div>
                <div className="gesture-label">
                  {gesture === '1' && '1 Finger (Answer A)'}
                  {gesture === '2' && '2 Fingers (Answer B)'}
                  {gesture === '3' && '3 Fingers (Answer C)'}
                  {gesture === '4' && '4 Fingers (Answer D)'}
                  {gesture === 'thumbsUp' && 'Thumbs Up (I understand)'}
                  {gesture === 'thumbsDown' && "Two Thumbs Down (I don't understand)"}
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
                        lastConfirmedGesture === 'thumbsDown' ? "I don't understand" :
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
                    <span className="guide-icon"><img src={gestureIcon} alt="" style={{ width: '24px', height: '24px' }} /></span>
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
                    <span className="guide-icon">👎👎</span>
                    <span>Two Thumbs Down = I don't understand</span>
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
                  <div className="stat">
                    <span className="stat-label">Question:</span>
                    <span className="stat-value">{currentQuestionIndex + 1}/{questions.length}</span>
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
          <motion.div className="learn-pane learning-pane learn-pane--glass" variants={cardVariants}>
            <h2 id="practice-content-heading" className="learn-content-heading">
              <span className="landing-badge-cyan learn-heading-badge">Practice</span>
              <span className="learn-content-heading__title">Assignment</span>
            </h2>
            
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
                  <img src={audioIcon} alt="" className="mode-button-img" width={28} height={28} />
                  Audio
                </button>
                <button 
                  className={`mode-button ${currentMode === 'icons' ? 'active' : ''}`}
                  onClick={() => changeMode('icons')}
                >
                  <img src={iconsModeImage} alt="" className="mode-button-img" width={28} height={28} />
                  Icons
                </button>
                <button 
                  className={`mode-button ${currentMode === 'gesture' ? 'active' : ''}`}
                  onClick={() => changeMode('gesture')}
                >
                  <img src={gestureIcon} alt="" className="mode-button-img" width={28} height={28} />
                  Gesture
                </button>
                <button 
                  className={`mode-button ${currentMode === 'simple' ? 'active' : ''}`}
                  onClick={() => changeMode('simple')}
                >
                  <img src={simplifyIcon} alt="" className="mode-button-img" width={28} height={28} />
                  Simple
                </button>
              </div>
            </div>

            <div className="content-display">
              <div className="mode-indicator">
                <span className="mode-indicator-badge">
                  {currentMode === 'audio' && (
                    <>
                      <img src={audioIcon} alt="" className="mode-indicator-icon" width={16} height={16} />
                      <span>Audio Mode</span>
                    </>
                  )}
                  {currentMode === 'icons' && (
                    <>
                      <img src={iconsModeImage} alt="" className="mode-indicator-icon" width={16} height={16} />
                      <span>Interactive Mode</span>
                    </>
                  )}
                  {currentMode === 'gesture' && (
                    <>
                      <img src={gestureIcon} alt="" className="mode-indicator-icon" width={16} height={16} />
                      <span>Gesture Mode</span>
                    </>
                  )}
                  {currentMode === 'simple' && (
                    <>
                      <img src={simplifyIcon} alt="" className="mode-indicator-icon" width={16} height={16} />
                      <span>Simple Mode</span>
                    </>
                  )}
                </span>
                <span className="mode-indicator-badge" style={{ marginLeft: 'var(--spacing-sm)' }}>
                  Question {currentQuestionIndex + 1} of {questions.length}
                </span>
              </div>
              
              {currentMode === 'audio' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={currentQuestionIndex}
                >
                  <div className="audio-mode">
                    <div className="mode-icon-large" aria-hidden>
                      <img src={audioIcon} alt="" className="mode-icon-large-img" width={64} height={64} />
                    </div>
                    <div className="content-card">
                      {currentQuestion?.imageData && (
                        <img 
                          src={currentQuestion.imageData} 
                          alt="Question" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '300px', 
                            marginBottom: 'var(--spacing-md)',
                            borderRadius: 'var(--border-radius)',
                            objectFit: 'contain'
                          }} 
                        />
                      )}
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600 }}>
                        {currentQuestion?.text || 'No question available'}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {(currentQuestion?.answers || []).map((ans: any) => {
                          // Support both single correctAnswer and multiple correctAnswers
                          const correctAnswers = currentQuestion?.correctAnswers && currentQuestion.correctAnswers.length > 0
                            ? currentQuestion.correctAnswers.map((ca: string) => String(ca).toUpperCase().trim())
                            : currentQuestion?.correctAnswer
                              ? [String(currentQuestion.correctAnswer).toUpperCase().trim()]
                              : [];
                          
                          const isCorrect = correctAnswers.includes(ans.letter.toUpperCase());
                          const isSelected = selectedAnswer === ans.letter;
                          // Show green only if this specific answer is selected AND it's correct
                          // For multiple correct answers: show all correct answers in green when a correct one is selected
                          const showAsCorrect = isSelected && isCorrect || (selectedAnswer && isCorrect && correctAnswers.length > 1);
                          const showAsIncorrect = isSelected && !isCorrect;
                          
                          return (
                          <div
                            key={ans.letter}
                            className={`answer-choice explainable ${showAsCorrect ? 'correct' : showAsIncorrect ? 'incorrect' : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${showAsCorrect ? 'var(--success-color)' : showAsIncorrect ? 'var(--error-color)' : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: showAsCorrect ? 'rgba(34, 197, 94, 0.1)' : showAsIncorrect ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                              cursor: 'pointer',
                              fontWeight: isSelected ? 600 : 400
                            }}
                            onClick={() => handleAnswerSelection(ans.letter)}
                            onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement(`answer-${ans.letter.toLowerCase()}`)}
                            onMouseLeave={() => setHoveredElement(null)}
                            data-buddy-type={`answer-${ans.letter.toLowerCase()}`}
                          >
                            <strong>{ans.letter})</strong> {ans.value}
                          </div>
                          );
                        })}
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

              {currentMode === 'icons' && (
                <motion.div 
                  className="mode-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={currentQuestionIndex}
                >
                  <div className="icons-mode">
                    <div className="content-card">
                      {currentQuestion?.imageData && (
                        <img 
                          src={currentQuestion.imageData} 
                          alt="Question" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '300px', 
                            marginBottom: 'var(--spacing-md)',
                            borderRadius: 'var(--border-radius)',
                            objectFit: 'contain'
                          }} 
                        />
                      )}
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600 }}>
                        {currentQuestion?.text || 'No question available'}
                      </p>
                      <div className="answer-choices" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)' }}>
                        {(currentQuestion?.answers || []).map((ans: any) => {
                          // Support both single correctAnswer and multiple correctAnswers
                          const correctAnswers = currentQuestion?.correctAnswers && currentQuestion.correctAnswers.length > 0
                            ? currentQuestion.correctAnswers.map((ca: string) => String(ca).toUpperCase().trim())
                            : currentQuestion?.correctAnswer
                              ? [String(currentQuestion.correctAnswer).toUpperCase().trim()]
                              : [];
                          
                          const isCorrect = correctAnswers.includes(ans.letter.toUpperCase());
                          const isSelected = selectedAnswer === ans.letter;
                          // Show green only if this specific answer is selected AND it's correct
                          // For multiple correct answers: show all correct answers in green when a correct one is selected
                          const showAsCorrect = isSelected && isCorrect || (selectedAnswer && isCorrect && correctAnswers.length > 1);
                          const showAsIncorrect = isSelected && !isCorrect;
                          
                          return (
                          <motion.button
                            key={ans.letter}
                            className={`icon-button answer-choice explainable ${showAsCorrect ? 'correct' : showAsIncorrect ? 'incorrect' : ''}`}
                            onClick={() => handleAnswerSelection(ans.letter)}
                            onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement(`answer-${ans.letter.toLowerCase()}`)}
                            onMouseLeave={() => setHoveredElement(null)}
                            data-buddy-type={`answer-${ans.letter.toLowerCase()}`}
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                              padding: 'var(--spacing-lg)',
                              border: `2px solid ${showAsCorrect ? 'var(--success-color)' : showAsIncorrect ? 'var(--error-color)' : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: showAsCorrect ? 'rgba(34, 197, 94, 0.1)' : showAsIncorrect ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                              fontWeight: isSelected ? 600 : 400,
                              fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))'
                            }}
                          >
                            <span className="icon-emoji icons-mode-sticker-wrap">
                              {ans.letter === 'A' ? (
                                <img src={threeStickersIcon} alt="" className="icons-mode-sticker-img" width={128} height={128} />
                              ) : ans.letter === 'B' ? (
                                <img src={fourStickersIcon} alt="" className="icons-mode-sticker-img" width={128} height={128} />
                              ) : ans.letter === 'C' ? (
                                <img src={fiveStickersIcon} alt="" className="icons-mode-sticker-img" width={128} height={128} />
                              ) : (
                                <img src={sixStickersIcon} alt="" className="icons-mode-sticker-img" width={128} height={128} />
                              )}
                            </span>
                            <span className="icon-text"><strong>{ans.letter})</strong> {ans.value}</span>
                          </motion.button>
                          );
                        })}
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
                  key={currentQuestionIndex}
                >
                  <div className="gesture-mode">
                    <div className="webcam-section gesture-mode-webcam" style={{
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      marginBottom: 'var(--spacing-lg)',
                      order: -1
                    }}>
                      <div className="gesture-engine-container" aria-hidden="true">
                        <div className="webcam-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
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
                            ref={overlayCanvasRef}
                            className="ghost-hand-overlay"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              pointerEvents: 'none',
                              borderRadius: '12px'
                            }}
                          />
                        </div>
                        <canvas
                          ref={canvasRef}
                          className="gesture-canvas"
                          aria-hidden={true}
                        />
                      </div>
                    </div>
                    <div className="content-card learn-content-card" style={{
                      backgroundColor: theme.secondary,
                      borderColor: theme.border
                    }}>
                      <p className="content-text" style={{ color: theme.text }}>{content}</p>
                    </div>
                    <div className="content-card" style={{
                      marginBottom: 'var(--spacing-md)',
                      backgroundColor: theme.secondary,
                      borderColor: theme.border,
                      transition: 'background-color 0.5s ease, border-color 0.5s ease'
                    }}>
                      {currentQuestion?.imageData && (
                        <img 
                          src={currentQuestion.imageData} 
                          alt="Question" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '300px', 
                            marginBottom: 'var(--spacing-md)',
                            borderRadius: 'var(--border-radius)',
                            objectFit: 'contain'
                          }} 
                        />
                      )}
                      <p className="content-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600, color: theme.text }}>
                        {currentQuestion?.text || 'No question available'}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {(currentQuestion?.answers || []).map((ans: any) => (
                          <div
                            key={ans.letter}
                            className={`answer-choice ${selectedAnswer === ans.letter ? (ans.letter === currentQuestion?.correctAnswer ? 'correct' : 'incorrect') : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${selectedAnswer === ans.letter ? (ans.letter === currentQuestion?.correctAnswer ? 'var(--success-color)' : 'var(--error-color)') : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: selectedAnswer === ans.letter ? (ans.letter === currentQuestion?.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'transparent',
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
                          <span className="instruction-icon"><img src={gestureIcon} alt="" style={{ width: '24px', height: '24px', display: 'inline-block' }} /></span>
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
                          <span className="instruction-icon">👎👎</span>
                          <div>
                            <strong>Two Thumbs Down</strong>
                            <span className="instruction-desc">I don't understand</span>
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
                  key={currentQuestionIndex}
                >
                  <div className="simple-mode">
                    <div className="content-card simplified">
                      {currentQuestion?.imageData && (
                        <img 
                          src={currentQuestion.imageData} 
                          alt="Question" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '300px', 
                            marginBottom: 'var(--spacing-md)',
                            borderRadius: 'var(--border-radius)',
                            objectFit: 'contain'
                          }} 
                        />
                      )}
                      <p className="simple-text" style={{ fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', marginBottom: 'var(--spacing-lg)', fontWeight: 600, lineHeight: '1.6' }}>
                        {currentQuestion?.text || 'No question available'}
                      </p>
                      <div className="answer-choices" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {(currentQuestion?.answers || []).map((ans: any) => {
                          // Support both single correctAnswer and multiple correctAnswers
                          const correctAnswers = currentQuestion?.correctAnswers && currentQuestion.correctAnswers.length > 0
                            ? currentQuestion.correctAnswers.map((ca: string) => String(ca).toUpperCase().trim())
                            : currentQuestion?.correctAnswer
                              ? [String(currentQuestion.correctAnswer).toUpperCase().trim()]
                              : [];
                          
                          const isCorrect = correctAnswers.includes(ans.letter.toUpperCase());
                          const isSelected = selectedAnswer === ans.letter;
                          // Show green only if this specific answer is selected AND it's correct
                          // For multiple correct answers: show all correct answers in green when a correct one is selected
                          const showAsCorrect = isSelected && isCorrect || (selectedAnswer && isCorrect && correctAnswers.length > 1);
                          const showAsIncorrect = isSelected && !isCorrect;
                          
                          return (
                          <div
                            key={ans.letter}
                            className={`answer-choice explainable ${showAsCorrect ? 'correct' : showAsIncorrect ? 'incorrect' : ''}`}
                            style={{
                              padding: 'var(--spacing-md)',
                              border: `2px solid ${showAsCorrect ? 'var(--success-color)' : showAsIncorrect ? 'var(--error-color)' : 'var(--border-color)'}`,
                              borderRadius: 'var(--border-radius)',
                              backgroundColor: showAsCorrect ? 'rgba(34, 197, 94, 0.1)' : showAsIncorrect ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                              cursor: 'pointer',
                              fontWeight: isSelected ? 600 : 400,
                              fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 1.1)'
                            }}
                            onClick={() => handleAnswerSelection(ans.letter)}
                            onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement(`answer-${ans.letter.toLowerCase()}`)}
                            onMouseLeave={() => setHoveredElement(null)}
                            data-buddy-type={`answer-${ans.letter.toLowerCase()}`}
                          >
                            <strong>{ans.letter})</strong> {ans.value}
                          </div>
                          );
                        })}
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
                className="action-btn success-btn explainable"
                onClick={() => {
                  if (buddyMode === 'try-me') {
                    const explanation = "This button means 'I understand'. In real mode, this would record that you understand the question. You can also use thumbs up gesture.";
                    if ('speechSynthesis' in window) {
                      const utterance = new SpeechSynthesisUtterance(explanation);
                      utterance.rate = 0.85;
                      speechSynthesis.speak(utterance);
                    }
                    alert(explanation);
                    return;
                  }
                  recordSuccess();
                }}
                onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement('understand')}
                onMouseLeave={() => setHoveredElement(null)}
                data-buddy-type="understand"
              >
                ✅ I understand
              </button>
              <button 
                className="action-btn help-btn explainable"
                onClick={() => {
                  if (buddyMode === 'try-me') {
                    const explanation = "This button asks for help. In real mode, this would record that you need help and might switch to an easier mode. You can also use thumbs down gesture.";
                    if ('speechSynthesis' in window) {
                      const utterance = new SpeechSynthesisUtterance(explanation);
                      utterance.rate = 0.85;
                      speechSynthesis.speak(utterance);
                    }
                    alert(explanation);
                    return;
                  }
                  recordHelp();
                }}
                onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement('help')}
                onMouseLeave={() => setHoveredElement(null)}
                data-buddy-type="help"
              >
                ❓ Please help
              </button>
              <button 
                className="action-btn previous-btn explainable"
                onClick={() => {
                  if (buddyMode === 'try-me') {
                    const explanation = "This button moves to the previous question. In real mode, this would go back to the previous learning item.";
                    if ('speechSynthesis' in window) {
                      const utterance = new SpeechSynthesisUtterance(explanation);
                      utterance.rate = 0.85;
                      speechSynthesis.speak(utterance);
                    }
                    alert(explanation);
                    return;
                  }
                  previousItem();
                }}
                onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement('previous')}
                onMouseLeave={() => setHoveredElement(null)}
                data-buddy-type="previous"
                disabled={currentQuestionIndex === 0}
              >
                ⏮️ Previous Question
              </button>
              <button 
                className="action-btn next-btn explainable"
                onClick={() => {
                  if (buddyMode === 'try-me') {
                    const explanation = "This button moves to the next question. In real mode, this would advance to the next learning item.";
                    if ('speechSynthesis' in window) {
                      const utterance = new SpeechSynthesisUtterance(explanation);
                      utterance.rate = 0.85;
                      speechSynthesis.speak(utterance);
                    }
                    alert(explanation);
                    return;
                  }
                  nextItem();
                }}
                onMouseEnter={() => buddyMode === 'try-me' && setHoveredElement('next')}
                onMouseLeave={() => setHoveredElement(null)}
                data-buddy-type="next"
                disabled={currentQuestionIndex >= questions.length - 1}
              >
                ⏭️ Next Question
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

      {currentMode === 'gesture' && (
        <div className="learn-gesture-floating-pill" role="status" aria-live="polite">
          <span
            className={
              gesture !== '-'
                ? 'landing-badge-cyan learn-gesture-pill--live'
                : 'learn-gesture-pill-muted'
            }
          >
            {gesture !== '-'
              ? `Detecting: ${gesture}`
              : detectStatus === 'ready'
                ? 'Waiting for gesture…'
                : 'Getting camera ready…'}
          </span>
        </div>
      )}
    </motion.div>
  );
}