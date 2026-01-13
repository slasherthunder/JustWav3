import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, Timestamp, query as fsQuery, where, limit, addDoc, serverTimestamp, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FirebaseError } from 'firebase/app';
import { EmailVerificationBanner } from '../components/EmailVerificationBanner';
import './Home.css';

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
  };
}

interface Teacher {
  uid: string;
  email: string;
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

interface ParentConnectionRequest {
  id: string;
  requestorId: string;
  requestedId: string;
  requestorEmail: string;
  requestedEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
  requestorRole: 'parent' | 'student';
}

interface ParentConnection {
  id: string;
  studentId: string;
  parentId: string;
  studentEmail: string;
  parentEmail: string;
  createdAt: Timestamp;
}

export function StudentHome() {
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
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
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
  
  const [reports, setReports] = useState<LearningReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  
  // Teacher search state
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherSearchLoading, setTeacherSearchLoading] = useState(false);
  const [teacherSearchError, setTeacherSearchError] = useState<string | null>(null);
  
  // Connection requests state
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
  const [myTeachers, setMyTeachers] = useState<Connection[]>([]);
  const [refreshingConnections, setRefreshingConnections] = useState(false);
  
  // Parent connection state
  const [parentPendingRequests, setParentPendingRequests] = useState<ParentConnectionRequest[]>([]);
  const [myParents, setMyParents] = useState<ParentConnection[]>([]);
  
