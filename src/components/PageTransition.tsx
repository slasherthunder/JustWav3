import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigation } from '../contexts/NavigationContext';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { setNavigating } = useNavigation();
  const prevPathnameRef = useRef(location.pathname);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevPathnameRef.current = location.pathname;
      return;
    }

    // Only show loading if pathname actually changed
    if (prevPathnameRef.current !== location.pathname) {
      setNavigating(true);
      prevPathnameRef.current = location.pathname;
      
      const timer = setTimeout(() => {
        setNavigating(false);
      }, 1500); // Show loading for 1.5 seconds during transition

      return () => clearTimeout(timer);
    }
  }, [location.pathname, setNavigating]);

  return <>{children}</>;
}
