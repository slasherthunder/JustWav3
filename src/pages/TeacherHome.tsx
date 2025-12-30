import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import { collection, query as fsQuery, where, limit, getDocs, orderBy, query, addDoc, updateDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FirebaseError } from 'firebase/app';
import { Timestamp } from 'firebase/firestore';
import { EmailVerificationBanner } from '../components/EmailVerificationBanner';
import './Home.css';

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
  const [textSize, setTextSize] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
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

  useEffect(() => {
    document.documentElement.style.setProperty('--text-size-multiplier', textSize.toString());
    
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [textSize, highContrast]);

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
          JustWav3 👩‍🏫
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
            Welcome, Teacher! 👩‍🏫
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
            Monitor your students' learning progress and access their reports.
          </motion.p>
        </motion.div>

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
                      <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>🎓</div>
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
                      <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>🎓</div>
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

        {/* Your Students Section */}
        <motion.section
          className="reports-history"
          aria-labelledby="your-students-heading"
          variants={itemVariants}
        >
          <h3 id="your-students-heading">Your Students 🎓</h3>
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
                    <div className="feature-icon-large" style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>🎓</div>
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
                            👨‍👩‍👧‍👦 {parent.parentEmail}
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
                      <div className="feature-icon-large">🎓</div>
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
      </main>
    </motion.div>
  );
}

