import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, Timestamp, query as fsQuery, where, limit, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FirebaseError } from 'firebase/app';
import { EmailVerificationBanner } from '../components/EmailVerificationBanner';
import { getAssignmentsByStudent } from '../utils/assignments';
import type { Assignment } from '../types/assignments';
import './Home.css';
import logoImage from '../assets/images/logo.png';

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
  const [textSize, setTextSize] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
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
  
  // Assignments state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  
  // Notification counts
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  
  // Accessibility modal state
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  
  // Assignment selection modal state
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentMcqSets, setAssignmentMcqSets] = useState<Record<string, { title: string }>>({});
  const [loadingMcqSets, setLoadingMcqSets] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-size-multiplier', textSize.toString());
    
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [textSize, highContrast]);

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

  // Fetch assignments for this student
  useEffect(() => {
    const fetchAssignments = async () => {
      if (!currentUser) return;

      try {
        setLoadingAssignments(true);
        // Try query with orderBy first, but if it fails (no index), fall back to simple query
        try {
          const studentAssignments = await getAssignmentsByStudent(currentUser.uid);
          console.log('Fetched assignments for student:', studentAssignments.length, studentAssignments);
          setAssignments(studentAssignments);
        } catch (queryError: any) {
          // If orderBy fails (likely missing index), try without it
          if (queryError?.code === 'failed-precondition') {
            // Silently handle missing index - we'll use fallback query
            console.log('[StudentHome] Firestore index not found, using fallback query (this is expected until index is created)');
          } else {
          console.warn('Query with orderBy failed, trying without orderBy:', queryError);
          }
          
          const assignmentsQuery = fsQuery(
            collection(db, 'assignments'),
            where('assignedStudentIds', 'array-contains', currentUser.uid)
          );
          const snapshot = await getDocs(assignmentsQuery);
          const assignments = snapshot.docs.map(doc => ({
            assignmentId: doc.id,
            ...doc.data(),
          })) as Assignment[];
          // Sort manually by createdAt
          assignments.sort((a, b) => {
            const aTime = a.createdAt ? (a.createdAt as Timestamp).seconds : 0;
            const bTime = b.createdAt ? (b.createdAt as Timestamp).seconds : 0;
            return bTime - aTime;
          });
          console.log('Fetched assignments (sorted manually):', assignments.length, assignments);
          setAssignments(assignments);
        }
      } catch (error: any) {
        console.error('Error fetching assignments:', error);
        console.error('Error code:', error?.code);
        console.error('Error message:', error?.message);
        setAssignments([]);
      } finally {
        setLoadingAssignments(false);
      }
    };

    fetchAssignments();
  }, [currentUser]);

  // Load MCQ set titles for assignments
  useEffect(() => {
    const loadMcqSetTitles = async () => {
      if (assignments.length === 0) return;

      try {
        setLoadingMcqSets(true);
        const mcqSetIds = [...new Set(assignments.map(a => a.mcqSetId))];
        const mcqSetData: Record<string, { title: string }> = {};

        await Promise.all(
          mcqSetIds.map(async (mcqSetId) => {
            try {
              const mcqSetDoc = await getDoc(doc(db, 'mcqSets', mcqSetId));
              if (mcqSetDoc.exists()) {
                mcqSetData[mcqSetId] = { title: mcqSetDoc.data().title || 'Untitled Assignment' };
              }
            } catch (error) {
              console.error(`Error loading MCQ set ${mcqSetId}:`, error);
              mcqSetData[mcqSetId] = { title: 'Unknown Assignment' };
            }
          })
        );

        setAssignmentMcqSets(mcqSetData);
      } catch (error) {
        console.error('Error loading MCQ set titles:', error);
      } finally {
        setLoadingMcqSets(false);
      }
    };

    loadMcqSetTitles();
  }, [assignments]);

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

  return (
    <motion.div
      className="home-container"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <motion.header
        className="home-header"
        role="banner"
        variants={itemVariants}
      >
        <motion.h1
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
        >
          <img src={logoImage} alt="JustWav3" style={{ maxHeight: '50px', width: 'auto', verticalAlign: 'middle' }} /> 🎓
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
            style={{
              padding: '14px',
              background: 'linear-gradient(135deg, #FF6B6B 0%, #FF3B30 50%, #FF6B6B 100%)',
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
              boxShadow: '0 8px 24px rgba(255, 59, 48, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            🚪
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '0.75rem' }}>
            <motion.button
              onClick={() => { setNavigating(true); navigate('/learn'); }}
              className="logout-button"
              aria-label="Our Tutorial"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              Our Tutorial
            </motion.button>
          </div>
        </motion.div>

        {/* Hub-based Layout */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '2.5rem', 
          marginTop: '2.5rem',
          maxWidth: '1400px',
          margin: '2.5rem auto 0',
          padding: '0 var(--spacing-lg)'
        }}>
          
          {/* My Work Hub */}
        <motion.section
          className="reports-history"
            aria-labelledby="work-hub-heading"
          variants={itemVariants}
            style={{ 
              border: '2px solid rgba(102, 126, 234, 0.2)', 
              borderRadius: '20px', 
              padding: '2rem',
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
              boxShadow: '0 8px 32px rgba(102, 126, 234, 0.1)',
              minHeight: '500px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 'var(--spacing-md)', 
              marginBottom: '2rem',
              paddingBottom: '1.5rem',
              borderBottom: '2px solid rgba(102, 126, 234, 0.15)'
            }}>
              <span style={{ fontSize: '3rem' }}>📚</span>
              <h2 id="work-hub-heading" style={{ 
                margin: 0, 
                fontSize: 'calc(var(--font-size-xl) * var(--text-size-multiplier) * 1.2)',
                fontWeight: 700,
                color: 'var(--primary-color)'
              }}>My Work</h2>
            </div>

            {/* Assignments Section */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 id="assignments-heading" style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>📋 Assignments</h3>
          {loadingAssignments ? (
            <div className="reports-empty">
              <p>Loading assignments...</p>
            </div>
          ) : assignments.length === 0 ? (
            <div className="reports-empty">
              <p>You don't have any assignments yet.</p>
              <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                Your teachers will assign MCQ practice sets here.
              </p>
            </div>
          ) : (
            <div className="reports-grid">
              {assignments.map((assignment) => {
                const dueDate = assignment.dueDate 
                  ? new Date((assignment.dueDate as Timestamp).seconds * 1000)
                  : null;
                const isOverdue = dueDate && dueDate < new Date();
                const isDueSoon = dueDate && dueDate.getTime() - Date.now() < 24 * 60 * 60 * 1000 && !isOverdue;

                return (
                  <motion.div
                    key={assignment.assignmentId}
                    className="report-card"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                  >
                    <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>📋</div>
                    <h4>Assignment</h4>
                    {dueDate && (
                      <p style={{ 
                        color: isOverdue ? 'var(--error-color)' : isDueSoon ? '#ff9800' : 'var(--text-secondary)', 
                        marginBottom: 'var(--spacing-sm)',
                        fontWeight: isOverdue || isDueSoon ? 600 : 400
                      }}>
                        Due: {dueDate.toLocaleDateString()} {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {isOverdue && ' (Overdue)'}
                        {isDueSoon && ' (Due Soon)'}
                      </p>
                    )}
                    {assignment.settings.timeLimit && (
                      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-sm)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)' }}>
                        Time Limit: {assignment.settings.timeLimit} minutes
                      </p>
                    )}
                    {assignment.settings.attemptLimit && (
                      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-sm)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)' }}>
                        Attempts: {assignment.settings.attemptLimit} max
                      </p>
                    )}
                    {(assignment.settings.shuffleQuestions || assignment.settings.shuffleOptions) && (
                      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)' }}>
                        {assignment.settings.shuffleQuestions && '🔄 Shuffled Questions '}
                        {assignment.settings.shuffleOptions && '🔄 Shuffled Options'}
                      </p>
                    )}
                    <motion.button
                      className="logout-button"
                      style={{ 
                        marginTop: 'var(--spacing-md)', 
                        width: '100%',
                        background: isOverdue 
                          ? 'linear-gradient(135deg, var(--error-color) 0%, #d32f2f 100%)'
                          : 'linear-gradient(135deg, var(--primary-color) 0%, #4169E1 100%)'
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isOverdue ? '⚠️ Start Assignment (Overdue)' : '▶️ Start Assignment'}
                    </motion.button>
                  </motion.div>
                );
              })}
            </div>
          )}
            </div>

            {/* Practice Section */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>🎯 Practice</h3>
              <motion.button
                onClick={() => {
                  if (assignments.length === 0) {
                    alert('You don\'t have any assignments yet. Your teachers will assign MCQ practice sets to you.');
                    return;
                  }
                  setShowAssignmentModal(true);
                }}
                className="logout-button"
                aria-label="Start practice"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
                    style={{ 
                      width: '100%',
                      padding: '1rem 1.5rem',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                      fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))'
                    }}
              >
                Start Practice
              </motion.button>
            </div>

            {/* Learning Reports Section */}
            <div style={{ flex: 1 }}>
              <h3 id="reports-heading" style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>📊 Learning Reports</h3>
              
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
                    aria-label="Our Tutorial"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                    style={{ marginTop: '1rem' }}
                  >
                    Our Tutorial
                  </motion.button>
                </div>
              ) : (
                <div className="reports-grid">
                  {reports.map((report, index) => (
                    <motion.div
                      key={report.id}
                      className="report-card"
                      variants={cardVariants}
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
            </div>
        </motion.section>

          {/* My People Hub */}
        <motion.section
            className="reports-history"
            aria-labelledby="people-hub-heading"
          variants={itemVariants}
            style={{ 
              border: '2px solid rgba(34, 197, 94, 0.2)', 
              borderRadius: '20px', 
              padding: '2rem',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
              boxShadow: '0 8px 32px rgba(34, 197, 94, 0.1)',
              minHeight: '500px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 'var(--spacing-md)', 
              marginBottom: '2rem',
              paddingBottom: '1.5rem',
              borderBottom: '2px solid rgba(34, 197, 94, 0.15)'
            }}>
              <span style={{ fontSize: '3rem' }}>👥</span>
              <h2 id="people-hub-heading" style={{ 
                margin: 0, 
                fontSize: 'calc(var(--font-size-xl) * var(--text-size-multiplier) * 1.2)',
                fontWeight: 700,
                color: 'var(--success-color)'
              }}>My People</h2>
            </div>

            {/* Find Your Teachers Section */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 id="find-teachers-heading" style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>👩‍🏫 Teachers</h3>
              <form onSubmit={handleTeacherSearch} style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
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
                <div className="feature-grid" style={{ marginTop: '1.25rem', gap: '1rem' }}>
              {teachers.map((teacher) => {
                const isPending = pendingRequests.some(req => req.requestedId === teacher.uid);
                const isConnected = myTeachers.some(conn => conn.teacherId === teacher.uid);
                
                return (
                  <motion.div 
                    key={teacher.uid} 
                    className="feature-card" 
                    variants={cardVariants} 
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
                <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>No teachers found</p>
              )}
            </div>

            {/* Connected Teachers Section */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 id="connected-teachers-heading" style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>👩‍🏫 My Teachers</h3>
              {myTeachers.length === 0 ? (
                <div className="reports-empty">
                  <p>You did not connect with any of your teachers yet.</p>
                  <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                    Search for teachers above and send them connection requests, or wait for your teachers to request you.
                  </p>
                </div>
              ) : (
                <div>
                  <h4 style={{ 
                    fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))', 
                    marginBottom: 'var(--spacing-sm)', 
                    color: 'var(--text-secondary)',
                    fontWeight: 500
                  }}>My Teachers ({myTeachers.length})</h4>
                  <div className="reports-grid">
                    {myTeachers.map((connection) => (
                      <motion.div
                        key={connection.id}
                        className="report-card"
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                      >
                        <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👩‍🏫</div>
                        <h4>{connection.teacherEmail}</h4>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
                          Connected since {connection.createdAt ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Your Parents Section */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 id="your-parents-heading" style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>👨‍👩‍👧‍👦 My Parents/Guardians</h3>
              {myParents.length === 0 ? (
                <div className="reports-empty">
                  <p>You did not connect with any of your parents/guardians yet.</p>
                  <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)' }}>
                    Parents/Guardians can send you connection requests, which will appear in your Requests section below.
                  </p>
                </div>
              ) : (
                <div>
                  <h4 style={{ 
                    fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))', 
                    marginBottom: 'var(--spacing-sm)', 
                    color: 'var(--text-secondary)',
                    fontWeight: 500
                  }}>Connected Parents/Guardians ({myParents.length})</h4>
                  <div className="reports-grid">
                    {myParents.map((connection) => (
                      <motion.div
                        key={connection.id}
                        className="report-card"
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
                      >
                        <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👨‍👩‍👧‍👦</div>
                        <h4>{connection.parentEmail}</h4>
                        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
                          Connected since {connection.createdAt ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Connection Requests Section */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 id="requests-heading" style={{ 
                  margin: 0, 
                  fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)',
                  fontWeight: 600,
                  color: 'var(--text-color)'
                }}>📬 Requests</h3>
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
                      variants={cardVariants}
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
                      variants={cardVariants}
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
                      variants={cardVariants}
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
                      variants={cardVariants}
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
            </div>
        </motion.section>

          {/* My Tools Hub */}
        <motion.section
          className="reports-history"
            aria-labelledby="tools-hub-heading"
          variants={itemVariants}
            style={{ 
              border: '2px solid rgba(255, 193, 7, 0.2)', 
              borderRadius: '20px', 
              padding: '2rem',
              background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.08) 0%, rgba(255, 152, 0, 0.08) 100%)',
              boxShadow: '0 8px 32px rgba(255, 193, 7, 0.1)',
              minHeight: '500px',
              display: 'flex',
              flexDirection: 'column',
              gridColumn: '1 / -1',
              maxWidth: '600px',
              justifySelf: 'center'
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 'var(--spacing-md)', 
              marginBottom: '2rem',
              paddingBottom: '1.5rem',
              borderBottom: '2px solid rgba(255, 193, 7, 0.15)'
            }}>
              <span style={{ fontSize: '3rem' }}>⚙️</span>
              <h2 id="tools-hub-heading" style={{ 
                margin: 0, 
                fontSize: 'calc(var(--font-size-xl) * var(--text-size-multiplier) * 1.2)',
                fontWeight: 700,
                color: '#ff9800'
              }}>My Tools</h2>
            </div>

            {/* Accessibility Settings */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 id="accessibility-heading" style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>♿ Accessibility</h3>
          
          <div className="control-group">
            <label htmlFor="text-size">
              <motion.input
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
                whileFocus={{ scale: 1.05 }}
              />
              <span>Text Size: {Math.round(textSize * 100)}%</span>
            </label>
            <motion.span
              className="range-label"
              aria-live="polite"
              key={textSize}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Current size: {Math.round(textSize * 100)}% ({textSize < 1 ? 'Smaller' : textSize > 1 ? 'Larger' : 'Default'})
            </motion.span>
          </div>

          <div className="control-group">
            <label htmlFor="high-contrast">
              <motion.input
                type="checkbox"
                id="high-contrast"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                aria-label="Enable high contrast mode"
                whileTap={{ scale: 0.95 }}
              />
              <span>High Contrast Mode</span>
            </label>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Increases contrast for better visibility
            </p>
          </div>
            </div>

            {/* Messages Section */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>💬 Messages</h3>
              <motion.button
                onClick={() => { setNavigating(true); navigate('/messages'); }}
                className="logout-button"
                aria-label="Open messages"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
                style={{ 
                  width: '100%',
                  padding: '1rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                  position: 'relative',
                  fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))'
                }}
              >
                {unreadMessageCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    background: 'var(--error-color)',
                    color: 'white',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </span>
                )}
                Open Messages {unreadMessageCount > 0 && `(${unreadMessageCount} unread)`}
              </motion.button>
            </div>

            {/* Settings Section */}
            <div style={{ flex: 1 }}>
              <h3 style={{ 
                fontSize: 'calc(var(--font-size-lg) * var(--text-size-multiplier) * 1.1)', 
                marginBottom: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-color)'
              }}>⚙️ Settings</h3>
              <motion.button
                onClick={() => setShowAccessibilityModal(true)}
                className="logout-button"
                aria-label="Open accessibility settings"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400 }}
                style={{ 
                  width: '100%',
                  padding: '1rem 1.5rem',
                  background: 'linear-gradient(135deg, var(--disability-green) 0%, #00A86B 100%)',
                  boxShadow: '0 8px 24px rgba(0, 132, 61, 0.4)',
                  fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier))'
                }}
              >
                Advanced Settings
              </motion.button>
            </div>
          </motion.section>
                  </div>

        {/* Assignment Selection Modal */}
        {showAssignmentModal && (
          <div 
            className="modal-overlay" 
            onClick={() => setShowAssignmentModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignment-modal-heading"
          >
            <div className="accessibility-settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
              <div className="modal-header">
                <h2 id="assignment-modal-heading">
                  <span className="accessibility-icon">📋</span>
                  Select an Assignment
                </h2>
                <button
                  onClick={() => setShowAssignmentModal(false)}
                  className="close-modal-button"
                  aria-label="Close assignment selection"
                >
                  ✕
                </button>
              </div>
              
              <div className="accessibility-controls-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {loadingMcqSets ? (
                  <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
                    <p>Loading assignments...</p>
                  </div>
                ) : assignments.length === 0 ? (
                  <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
                    <p>You don't have any assignments yet.</p>
                    <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>
                      Your teachers will assign MCQ practice sets to you.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {assignments.map((assignment) => {
                      const dueDate = assignment.dueDate 
                        ? new Date((assignment.dueDate as Timestamp).seconds * 1000)
                        : null;
                      const isOverdue = dueDate && dueDate < new Date();
                      const isDueSoon = dueDate && dueDate.getTime() - Date.now() < 24 * 60 * 60 * 1000 && !isOverdue;
                      const mcqSetTitle = assignmentMcqSets[assignment.mcqSetId]?.title || 'Loading...';

                      return (
                        <motion.button
                          key={assignment.assignmentId}
                          onClick={() => {
                            setNavigating(true);
                            navigate(`/practice?assignmentId=${assignment.assignmentId}`);
                          }}
                          className="report-card"
                          style={{
                            textAlign: 'left',
                            padding: 'var(--spacing-lg)',
                            cursor: 'pointer',
                            border: isOverdue ? '2px solid var(--error-color)' : isDueSoon ? '2px solid #ff9800' : '2px solid var(--border-color)',
                            background: isOverdue ? 'rgba(255, 59, 48, 0.1)' : isDueSoon ? 'rgba(255, 152, 0, 0.1)' : 'var(--background)',
                          }}
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <h4 style={{ margin: '0 0 var(--spacing-sm) 0', color: 'var(--text-color)' }}>
                            {mcqSetTitle}
                          </h4>
                          {dueDate && (
                            <p style={{ 
                              margin: '0 0 var(--spacing-xs) 0',
                              color: isOverdue ? 'var(--error-color)' : isDueSoon ? '#ff9800' : 'var(--text-secondary)', 
                              fontWeight: isOverdue || isDueSoon ? 600 : 400,
                              fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.9)'
                            }}>
                              Due: {dueDate.toLocaleDateString()} {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {isOverdue && ' (Overdue)'}
                              {isDueSoon && ' (Due Soon)'}
                            </p>
                          )}
                          {assignment.settings.timeLimit && (
                            <p style={{ margin: '0 0 var(--spacing-xs) 0', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)' }}>
                              ⏱️ Time Limit: {assignment.settings.timeLimit} minutes
                            </p>
                          )}
                          {assignment.settings.attemptLimit && (
                            <p style={{ margin: '0 0 var(--spacing-xs) 0', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)' }}>
                              🔢 Attempts: {assignment.settings.attemptLimit} max
                            </p>
                          )}
                          {(assignment.settings.shuffleQuestions || assignment.settings.shuffleOptions) && (
                            <p style={{ margin: '0', color: 'var(--text-secondary)', fontSize: 'calc(var(--font-size-base) * var(--text-size-multiplier) * 0.875)' }}>
                              {assignment.settings.shuffleQuestions && '🔄 Shuffled Questions '}
                              {assignment.settings.shuffleOptions && '🔄 Shuffled Options'}
                            </p>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
                <button
                  onClick={() => setShowAccessibilityModal(false)}
                  className="close-modal-button"
                  aria-label="Close accessibility settings"
                >
                  ✕
                </button>
              </div>
              
              <div className="accessibility-controls-content">
                <div className="accessibility-section">
                  <h4 className="section-title">Text & Display</h4>
                  <div className="control-group">
                    <label htmlFor="modal-text-size">
                      <span>Text Size: {Math.round(textSize * 100)}%</span>
                      <input
                        type="range"
                        id="modal-text-size"
                        min="0.875"
                        max="1.5"
                        step="0.125"
                        value={textSize}
                        onChange={(e) => setTextSize(parseFloat(e.target.value))}
                        aria-label="Text size adjustment"
                      />
                    </label>
                  </div>

                  <div className="control-group">
                    <label htmlFor="modal-high-contrast">
                      <input
                        type="checkbox"
                        id="modal-high-contrast"
                        checked={highContrast}
                        onChange={(e) => setHighContrast(e.target.checked)}
                        aria-label="Enable high contrast mode"
                      />
                      <span>High Contrast Mode</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </motion.div>
  );
}
