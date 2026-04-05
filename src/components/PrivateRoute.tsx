import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

export function PrivateRoute({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return null;
  }

  return currentUser ? <>{children}</> : <Navigate to="/login" replace />;
}

