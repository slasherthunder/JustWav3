import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import { collection, query as fsQuery, where, limit, getDocs, orderBy, query, addDoc, updateDoc, serverTimestamp, doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FirebaseError } from 'firebase/app';
import { Timestamp } from 'firebase/firestore';
import { EmailVerificationBanner } from '../components/EmailVerificationBanner';
import { createAssignment, notifyStudentsOfAssignment } from '../utils/assignments';
import type { AssignmentSettings } from '../types/assignments';
import './Home.css';
import './Landing.css';
import logoImage from '../assets/images/logo.png';
import teacherProfileImage from '../assets/images/teacherprofile.png';
import parentProfileImage from '../assets/images/parentprofile.png';
import studentProfileImage from '../assets/images/studentprofile.png';
import audioIcon from '../assets/images/audioicon.png';

interface MCQSet {
  id: string;
  title: string;
  userId: string;
  userEmail: string | null;
  createdAt: Timestamp | { seconds: number; nanoseconds: number } | null;
  slides: Array<{
    question: string;
    questionType: 'multipleChoice' | 'multipleCorrect';
    options: string[];
    correctAnswer: string;
    correctAnswers: string[];
    imageData: string | null;
  }>;
}

interface ConnectionRequest {
  id: string;
  requestorId: string;
  requestedId: string;
  requestorEmail: string;
  requestedEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
  requestorRole: 'student' | 'teacher';
}

interface Connection {
  id: string;
  studentId: string;
  teacherId: string;
  studentEmail: string;
  teacherEmail: string;
  createdAt: Timestamp;
}

interface LearningReport {
  id: string;
  timestamp?: Timestamp | { seconds: number; nanoseconds: number } | null;
  sessionDate: string;
  sessionDuration: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalHelpRequests: number;
  successRate: number;
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
  };
}

interface StudentWithReports {
  uid: string;
  email: string;
  reports: LearningReport[];
}

