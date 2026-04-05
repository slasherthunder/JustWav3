import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import './BuddyPracticeGame.css';
import gestureIcon from '../assets/images/gestureicon.png';

type GestureType = '1' | '2' | '3' | '4' | 'thumbsUp' | 'thumbsDown' | '-';

interface PracticeStep {
  instruction: string;
  targetGesture: GestureType;
  helpText: string;
  successFeedback: string;
  visualAid?: string;
}

const practiceSteps: PracticeStep[] = [
  {
    instruction: "Show me 1 finger!",
    targetGesture: '1',
    helpText: "Hold up just your index finger like this 👆",
    successFeedback: "Excellent! 1 finger means Answer A",
    visualAid: "👆"
  },
  {
    instruction: "Show me 2 fingers!",
    targetGesture: '2',
    helpText: "Hold up 2 fingers like this ✌️",
    successFeedback: "Great! 2 fingers means Answer B",
    visualAid: "✌️"
  },
  {
    instruction: "Show me 3 fingers!",
    targetGesture: '3',
    helpText: "Hold up 3 fingers like this",
    successFeedback: "Awesome! 3 fingers means Answer C",
    visualAid: "image"
  },
  {
    instruction: "Show me 4 fingers!",
    targetGesture: '4',
    helpText: "Hold up 4 fingers like this 🖐️",
    successFeedback: "Perfect! 4 fingers means Answer D",
    visualAid: "🖐️"
  },
  {
    instruction: "Give me a thumbs up!",
    targetGesture: 'thumbsUp',
    helpText: "Stick your thumb up like this 👍",
    successFeedback: "Perfect! Thumbs up means 'I understand'",
    visualAid: "👍"
  },
  {
    instruction: "Give me a thumbs down!",
    targetGesture: 'thumbsDown',
    helpText: "Point your thumb down like this 👎",
    successFeedback: "Great! Thumbs down means 'I need help'",
    visualAid: "👎"
  }
];

interface BuddyPracticeGameProps {
  onComplete: () => void;
  onClose: () => void;
}

