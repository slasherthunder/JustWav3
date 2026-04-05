import { useAuth } from '../contexts/AuthContext';
import { ParentHome } from './ParentHome';
import { StudentHome } from './StudentHome';
import { TeacherHome } from './TeacherHome';

export function Home() {
  const { userRole, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (userRole === 'parent') {
    return <ParentHome />;
  }

  if (userRole === 'student') {
    return <StudentHome />;
  }

  if (userRole === 'teacher') {
    return <TeacherHome />;
  }

  // Fallback if role is not set
  return <StudentHome />;
}
