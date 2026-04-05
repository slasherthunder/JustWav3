import { useState, useEffect, useRef } from 'react';
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
import './StudentHome.css';
import teacherProfileImage from '../assets/images/teacherprofile.png';
import parentProfileImage from '../assets/images/parentprofile.png';
import studentProfileImage from '../assets/images/studentprofile.png';

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

function getAssignmentDueState(assignment: Assignment) {
  const dueDate = assignment.dueDate
    ? new Date((assignment.dueDate as Timestamp).seconds * 1000)
    : null;
  if (!dueDate) {
    return { dueDate: null as Date | null, kind: 'none' as const };
  }
  const now = new Date();
  const isOverdue = dueDate < now;
  const msLeft = dueDate.getTime() - Date.now();
  const isDueSoon = !isOverdue && msLeft < 24 * 60 * 60 * 1000 && msLeft >= 0;
  if (isOverdue) return { dueDate, kind: 'overdue' as const };
  if (isDueSoon) return { dueDate, kind: 'soon' as const };
  return { dueDate, kind: 'ok' as const };
}

export function StudentHome() {
  const { currentUser, logout } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const [textSize, setTextSize] = useState(1.125);
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

  const trophyStoriesRef = useRef<HTMLDetailsElement>(null);

  const openTrophyStories = () => {
    const el = trophyStoriesRef.current;
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
      className={`student-adventure ${highContrast ? 'student-adventure--contrast' : ''}`}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <nav className="student-adventure-nav" aria-label="My learning space">
        <div className="student-adventure-nav__brand">
          <div className="student-adventure-nav__mark" aria-hidden="true">
            🌟
          </div>
          <h2 className="student-adventure-nav__title">My Learning Space</h2>
        </div>
        <div className="student-adventure-nav__actions">
          <motion.button
            type="button"
            className="student-adventure__bubble"
            onClick={() => {
              setNavigating(true);
              navigate('/messages');
            }}
            aria-label={`Messages${unreadMessageCount > 0 ? `, ${unreadMessageCount} unread` : ''}`}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <span aria-hidden="true">💬</span>
            <span>Messages</span>
            {unreadMessageCount > 0 && (
              <span className="student-adventure__badge">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
            )}
            {unreadMessageCount === 0 && pendingRequestCount > 0 && (
              <span className="student-adventure__badge" title="Pending invites">
                !
              </span>
            )}
          </motion.button>
          <motion.button
            type="button"
            className="student-adventure__bubble"
            onClick={() => setShowAccessibilityModal(true)}
            aria-label="Settings"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <span aria-hidden="true">⚙️</span>
            <span>Settings</span>
          </motion.button>
          <motion.button
            type="button"
            className="student-adventure__bubble student-adventure__bubble--ghost"
            onClick={handleLogout}
            aria-label="Log out"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Log out
          </motion.button>
        </div>
      </nav>
      <main id="main-content" className="student-adventure-main" role="main">
        <EmailVerificationBanner />
        <header className="student-adventure-hero">
          <h1 className="student-adventure-hero__h1">
            Hello,{' '}
            <span className="student-adventure-hero__name">
              {currentUser?.email?.split('@')[0] || 'friend'}
            </span>
            !
          </h1>
          <p className="student-adventure-hero__sub">What are we doing today?</p>
        </header>

        {/* Task-based adventure — bento zones */}
        <div className="student-adventure-bento">
          <section
            className="student-adventure-zone student-adventure-zone--work"
            aria-labelledby="zone-work-heading"
          >
            <div className="student-adventure-zone__head">
              <span className="student-adventure-zone__icon" aria-hidden="true">
                📝
              </span>
              <h2 id="zone-work-heading" className="student-adventure-zone__h2">
                My School Work
              </h2>
            </div>
            <p className="student-adventure-zone__text" style={{ marginTop: 0 }}>
              Your tasks from school. Tap one to start.
            </p>
            <div className="student-adventure-task-list">
              {loadingAssignments ? (
                <p className="student-adventure-empty">Loading your tasks…</p>
              ) : assignments.length === 0 ? (
                <p className="student-adventure-empty">All caught up! No tasks right now. 🎉</p>
              ) : (
                assignments.slice(0, 5).map((assignment) => {
                  const { dueDate, kind } = getAssignmentDueState(assignment);
                  const title =
                    assignmentMcqSets[assignment.mcqSetId]?.title || 'School task';
                  const dueLine =
                    kind === 'overdue'
                      ? { icon: '⚠️', text: 'Past due — ask for help if you need it', cls: 'student-adventure-task-row__meta--late' }
                      : kind === 'soon'
                        ? { icon: '⏰', text: 'Due soon', cls: 'student-adventure-task-row__meta--soon' }
                        : kind === 'ok' && dueDate
                          ? { icon: '📅', text: `Due ${dueDate.toLocaleDateString()}`, cls: 'student-adventure-task-row__meta--ok' }
                          : { icon: '📌', text: 'No due date', cls: 'student-adventure-task-row__meta--ok' };

                  return (
                    <button
                      type="button"
                      key={assignment.assignmentId}
                      className="student-adventure-task-row"
                      onClick={() => {
                        setNavigating(true);
                        navigate(`/practice?assignmentId=${assignment.assignmentId}`);
                      }}
                    >
                      <div>
                        <div className="student-adventure-task-row__title">{title}</div>
                        <div className={`student-adventure-task-row__meta ${dueLine.cls}`}>
                          <span aria-hidden="true">{dueLine.icon}</span>
                          <span>{dueLine.text}</span>
                        </div>
                      </div>
                      <span className="student-adventure-task-row__play" aria-hidden="true">
                        ▶️
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {assignments.length > 5 && (
              <button
                type="button"
                className="student-adventure-btn-secondary"
                onClick={() => setShowAssignmentModal(true)}
              >
                See all my tasks ({assignments.length})
              </button>
            )}
          </section>

          <section
            className="student-adventure-zone student-adventure-zone--play"
            aria-labelledby="zone-play-heading"
          >
            <div className="student-adventure-zone__head">
              <span className="student-adventure-zone__icon" aria-hidden="true">
                🚀
              </span>
              <h2 id="zone-play-heading" className="student-adventure-zone__h2">
                Play &amp; Learn
              </h2>
            </div>
            <p className="student-adventure-zone__text">
              Practice skills, try the tutorial, or play on your own — your choice.
            </p>
            <motion.button
              type="button"
              className="student-adventure-btn-primary"
              onClick={() => {
                if (assignments.length === 0) {
                  setNavigating(true);
                  navigate('/practice');
                  return;
                }
                setShowAssignmentModal(true);
              }}
              aria-label="Start play and learn practice"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              START PLAY &amp; LEARN
            </motion.button>
            <motion.button
              type="button"
              className="student-adventure-btn-secondary"
              style={{ width: '100%', minHeight: 48 }}
              onClick={() => {
                setNavigating(true);
                navigate('/learn');
              }}
              aria-label="Open tutorial"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Our Tutorial
            </motion.button>
          </section>

          <section
            className="student-adventure-zone student-adventure-zone--helpers"
            aria-labelledby="zone-helpers-heading"
          >
            <div className="student-adventure-zone__head">
              <span className="student-adventure-zone__icon" aria-hidden="true">
                👥
              </span>
              <h2 id="zone-helpers-heading" className="student-adventure-zone__h2">
                My Helpers
              </h2>
            </div>
            <p className="student-adventure-zone__text">
              Teachers and family connected to your account.
            </p>
            <div className="student-adventure-helpers-row" aria-label="Connected helpers">
              {myTeachers.map((t) => (
                <span
                  key={t.id}
                  className="student-adventure-helper-pill"
                  title={t.teacherEmail}
                  role="img"
                  aria-label={`Teacher ${t.teacherEmail}`}
                >
                  👩‍🏫
                </span>
              ))}
              {myParents.map((p) => (
                <span
                  key={p.id}
                  className="student-adventure-helper-pill"
                  title={p.parentEmail}
                  role="img"
                  aria-label={`Parent ${p.parentEmail}`}
                >
                  🏠
                </span>
              ))}
              {myTeachers.length === 0 && myParents.length === 0 && (
                <span className="student-adventure-empty" style={{ padding: 0 }}>
                  No helpers yet — ask a grown-up to connect below.
                </span>
              )}
            </div>
            <motion.button
              type="button"
              className="student-adventure-btn-helpers"
              onClick={() => {
                setNavigating(true);
                navigate('/messages');
              }}
              aria-label="Ask a question in messages"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Ask a question
            </motion.button>
          </section>

          <section
            className="student-adventure-zone student-adventure-zone--trophy"
            aria-labelledby="zone-trophy-heading"
          >
            <div className="student-adventure-zone__head">
              <span className="student-adventure-zone__icon" aria-hidden="true">
                🏆
              </span>
              <h2 id="zone-trophy-heading" className="student-adventure-zone__h2">
                My Progress
              </h2>
            </div>
            <div className="student-adventure-trophy-stat">
              <div className="student-adventure-trophy-stat__n" aria-live="polite">
                {loadingReports ? '…' : reports.length}
              </div>
              <div className="student-adventure-trophy-stat__label">Lessons completed</div>
            </div>
            <button
              type="button"
              className="student-adventure-btn-secondary"
              onClick={openTrophyStories}
              disabled={loadingReports}
            >
              See my badges
            </button>
          </section>
        </div>

        <details
          ref={trophyStoriesRef}
          id="student-trophy-stories"
          className="student-adventure-details"
          style={{ marginBottom: '2rem' }}
        >
          <summary>See my lesson stories (optional)</summary>
          {loadingReports ? (
            <p style={{ padding: '1rem 0' }}>Loading…</p>
          ) : reports.length === 0 ? (
            <p style={{ padding: '1rem 0', color: 'var(--sa-muted, #718096)' }}>
              No stories yet — finish a lesson to earn your first badge.
            </p>
          ) : (
            <div className="reports-grid" style={{ marginTop: '1rem' }}>
              {reports.map((report, index) => (
                <motion.div
                  key={report.id}
                  className="report-card"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                >
                  <div className="report-header">
                    <h4>Lesson story</h4>
                    <span className="report-date">
                      {new Date(report.sessionDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
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
                  </div>
                  <div className="report-profile">
                    <div className="profile-item">
                      <strong>Strengths:</strong> {report.profile.strengths}
                    </div>
                    <div className="profile-item">
                      <strong>Tip:</strong> {report.profile.recommended}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </details>

        <section className="student-adventure-panel" aria-labelledby="find-teacher-heading">
          <h2 id="find-teacher-heading" className="student-adventure-panel__h2">
            Find your teacher
          </h2>
          <p style={{ marginTop: 0, fontWeight: 600, color: '#4a5568' }}>
            Search by email.
          </p>
          <form
            onSubmit={handleTeacherSearch}
            style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
              alignItems: 'stretch',
              flexWrap: 'wrap',
              marginBottom: '1rem',
            }}
          >
            <input
              type="text"
              value={teacherSearchQuery}
              onChange={(e) => setTeacherSearchQuery(e.target.value)}
              placeholder="Teacher email"
              aria-label="Search by teacher email"
              style={{ flex: 1, minWidth: '240px' }}
            />
            <motion.button
              type="submit"
              className="student-adventure-btn-primary"
              style={{ marginTop: 0 }}
              aria-busy={teacherSearchLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {teacherSearchLoading ? 'Searching…' : 'Search'}
            </motion.button>
          </form>
          {teacherSearchError && <p className="error-text">{teacherSearchError}</p>}
          {teachers.length > 0 && (
            <div className="feature-grid" style={{ marginTop: '1rem', gap: '1rem' }}>
              {teachers.map((teacher) => {
                const isPending = pendingRequests.some((req) => req.requestedId === teacher.uid);
                const isConnected = myTeachers.some((conn) => conn.teacherId === teacher.uid);
                return (
                  <motion.div
                    key={teacher.uid}
                    className="feature-card"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ y: -4, scale: 1.01, boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}
                  >
                    <div className="feature-icon-large">
                      <img src={teacherProfileImage} alt="" className="teacher-role-icon-img" />
                    </div>
                    <h4>{teacher.email}</h4>
                    {isConnected ? (
                      <p style={{ color: 'var(--success-color)', fontWeight: 700 }}>Connected</p>
                    ) : isPending ? (
                      <p style={{ color: 'var(--text-secondary)' }}>Waiting for answer…</p>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={() => handleRequestTeacher(teacher.uid, teacher.email)}
                        className="student-adventure-btn-helpers"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Send invite
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          {teachers.length === 0 && teacherSearchQuery.trim() && !teacherSearchLoading && !teacherSearchError && (
            <p style={{ color: 'var(--text-secondary)' }}>No teachers found</p>
          )}
        </section>

        <div className="student-adventure-connect-grid">
          <section className="student-adventure-panel" aria-labelledby="connected-teachers-heading">
            <h2 id="connected-teachers-heading" className="student-adventure-panel__h2">
              My teachers
            </h2>
            {myTeachers.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                None yet — use Find your teacher above.
              </p>
            ) : (
              <div className="reports-grid">
                {myTeachers.map((connection) => (
                  <motion.div
                    key={connection.id}
                    className="report-card"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                  >
                    <div className="feature-icon-large">
                      <img src={teacherProfileImage} alt="" className="teacher-role-icon-img" />
                    </div>
                    <h4>{connection.teacherEmail}</h4>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
                      Connected{' '}
                      {connection.createdAt
                        ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString()
                        : 'recently'}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          <section className="student-adventure-panel" aria-labelledby="your-parents-heading">
            <h2 id="your-parents-heading" className="student-adventure-panel__h2">
              My parents / guardians
            </h2>
            {myParents.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                None yet — they can send you a request.
              </p>
            ) : (
              <div className="reports-grid">
                {myParents.map((connection) => (
                  <motion.div
                    key={connection.id}
                    className="report-card"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                  >
                    <div className="feature-icon-large">
                      <img src={parentProfileImage} alt="" className="parent-role-icon-img" />
                    </div>
                    <h4>{connection.parentEmail}</h4>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
                      Connected{' '}
                      {connection.createdAt
                        ? new Date(connection.createdAt.seconds * 1000).toLocaleDateString()
                        : 'recently'}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="student-adventure-panel" aria-labelledby="requests-heading">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 id="requests-heading" className="student-adventure-panel__h2" style={{ margin: 0 }}>
              Invites &amp; requests
            </h2>
            <motion.button
              type="button"
              onClick={fetchConnections}
              disabled={refreshingConnections}
              className="student-adventure-btn-secondary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {refreshingConnections ? 'Refreshing…' : 'Refresh list'}
            </motion.button>
          </div>

          {pendingRequests.length === 0 && parentPendingRequests.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No invites waiting.</p>
          ) : (
            <>
              {pendingRequests.filter((req) => req.requestedId === currentUser?.uid).length > 0 && (
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--primary-color)' }}>
                    Teacher invites ({pendingRequests.filter((req) => req.requestedId === currentUser?.uid).length})
                  </h3>
                  <div className="reports-grid">
                    {pendingRequests
                      .filter((req) => req.requestedId === currentUser?.uid)
                      .map((request) => (
                        <motion.div
                          key={request.id}
                          className="report-card"
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                        >
                          <div className="feature-icon-large">
                            {request.requestorRole === 'teacher' ? (
                              <img src={teacherProfileImage} alt="" className="teacher-role-icon-img" />
                            ) : (
                              <img src={studentProfileImage} alt="" className="student-role-icon-img" />
                            )}
                          </div>
                          <h4>{request.requestorEmail}</h4>
                          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                            Wants to connect
                          </p>
                          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                            <motion.button
                              type="button"
                              onClick={() =>
                                handleAcceptRequest(
                                  request.id,
                                  request.requestorId,
                                  request.requestorEmail,
                                  request.requestorRole
                                )
                              }
                              className="student-adventure-btn-primary"
                              style={{ flex: 1, minWidth: 120 }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              Accept
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => handleRejectRequest(request.id)}
                              className="student-adventure-btn-secondary"
                              style={{ flex: 1, minWidth: 120 }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              No thanks
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                </div>
              )}

              {pendingRequests.filter((req) => req.requestorId === currentUser?.uid).length > 0 && (
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
                    Waiting on teachers ({pendingRequests.filter((req) => req.requestorId === currentUser?.uid).length})
                  </h3>
                  <div className="reports-grid">
                    {pendingRequests
                      .filter((req) => req.requestorId === currentUser?.uid)
                      .map((request) => (
                        <motion.div
                          key={request.id}
                          className="report-card"
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                        >
                          <div className="feature-icon-large">
                            <img src={teacherProfileImage} alt="" className="teacher-role-icon-img" />
                          </div>
                          <h4>{request.requestedEmail}</h4>
                          <p style={{ color: 'var(--text-secondary)' }}>Waiting for their answer…</p>
                        </motion.div>
                      ))}
                  </div>
                </div>
              )}

              {parentPendingRequests.filter((req) => req.requestedId === currentUser?.uid).length > 0 && (
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--primary-color)' }}>
                    Parent invites ({parentPendingRequests.filter((req) => req.requestedId === currentUser?.uid).length})
                  </h3>
                  <div className="reports-grid">
                    {parentPendingRequests
                      .filter((req) => req.requestedId === currentUser?.uid)
                      .map((request) => (
                        <motion.div
                          key={request.id}
                          className="report-card"
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                        >
                          <div className="feature-icon-large">
                            <img src={parentProfileImage} alt="" className="parent-role-icon-img" />
                          </div>
                          <h4>{request.requestorEmail}</h4>
                          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                            Parent wants to connect
                          </p>
                          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                            <motion.button
                              type="button"
                              onClick={() =>
                                handleAcceptParentRequest(
                                  request.id,
                                  request.requestorId,
                                  request.requestorEmail,
                                  request.requestorRole
                                )
                              }
                              className="student-adventure-btn-primary"
                              style={{ flex: 1, minWidth: 120 }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              Accept
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => handleRejectParentRequest(request.id)}
                              className="student-adventure-btn-secondary"
                              style={{ flex: 1, minWidth: 120 }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              No thanks
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                </div>
              )}

              {parentPendingRequests.filter((req) => req.requestorId === currentUser?.uid).length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
                    Waiting on parents ({parentPendingRequests.filter((req) => req.requestorId === currentUser?.uid).length})
                  </h3>
                  <div className="reports-grid">
                    {parentPendingRequests
                      .filter((req) => req.requestorId === currentUser?.uid)
                      .map((request) => (
                        <motion.div
                          key={request.id}
                          className="report-card"
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
                        >
                          <div className="feature-icon-large">
                            <img src={parentProfileImage} alt="" className="parent-role-icon-img" />
                          </div>
                          <h4>{request.requestedEmail}</h4>
                          <p style={{ color: 'var(--text-secondary)' }}>Waiting for their answer…</p>
                        </motion.div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

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