  // Notification counts
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

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
      container.className = `home-container spacing-${spacing}`;
    }
  }, [textSize, highContrast, fontPreference, reducedMotion, spacing]);

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

    // Dyslexic Font (separate from OpenDyslexic preference)
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
          filterString += 'url(#protanopia) ';
          break;
        case 'blue-yellow':
          filterString += 'url(#tritanopia) ';
          break;
        case 'green-red':
          filterString += 'url(#deuteranopia) ';
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

    // Invert Colors class for additional styling
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

  // Fetch learning reports
  useEffect(() => {
    async function fetchReports() {
      if (!currentUser) {
        setLoadingReports(false);
        return;
      }

      try {
        setLoadingReports(true);
        console.log('Fetching reports for user:', currentUser.uid);
        const reportsRef = collection(db, 'users', currentUser.uid, 'learningReports');
        
        // Try with orderBy first, but fallback to no orderBy if index is missing
        let querySnapshot;
        try {
          const q = query(reportsRef, orderBy('timestamp', 'desc'));
          querySnapshot = await getDocs(q);
        } catch (orderByError: any) {
          console.warn('Error with orderBy, trying without orderBy:', orderByError);
          // If orderBy fails (likely missing index), fetch without ordering
          if (orderByError.code === 'failed-precondition' || orderByError.message?.includes('index')) {
            console.log('Fetching reports without orderBy (index may be missing)');
            querySnapshot = await getDocs(reportsRef);
          } else {
            throw orderByError;
          }
        }
        
        const reportsData: LearningReport[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          console.log('Found report:', doc.id, data);
          reportsData.push({
            id: doc.id,
            ...data
          } as LearningReport);
        });
        
        // Sort manually if we fetched without orderBy
        reportsData.sort((a, b) => {
          const aTime = a.timestamp?.seconds || (a.sessionDate ? new Date(a.sessionDate).getTime() / 1000 : 0);
          const bTime = b.timestamp?.seconds || (b.sessionDate ? new Date(b.sessionDate).getTime() / 1000 : 0);
          return bTime - aTime; // Descending order
        });
        
        console.log(`Loaded ${reportsData.length} reports`);
        setReports(reportsData);
      } catch (error: any) {
        console.error('Error fetching learning reports:', error);
        console.error('Error code:', error?.code);
        console.error('Error message:', error?.message);
        
        // Set empty array on error so UI shows "no reports" instead of loading forever
        setReports([]);
      } finally {
        setLoadingReports(false);
      }
    }

    fetchReports();
  }, [currentUser]);

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
      console.log('Fetching connections for student:', currentUser.uid);
      
      // Fetch pending teacher requests where student is requestor OR requested
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
      
      // Fetch pending parent requests where student is requestor OR requested
      const parentRequestsAsRequestorQuery = fsQuery(
        collection(db, 'parentConnectionRequests'),
        where('requestorId', '==', currentUser.uid),
        where('status', '==', 'pending')
      );
      const parentRequestsAsRequestedQuery = fsQuery(
        collection(db, 'parentConnectionRequests'),
        where('requestedId', '==', currentUser.uid),
        where('status', '==', 'pending')
      );
      
      const [requestorSnapshot, requestedSnapshot, parentRequestorSnapshot, parentRequestedSnapshot] = await Promise.all([
        getDocs(requestsAsRequestorQuery).catch(err => {
          console.error('Error fetching outgoing teacher requests:', err);
          return { docs: [] };
        }),
        getDocs(requestsAsRequestedQuery).catch(err => {
          console.error('Error fetching incoming teacher requests:', err);
          return { docs: [] };
        }),
        getDocs(parentRequestsAsRequestorQuery).catch(err => {
          console.error('Error fetching outgoing parent requests:', err);
          return { docs: [] };
        }),
        getDocs(parentRequestsAsRequestedQuery).catch(err => {
          console.error('Error fetching incoming parent requests:', err);
          return { docs: [] };
        })
      ]);
      
      const pending = [
        ...requestorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })),
        ...requestedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      ] as ConnectionRequest[];
      setPendingRequests(pending);
      
      const parentPending = [
        ...parentRequestorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })),
        ...parentRequestedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      ] as ParentConnectionRequest[];
      setParentPendingRequests(parentPending);
      
      // Fetch confirmed teacher connections (my teachers)
      const connectionsQuery = fsQuery(
        collection(db, 'connections'),
        where('studentId', '==', currentUser.uid)
      );
      const connectionsSnapshot = await getDocs(connectionsQuery).catch(err => {
        console.error('Error fetching teacher connections:', err);
        return { docs: [] };
      });
      const connections = connectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Connection[];
      setMyTeachers(connections);
      
      // Fetch confirmed parent connections (my parents)
      const parentConnectionsQuery = fsQuery(
        collection(db, 'parentConnections'),
        where('studentId', '==', currentUser.uid)
      );
      const parentConnectionsSnapshot = await getDocs(parentConnectionsQuery).catch(err => {
        console.error('Error fetching parent connections:', err);
        return { docs: [] };
      });
      const parentConnections = parentConnectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ParentConnection[];
      setMyParents(parentConnections);
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

  async function handleTeacherSearch(e?: React.FormEvent<HTMLFormElement>) {
    if (e) e.preventDefault();
    const q = teacherSearchQuery.trim().toLowerCase();
    if (!q) {
      setTeachers([]);
      setTeacherSearchError(null);
      return;
    }
    try {
      setTeacherSearchLoading(true);
      setTeacherSearchError(null);
      const snap = await getDocs(fsQuery(collection(db, 'users'), where('role', '==', 'teacher'), limit(50)));
      const all = snap.docs.map(d => {
        const data = d.data() as { email?: string };
        return { uid: d.id, email: String(data.email || '') };
      });
      const matches = all.filter(t => t.email.toLowerCase().includes(q));
      setTeachers(matches);
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        setTeacherSearchError('Not allowed to read teachers. Please update Firestore rules.');
      } else {
        setTeacherSearchError('Search failed. Please try again.');
      }
      setTeachers([]);
    } finally {
      setTeacherSearchLoading(false);
    }
  }

  async function handleRequestTeacher(teacherId: string, teacherEmail: string) {
    if (!currentUser) return;
    
    try {
      // Check if request already exists
      const existingRequestsQuery = fsQuery(
        collection(db, 'connectionRequests'),
        where('requestorId', '==', currentUser.uid),
        where('requestedId', '==', teacherId)
      );
      const existingSnapshot = await getDocs(existingRequestsQuery);
      
      if (!existingSnapshot.empty) {
        alert('You have already sent a request to this teacher.');
        return;
      }
      
      // Check if already connected
      const existingConnectionQuery = fsQuery(
        collection(db, 'connections'),
        where('studentId', '==', currentUser.uid),
        where('teacherId', '==', teacherId)
      );
      const existingConnectionSnapshot = await getDocs(existingConnectionQuery);
      
      if (!existingConnectionSnapshot.empty) {
        alert('You are already connected with this teacher.');
        return;
      }
      
      // Create request
      const requestData = {
        requestorId: currentUser.uid,
        requestedId: teacherId,
        requestorEmail: currentUser.email || '',
        requestedEmail: teacherEmail,
        status: 'pending',
        requestorRole: 'student',
        createdAt: serverTimestamp()
      };
      
      console.log('Creating request:', requestData);
      const docRef = await addDoc(collection(db, 'connectionRequests'), requestData);
      console.log('Request created with ID:', docRef.id);
      
      alert(`Request sent to ${teacherEmail}! The teacher will be notified.`);
      
      // Refresh pending requests
      await fetchConnections();
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
      if (requestorRole === 'teacher') {
        await addDoc(collection(db, 'connections'), {
          studentId: currentUser.uid,
          teacherId: requestorId,
          studentEmail: currentUser.email || '',
          teacherEmail: requestorEmail,
          createdAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'connections'), {
          studentId: requestorId,
          teacherId: currentUser.uid,
          studentEmail: requestorEmail,
          teacherEmail: currentUser.email || '',
          createdAt: serverTimestamp()
        });
      }
      
      // Refresh connections and requests
      await fetchConnections();
      
      alert('Request accepted! Teacher added to your connections.');
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

  async function handleAcceptParentRequest(requestId: string, requestorId: string, requestorEmail: string, requestorRole: string) {
    if (!currentUser) return;
    
    try {
      // Update request status
      const requestRef = doc(db, 'parentConnectionRequests', requestId);
      await updateDoc(requestRef, {
        status: 'accepted'
      });
      
      // Create connection
      if (requestorRole === 'parent') {
        await addDoc(collection(db, 'parentConnections'), {
          studentId: currentUser.uid,
          parentId: requestorId,
          studentEmail: currentUser.email || '',
          parentEmail: requestorEmail,
          createdAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'parentConnections'), {
          studentId: requestorId,
          parentId: currentUser.uid,
          studentEmail: requestorEmail,
          parentEmail: currentUser.email || '',
          createdAt: serverTimestamp()
        });
      }
      
      // Refresh connections and requests
      await fetchConnections();
      
      alert('Request accepted! Parent added to your connections.');
    } catch (error) {
      console.error('Error accepting parent request:', error);
      alert('Failed to accept request. Please try again.');
    }
  }

  async function handleRejectParentRequest(requestId: string) {
    try {
      const requestRef = doc(db, 'parentConnectionRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected'
      });
      
      // Refresh pending requests
      await fetchConnections();
    } catch (error) {
      console.error('Error rejecting parent request:', error);
      alert('Failed to reject request. Please try again.');
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

  // Respect reduced motion preference
  const motionVariants = reducedMotion ? {
    containerVariants: { hidden: { opacity: 1 }, visible: { opacity: 1 } },
    itemVariants: { hidden: { opacity: 1 }, visible: { opacity: 1 } },
    cardVariants: { hidden: { opacity: 1 }, visible: { opacity: 1 } }
  } : {
    containerVariants,
    itemVariants,
    cardVariants
  };

  return (
    <>
      {/* ARIA Live Region for Announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
        id="announcements"
      />

      <motion.div
        className={`home-container spacing-${spacing}`}
        initial="hidden"
        animate="visible"
        variants={motionVariants.containerVariants}
      >
      <motion.header
        className="home-header"
        role="banner"
        variants={motionVariants.itemVariants}
      >
        <motion.h1
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
        >
          JustWav3 🎓
        </motion.h1>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <motion.button
            onClick={() => { setNavigating(true); navigate('/messages'); }}
            className="messaging-button"
            aria-label="Open Connect"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400 }}
            style={{
              padding: '14px',
              background: (unreadMessageCount > 0 || pendingRequestCount > 0) 
                ? 'linear-gradient(135deg, #FF3B30 0%, #FF6B6B 50%, #FF3B30 100%)'
                : 'linear-gradient(135deg, var(--disability-blue) 0%, #4169E1 50%, var(--disability-blue) 100%)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))',
              cursor: 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: (unreadMessageCount > 0 || pendingRequestCount > 0)
                ? '0 8px 24px rgba(255, 59, 48, 0.4)'
                : '0 8px 24px rgba(65, 105, 225, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            💬
          </motion.button>
          <motion.button
            onClick={() => setShowAccessibilityModal(true)}
            className="accessibility-settings-button"
            aria-label="Open accessibility settings"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400 }}
            style={{
              padding: '14px',
              background: 'linear-gradient(135deg, var(--disability-green) 0%, #00A86B 50%, var(--disability-green) 100%)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))',
              cursor: 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0, 132, 61, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            ⚙️
          </motion.button>
          <motion.button
            onClick={handleLogout}
            className="logout-button"
            aria-label="Log out of your account"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            Logout
          </motion.button>
        </div>
      </motion.header>
      <main id="main-content" className="home-main" role="main">
        <EmailVerificationBanner />
        <motion.div
          className="welcome-card"
          variants={cardVariants}
          whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Welcome, Student! 🎓
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            You are logged in as:
          </motion.p>
          <motion.p
            className="user-email"
            aria-label={`User email: ${currentUser?.email}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            {currentUser?.email}
          </motion.p>
          <motion.p
            className="welcome-message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Ready to learn? Let's start your learning adventure! 🌟
          </motion.p>
          <motion.button
            onClick={() => { setNavigating(true); navigate('/learn'); }}
            className="logout-button"
            aria-label="Start your learning"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400 }}
            style={{ marginTop: '0.75rem' }}
          >
            Start Your Learning
          </motion.button>
        </motion.div>

        <motion.section
          className="accessibility-controls"
          aria-labelledby="find-teachers-heading"
          variants={motionVariants.itemVariants}
        >
          <h3 id="find-teachers-heading">Find Your Teachers 👩‍🏫</h3>
          <form onSubmit={handleTeacherSearch} style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={teacherSearchQuery}
              onChange={(e) => setTeacherSearchQuery(e.target.value)}
              placeholder="Search by teacher email"
              aria-label="Search by teacher email"
              style={{ flex: 1, minWidth: '240px' }}
            />
            <motion.button
              type="submit"
              className="logout-button"
              aria-busy={teacherSearchLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              {teacherSearchLoading ? 'Searching…' : 'Search'}
            </motion.button>
          </form>
          {teacherSearchError && (
            <p className="error-text" style={{ marginTop: 'var(--spacing-sm)' }}>{teacherSearchError}</p>
          )}
          {teachers.length > 0 && (
            <div className="feature-grid" style={{ marginTop: 'var(--spacing-md)' }}>
              {teachers.map((teacher) => {
                const isPending = pendingRequests.some(req => req.requestedId === teacher.uid);
                const isConnected = myTeachers.some(conn => conn.teacherId === teacher.uid);
                
                return (
                  <motion.div 
                    key={teacher.uid} 
                    className="feature-card" 
                    variants={motionVariants.cardVariants} 
                    initial="hidden" 
                    animate="visible"
                    whileHover={{ y: -5, scale: 1.02, boxShadow: "0 8px 20px rgba(0,0,0,0.12)" }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}
                  >
                    <div className="feature-icon-large">👩‍🏫</div>
                    <h4>{teacher.email}</h4>
                    {isConnected ? (
                      <p style={{ color: 'var(--success-color)', fontWeight: 600 }}>✅ Connected</p>
                    ) : isPending ? (
                      <p style={{ color: 'var(--text-secondary)' }}>⏳ Request Pending</p>
                    ) : (
                      <motion.button
                        onClick={() => handleRequestTeacher(teacher.uid, teacher.email)}
                        className="logout-button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{ marginTop: 'var(--spacing-xs)' }}
                      >
                        Request Teacher
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          {teachers.length === 0 && teacherSearchQuery.trim() && !teacherSearchLoading && !teacherSearchError && (
            <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>No teachers found</p>
          )}
        </motion.section>

        {/* Connection Requests Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="requests-heading"
          variants={motionVariants.itemVariants}
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
          
          {pendingRequests.length === 0 && parentPendingRequests.length === 0 ? (
            <div className="reports-empty">
              <p>No pending connection requests.</p>
            </div>
          ) : (
            <>
            
            {/* Incoming Requests */}
            {pendingRequests.filter(req => req.requestedId === currentUser?.uid).length > 0 && (
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--primary-color)', fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>
                  Incoming Teacher Requests ({pendingRequests.filter(req => req.requestedId === currentUser?.uid).length})
                </h4>
                <div className="reports-grid">
                  {pendingRequests.filter(req => req.requestedId === currentUser?.uid).map((request) => (
                    <motion.div
                      key={request.id}
                      className="report-card"
                      variants={motionVariants.cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👩‍🏫</div>
                      <h4>{request.requestorEmail}</h4>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                        {request.requestorRole === 'teacher' ? 'Teacher' : 'Student'} wants to connect
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
                  Outgoing Teacher Requests ({pendingRequests.filter(req => req.requestorId === currentUser?.uid).length})
                </h4>
                <div className="reports-grid">
                  {pendingRequests.filter(req => req.requestorId === currentUser?.uid).map((request) => (
                    <motion.div
                      key={request.id}
                      className="report-card"
                      variants={motionVariants.cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👩‍🏫</div>
                      <h4>{request.requestedEmail}</h4>
                      <p style={{ color: 'var(--text-secondary)' }}>⏳ Waiting for response...</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', marginTop: 'var(--spacing-xs)' }}>
                        Sent {request.createdAt ? new Date(request.createdAt.seconds * 1000).toLocaleDateString() : 'recently'}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Parent Incoming Requests */}
            {parentPendingRequests.filter(req => req.requestedId === currentUser?.uid).length > 0 && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--primary-color)', fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>
                  Incoming Parent Requests ({parentPendingRequests.filter(req => req.requestedId === currentUser?.uid).length})
                </h4>
                <div className="reports-grid">
                  {parentPendingRequests.filter(req => req.requestedId === currentUser?.uid).map((request) => (
                    <motion.div
                      key={request.id}
                      className="report-card"
                      variants={motionVariants.cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👨‍👩‍👧‍👦</div>
                      <h4>{request.requestorEmail}</h4>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                        Parent wants to connect
                      </p>
                      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                        <motion.button
                          onClick={() => handleAcceptParentRequest(request.id, request.requestorId, request.requestorEmail, request.requestorRole)}
                          className="logout-button"
                          style={{ flex: 1, background: 'var(--success-color)' }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          ✅ Accept
                        </motion.button>
                        <motion.button
                          onClick={() => handleRejectParentRequest(request.id)}
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
            
            {/* Parent Outgoing Requests */}
            {parentPendingRequests.filter(req => req.requestorId === currentUser?.uid).length > 0 && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier))' }}>
                  Outgoing Parent Requests ({parentPendingRequests.filter(req => req.requestorId === currentUser?.uid).length})
                </h4>
                <div className="reports-grid">
                  {parentPendingRequests.filter(req => req.requestorId === currentUser?.uid).map((request) => (
                    <motion.div
                      key={request.id}
                      className="report-card"
                      variants={motionVariants.cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                    >
                      <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👨‍👩‍👧‍👦</div>
                      <h4>{request.requestedEmail}</h4>
                      <p style={{ color: 'var(--text-secondary)' }}>⏳ Waiting for response...</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)', marginTop: 'var(--spacing-xs)' }}>
                        Sent {request.createdAt ? new Date(request.createdAt.seconds * 1000).toLocaleDateString() : 'recently'}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
        </motion.section>

        {/* Your Teachers Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="your-teachers-heading"
          variants={motionVariants.itemVariants}
        >
          <h3 id="your-teachers-heading">Your Teachers 👩‍🏫</h3>
          {myTeachers.length === 0 ? (
            <div className="reports-empty">
              <p>You don't have any connected teachers yet.</p>
              <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                Search for teachers above and send them connection requests, or wait for teachers to request you.
              </p>
            </div>
          ) : (
            <div className="reports-grid">
              {myTeachers.map((connection) => (
                <motion.div
                  key={connection.id}
                  className="report-card"
                  variants={motionVariants.cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                >
                  <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👩‍🏫</div>
                  <h4>{connection.teacherEmail}</h4>
                  <p>Connected since {connection.createdAt ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}</p>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Your Parents Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="your-parents-heading"
          variants={motionVariants.itemVariants}
        >
          <h3 id="your-parents-heading">Your Parents 👨‍👩‍👧‍👦</h3>
          {myParents.length === 0 ? (
            <div className="reports-empty">
              <p>You don't have any connected parents yet.</p>
              <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                Parents can send you connection requests, which will appear in your Connection Requests section above.
              </p>
            </div>
          ) : (
            <div className="reports-grid">
              {myParents.map((connection) => (
                <motion.div
                  key={connection.id}
                  className="report-card"
                  variants={motionVariants.cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                >
                  <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👨‍👩‍👧‍👦</div>
                  <h4>{connection.parentEmail}</h4>
                  <p>Connected since {connection.createdAt ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}</p>
                </motion.div>
              ))}
            </div>
          )}
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
                      <span className="button-icon">🔊</span>
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

        {/* Learning Reports History Section */}
        <motion.section
          id="reports-section"
          className="reports-history"
          aria-labelledby="reports-heading"
          variants={motionVariants.itemVariants}
          whileHover={reducedMotion ? {} : { y: -2 }}
          transition={reducedMotion ? {} : { type: "spring", stiffness: 300 }}
        >
          <h3 id="reports-heading">📊 Your Learning Reports History</h3>
          
          {loadingReports ? (
            <div className="reports-loading">
              <p>Loading your reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="reports-empty">
              <p>No learning reports yet. Start your first learning session to see your progress!</p>
              <motion.button
                onClick={() => { setNavigating(true); navigate('/learn'); }}
                className="logout-button"
                aria-label="Start your learning"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
                style={{ marginTop: '1rem' }}
              >
                Start Learning
              </motion.button>
            </div>
          ) : (
            <div className="reports-grid">
              {reports.map((report, index) => (
                <motion.div
                  key={report.id}
                  className="report-card"
                  variants={motionVariants.cardVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                >
                  <div className="report-header">
                    <h4>Session Report</h4>
                    <span className="report-date">
                      {new Date(report.sessionDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  
                  <div className="report-metrics">
                    <div className="metric-item">
                      <span className="metric-label">Success Rate</span>
                      <span className="metric-value success">{Math.round(report.successRate)}%</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Attempts</span>
                      <span className="metric-value">{report.totalAttempts}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Successes</span>
                      <span className="metric-value">{report.totalSuccesses}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Help Requests</span>
                      <span className="metric-value">{report.totalHelpRequests}</span>
                    </div>
                  </div>

                  <div className="report-profile">
                    <div className="profile-item">
                      <strong>Best Modes:</strong> {report.profile.bestModes}
                    </div>
                    <div className="profile-item">
                      <strong>Strengths:</strong> {report.profile.strengths}
                    </div>
                    <div className="profile-item">
                      <strong>Recommendation:</strong> {report.profile.recommended}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>
      </main>
    </motion.div>
    </>
  );
}