export function TeacherHome() {
  const { currentUser, logout } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const [textSize, setTextSize] = useState(() => {
    const saved = localStorage.getItem('home-text-size');
    return saved ? parseFloat(saved) : 1;
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('home-high-contrast') === 'true';
  });
  const [fontPreference, setFontPreference] = useState<'default' | 'opendyslexic'>(() => {
    const saved = localStorage.getItem('home-font');
    return (saved === 'default' || saved === 'opendyslexic') ? saved : 'default';
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    return localStorage.getItem('home-reduced-motion') === 'true';
  });
  const [spacing, setSpacing] = useState<'compact' | 'comfortable'>(() => {
    const saved = localStorage.getItem('home-spacing');
    return (saved === 'compact' || saved === 'comfortable') ? saved : 'comfortable';
  });
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showBrightnessModal, setShowBrightnessModal] = useState(false);
  const [showContrastModal, setShowContrastModal] = useState(false);
  const [showSaturationModal, setShowSaturationModal] = useState(false);
  
  // Additional accessibility features
  const [hideImages, setHideImages] = useState(() => localStorage.getItem('hide-images') === 'true');
  const [readableFonts, setReadableFonts] = useState(() => localStorage.getItem('readable-fonts') === 'true');
  const [dyslexicFont, setDyslexicFont] = useState(() => localStorage.getItem('dyslexic-font') === 'true');
  const [bionicReading, setBionicReading] = useState(() => localStorage.getItem('bionic-reading') === 'true');
  const [stopAnimations, setStopAnimations] = useState(() => localStorage.getItem('stop-animations') === 'true');
  const [invertColors, setInvertColors] = useState(() => localStorage.getItem('invert-colors') === 'true');
  const [brightness, setBrightness] = useState(() => {
    const saved = localStorage.getItem('brightness');
    return saved ? parseFloat(saved) : 100;
  });
  const [contrast, setContrast] = useState(() => {
    const saved = localStorage.getItem('contrast');
    return saved ? parseFloat(saved) : 100;
  });
  const [saturation, setSaturation] = useState(() => {
    const saved = localStorage.getItem('saturation');
    return saved ? parseFloat(saved) : 100;
  });
  const [colorFilter, setColorFilter] = useState<'none' | 'grayscale' | 'red-green' | 'blue-yellow' | 'green-red'>(() => {
    const saved = localStorage.getItem('color-filter');
    return (saved === 'none' || saved === 'grayscale' || saved === 'red-green' || saved === 'blue-yellow' || saved === 'green-red') ? saved : 'none';
  });
  const [readingLine, setReadingLine] = useState(() => localStorage.getItem('reading-line') === 'true');
  const [highlightLinks, setHighlightLinks] = useState(() => localStorage.getItem('highlight-links') === 'true');
  const [readingMask, setReadingMask] = useState(() => localStorage.getItem('reading-mask') === 'true');
  const [pageStructure, setPageStructure] = useState(() => localStorage.getItem('page-structure') === 'true');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<StudentWithReports[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithReports | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  
  // Connection requests and students state
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
  const [myStudents, setMyStudents] = useState<Connection[]>([]);
  const [refreshingConnections, setRefreshingConnections] = useState(false);
  
  // Student parents state - track parents for each student
  const [studentParentsMap, setStudentParentsMap] = useState<Record<string, Array<{ id: string; parentEmail: string; parentId: string }>>>({});
  
  // Notification counts
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  
  // MCQ Sets state
  const [mcqSets, setMcqSets] = useState<MCQSet[]>([]);
  const [loadingMcqSets, setLoadingMcqSets] = useState(false);
  const [selectedMcqSetForAssignment, setSelectedMcqSetForAssignment] = useState<MCQSet | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignTimeLimit, setAssignTimeLimit] = useState<number | undefined>(undefined);
  const [assignAttemptLimit, setAssignAttemptLimit] = useState<number | undefined>(undefined);
  const [assignShuffleQuestions, setAssignShuffleQuestions] = useState(false);
  const [assignShuffleOptions, setAssignShuffleOptions] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Fetch notification counts (unread messages and pending requests)
  useEffect(() => {
    if (!currentUser) return;

    // Fetch unread messages
    const messagesQuery = query(
      collection(db, 'messages'),
      where('receiverId', '==', currentUser.uid),
      where('read', '==', false)
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      setUnreadMessageCount(snapshot.docs.length);
    });

    // Fetch pending message requests
    const requestsQuery = query(
      collection(db, 'messageRequests'),
      where('requestedId', '==', currentUser.uid)
    );

    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      setPendingRequestCount(snapshot.docs.length);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeRequests();
    };
  }, [currentUser]);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('home-text-size', textSize.toString());
  }, [textSize]);

  useEffect(() => {
    localStorage.setItem('home-high-contrast', highContrast.toString());
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem('home-font', fontPreference);
  }, [fontPreference]);

  useEffect(() => {
    localStorage.setItem('home-reduced-motion', reducedMotion.toString());
  }, [reducedMotion]);

  useEffect(() => {
    localStorage.setItem('home-spacing', spacing);
  }, [spacing]);

  // Save new accessibility preferences to localStorage
  useEffect(() => {
    localStorage.setItem('hide-images', hideImages.toString());
  }, [hideImages]);

  useEffect(() => {
    localStorage.setItem('readable-fonts', readableFonts.toString());
  }, [readableFonts]);

  useEffect(() => {
    localStorage.setItem('dyslexic-font', dyslexicFont.toString());
  }, [dyslexicFont]);

  useEffect(() => {
    localStorage.setItem('bionic-reading', bionicReading.toString());
  }, [bionicReading]);

  useEffect(() => {
    localStorage.setItem('stop-animations', stopAnimations.toString());
  }, [stopAnimations]);

  useEffect(() => {
    localStorage.setItem('invert-colors', invertColors.toString());
  }, [invertColors]);

  useEffect(() => {
    localStorage.setItem('brightness', brightness.toString());
  }, [brightness]);

  useEffect(() => {
    localStorage.setItem('contrast', contrast.toString());
  }, [contrast]);

  useEffect(() => {
    localStorage.setItem('saturation', saturation.toString());
  }, [saturation]);

  useEffect(() => {
    localStorage.setItem('color-filter', colorFilter);
  }, [colorFilter]);

  useEffect(() => {
    localStorage.setItem('reading-line', readingLine.toString());
  }, [readingLine]);

  useEffect(() => {
    localStorage.setItem('highlight-links', highlightLinks.toString());
  }, [highlightLinks]);

  useEffect(() => {
    localStorage.setItem('reading-mask', readingMask.toString());
  }, [readingMask]);

  useEffect(() => {
    localStorage.setItem('page-structure', pageStructure.toString());
  }, [pageStructure]);

  // Text Reader function
  const readPage = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance();
      utterance.text = document.body.innerText;
      utterance.lang = 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in your browser.');
    }
  };

  // Apply accessibility preferences
  useEffect(() => {
    document.documentElement.style.setProperty('--text-size-multiplier', textSize.toString());
    
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }

    if (fontPreference === 'opendyslexic') {
      document.body.classList.add('font-opendyslexic');
    } else {
      document.body.classList.remove('font-opendyslexic');
    }

    if (reducedMotion) {
      document.documentElement.style.setProperty('--motion-reduce', '1');
    } else {
      document.documentElement.style.setProperty('--motion-reduce', '0');
    }

    const container = document.querySelector('.home-container');
    if (container) {
      container.className = `landing-wrapper brand-bg-light home-container spacing-${spacing}`;
    }
  }, [textSize, highContrast, fontPreference, reducedMotion, spacing]);

  // Apply accessibility features
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    // Hide Images
    if (hideImages) {
      body.classList.add('hide-images');
    } else {
      body.classList.remove('hide-images');
    }

    // Readable Fonts
    if (readableFonts) {
      body.classList.add('readable-fonts');
    } else {
      body.classList.remove('readable-fonts');
    }

    // Dyslexic Font
    if (dyslexicFont) {
      body.classList.add('dyslexic-font');
    } else {
      body.classList.remove('dyslexic-font');
    }

    // Bionic Reading
    if (bionicReading) {
      body.classList.add('bionic-reading');
      // Apply bionic reading to text content
      const applyBionicReading = () => {
        const walker = document.createTreeWalker(
          body,
          NodeFilter.SHOW_TEXT,
          null
        );
        let node;
        const nodesToProcess: Node[] = [];
        while (node = walker.nextNode()) {
          if (node.nodeValue && node.nodeValue.trim().length > 0 && 
              node.parentElement && 
              !node.parentElement.classList.contains('bionic-processed') &&
              node.parentElement.tagName !== 'SCRIPT' &&
              node.parentElement.tagName !== 'STYLE') {
            nodesToProcess.push(node);
          }
        }
        nodesToProcess.forEach(textNode => {
          const parent = textNode.parentElement;
          if (parent && !parent.classList.contains('bionic-processed')) {
            const text = textNode.nodeValue || '';
            const words = text.split(/(\s+)/);
            const fragment = document.createDocumentFragment();
            words.forEach(word => {
              if (word.trim().length > 0) {
                const boldLength = Math.ceil(word.length / 2);
                const boldPart = word.substring(0, boldLength);
                const restPart = word.substring(boldLength);
                const span = document.createElement('span');
                span.innerHTML = `<strong class="bionic-word">${boldPart}</strong><span class="bionic-rest">${restPart}</span>`;
                fragment.appendChild(span);
              } else {
                fragment.appendChild(document.createTextNode(word));
              }
            });
            parent.replaceChild(fragment, textNode);
            parent.classList.add('bionic-processed');
          }
        });
      };
      setTimeout(applyBionicReading, 100);
    } else {
      body.classList.remove('bionic-reading');
      // Remove bionic reading formatting
      const bionicElements = body.querySelectorAll('.bionic-processed');
      bionicElements.forEach(el => {
        const text = el.textContent || '';
        el.classList.remove('bionic-processed');
        el.innerHTML = text;
      });
    }

    // Stop Animations
    if (stopAnimations) {
      html.style.setProperty('--animation-duration', '0s');
      html.style.setProperty('--transition-duration', '0s');
      body.classList.add('stop-animations');
    } else {
      html.style.removeProperty('--animation-duration');
      html.style.removeProperty('--transition-duration');
      body.classList.remove('stop-animations');
    }

    // Brightness, Contrast, Saturation, Color Filters
    let filterString = '';
    if (invertColors) {
      filterString += 'invert(1) ';
    }
    if (brightness !== 100) {
      filterString += `brightness(${brightness}%) `;
    }
    if (contrast !== 100) {
      filterString += `contrast(${contrast}%) `;
    }
    if (saturation !== 100) {
      filterString += `saturate(${saturation}%) `;
    }
    if (colorFilter !== 'none') {
      switch (colorFilter) {
        case 'grayscale':
          filterString += 'grayscale(100%) ';
          break;
        case 'red-green':
        case 'blue-yellow':
        case 'green-red':
          // These would require SVG filters for proper color blindness simulation
          break;
      }
    }
    if (filterString) {
      html.style.setProperty('filter', filterString.trim());
      body.classList.add('accessibility-filters');
    } else {
      html.style.removeProperty('filter');
      body.classList.remove('accessibility-filters');
    }

    // Invert Colors class
    if (invertColors) {
      body.classList.add('invert-colors');
    } else {
      body.classList.remove('invert-colors');
    }

    // Reading Line
    let handleMouseMove: ((e: MouseEvent) => void) | null = null;
    if (readingLine) {
      body.classList.add('reading-line');
      handleMouseMove = (e: MouseEvent) => {
        document.documentElement.style.setProperty('--reading-line-y', `${e.clientY}px`);
      };
      document.addEventListener('mousemove', handleMouseMove);
    } else {
      body.classList.remove('reading-line');
      document.documentElement.style.removeProperty('--reading-line-y');
    }
    
    return () => {
      if (handleMouseMove) {
        document.removeEventListener('mousemove', handleMouseMove);
      }
      body.classList.remove('reading-line');
      document.documentElement.style.removeProperty('--reading-line-y');
    };

    // Highlight Links
    if (highlightLinks) {
      body.classList.add('highlight-links');
    } else {
      body.classList.remove('highlight-links');
    }

    // Reading Mask
    if (readingMask) {
      body.classList.add('reading-mask');
    } else {
      body.classList.remove('reading-mask');
    }

    // Page Structure
    if (pageStructure) {
      body.classList.add('show-page-structure');
    } else {
      body.classList.remove('show-page-structure');
    }
  }, [hideImages, readableFonts, dyslexicFont, bionicReading, stopAnimations, invertColors, brightness, contrast, saturation, colorFilter, readingLine, highlightLinks, readingMask, pageStructure]);

  // Load OpenDyslexic font if selected
  useEffect(() => {
    if (fontPreference === 'opendyslexic') {
      const existingLink = document.querySelector('link[data-opendyslexic]');
      if (!existingLink) {
        const link = document.createElement('link');
        link.setAttribute('data-opendyslexic', 'true');
        link.href = 'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic.css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    }
  }, [fontPreference]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + / to show keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowKeyboardShortcuts(!showKeyboardShortcuts);
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (showKeyboardShortcuts) {
          setShowKeyboardShortcuts(false);
        }
        if (showAccessibilityModal) {
          setShowAccessibilityModal(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showKeyboardShortcuts, showAccessibilityModal]);

  // Scroll to reports section when selectedStudent changes
  useEffect(() => {
    if (selectedStudent) {
      console.log('Selected student changed:', selectedStudent.email, 'Reports count:', selectedStudent.reports.length);
      // Small delay to ensure the DOM has updated
      setTimeout(() => {
        const reportsHeading = document.getElementById('student-reports-heading');
        if (reportsHeading) {
          reportsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [selectedStudent]);

  async function handleLogout() {
    try {
      setNavigating(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  async function fetchConnections() {
    if (!currentUser) {
      return;
    }

    try {
      setRefreshingConnections(true);
      console.log('Fetching connections for teacher:', currentUser.uid);
      
      // Fetch pending requests where teacher is requested OR requestor
      const requestsAsRequestorQuery = fsQuery(
        collection(db, 'connectionRequests'),
        where('requestorId', '==', currentUser.uid),
        where('status', '==', 'pending')
      );
      const requestsAsRequestedQuery = fsQuery(
        collection(db, 'connectionRequests'),
        where('requestedId', '==', currentUser.uid),
        where('status', '==', 'pending')
      );
      
      const [requestorSnapshot, requestedSnapshot] = await Promise.all([
        getDocs(requestsAsRequestorQuery).catch(err => {
          console.error('Error fetching outgoing requests:', err);
          return { docs: [] };
        }),
        getDocs(requestsAsRequestedQuery).catch(err => {
          console.error('Error fetching incoming requests:', err);
          return { docs: [] };
        })
      ]);
      
      console.log('Requests where teacher is requestor:', requestorSnapshot.docs.length);
      console.log('Requests where teacher is requested:', requestedSnapshot.docs.length);
      
      const pending = [
        ...requestorSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Outgoing request:', doc.id, {
            requestorId: data.requestorId,
            requestedId: data.requestedId,
            requestorEmail: data.requestorEmail,
            requestedEmail: data.requestedEmail,
            status: data.status,
            requestorRole: data.requestorRole
          });
          return {
            id: doc.id,
            ...data
          };
        }),
        ...requestedSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Incoming request:', doc.id, {
            requestorId: data.requestorId,
            requestedId: data.requestedId,
            requestorEmail: data.requestorEmail,
            requestedEmail: data.requestedEmail,
            status: data.status,
            requestorRole: data.requestorRole
          });
          return {
            id: doc.id,
            ...data
          };
        })
      ] as ConnectionRequest[];
      
      console.log('Total pending requests:', pending.length);
      setPendingRequests(pending);
      
      // Fetch confirmed connections (my students)
      const connectionsQuery = fsQuery(
        collection(db, 'connections'),
        where('teacherId', '==', currentUser.uid)
      );
      const connectionsSnapshot = await getDocs(connectionsQuery).catch(err => {
        console.error('Error fetching connections:', err);
        return { docs: [] };
      });
      const connections = connectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Connection[];
      setMyStudents(connections);
      
      // Fetch parents for each connected student
      const parentsMap: Record<string, Array<{ id: string; parentEmail: string; parentId: string }>> = {};
      await Promise.all(
        connections.map(async (conn) => {
          try {
            const parentConnectionsQuery = fsQuery(
              collection(db, 'parentConnections'),
              where('studentId', '==', conn.studentId)
            );
            const parentConnectionsSnapshot = await getDocs(parentConnectionsQuery);
            parentsMap[conn.studentId] = parentConnectionsSnapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                parentEmail: data.parentEmail || '',
                parentId: data.parentId || ''
              };
            });
          } catch (error) {
            console.error(`Error fetching parents for student ${conn.studentId}:`, error);
            parentsMap[conn.studentId] = [];
          }
        })
      );
      setStudentParentsMap(parentsMap);
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setRefreshingConnections(false);
    }
  }

  // Fetch connections and requests on mount and when currentUser changes
  useEffect(() => {
    fetchConnections();
  }, [currentUser]);

  // Fetch MCQ sets created by this teacher
  useEffect(() => {
    const fetchMcqSets = async () => {
      if (!currentUser) return;

      try {
        setLoadingMcqSets(true);
        // Try query with orderBy first, but if it fails (no index), fall back to simple query
        try {
          const mcqSetsQuery = fsQuery(
            collection(db, 'mcqSets'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
          );
          const mcqSetsSnapshot = await getDocs(mcqSetsQuery);
          const sets = mcqSetsSnapshot.docs.map(doc => {
            const data = doc.data();
            const mcqSet = {
              id: doc.id,
              ...data,
            } as MCQSet;
            console.log('MCQ set fetched:', {
              id: mcqSet.id,
              title: mcqSet.title,
              hasSlides: !!mcqSet.slides,
              slidesCount: mcqSet.slides?.length || 0,
              userId: mcqSet.userId
            });
            return mcqSet;
          }) as MCQSet[];
          // Sort manually as fallback
          sets.sort((a, b) => {
            const aTime = a.createdAt ? (a.createdAt as Timestamp).seconds : 0;
            const bTime = b.createdAt ? (b.createdAt as Timestamp).seconds : 0;
            return bTime - aTime;
          });
          setMcqSets(sets);
          console.log('Fetched MCQ sets:', sets.length);
          console.log('MCQ set IDs:', sets.map(s => s.id));
        } catch (queryError: any) {
          // If orderBy fails (likely missing index), try without it
          console.warn('Query with orderBy failed, trying without orderBy:', queryError);
          const mcqSetsQuery = fsQuery(
            collection(db, 'mcqSets'),
            where('userId', '==', currentUser.uid)
          );
          const mcqSetsSnapshot = await getDocs(mcqSetsQuery);
          const sets = mcqSetsSnapshot.docs.map(doc => {
            const data = doc.data();
            const mcqSet = {
              id: doc.id,
              ...data,
            } as MCQSet;
            console.log('MCQ set fetched (fallback query):', {
              id: mcqSet.id,
              title: mcqSet.title,
              hasSlides: !!mcqSet.slides,
              slidesCount: mcqSet.slides?.length || 0,
              userId: mcqSet.userId
            });
            return mcqSet;
          }) as MCQSet[];
          // Sort manually by createdAt
          sets.sort((a, b) => {
            const aTime = a.createdAt ? (a.createdAt as Timestamp).seconds : 0;
            const bTime = b.createdAt ? (b.createdAt as Timestamp).seconds : 0;
            return bTime - aTime;
          });
          setMcqSets(sets);
          console.log('Fetched MCQ sets (without orderBy):', sets.length);
          console.log('MCQ set IDs:', sets.map(s => s.id));
          
          // Log the error message to help user create the index
          if (queryError?.code === 'failed-precondition') {
            console.error('Firestore index required. Please create a composite index for:');
            console.error('Collection: mcqSets');
            console.error('Fields: userId (Ascending), createdAt (Descending)');
          }
        }
      } catch (error) {
        console.error('Error fetching MCQ sets:', error);
      } finally {
        setLoadingMcqSets(false);
      }
    };

    fetchMcqSets();
  }, [currentUser]);

  const handleOpenAssignModal = (mcqSet: MCQSet) => {
    setSelectedMcqSetForAssignment(mcqSet);
    setAssignStudentIds([]);
    setAssignDueDate('');
    setAssignTimeLimit(undefined);
    setAssignAttemptLimit(undefined);
    setAssignShuffleQuestions(false);
    setAssignShuffleOptions(false);
    setShowAssignModal(true);
  };

  const handleCloseAssignModal = () => {
    setShowAssignModal(false);
    setSelectedMcqSetForAssignment(null);
  };

  const handleCreateAssignment = async () => {
    if (!currentUser || !selectedMcqSetForAssignment) {
      return;
    }

    if (assignStudentIds.length === 0) {
      alert('Please select at least one student.');
      return;
    }

    if (!assignDueDate) {
      alert('Please select a due date.');
      return;
    }

    // Verify all selected students are connected to this teacher
    const connectedStudentIds = myStudents.map(conn => conn.studentId);
    const invalidStudents = assignStudentIds.filter(id => !connectedStudentIds.includes(id));
    if (invalidStudents.length > 0) {
      alert('Some selected students are not connected to you.');
      return;
    }

    try {
      setAssigning(true);

      const settings: AssignmentSettings = {
        timeLimit: assignTimeLimit && assignTimeLimit > 0 ? assignTimeLimit : undefined,
        attemptLimit: assignAttemptLimit && assignAttemptLimit > 0 ? assignAttemptLimit : undefined,
        shuffleQuestions: assignShuffleQuestions,
        shuffleOptions: assignShuffleOptions,
      };

      const dueDateObj = new Date(assignDueDate);

      console.log('Creating assignment from TeacherHome:', {
        mcqSetId: selectedMcqSetForAssignment.id,
        mcqSetTitle: selectedMcqSetForAssignment.title,
        mcqSetIdType: typeof selectedMcqSetForAssignment.id,
        teacherId: currentUser.uid,
        assignedStudentIds: assignStudentIds,
        dueDate: dueDateObj
      });
      
      if (!selectedMcqSetForAssignment.id || typeof selectedMcqSetForAssignment.id !== 'string') {
        throw new Error(`Invalid MCQ set ID: "${selectedMcqSetForAssignment.id}". Cannot create assignment.`);
      }

      const assignmentId = await createAssignment({
        mcqSetId: selectedMcqSetForAssignment.id,
        teacherId: currentUser.uid,
        assignedStudentIds: assignStudentIds,
        assignedClassIds: [],
        dueDate: dueDateObj,
        settings,
      });
      
      console.log('Assignment created successfully with ID:', assignmentId);

      // Notify students
      await notifyStudentsOfAssignment(assignStudentIds, assignmentId, selectedMcqSetForAssignment.title);

      alert('Assignment created and assigned successfully!');
      handleCloseAssignModal();
      
      // Refresh MCQ sets to show updated assignment info if needed
    } catch (error: any) {
      console.error('Error creating assignment:', error);
      alert(`Failed to create assignment: ${error?.message || 'Unknown error'}. Please try again.`);
    } finally {
      setAssigning(false);
    }
  };

  async function handleStudentSearch(e?: React.FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setStudents([]);
      setSearchError(null);
      return;
    }
    try {
      setSearchLoading(true);
      setSearchError(null);
      const snap = await getDocs(fsQuery(collection(db, 'users'), where('role', '==', 'student'), limit(50)));
      const all = snap.docs.map(d => {
        const data = d.data() as { email?: string };
        return { uid: d.id, email: String(data.email || '') };
      });
      const matches = all.filter(s => s.email.toLowerCase().includes(q));
      
      // Get list of connected student IDs
      const connectedStudentIds = myStudents.map(conn => conn.studentId);
      
      // Load reports only for connected students (security check)
      const studentsWithReports: StudentWithReports[] = await Promise.all(
        matches
          .filter(student => connectedStudentIds.includes(student.uid))
          .map(async (student) => {
            try {
              const reportsCollectionRef = collection(db, 'users', student.uid, 'learningReports');
              const q = query(reportsCollectionRef, orderBy('timestamp', 'desc'), limit(10));
              const querySnapshot = await getDocs(q);
              const reports: LearningReport[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as LearningReport[];
              return { ...student, reports };
            } catch {
              return { ...student, reports: [] };
            }
          })
      );
      
      // Add non-connected students without reports (for connection requests only)
      const nonConnectedStudents = matches.filter(student => 
        !connectedStudentIds.includes(student.uid)
      );
      const allStudents: StudentWithReports[] = [
        ...studentsWithReports,
        ...nonConnectedStudents.map(s => ({ ...s, reports: [] }))
      ];
      
      setStudents(allStudents);
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        setSearchError('Not allowed to read students. Please update Firestore rules.');
      } else {
        setSearchError('Search failed. Please try again.');
      }
      setStudents([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleRequestStudent(studentId: string, studentEmail: string) {
    if (!currentUser) return;
    
    try {
      // Check if request already exists
      const existingRequestsQuery = fsQuery(
        collection(db, 'connectionRequests'),
        where('requestorId', '==', currentUser.uid),
        where('requestedId', '==', studentId)
      );
      const existingSnapshot = await getDocs(existingRequestsQuery);
      
      if (!existingSnapshot.empty) {
        alert('You have already sent a request to this student.');
        return;
      }
      
      // Check if already connected
      const existingConnectionQuery = fsQuery(
        collection(db, 'connections'),
        where('teacherId', '==', currentUser.uid),
        where('studentId', '==', studentId)
      );
      const existingConnectionSnapshot = await getDocs(existingConnectionQuery);
      
      if (!existingConnectionSnapshot.empty) {
        alert('You are already connected with this student.');
        return;
      }
      
      // Create request
      await addDoc(collection(db, 'connectionRequests'), {
        requestorId: currentUser.uid,
        requestedId: studentId,
        requestorEmail: currentUser.email || '',
        requestedEmail: studentEmail,
        status: 'pending',
        requestorRole: 'teacher',
        createdAt: serverTimestamp()
      });
      
      alert(`Request sent to ${studentEmail}!`);
    } catch (error) {
      console.error('Error sending request:', error);
      alert('Failed to send request. Please try again.');
    }
  }

  async function handleAcceptRequest(requestId: string, requestorId: string, requestorEmail: string, requestorRole: string) {
    if (!currentUser) return;
    
    try {
      // Update request status
      const requestRef = doc(db, 'connectionRequests', requestId);
      await updateDoc(requestRef, {
        status: 'accepted'
      });
      
      // Create connection
      if (requestorRole === 'student') {
        await addDoc(collection(db, 'connections'), {
          studentId: requestorId,
          teacherId: currentUser.uid,
          studentEmail: requestorEmail,
          teacherEmail: currentUser.email || '',
          createdAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'connections'), {
          studentId: currentUser.uid,
          teacherId: requestorId,
          studentEmail: currentUser.email || '',
          teacherEmail: requestorEmail,
          createdAt: serverTimestamp()
        });
      }
      
      // Refresh connections and requests (this will also update myStudents)
      await fetchConnections();
      
      alert('Request accepted! Student added to your connections.');
    } catch (error) {
      console.error('Error accepting request:', error);
      alert('Failed to accept request. Please try again.');
    }
  }

  async function handleRejectRequest(requestId: string) {
    try {
      const requestRef = doc(db, 'connectionRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected'
      });
      
      // Refresh pending requests
      await fetchConnections();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request. Please try again.');
    }
  }

  async function handleCancelOutgoingConnectionRequest(requestId: string) {
    try {
      await deleteDoc(doc(db, 'connectionRequests', requestId));
      await fetchConnections();
    } catch (error) {
      console.error('Error canceling request:', error);
      alert('Failed to cancel request. Please try again.');
    }
  }

  async function loadStudentReports(studentUid: string, studentEmail?: string) {
    try {
      setLoadingReports(true);
      console.log('Loading reports for student:', studentUid);
      
      // Check if teacher is connected to this student
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      const isConnected = myStudents.some(conn => conn.studentId === studentUid);
      if (!isConnected) {
        alert('You can only view reports for students you are connected with. Please send a connection request first.');
        setLoadingReports(false);
        return;
      }
      
      // Find student in search results or use provided email
      let student = students.find(s => s.uid === studentUid);
      let email = student?.email || studentEmail || 'Unknown Student';
      
      // Set selected student immediately (even with empty reports) so the section appears
      const initialStudent: StudentWithReports = student 
        ? { ...student, reports: [] }
        : { uid: studentUid, email, reports: [] };
      
      console.log('Setting selectedStudent initially:', initialStudent);
      setSelectedStudent(initialStudent);
      
      const reportsCollectionRef = collection(db, 'users', studentUid, 'learningReports');
      
      // Try with orderBy first, but fallback to no orderBy if index is missing
      let querySnapshot;
      try {
        const q = query(reportsCollectionRef, orderBy('timestamp', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('Error with orderBy, trying without orderBy:', orderByError);
        // If orderBy fails (likely missing index), fetch without ordering
        if (orderByError.code === 'failed-precondition' || orderByError.message?.includes('index')) {
          console.log('Fetching reports without orderBy (index may be missing)');
          querySnapshot = await getDocs(reportsCollectionRef);
        } else {
          throw orderByError;
        }
      }
      
      const reports: LearningReport[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Found report:', doc.id, data);
        return {
          id: doc.id,
          ...data
        } as LearningReport;
      });
      
      // Sort manually if we fetched without orderBy
      reports.sort((a, b) => {
        const aTime = a.timestamp?.seconds || (a.sessionDate ? new Date(a.sessionDate).getTime() / 1000 : 0);
        const bTime = b.timestamp?.seconds || (b.sessionDate ? new Date(b.sessionDate).getTime() / 1000 : 0);
        return bTime - aTime; // Descending order
      });
      
      console.log(`Loaded ${reports.length} reports for student:`, studentUid);
      console.log('Reports data:', reports);
      console.log('Query snapshot size:', querySnapshot.docs.length);
      console.log('Is connected check result:', isConnected);
      console.log('myStudents array:', myStudents.map(c => ({ studentId: c.studentId, studentEmail: c.studentEmail })));
      
      // Update selected student with loaded reports
      const updatedStudent: StudentWithReports = student 
        ? { ...student, reports }
        : { uid: studentUid, email, reports };
      
      console.log('Setting selectedStudent with reports:', updatedStudent);
      setSelectedStudent(updatedStudent);
    } catch (error: any) {
      console.error('Error loading student reports:', error);
      console.error('Error code:', error?.code);
      console.error('Error message:', error?.message);
      console.error('Full error object:', error);
      
      // Show more detailed error message
      if (error?.code === 'permission-denied') {
        alert('Permission denied: Unable to access student reports. Please ensure you are connected to this student and try again. If the problem persists, please refresh the page.');
      } else {
        alert(`Error loading reports: ${error?.message || 'Unknown error'}`);
      }
      
      // Update with empty reports on error
      const student = students.find(s => s.uid === studentUid);
      let email = student?.email || studentEmail || 'Unknown Student';
      if (student) {
        setSelectedStudent({ ...student, reports: [] });
      } else {
        setSelectedStudent({ uid: studentUid, email, reports: [] });
      }
    } finally {
      setLoadingReports(false);
    }
  }

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
      transition: {
        duration: 0.5
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4
      }
    }
  };

  return (
    <motion.div
      className={`landing-wrapper brand-bg-light home-container spacing-${spacing}`}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <nav className="glass-nav glass-nav-light parent-dashboard-nav" aria-label="Teacher dashboard">
        <div className="nav-left">
          <img src={logoImage} alt="JustWav3" className="nav-logo" width={150} height={44} />
          <span className="nav-divider" aria-hidden="true" />
          <div className="nav-user-pill">
            <img src={teacherProfileImage} alt="" className="avatar-sm" width={32} height={32} />
            <span className="text-dark-sm">Teacher Portal</span>
          </div>
        </div>
        <div className="nav-actions">
          <motion.button
            type="button"
            onClick={() => { setNavigating(true); navigate('/messages'); }}
            className="btn-ghost-dark relative"
            aria-label="Open messages"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Messages
            {(unreadMessageCount > 0 || pendingRequestCount > 0) && (
              <span className="notification-dot" aria-hidden="true" />
            )}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setShowAccessibilityModal(true)}
            className="btn-outline-dark-lg"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Accessibility
          </motion.button>
          <motion.button
            type="button"
            onClick={handleLogout}
            className="btn-cyan-solid"
            aria-label="Sign out"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Sign Out
          </motion.button>
        </div>
      </nav>
      <main id="main-content" className="parent-dashboard-main container-xl" role="main">
        <EmailVerificationBanner />
        <header className="dashboard-header-text">
          <h1 className="hero-title-dark-sm">
            Welcome back, <span className="text-cyan-solid">Teacher</span>
          </h1>
          <p className="bento-text-muted">Monitor your students&apos; learning progress and access their reports.</p>
          <p className="user-email" aria-label={currentUser?.email ? `Signed in as ${currentUser.email}` : 'Account'}>
            {currentUser?.email}
          </p>
          <div className="parent-dashboard-quick-actions">
            <motion.button
              type="button"
              onClick={() => { setNavigating(true); navigate('/learn'); }}
              className="btn-outline-dark-lg"
              aria-label="Open demo version"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Demo Version
            </motion.button>
            <motion.button
              type="button"
              onClick={() => { setNavigating(true); navigate('/practice'); }}
              className="btn-cyan-solid"
              aria-label="Start practice"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Start Practice
            </motion.button>
            <motion.button
              type="button"
              onClick={() => { setNavigating(true); navigate('/create-mcq'); }}
              className="btn-cyan-solid"
              aria-label="Create MCQ Practice"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Create MCQ Practice
            </motion.button>
          </div>
        </header>

        {/* MCQ Sets Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="mcq-sets-heading"
          variants={itemVariants}
        >
          <h3 id="mcq-sets-heading">📝 My MCQ Sets</h3>
          {loadingMcqSets ? (
            <div className="reports-empty">
              <p>Loading MCQ sets...</p>
            </div>
          ) : mcqSets.length === 0 ? (
            <div className="reports-empty">
              <p>You haven't created any MCQ sets yet.</p>
              <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                Click "Create MCQ Practice" above to create your first set.
              </p>
            </div>
          ) : (
            <div className="reports-grid">
              {mcqSets.map((mcqSet) => (
                <motion.div
                  key={mcqSet.id}
                  className="report-card"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                >
                  <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>📝</div>
                  <h4>{mcqSet.title}</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
                    {mcqSet.slides?.length || 0} question{mcqSet.slides?.length !== 1 ? 's' : ''}
                  </p>
                  {mcqSet.createdAt && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', marginBottom: 'var(--spacing-md)' }}>
                      Created: {new Date((mcqSet.createdAt as Timestamp).seconds * 1000).toLocaleDateString()}
                    </p>
                  )}
                  <motion.button
                    onClick={() => handleOpenAssignModal(mcqSet)}
                    className="logout-button"
                    style={{ 
                      marginTop: 'var(--spacing-md)', 
                      width: '100%',
                      background: 'linear-gradient(135deg, var(--primary-color) 0%, #4169E1 100%)'
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    📤 Assign to Students
                  </motion.button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Connection Requests Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="requests-heading"
          variants={itemVariants}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
            <h3 id="requests-heading" style={{ margin: 0 }}>📬 Connection Requests</h3>
            <motion.button
              onClick={fetchConnections}
              disabled={refreshingConnections}
              className="logout-button"
              style={{ padding: '8px 16px', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {refreshingConnections ? 'Refreshing...' : '🔄 Refresh'}
            </motion.button>
          </div>
          
          {pendingRequests.length === 0 ? (
            <div className="reports-empty">
              <p>No pending connection requests.</p>
            </div>
          ) : (
            <>
            
            {/* Incoming Requests */}
            {pendingRequests.filter(req => req.requestedId === currentUser?.uid).length > 0 && (
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--primary-color)', fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>
                  Incoming Requests ({pendingRequests.filter(req => req.requestedId === currentUser?.uid).length})
                </h4>
                <div className="reports-grid">
                  {pendingRequests.filter(req => req.requestedId === currentUser?.uid).map((request) => (
                    <motion.div
                      key={request.id}
                      className="report-card"
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div className="feature-icon-large" style={{ marginBottom: 'var(--spacing-sm)' }}>
                        {request.requestorRole === 'teacher' ? (
                          <img src={teacherProfileImage} alt="" className="teacher-role-icon-img" />
                        ) : (
                          <img src={studentProfileImage} alt="" className="student-role-icon-img" />
                        )}
                      </div>
                      <h4>{request.requestorEmail}</h4>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                        {request.requestorRole === 'student' ? 'Student' : 'Teacher'} wants to connect
                      </p>
                      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                        <motion.button
                          onClick={() => handleAcceptRequest(request.id, request.requestorId, request.requestorEmail, request.requestorRole)}
                          className="logout-button"
                          style={{ flex: 1, background: 'var(--success-color)' }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          ✅ Accept
                        </motion.button>
                        <motion.button
                          onClick={() => handleRejectRequest(request.id)}
                          className="logout-button"
                          style={{ flex: 1, background: 'var(--error-color)' }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          ❌ Reject
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Outgoing Requests */}
            {pendingRequests.filter(req => req.requestorId === currentUser?.uid).length > 0 && (
              <div>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>
                  Outgoing Requests ({pendingRequests.filter(req => req.requestorId === currentUser?.uid).length})
                </h4>
                <div className="reports-grid">
                  {pendingRequests.filter(req => req.requestorId === currentUser?.uid).map((request) => (
                    <motion.div
                      key={request.id}
                      className="report-card"
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div className="feature-icon-large" style={{ marginBottom: 'var(--spacing-sm)' }}>
                        <img src={studentProfileImage} alt="" className="student-role-icon-img" />
                      </div>
                      <h4>{request.requestedEmail}</h4>
                      <p style={{ color: 'var(--text-secondary)' }}>⏳ Waiting for response...</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', marginTop: 'var(--spacing-xs)' }}>
                        Sent {request.createdAt ? new Date(request.createdAt.seconds * 1000).toLocaleDateString() : 'recently'}
                      </p>
                      <motion.button
                        type="button"
                        onClick={() => handleCancelOutgoingConnectionRequest(request.id)}
                        className="logout-button"
                        style={{ marginTop: 'var(--spacing-md)', width: '100%', background: 'var(--text-secondary)' }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        aria-label={`Cancel request to ${request.requestedEmail}`}
                      >
                        Cancel request
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
        </motion.section>

        {/* Your Students Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="your-students-heading"
          variants={itemVariants}
        >
          <h3 id="your-students-heading">
            <img
              src={studentProfileImage}
              alt=""
              className="student-role-icon-heading"
              width={32}
              height={32}
            />{' '}
            Your Students
          </h3>
          {myStudents.length === 0 ? (
            <div className="reports-empty">
              <p>You don't have any connected students yet.</p>
              <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                Search for students above and send them connection requests, or wait for students to request you.
              </p>
            </div>
          ) : (
            <div className="reports-grid">
              {myStudents.map((connection) => {
                const studentParents = studentParentsMap[connection.studentId] || [];
                return (
                  <motion.div
                    key={connection.id}
                    className="report-card"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                  >
                    <div className="feature-icon-large" style={{ marginBottom: 'var(--spacing-sm)' }}>
                      <img src={studentProfileImage} alt="" className="student-role-icon-img" />
                    </div>
                    <h4>{connection.studentEmail}</h4>
                    <p>Connected since {connection.createdAt ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}</p>
                    
                    {/* Student's Parents */}
                    {studentParents.length > 0 && (
                      <div style={{ 
                        marginTop: 'var(--spacing-md)', 
                        padding: 'var(--spacing-sm)', 
                        background: 'var(--background)', 
                        borderRadius: 'var(--border-radius)',
                        border: '1px solid var(--border-color)'
                      }}>
                        <p style={{ 
                          margin: 0, 
                          marginBottom: 'var(--spacing-xs)', 
                          fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)',
                          fontWeight: 600,
                          color: 'var(--text-secondary)'
                        }}>
                          Student's Parents:
                        </p>
                        {studentParents.map((parent) => (
                          <p key={parent.id} style={{ 
                            margin: 'var(--spacing-xs) 0 0 0', 
                            fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)',
                            color: 'var(--text-color)'
                          }}>
                            <img
                              src={parentProfileImage}
                              alt=""
                              className="parent-role-icon-inline"
                              width={18}
                              height={18}
                            />{' '}
                            {parent.parentEmail}
                          </p>
                        ))}
                      </div>
                    )}
                    
                    <motion.button
                      onClick={() => {
                        console.log('View Reports button clicked for:', connection.studentEmail);
                        loadStudentReports(connection.studentId, connection.studentEmail);
                      }}
                      className="logout-button"
                      style={{ 
                        marginTop: 'var(--spacing-md)', 
                        width: '100%',
                        background: 'var(--primary-color)'
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      📊 View Reports
                    </motion.button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.section>

        <motion.section
          className="accessibility-controls"
          aria-labelledby="find-students-heading"
          variants={itemVariants}
        >
          <h3 id="find-students-heading">Search Students</h3>
          <form onSubmit={handleStudentSearch} style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student email"
              aria-label="Search by student email"
              style={{ flex: 1, minWidth: '240px' }}
            />
            <motion.button
              type="submit"
              className="logout-button"
              aria-busy={searchLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              {searchLoading ? 'Searching…' : 'Search'}
            </motion.button>
          </form>
          {searchError && (
            <p className="error-text" style={{ marginTop: 'var(--spacing-sm)' }}>{searchError}</p>
          )}
          {students.length > 0 && (
            <div className="feature-grid" style={{ marginTop: 'var(--spacing-md)' }}>
              {students.map((s) => {
                const isPending = pendingRequests.some(req => 
                  (req.requestorId === currentUser?.uid && req.requestedId === s.uid) ||
                  (req.requestorId === s.uid && req.requestedId === currentUser?.uid)
                );
                const isConnected = myStudents.some(conn => conn.studentId === s.uid);
                
                return (
                  <motion.div 
                    key={s.uid} 
                    className="feature-card" 
                    variants={cardVariants} 
                    initial="hidden" 
                    animate="visible"
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="feature-icon-large">
                        <img src={studentProfileImage} alt="" className="student-role-icon-img" />
                      </div>
                      <h4>{s.email}</h4>
                      <p>Reports: {s.reports.length}</p>
                    </div>
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadStudentReports(s.uid, s.email);
                      }}
                      className="logout-button"
                      style={{ 
                        marginTop: 'var(--spacing-xs)',
                        width: '100%',
                        background: 'var(--primary-color)'
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      📊 View Reports
                    </motion.button>
                    {isConnected ? (
                      <p style={{ color: 'var(--success-color)', fontWeight: 600, marginTop: 'var(--spacing-xs)', textAlign: 'center' }}>✅ Connected</p>
                    ) : isPending ? (
                      <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)', textAlign: 'center' }}>⏳ Request Pending</p>
                    ) : (
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequestStudent(s.uid, s.email);
                        }}
                        className="logout-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{ marginTop: 'var(--spacing-xs)', width: '100%' }}
                      >
                        Request Student
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          {students.length === 0 && searchQuery.trim() && !searchLoading && !searchError && (
            <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>No students found</p>
          )}
        </motion.section>

        {selectedStudent ? (
          <motion.section
            id="student-reports-section"
            className="reports-history"
            aria-labelledby="student-reports-heading"
            variants={itemVariants}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ 
              marginTop: 'var(--spacing-lg)', 
              padding: 'var(--spacing-lg)', 
              border: '2px solid var(--primary-color)', 
              borderRadius: 'var(--border-radius)',
              backgroundColor: 'var(--background)',
              minHeight: '200px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <h3 id="student-reports-heading" style={{ margin: 0, color: 'var(--text-color)' }}>
                Learning Reports for {selectedStudent.email} 📊
              </h3>
              <motion.button
                onClick={() => setSelectedStudent(null)}
                className="logout-button"
                style={{ padding: '8px 16px', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Close student reports"
              >
                ✕ Close
              </motion.button>
            </div>
            {loadingReports ? (
              <div className="reports-loading" style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
                <p>Loading reports...</p>
              </div>
            ) : selectedStudent.reports.length === 0 ? (
              <div className="reports-empty" style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
                <p>No learning reports yet for this student.</p>
                <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                  Reports will appear here once the student completes learning sessions.
                </p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--background)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Total Reports: <span style={{ color: 'var(--primary-color)' }}>{selectedStudent.reports.length}</span>
                  </p>
                </div>
                <div className="reports-grid">
                  {selectedStudent.reports.map((report) => (
                    <motion.div
                      key={report.id}
                      className="report-card"
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)' }}>
                        <h4 style={{ margin: 0, fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>
                          📅 {new Date(report.sessionDate).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h4>
                        <span className="success-rate" style={{ 
                          fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))',
                          fontWeight: 700,
                          color: report.successRate >= 70 ? 'var(--success-color)' : report.successRate >= 50 ? '#FFA500' : 'var(--error-color)'
                        }}>
                          {report.successRate.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: 'var(--spacing-sm)',
                        marginBottom: 'var(--spacing-md)',
                        padding: 'var(--spacing-sm)',
                        background: 'var(--background)',
                        borderRadius: 'var(--border-radius)'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', color: 'var(--text-secondary)' }}>Attempts</p>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>{report.totalAttempts}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', color: 'var(--text-secondary)' }}>Successes</p>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', color: 'var(--success-color)' }}>{report.totalSuccesses}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', color: 'var(--text-secondary)' }}>Help Requests</p>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))', color: 'var(--primary-color)' }}>{report.totalHelpRequests}</p>
                        </div>
                      </div>

                      <div style={{ 
                        marginTop: 'var(--spacing-md)', 
                        paddingTop: 'var(--spacing-md)', 
                        borderTop: '1px solid var(--border-color)' 
                      }}>
                        <p style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                          <strong>⭐ Best Modes:</strong> {report.profile.bestModes}
                        </p>
                        <p style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                          <strong>💪 Strengths:</strong> {report.profile.strengths}
                        </p>
                        <p style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                          <strong>🎯 Needs:</strong> {report.profile.needs}
                        </p>
                        <p style={{ margin: 0, fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)', color: 'var(--primary-color)', fontWeight: 600 }}>
                          <strong>💡 Recommended:</strong> {report.profile.recommended}
                        </p>
                      </div>

                      {/* Teacher-facing explanations */}
                      {report.profile.explanations && (
                        <details style={{
                          marginTop: 'var(--spacing-md)',
                          padding: 'var(--spacing-md)',
                          background: '#f8f9fa',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--border-radius)'
                        }}>
                          <summary style={{
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))',
                            color: 'var(--primary-color)',
                            marginBottom: 'var(--spacing-sm)'
                          }}>
                            📊 Why these recommendations? (Click to expand)
                          </summary>
                          <div style={{
                            marginTop: 'var(--spacing-md)',
                            paddingTop: 'var(--spacing-md)',
                            borderTop: '1px solid var(--border-color)'
                          }}>
                            {report.profile.explanations.leastEffectiveReason && (
                              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <strong style={{ fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.95)', color: 'var(--text-color)' }}>
                                  🚨 Why student struggles in {report.profile.leastEffective} mode:
                                </strong>
                                <p style={{
                                  margin: 'var(--spacing-xs) 0 0 0',
                                  fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.6'
                                }}>
                                  {report.profile.explanations.leastEffectiveReason}
                                </p>
                              </div>
                            )}
                            {report.profile.explanations.recommendationReason && (
                              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <strong style={{ fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.95)', color: 'var(--text-color)' }}>
                                  ✅ Why these recommendations were made:
                                </strong>
                                <p style={{
                                  margin: 'var(--spacing-xs) 0 0 0',
                                  fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.6'
                                }}>
                                  {report.profile.explanations.recommendationReason}
                                </p>
                              </div>
                            )}
                            {report.profile.explanations.modeStruggles && (
                              <div>
                                <strong style={{ fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.95)', color: 'var(--text-color)' }}>
                                  📈 Detailed mode analysis:
                                </strong>
                                <p style={{
                                  margin: 'var(--spacing-xs) 0 0 0',
                                  fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.6',
                                  whiteSpace: 'pre-line'
                                }}>
                                  {report.profile.explanations.modeStruggles}
                                </p>
                              </div>
                            )}
                          </div>
                        </details>
                      )}

                      {report.sessionDuration && (
                        <p style={{ 
                          marginTop: 'var(--spacing-sm)', 
                          paddingTop: 'var(--spacing-sm)', 
                          borderTop: '1px solid var(--border-color)',
                          fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)',
                          color: 'var(--text-secondary)'
                        }}>
                          ⏱️ Session Duration: {Math.round(report.sessionDuration / 1000 / 60)} minutes
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.section>
        ) : null}

        <motion.section
          className="accessibility-controls"
          aria-labelledby="teacher-features-heading"
          variants={itemVariants}
        >
          <h3 id="teacher-features-heading">Teacher Features</h3>
          <div className="feature-grid">
            {[
              {
                icon: '📊',
                title: 'View Student Progress',
                description: 'Monitor all your students\' learning progress and achievements'
              },
              {
                icon: '📝',
                title: 'Access Reports',
                description: 'View detailed learning reports for each student'
              },
              {
                icon: '🎯',
                title: 'Identify Needs',
                description: 'Understand each student\'s learning preferences and needs'
              },
              {
                icon: '💡',
                title: 'Adaptive Insights',
                description: 'See which learning modes work best for each student'
              }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                className="feature-card"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.7 + index * 0.1, type: "spring", stiffness: 300 }}
                whileHover={{ y: -5, scale: 1.02, boxShadow: "0 8px 20px rgba(0,0,0,0.12)" }}
              >
                <div className="feature-icon-large">{feature.icon}</div>
                <h4>{feature.title}</h4>
                <p>{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Accessibility Settings Modal */}
        {showAccessibilityModal && (
          <div 
            className="modal-overlay" 
            onClick={() => setShowAccessibilityModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="accessibility-heading"
          >
            <div className="accessibility-settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 id="accessibility-heading">
                  <span className="accessibility-icon">⚙️</span>
                  Accessibility Settings
                </h2>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <button
                    onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                    className="keyboard-shortcuts-button"
                    aria-label="Show keyboard shortcuts"
                    title="Keyboard shortcuts (Ctrl/Cmd + /)"
                  >
                    ⌨️
                  </button>
                  <button
                    onClick={() => setShowAccessibilityModal(false)}
                    className="close-modal-button"
                    aria-label="Close accessibility settings"
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div className="accessibility-controls-content">
                {/* Font Options Section */}
                <div className="accessibility-section">
                  <h4 className="section-title">Font Options</h4>
                  <div className="accessibility-buttons-grid">
                    <button
                      className={`accessibility-feature-button ${hideImages ? 'active' : ''}`}
                      onClick={() => setHideImages(!hideImages)}
                      aria-pressed={hideImages}
                    >
                      <span className="button-icon">🖼️</span>
                      <span className="button-text">Hide Images</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${readableFonts ? 'active' : ''}`}
                      onClick={() => setReadableFonts(!readableFonts)}
                      aria-pressed={readableFonts}
                    >
                      <span className="button-icon">📖</span>
                      <span className="button-text">Readable Fonts</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${dyslexicFont ? 'active' : ''}`}
                      onClick={() => setDyslexicFont(!dyslexicFont)}
                      aria-pressed={dyslexicFont}
                    >
                      <span className="button-icon">Aa</span>
                      <span className="button-text">Dyslexic Font</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${bionicReading ? 'active' : ''}`}
                      onClick={() => setBionicReading(!bionicReading)}
                      aria-pressed={bionicReading}
                    >
                      <span className="button-icon">AA</span>
                      <span className="button-text">Bionic Reading</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${stopAnimations ? 'active' : ''}`}
                      onClick={() => setStopAnimations(!stopAnimations)}
                      aria-pressed={stopAnimations}
                    >
                      <span className="button-icon">⏸️</span>
                      <span className="button-text">Stop Animations</span>
                    </button>
                  </div>
                </div>

                {/* Colors Section */}
                <div className="accessibility-section">
                  <h4 className="section-title">Colors</h4>
                  <div className="accessibility-buttons-grid">
                    <button
                      className={`accessibility-feature-button ${invertColors ? 'active' : ''}`}
                      onClick={() => setInvertColors(!invertColors)}
                      aria-pressed={invertColors}
                    >
                      <span className="button-icon">🔄</span>
                      <span className="button-text">Invert Colors</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${brightness !== 100 ? 'active' : ''}`}
                      onClick={() => setShowBrightnessModal(true)}
                    >
                      <span className="button-icon">☀️</span>
                      <span className="button-text">Brightness</span>
                      {brightness !== 100 && <span className="button-value">{brightness}%</span>}
                    </button>
                    <button
                      className={`accessibility-feature-button ${contrast !== 100 ? 'active' : ''}`}
                      onClick={() => setShowContrastModal(true)}
                    >
                      <span className="button-icon">◐</span>
                      <span className="button-text">Contrast</span>
                      {contrast !== 100 && <span className="button-value">{contrast}%</span>}
                    </button>
                    <button
                      className={`accessibility-feature-button ${saturation !== 100 ? 'active' : ''}`}
                      onClick={() => setShowSaturationModal(true)}
                    >
                      <span className="button-icon">💧</span>
                      <span className="button-text">Saturation</span>
                      {saturation !== 100 && <span className="button-value">{saturation}%</span>}
                    </button>
                  </div>
                  
                  {/* Color Filters */}
                  <div className="color-filters-group">
                    <label className="filters-label">Color Filters:</label>
                    <div className="color-filters-options">
                      <button
                        className={`color-filter-option ${colorFilter === 'none' ? 'active' : ''}`}
                        onClick={() => setColorFilter('none')}
                        aria-pressed={colorFilter === 'none'}
                        title="None"
                      >
                        <span className="filter-circle" style={{ background: 'linear-gradient(45deg, #ff0000, #00ff00, #0000ff)' }}></span>
                      </button>
                      <button
                        className={`color-filter-option ${colorFilter === 'grayscale' ? 'active' : ''}`}
                        onClick={() => setColorFilter('grayscale')}
                        aria-pressed={colorFilter === 'grayscale'}
                        title="Grayscale"
                      >
                        <span className="filter-circle" style={{ background: '#808080' }}></span>
                      </button>
                      <button
                        className={`color-filter-option ${colorFilter === 'red-green' ? 'active' : ''}`}
                        onClick={() => setColorFilter('red-green')}
                        aria-pressed={colorFilter === 'red-green'}
                        title="Red/Green"
                      >
                        <span className="filter-circle" style={{ background: 'linear-gradient(45deg, #ff0000, #00ff00)' }}></span>
                      </button>
                      <button
                        className={`color-filter-option ${colorFilter === 'blue-yellow' ? 'active' : ''}`}
                        onClick={() => setColorFilter('blue-yellow')}
                        aria-pressed={colorFilter === 'blue-yellow'}
                        title="Blue/Yellow"
                      >
                        <span className="filter-circle" style={{ background: 'linear-gradient(45deg, #0000ff, #ffff00)' }}></span>
                      </button>
                      <button
                        className={`color-filter-option ${colorFilter === 'green-red' ? 'active' : ''}`}
                        onClick={() => setColorFilter('green-red')}
                        aria-pressed={colorFilter === 'green-red'}
                        title="Green/Red"
                      >
                        <span className="filter-circle" style={{ background: 'linear-gradient(45deg, #00ff00, #ff0000)' }}></span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Navigation Section */}
                <div className="accessibility-section">
                  <h4 className="section-title">Navigation</h4>
                  <div className="accessibility-buttons-grid">
                    <button
                      className={`accessibility-feature-button ${readingLine ? 'active' : ''}`}
                      onClick={() => setReadingLine(!readingLine)}
                      aria-pressed={readingLine}
                    >
                      <span className="button-icon">➖</span>
                      <span className="button-text">Reading Line</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${highlightLinks ? 'active' : ''}`}
                      onClick={() => setHighlightLinks(!highlightLinks)}
                      aria-pressed={highlightLinks}
                    >
                      <span className="button-icon">🔗</span>
                      <span className="button-text">Highlight Links</span>
                    </button>
                    <button
                      className="accessibility-feature-button"
                      onClick={readPage}
                    >
                      <span className="button-icon" aria-hidden>
                        <img src={audioIcon} alt="" width={20} height={20} />
                      </span>
                      <span className="button-text">Read Page</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${readingMask ? 'active' : ''}`}
                      onClick={() => setReadingMask(!readingMask)}
                      aria-pressed={readingMask}
                    >
                      <span className="button-icon">🎭</span>
                      <span className="button-text">Reading Mask</span>
                    </button>
                    <button
                      className={`accessibility-feature-button ${pageStructure ? 'active' : ''}`}
                      onClick={() => setPageStructure(!pageStructure)}
                      aria-pressed={pageStructure}
                    >
                      <span className="button-icon">📋</span>
                      <span className="button-text">Page Structure</span>
                    </button>
                  </div>
                </div>

                {/* Additional Settings (Collapsible) */}
                <div className="accessibility-section">
                  <details className="additional-settings">
                    <summary className="section-title">Additional Settings</summary>
                    <div className="additional-controls">
                      <div className="control-group">
                        <label htmlFor="text-size">
                          <span>Text Size: {Math.round(textSize * 100)}%</span>
                          <input
                            type="range"
                            id="text-size"
                            min="0.875"
                            max="1.5"
                            step="0.125"
                            value={textSize}
                            onChange={(e) => setTextSize(parseFloat(e.target.value))}
                            aria-label="Text size adjustment"
                            aria-valuemin={0.875}
                            aria-valuemax={1.5}
                            aria-valuenow={textSize}
                          />
                        </label>
                      </div>

                      <div className="control-group">
                        <label htmlFor="high-contrast">
                          <input
                            type="checkbox"
                            id="high-contrast"
                            checked={highContrast}
                            onChange={(e) => setHighContrast(e.target.checked)}
                            aria-label="Enable high contrast mode"
                          />
                          <span>High Contrast Mode</span>
                        </label>
                      </div>

                      <div className="control-group">
                        <label htmlFor="font-preference">Font</label>
                        <div className="setting-options">
                          <button
                            id="font-default"
                            className={`setting-option ${fontPreference === 'default' ? 'active' : ''}`}
                            onClick={() => setFontPreference('default')}
                            aria-pressed={fontPreference === 'default'}
                          >
                            Default
                          </button>
                          <button
                            id="font-opendyslexic"
                            className={`setting-option ${fontPreference === 'opendyslexic' ? 'active' : ''}`}
                            onClick={() => setFontPreference('opendyslexic')}
                            aria-pressed={fontPreference === 'opendyslexic'}
                          >
                            OpenDyslexic
                          </button>
                        </div>
                      </div>

                      <div className="control-group">
                        <label htmlFor="reduced-motion">
                          <input
                            type="checkbox"
                            id="reduced-motion"
                            checked={reducedMotion}
                            onChange={(e) => setReducedMotion(e.target.checked)}
                            aria-label="Enable reduced motion"
                          />
                          <span>Reduced Motion</span>
                        </label>
                      </div>

                      <div className="control-group">
                        <label htmlFor="spacing">Layout Spacing</label>
                        <div className="setting-options">
                          <button
                            id="spacing-compact"
                            className={`setting-option ${spacing === 'compact' ? 'active' : ''}`}
                            onClick={() => setSpacing('compact')}
                            aria-pressed={spacing === 'compact'}
                          >
                            Compact
                          </button>
                          <button
                            id="spacing-comfortable"
                            className={`setting-option ${spacing === 'comfortable' ? 'active' : ''}`}
                            onClick={() => setSpacing('comfortable')}
                            aria-pressed={spacing === 'comfortable'}
                          >
                            Comfortable
                          </button>
                        </div>
                      </div>

                    </div>
                  </details>
                </div>

                {/* Bottom Actions */}
                <div className="accessibility-actions">
                  <button
                    className="reset-settings-button"
                    onClick={() => {
                      setTextSize(1);
                      setHighContrast(false);
                      setFontPreference('default');
                      setReducedMotion(false);
                      setSpacing('comfortable');
                      setHideImages(false);
                      setReadableFonts(false);
                      setDyslexicFont(false);
                      setBionicReading(false);
                      setStopAnimations(false);
                      setInvertColors(false);
                      setBrightness(100);
                      setContrast(100);
                      setSaturation(100);
                      setColorFilter('none');
                      setReadingLine(false);
                      setHighlightLinks(false);
                      setReadingMask(false);
                      setPageStructure(false);
                    }}
                  >
                    🔄 Reset Settings
                  </button>
                </div>

                {/* Slider Modals */}
                {showBrightnessModal && (
                  <div className="slider-modal-overlay" onClick={() => setShowBrightnessModal(false)}>
                    <div className="slider-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="slider-modal-content">
                        <h5>Brightness</h5>
                        <input
                          type="range"
                          min="50"
                          max="200"
                          step="10"
                          value={brightness}
                          onChange={(e) => setBrightness(parseFloat(e.target.value))}
                          aria-label="Adjust brightness"
                        />
                        <span>{brightness}%</span>
                        <button onClick={() => setShowBrightnessModal(false)}>Done</button>
                      </div>
                    </div>
                  </div>
                )}

                {showContrastModal && (
                  <div className="slider-modal-overlay" onClick={() => setShowContrastModal(false)}>
                    <div className="slider-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="slider-modal-content">
                        <h5>Contrast</h5>
                        <input
                          type="range"
                          min="50"
                          max="200"
                          step="10"
                          value={contrast}
                          onChange={(e) => setContrast(parseFloat(e.target.value))}
                          aria-label="Adjust contrast"
                        />
                        <span>{contrast}%</span>
                        <button onClick={() => setShowContrastModal(false)}>Done</button>
                      </div>
                    </div>
                  </div>
                )}

                {showSaturationModal && (
                  <div className="slider-modal-overlay" onClick={() => setShowSaturationModal(false)}>
                    <div className="slider-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="slider-modal-content">
                        <h5>Saturation</h5>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          step="10"
                          value={saturation}
                          onChange={(e) => setSaturation(parseFloat(e.target.value))}
                          aria-label="Adjust saturation"
                        />
                        <span>{saturation}%</span>
                        <button onClick={() => setShowSaturationModal(false)}>Done</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Assign Assignment Modal */}
        {showAssignModal && selectedMcqSetForAssignment && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleCloseAssignModal}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--spacing-md)',
            }}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(30px) saturate(180%)',
                borderRadius: '24px',
                padding: 'var(--spacing-xl)',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-xl)',
                border: '1px solid var(--glass-border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
                <h2 style={{ margin: 0, color: 'var(--text-color)', fontSize: 'calc(var(--font-size-xl) * var(--text-size-multiplier))' }}>
                  Assign: {selectedMcqSetForAssignment.title}
                </h2>
                <button
                  onClick={handleCloseAssignModal}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: 'var(--text-color)',
                    padding: 'var(--spacing-xs)',
                  }}
                  aria-label="Close modal"
                >
                  ×
                </button>
              </div>

              {myStudents.length === 0 ? (
                <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <p>You don't have any connected students yet.</p>
                  <p style={{ marginTop: 'var(--spacing-sm)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                    Connect with students from the "Your Students" section first.
                  </p>
                </div>
              ) : (
                <>
                  {/* Student Selection */}
                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--spacing-sm)', fontWeight: 600, color: 'var(--text-color)' }}>
                      Select Students (Multi-select):
                    </label>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacing-sm)',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      padding: 'var(--spacing-sm)',
                      background: 'var(--surface)',
                      borderRadius: '12px',
                      border: '2px solid var(--glass-border)',
                    }}>
                      {myStudents.map((connection) => (
                        <label key={connection.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--spacing-sm)',
                          padding: 'var(--spacing-sm)',
                          cursor: 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={assignStudentIds.includes(connection.studentId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAssignStudentIds([...assignStudentIds, connection.studentId]);
                              } else {
                                setAssignStudentIds(assignStudentIds.filter(id => id !== connection.studentId));
                              }
                            }}
                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                          />
                          <span style={{ color: 'var(--text-color)' }}>{connection.studentEmail}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Due Date */}
                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label htmlFor="modal-due-date" style={{ display: 'block', marginBottom: 'var(--spacing-sm)', fontWeight: 600, color: 'var(--text-color)' }}>
                      Due Date (Required):
                    </label>
                    <input
                      id="modal-due-date"
                      type="datetime-local"
                      value={assignDueDate}
                      onChange={(e) => setAssignDueDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 'var(--spacing-md)',
                        border: '2px solid var(--glass-border)',
                        borderRadius: '12px',
                        fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))',
                        background: 'var(--background)',
                        color: 'var(--text-color)',
                      }}
                      min={new Date().toISOString().slice(0, 16)}
                      required
                    />
                  </div>

                  {/* Time Limit */}
                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label htmlFor="modal-time-limit" style={{ display: 'block', marginBottom: 'var(--spacing-sm)', fontWeight: 600, color: 'var(--text-color)' }}>
                      Time Limit in Minutes (Optional, 0 = no limit):
                    </label>
                    <input
                      id="modal-time-limit"
                      type="number"
                      value={assignTimeLimit ?? ''}
                      onChange={(e) => setAssignTimeLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                      style={{
                        width: '100%',
                        padding: 'var(--spacing-md)',
                        border: '2px solid var(--glass-border)',
                        borderRadius: '12px',
                        fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))',
                        background: 'var(--background)',
                        color: 'var(--text-color)',
                      }}
                      min="0"
                      placeholder="No limit"
                    />
                  </div>

                  {/* Attempt Limit */}
                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label htmlFor="modal-attempt-limit" style={{ display: 'block', marginBottom: 'var(--spacing-sm)', fontWeight: 600, color: 'var(--text-color)' }}>
                      Attempt Limit (Optional, 0 = unlimited):
                    </label>
                    <input
                      id="modal-attempt-limit"
                      type="number"
                      value={assignAttemptLimit ?? ''}
                      onChange={(e) => setAssignAttemptLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                      style={{
                        width: '100%',
                        padding: 'var(--spacing-md)',
                        border: '2px solid var(--glass-border)',
                        borderRadius: '12px',
                        fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))',
                        background: 'var(--background)',
                        color: 'var(--text-color)',
                      }}
                      min="0"
                      placeholder="Unlimited"
                    />
                  </div>

                  {/* Shuffle Options */}
                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={assignShuffleQuestions}
                        onChange={(e) => setAssignShuffleQuestions(e.target.checked)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <span style={{ color: 'var(--text-color)' }}>Shuffle Questions</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={assignShuffleOptions}
                        onChange={(e) => setAssignShuffleOptions(e.target.checked)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <span style={{ color: 'var(--text-color)' }}>Shuffle Answer Options</span>
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'flex-end', marginTop: 'var(--spacing-xl)' }}>
                    <motion.button
                      onClick={handleCloseAssignModal}
                      style={{
                        padding: '14px 28px',
                        background: 'transparent',
                        color: 'var(--text-color)',
                        border: '2px solid var(--glass-border)',
                        borderRadius: '12px',
                        fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))',
                        fontWeight: 600,
                        cursor: 'pointer',
                        minHeight: '44px',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      onClick={handleCreateAssignment}
                      disabled={assignStudentIds.length === 0 || !assignDueDate || assigning}
                      style={{
                        padding: '14px 28px',
                        background: assignStudentIds.length === 0 || !assignDueDate || assigning
                          ? 'var(--glass-border)'
                          : 'linear-gradient(135deg, #29c5e6 0%, #1ba8cc 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))',
                        fontWeight: 600,
                        cursor: assignStudentIds.length === 0 || !assignDueDate || assigning ? 'not-allowed' : 'pointer',
                        minHeight: '44px',
                        boxShadow: assignStudentIds.length === 0 || !assignDueDate || assigning
                          ? 'none'
                          : '0 8px 24px rgba(41, 197, 230, 0.35)',
                      }}
                      whileHover={assignStudentIds.length === 0 || !assignDueDate || assigning ? {} : { scale: 1.05 }}
                      whileTap={assignStudentIds.length === 0 || !assignDueDate || assigning ? {} : { scale: 0.95 }}
                    >
                      {assigning ? 'Creating...' : '📤 Assign Assignment'}
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Keyboard Shortcuts Modal */}
        {showKeyboardShortcuts && (
          <div 
            className="modal-overlay" 
            onClick={() => setShowKeyboardShortcuts(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-heading"
          >
            <div className="keyboard-shortcuts-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 id="shortcuts-heading">Keyboard Shortcuts</h2>
                <button
                  onClick={() => setShowKeyboardShortcuts(false)}
                  className="close-modal-button"
                  aria-label="Close keyboard shortcuts"
                >
                  ✕
                </button>
              </div>
              <div className="shortcuts-list">
                <div className="shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>/</kbd> or <kbd>Cmd</kbd> + <kbd>/</kbd>
                  <span>Show/hide keyboard shortcuts</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Esc</kbd>
                  <span>Close modal or cancel action</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Tab</kbd>
                  <span>Navigate between interactive elements</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Enter</kbd>
                  <span>Activate button or submit form</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Space</kbd>
                  <span>Toggle checkbox or activate button</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Arrow Keys</kbd>
                  <span>Navigate lists and options</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </motion.div>
  );
}

