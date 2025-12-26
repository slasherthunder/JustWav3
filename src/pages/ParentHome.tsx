import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import { collection, query as fsQuery, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FirebaseError } from 'firebase/app';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export function ParentHome() {
  const { currentUser, logout } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const [textSize, setTextSize] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<Array<{ uid: string; email: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{ uid: string; email: string } | null>(null);
  const [accessInfo, setAccessInfo] = useState<{ ownerUid?: string; accessKeyHash?: string } | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [accessGranted, setAccessGranted] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-size-multiplier', textSize.toString());
    
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [textSize, highContrast]);

  async function handleLogout() {
    try {
      setNavigating(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

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
      setStudents(matches);
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

  async function hashAccessCode(pw: string) {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function loadAccessInfo(studentUid: string) {
    try {
      setAccessLoading(true);
      setAccessError(null);
      const snap = await getDoc(doc(db, 'users', studentUid));
      const data = snap.exists() ? (snap.data() as { parentAccess?: { ownerUid?: string; passwordHash?: string; accessKeyHash?: string } }) : {};
      const pa = data.parentAccess;
      setAccessInfo(pa ? { ownerUid: pa.ownerUid, accessKeyHash: pa.accessKeyHash || pa.passwordHash } : null);
    } catch {
      setAccessError('Failed to load access info');
      setAccessInfo(null);
    } finally {
      setAccessLoading(false);
    }
  }

  async function onSelectStudent(s: { uid: string; email: string }) {
    setSelectedStudent(s);
    setAccessGranted(false);
    setAccessCodeInput('');
    await loadAccessInfo(s.uid);
  }

  async function handleSetPassword() {
    if (!selectedStudent || !currentUser) return;
    const pw = accessCodeInput.trim();
    if (!pw) {
      setAccessError('Enter an access code');
      return;
    }
    try {
      setAccessLoading(true);
      setAccessError(null);
      const hash = await hashAccessCode(pw);
      await setDoc(doc(db, 'users', selectedStudent.uid), { parentAccess: { ownerUid: currentUser.uid, accessKeyHash: hash, createdAt: new Date().toISOString() } }, { merge: true });
      setAccessInfo({ ownerUid: currentUser.uid, accessKeyHash: hash });
      setAccessGranted(true);
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        setAccessError('Not allowed to set access code. Update Firestore rules.');
      } else {
        setAccessError('Failed to set access code');
      }
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleVerifyPassword() {
    if (!selectedStudent || !currentUser) return;
    const pw = accessCodeInput.trim();
    if (!pw) {
      setAccessError('Enter the access code');
      return;
    }
    if (!accessInfo || !accessInfo.ownerUid || !accessInfo.accessKeyHash) {
      setAccessError('No access code set');
      return;
    }
    if (accessInfo.ownerUid !== currentUser.uid) {
      setAccessError('Only the owner can access this student');
      return;
    }
    try {
      setAccessLoading(true);
      setAccessError(null);
      const hash = await hashAccessCode(pw);
      if (hash === accessInfo.accessKeyHash) {
        setAccessGranted(true);
      } else {
        setAccessError('Incorrect access code');
        setAccessGranted(false);
      }
    } catch {
      setAccessError('Verification failed');
    } finally {
      setAccessLoading(false);
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
          JustWav3 👨‍👩‍👧‍👦
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
            Welcome, Parent! 👨‍👩‍👧‍👦
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
            Manage your child's learning journey and track their progress here.
          </motion.p>
        </motion.div>

        <motion.section
          className="accessibility-controls"
          aria-labelledby="find-students-heading"
          variants={itemVariants}
        >
          <h3 id="find-students-heading">Find Students</h3>
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
              {students.map((s) => (
                <motion.div key={s.uid} className="feature-card" variants={cardVariants} initial="hidden" animate="visible" onClick={() => onSelectStudent(s)} style={{ cursor: 'pointer' }}>
                  <div className="feature-icon-large">🎓</div>
                  <h4>{s.email}</h4>
                </motion.div>
              ))}
            </div>
          )}
          {students.length === 0 && searchQuery.trim() && !searchLoading && !searchError && (
            <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>No students found</p>
          )}

          {selectedStudent && (
            <div style={{ marginTop: 'var(--spacing-lg)' }}>
              <h4>Selected: {selectedStudent.email}</h4>
              {!accessInfo && (
                <div className="control-group">
                  <label htmlFor="set-student-access">
                    <input
                      id="set-student-access"
                      type="password"
                      value={accessCodeInput}
                      onChange={(e) => setAccessCodeInput(e.target.value)}
                      placeholder="Set access code"
                      aria-label="Set access code"
                      style={{ maxWidth: '320px' }}
                    />
                    <span style={{ marginLeft: '0.5rem' }}>Set Access Code</span>
                  </label>
                  <motion.button
                    type="button"
                    className="logout-button"
                    onClick={handleSetPassword}
                    aria-busy={accessLoading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{ marginTop: '0.5rem' }}
                  >
                    Save Access Code
                  </motion.button>
                </div>
              )}
              {accessInfo && !accessGranted && (
                <div className="control-group">
                  <label htmlFor="verify-student-access">
                    <input
                      id="verify-student-access"
                      type="password"
                      value={accessCodeInput}
                      onChange={(e) => setAccessCodeInput(e.target.value)}
                      placeholder="Enter access code"
                      aria-label="Enter access code"
                      style={{ maxWidth: '320px' }}
                    />
                    <span style={{ marginLeft: '0.5rem' }}>Enter Access Code</span>
                  </label>
                  <motion.button
                    type="button"
                    className="logout-button"
                    onClick={handleVerifyPassword}
                    aria-busy={accessLoading}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{ marginTop: '0.5rem' }}
                  >
                    Unlock Student Homepage
                  </motion.button>
                </div>
              )}
              {accessError && (
                <p className="error-text" style={{ marginTop: 'var(--spacing-sm)' }}>{accessError}</p>
              )}
              {accessGranted && (
                <div className="welcome-card" style={{ marginTop: 'var(--spacing-md)' }}>
                  <h2>Student Homepage</h2>
                  <p>You are viewing:</p>
                  <p className="user-email">{selectedStudent.email}</p>
                  <p className="welcome-message">Protected access granted.</p>
                </div>
              )}
            </div>
          )}
        </motion.section>

        <motion.section
          className="accessibility-controls"
          aria-labelledby="parent-features-heading"
          variants={itemVariants}
        >
          <h3 id="parent-features-heading">Parent Features</h3>
          <div className="feature-grid">
            {[
              {
                icon: '📊',
                title: 'Track Progress',
                description: 'Monitor your child\'s learning progress and achievements'
              },
              {
                icon: '📝',
                title: 'View Reports',
                description: 'Access detailed reports about your child\'s activities and growth'
              },
              {
                icon: '⚙️',
                title: 'Manage Settings',
                description: 'Customize learning preferences and accessibility settings'
              },
              {
                icon: '💬',
                title: 'Communicate',
                description: 'Connect with teachers and stay updated on your child\'s education'
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

