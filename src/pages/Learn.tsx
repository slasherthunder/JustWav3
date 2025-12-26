import { motion } from 'framer-motion';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import './Learn.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

type LearningMode = 'audio' | 'image' | 'icons' | 'gesture' | 'simple';
type GestureType = 'open' | 'fist' | 'point' | 'wave' | '-';

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
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    detected: boolean;
    landmarks: number;
    confidence: number;
    classification: string;
  } | null>(null);
  
  // Gesture state machine
  type GestureState = 'IDLE' | 'DETECTING' | 'CONFIRMED' | 'COOLDOWN';
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [lastConfirmedGesture, setLastConfirmedGesture] = useState<GestureType>('-');
  const [cooldownEndTime, setCooldownEndTime] = useState<number>(0);
  const [gestureDetectionEnabled, setGestureDetectionEnabled] = useState<boolean>(true);
  
  // Session tracking
  const [currentMode, setCurrentMode] = useState<LearningMode>('audio');
  const [modeStart, setModeStart] = useState<number>(Date.now());
  const [lastAction, setLastAction] = useState<number>(0);
  const [attempts, setAttempts] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [helpCount, setHelpCount] = useState(0);
  const [sessionOver, setSessionOver] = useState(false);
  
  // Learning content
  const content = 'The water cycle moves water through evaporation, condensation, and precipitation. Water evaporates from oceans and lakes, forms clouds through condensation, and returns as precipitation like rain or snow.';
  const iconMap: Record<string, { icon: string; text: string; description: string }> = {
    water: { icon: '💧', text: 'Water', description: 'Liquid that flows in rivers and oceans' },
    cycle: { icon: '🔄', text: 'Cycle', description: 'A repeating pattern that goes around and around' },
    evaporation: { icon: '☀️', text: 'Evaporation', description: 'When water turns into invisible vapor from heat' },
    condensation: { icon: '🌫️', text: 'Condensation', description: 'When vapor turns into tiny water droplets to make clouds' },
    precipitation: { icon: '🌧️', text: 'Precipitation', description: 'Water falling from clouds as rain or snow' }
  };
  
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

  function goBack() {
    setNavigating(true);
    navigate('/');
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

  // Classify gesture from hand landmarks
  function classifyGestureFromLandmarks(landmarks: any[]): { gesture: GestureType; confidence: number } {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: '-', confidence: 0 };
    }

    // Get key points
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    // Calculate if fingers are extended (tip is above PIP joint in y-coordinate)
    const isExtended = (tip: any, pip: any) => tip.y < pip.y;
    
    const thumbExtended = thumbTip.y < thumbIp.y;
    const indexExtended = isExtended(indexTip, indexPip);
    const middleExtended = isExtended(middleTip, middlePip);
    const ringExtended = isExtended(ringTip, ringPip);
    const pinkyExtended = isExtended(pinkyTip, pinkyPip);

    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

    // Classify gestures
    if (extendedCount === 4 && thumbExtended) {
      // All fingers extended = open hand
      return { gesture: 'open', confidence: 90 };
    } else if (extendedCount === 0) {
      // No fingers extended = fist
      return { gesture: 'fist', confidence: 85 };
    } else if (extendedCount === 1 && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      // Only index finger extended = pointing
      return { gesture: 'point', confidence: 80 };
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

  function endSession() {
    const now = Date.now();
    setModeStats((s) => ({
      ...s,
      [currentMode]: {
        ...s[currentMode],
        time: s[currentMode].time + (now - modeStart)
      }
    }));
    setSessionOver(true);
  }

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
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5
        });

        // Set up drawing on canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (mounted) setMpStatus('error');
          return;
        }

        let lastActionTime = 0;
        let gestureHistory: GestureType[] = [];
        let currentGestureState: GestureState = 'IDLE';
        let gestureDetectedTime = 0;
        let stableGestureCount = 0;
        let lastGestureType: GestureType = '-';
        const STABLE_THRESHOLD = 800;
        const CONFIRMATION_THRESHOLD = 60;
        const COOLDOWN_DURATION = 2500;
        const MIN_STABLE_FRAMES = 5;

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
            const landmarks = results.multiHandLandmarks[0];
            
            // Draw hand landmarks
            ctx.strokeStyle = currentGestureState === 'CONFIRMED' ? '#10b981' : 
                             currentGestureState === 'DETECTING' ? '#3b82f6' : '#22c55e';
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

            ctx.strokeStyle = currentGestureState === 'CONFIRMED' ? '#10b981' : '#3b82f6';
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

            // Classify gesture from landmarks
            const { gesture: classification, confidence } = classifyGestureFromLandmarks(landmarks);
            
            setDetectStatus('ready');
            setGesture(classification);
            setGestureConfidence(confidence);

            if (debugMode) {
              setDebugInfo({
                detected: true,
                landmarks: landmarks.length,
                confidence,
                classification
              });
            }

            // Gesture State Machine
            if (classification !== '-' && confidence >= CONFIRMATION_THRESHOLD) {
              if (currentGestureState === 'IDLE') {
                if (timeSinceLastAction > COOLDOWN_DURATION) {
                  currentGestureState = 'DETECTING';
                  gestureDetectedTime = now;
                  stableGestureCount = 1;
                  lastGestureType = classification;
                  setGestureState('DETECTING');
                }
              } else if (currentGestureState === 'DETECTING') {
                if (classification === lastGestureType) {
                  stableGestureCount++;
                } else {
                  stableGestureCount = 1;
                  gestureDetectedTime = now;
                  lastGestureType = classification;
                }

                const stableDuration = now - gestureDetectedTime;
                if (stableDuration >= STABLE_THRESHOLD && stableGestureCount >= MIN_STABLE_FRAMES) {
                  currentGestureState = 'CONFIRMED';
                  setGestureState('CONFIRMED');
                  setLastConfirmedGesture(classification);

                  const actions: Partial<Record<GestureType, () => void>> = {
                    open: () => {
                      recordHelp();
                      if (currentMode !== 'simple') changeMode('simple');
                      speakText('Help requested. Switching to simpler mode.');
                    },
                    fist: () => {
                      nextItem();
                      speakText('Moving to next item.');
                    },
                    point: () => {
                      recordSuccess();
                      speakText('Great! You understand this.');
                    },
                    wave: () => {
                      if (currentMode !== 'audio') changeMode('audio');
                      speakText(content);
                    }
                  };

                  if (actions[classification]) {
                    actions[classification]!();
                    lastActionTime = now;
                    setLastAction(now);
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
            
            if (debugMode) {
              setDebugInfo({
                detected: false,
                landmarks: 0,
                confidence: 0,
                classification: '-'
              });
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
  }, [mediaReady, currentMode, content, recordHelp, changeMode, nextItem, recordSuccess, debugMode]);


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
  const gestureMessages: Record<GestureType, string> = {
    'open': 'Open hand detected. Help requested.',
    'fist': 'Fist detected. Moving to next item.',
    'point': 'Pointing gesture detected. You understand.',
    'wave': 'Wave detected. Playing audio.',
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
                    <button
                      className="reset-gesture-btn"
                      onClick={() => setDebugMode(!debugMode)}
                      aria-label="Toggle debug mode"
                      title="Show debug information"
                      style={{ background: debugMode ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined }}
                    >
                      {debugMode ? '🔍 Debug ON' : '🔍 Debug'}
                    </button>
                  </>
                )}
              </div>
              {!gestureDetectionEnabled && (
                <div className="detection-disabled-notice">
                  <p>⚠️ Gesture detection is paused. Click "Start Detection" to resume.</p>
                </div>
              )}
              {debugMode && debugInfo && (
                <div className="debug-info">
                  <h4>Debug Information</h4>
                  <div className="debug-stats">
                    <div>Detected: {debugInfo.detected ? '✓' : '✗'}</div>
                    <div>Landmarks: {debugInfo.landmarks}</div>
                    <div>Confidence: {Math.round(debugInfo.confidence)}%</div>
                    <div>Gesture: {debugInfo.classification}</div>
                    <div>State: {gestureState}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="gesture-info">
              <div className="gesture-display">
                <div className="gesture-icon">
                  {gesture === 'open' && '🖐️'}
                  {gesture === 'fist' && '✊'}
                  {gesture === 'point' && '👆'}
                  {gesture === 'wave' && '👋'}
                  {gesture === '-' && '—'}
                </div>
                <div className="gesture-label">
                  {gesture === 'open' && 'Open Hand (Help)'}
                  {gesture === 'fist' && 'Fist (Next)'}
                  {gesture === 'point' && 'Point (Understand)'}
                  {gesture === 'wave' && 'Wave (Audio)'}
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
                    ✓ {lastConfirmedGesture === 'open' ? 'Help requested' :
                        lastConfirmedGesture === 'fist' ? 'Next item' :
                        lastConfirmedGesture === 'point' ? 'You understand' :
                        lastConfirmedGesture === 'wave' ? 'Audio playing' : 'Gesture confirmed'}
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
                    <span className="guide-icon">👆</span>
                    <span>Point = I understand</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">✊</span>
                    <span>Fist = Next item</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">🖐️</span>
                    <span>Open = Need help</span>
                  </div>
                  <div className="guide-item">
                    <span className="guide-icon">👋</span>
                    <span>Wave = Play audio</span>
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
            
            <div className="mode-selector">
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
                      <p className="content-text">{content}</p>
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
                        💡 <strong>Tip:</strong> Listen to the content being read aloud. Great for when reading is difficult!
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
                      <div className="visual-icons">
                        💧 → ☀️ → 🌫️ → 🌧️ → 🔄
                      </div>
                      <p className="visual-caption">Water Cycle Visual</p>
                    </div>
                    <div className="content-card">
                      <p className="content-text">{content}</p>
                    </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> See the water cycle in action with visual icons!
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
                      <p className="content-text">Tap an icon to learn more:</p>
                    </div>
                    <div className="icon-grid">
                      {Object.entries(iconMap).map(([key, item]) => (
                        <motion.button
                          key={key}
                          className="icon-button"
                          onClick={() => {
                            recordSuccess();
                            speakText(`${item.text}: ${item.description}`);
                          }}
                          whileHover={{ scale: 1.05, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <span className="icon-emoji">{item.icon}</span>
                          <span className="icon-text">{item.text}</span>
                        </motion.button>
                      ))}
                    </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> Click icons to hear explanations. Perfect for visual learners!
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
                    <div className="gesture-instructions">
                      <p className="instructions-title">✋ Respond using gestures:</p>
                      <div className="gesture-instructions-grid">
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">👆</span>
                          <div>
                            <strong>Point</strong>
                            <span className="instruction-desc">I understand</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">✊</span>
                          <div>
                            <strong>Fist</strong>
                            <span className="instruction-desc">Next please</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">🖐️</span>
                          <div>
                            <strong>Open</strong>
                            <span className="instruction-desc">Help me</span>
                          </div>
                        </div>
                        <div className="gesture-instruction-item">
                          <span className="instruction-icon">👋</span>
                          <div>
                            <strong>Wave</strong>
                            <span className="instruction-desc">Play audio</span>
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
                      <p className="simple-text">
                        The water moves in a loop:<br />
                        ☀️ Sun makes it go up →<br />
                        🌫️ Clouds form →<br />
                        🌧️ Rain falls down →<br />
                        💧 Back to water
                      </p>
                    </div>
                    <div className="mode-info-card">
                      <p className="mode-description">
                        💡 <strong>Tip:</strong> Simplified explanation with easy words and visuals.
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
              >
                End Session & View Profile
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </motion.div>
  );
}
