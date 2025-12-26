import { useAuth } from '../contexts/AuthContext';
import { ParentHome } from './ParentHome';
import { StudentHome } from './StudentHome';
import { Loading } from '../components/Loading';

export function Home() {
  const { userRole, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  if (userRole === 'parent') {
    return <ParentHome />;
  }

  if (userRole === 'student') {
    return <StudentHome />;
  }

  // Fallback if role is not set
  return <StudentHome />;
}
