import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { Loading } from '../components/Loading';
import { withRateLimit } from '../utils/rateLimiter';

export type UserRole = 'parent' | 'student' | 'teacher' | null;

interface AuthContextType {
  currentUser: User | null;
  userRole: UserRole;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  async function signup(email: string, password: string, role: UserRole) {
    try {
      await withRateLimit('auth:signup', async () => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Send email verification
        try {
          console.log('Sending verification email to:', user.email);
          await sendEmailVerification(user, {
            url: window.location.origin,
            handleCodeInApp: false,
          });
          console.log('Verification email sent successfully');
        } catch (error: any) {
          console.error('Error sending verification email:', error);
          console.error('Error code:', error?.code);
          console.error('Error message:', error?.message);
          // Don't throw here - account creation succeeded, just email sending failed
          // But we'll log it so user can see in console
        }

        if (user && role) {
          const payload = {
            email: user.email,
            role: role,
            createdAt: new Date().toISOString(),
            emailVerified: false,
          };

          let attempt = 0;
          let lastError: unknown = null;
          while (attempt < 3) {
            try {
              await setDoc(doc(db, 'users', user.uid), payload);
              setUserRole(role);
              break;
            } catch (err) {
              lastError = err;
              attempt += 1;
              await new Promise((r) => setTimeout(r, 250 * attempt));
            }
          }

          if (attempt === 3 && lastError) {
            throw lastError;
          }
        }
      }, email);
    } catch (error: any) {
      // Handle rate limit errors specifically
      if (error.code === 'rate-limit-exceeded') {
        const retryAfter = error.retryAfter || 900; // Default to 15 minutes
        const minutes = Math.ceil(retryAfter / 60);
        throw new Error(`Too many signup attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
      }
      throw error;
    }
  }

  async function sendVerificationEmail() {
    if (!currentUser) {
      throw new Error('No user logged in');
    }
    if (currentUser.emailVerified) {
      throw new Error('Email already verified');
    }
    try {
      await withRateLimit('auth:emailVerification', async () => {
        console.log('Resending verification email to:', currentUser.email);
        await sendEmailVerification(currentUser, {
          url: window.location.origin,
          handleCodeInApp: false,
        });
        console.log('Verification email resent successfully');
      }, currentUser.email || currentUser.uid);
    } catch (error: any) {
      // Handle rate limit errors specifically
      if (error.code === 'rate-limit-exceeded') {
        const retryAfter = error.retryAfter || 3600; // Default to 1 hour
        const minutes = Math.ceil(retryAfter / 60);
        throw new Error(`Too many verification email requests. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
      }
      throw error;
    }
  }

  async function login(email: string, password: string) {
    try {
      await withRateLimit('auth:login', async () => {
        await signInWithEmailAndPassword(auth, email, password);
      }, email);
    } catch (error: any) {
      // Handle rate limit errors specifically
      if (error.code === 'rate-limit-exceeded') {
        const retryAfter = error.retryAfter || 900; // Default to 15 minutes
        const minutes = Math.ceil(retryAfter / 60);
        throw new Error(`Too many login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`);
      }
      throw error;
    }
  }

  function logout() {
    setUserRole(null);
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Reload user to get latest email verification status (e.g., if verified in another tab)
        // Only reload if email is not verified to avoid unnecessary API calls
        if (!user.emailVerified) {
          try {
            await reload(user);
            // Get fresh user after reload
            const updatedUser = auth.currentUser;
            if (updatedUser) {
              setCurrentUser(updatedUser);
            }
          } catch (error) {
            // Ignore reload errors - user data is still valid
            console.error('Error reloading user:', error);
          }
        }
        
        // Fetch user role from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role as UserRole);
          } else {
            setUserRole(null);
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    login,
    signup,
    logout,
    sendVerificationEmail,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? <Loading /> : children}
    </AuthContext.Provider>
  );
}
