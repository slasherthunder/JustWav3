import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, Timestamp, query as fsQuery, where, limit, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
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

  useEffect(() => {
    document.documentElement.style.setProperty('--text-size-multiplier', textSize.toString());
    
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [textSize, highContrast]);

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
          JustWav3 🎓
        </motion.h1>
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
          variants={itemVariants}
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
            <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>No teachers found</p>
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
        </motion.section>

        {/* Your Teachers Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="your-teachers-heading"
          variants={itemVariants}
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
                  variants={cardVariants}
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
          variants={itemVariants}
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
                  variants={cardVariants}
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

        <motion.section
          className="accessibility-controls"
          aria-labelledby="accessibility-heading"
          variants={itemVariants}
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <h3 id="accessibility-heading">Accessibility Settings</h3>
          
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
        </motion.section>

        {/* Learning Reports History Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="reports-heading"
          variants={itemVariants}
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300 }}
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
        </motion.section>
      </main>
    </motion.div>
  );
}