export function BuddyPracticeGame({ onComplete, onClose }: BuddyPracticeGameProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [gesture, setGesture] = useState<GestureType>('-');
  const [showSuccess, setShowSuccess] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [mediaReady, setMediaReady] = useState(false);

  const currentPracticeStep = practiceSteps[currentStep];
  const isComplete = completedSteps.length === practiceSteps.length;

  // Initialize MediaPipe Hands
  useEffect(() => {
    let mounted = true;

    async function initializeMediaPipe() {
      try {
        const video = webcamRef.current?.video;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.8,
          minTrackingConfidence: 0.6
        });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        hands.onResults((results) => {
          if (!mounted) return;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (results.image) {
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          }

          // Gesture detection - check for two thumbs down FIRST when multiple hands detected
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarksArray = results.multiHandLandmarks;
            
            // CRITICAL: Check for two thumbs down FIRST when 2+ hands are detected
            if (landmarksArray.length >= 2) {
              let thumbsDownCount = 0;
              
              // Check each hand for thumbs down
              for (let i = 0; i < landmarksArray.length; i++) {
                const landmarks = landmarksArray[i];
                if (landmarks && landmarks.length >= 21) {
                  const isDown = isThumbsDown(landmarks);
                  if (isDown) {
                    thumbsDownCount++;
                  }
                }
              }
              
              // If 2 or more hands show thumbs down, this is "two thumbs down"
              if (thumbsDownCount >= 2) {
                setGesture('thumbsDown');
                ctx.restore();
                return;
              }
            }
            
            // Process single hand gestures (use first hand)
            const landmarks = landmarksArray[0];
            if (landmarks && landmarks.length >= 21) {
              // Detect number of extended fingers
              const extendedFingers = countExtendedFingers(landmarks);
              if (extendedFingers >= 1 && extendedFingers <= 4) {
                setGesture(String(extendedFingers) as GestureType);
              } else {
                // Check for thumbs up/down (single hand)
                const thumbUp = isThumbsUp(landmarks);
                const thumbDown = isThumbsDown(landmarks);
                
                if (thumbUp) setGesture('thumbsUp');
                else if (thumbDown) setGesture('thumbsDown');
                else setGesture('-');
              }
            } else {
              setGesture('-');
            }
          } else {
            setGesture('-');
          }

          ctx.restore();
        });

        handsRef.current = hands;
        const camera = new Camera(video, {
          onFrame: async () => {
            if (handsRef.current && video) {
              await handsRef.current.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });

        cameraRef.current = camera;
        camera.start();

        if (mounted) setMediaReady(true);
      } catch (error) {
        console.error('MediaPipe initialization error:', error);
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
  }, [mediaReady]);

  // Check for correct gesture
  useEffect(() => {
    if (gesture === currentPracticeStep.targetGesture && !showSuccess && !completedSteps.includes(currentStep)) {
      setShowSuccess(true);
      setCompletedSteps([...completedSteps, currentStep]);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
      
      // Speak success feedback
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(currentPracticeStep.successFeedback);
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
      }

      // Move to next step after delay
      setTimeout(() => {
          if (currentStep < practiceSteps.length - 1) {
            setCurrentStep(currentStep + 1);
            setShowSuccess(false);
          } else {
          // All steps complete
          setTimeout(() => {
            onComplete();
          }, 2000);
        }
      }, 2000);
    }
  }, [gesture, currentPracticeStep.targetGesture, showSuccess, currentStep, completedSteps, onComplete]);

  // Helper functions for gesture detection
  function countExtendedFingers(landmarks: any[]): number {
    // Simplified finger counting
    let count = 0;
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerPips = [3, 6, 10, 14, 18];
    
    for (let i = 0; i < 4; i++) {
      if (landmarks[fingerTips[i + 1]].y < landmarks[fingerPips[i + 1]].y) {
        count++;
      }
    }
    
    // Thumb
    if (landmarks[4].x > landmarks[3].x) {
      count++;
    }
    
    return count;
  }

  function isThumbsUp(landmarks: any[]): boolean {
    // Simplified thumbs up detection
    return landmarks[4].y < landmarks[3].y && 
           landmarks[8].y > landmarks[6].y &&
           landmarks[12].y > landmarks[10].y;
  }

  function isThumbsDown(landmarks: any[]): boolean {
    if (!landmarks || landmarks.length < 21) return false;
    
    // Thumbs down detection - matches main Learn/Practice pages logic
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const wrist = landmarks[0];
    
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    
    // Check if fingers are extended - if 2+ fingers extended, this is NOT thumbs down
    const isFingerClosed = (tip: any, pip: any) => tip.y >= pip.y - 0.01;
    const indexClosed = isFingerClosed(indexTip, indexPip);
    const middleClosed = isFingerClosed(middleTip, middlePip);
    const ringClosed = isFingerClosed(ringTip, ringPip);
    const pinkyClosed = isFingerClosed(pinkyTip, pinkyPip);
    
    // All fingers should be closed for thumbs down
    if (!indexClosed || !middleClosed || !ringClosed || !pinkyClosed) {
      return false;
    }
    
    // Thumb must be extended downward (tip below IP joint)
    const thumbExtendedDown = thumbTip.y > thumbIp.y;
    
    // Thumb should be below the wrist (pointing down)
    const thumbBelowWrist = thumbTip.y > wrist.y - 0.05;
    
    // Check that thumb is clearly extended downward
    const thumbDownDistance = thumbTip.y - thumbIp.y > 0.015;
    
    // Thumb should be relatively close to hand
    const thumbCloseToHand = Math.abs(thumbTip.x - thumbIp.x) < 0.15;
    
    return thumbExtendedDown && thumbBelowWrist && thumbDownDistance && thumbCloseToHand;
  }


  return (
    <motion.div
      className="practice-game-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="practice-game-container"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        <div className="practice-game-header">
          <h2>🎮 Let's Practice Gestures!</h2>
          <button className="close-button" onClick={onClose} aria-label="Close practice game">
            ✕
          </button>
        </div>

        <div className="practice-game-content">
          <div className="progress-indicator">
            <div className="progress-bar">
              <motion.div
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${((completedSteps.length) / practiceSteps.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="progress-text">
              Step {completedSteps.length + 1} of {practiceSteps.length}
            </p>
          </div>

          {!isComplete ? (
            <>
              <div className="instruction-section">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="instruction-card"
                >
                  <div className="instruction-icon">
                    {currentPracticeStep.visualAid === "image" ? (
                      <img src={gestureIcon} alt="" style={{ width: '48px', height: '48px' }} />
                    ) : (
                      currentPracticeStep.visualAid
                    )}
                  </div>
                  <h3 className="instruction-text">{currentPracticeStep.instruction}</h3>
                  <p className="help-text">{currentPracticeStep.helpText}</p>
                </motion.div>
              </div>

              <div className="webcam-section">
                <div className="webcam-wrapper">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    onUserMedia={() => setMediaReady(true)}
                    videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                    className="practice-webcam"
                  />
                  <canvas ref={canvasRef} className="practice-canvas" />
                  {showSuccess && (
                    <motion.div
                      className="success-overlay"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <span className="success-icon">✅</span>
                      <p className="success-text">{currentPracticeStep.successFeedback}</p>
                    </motion.div>
                  )}
                </div>
                <div className="gesture-display">
                  <p className="current-gesture">
                    {gesture !== '-' ? `Detected: ${gesture}` : 'Show the gesture!'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <motion.div
              className="completion-screen"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="completion-icon">🏆</div>
              <h3>Gesture Master!</h3>
              <p>You've completed all the practice exercises!</p>
              <motion.button
                className="completion-button"
                onClick={onComplete}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Awesome! Let's Learn
              </motion.button>
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {showConfetti && (
            <motion.div
              className="confetti-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="confetti"
                  initial={{
                    x: '50%',
                    y: '50%',
                    rotate: 0,
                    scale: 0
                  }}
                  animate={{
                    x: `${50 + (Math.random() - 0.5) * 100}%`,
                    y: `${50 + Math.random() * 100}%`,
                    rotate: Math.random() * 360,
                    scale: 1
                  }}
                  transition={{
                    duration: 1,
                    delay: i * 0.05
                  }}
                >
                  🎉
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
