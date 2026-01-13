import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { PrivateRoute } from './components/PrivateRoute';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { PageTransition } from './components/PageTransition';
import { Learn } from './pages/Learn';
import { Messages } from './pages/Messages';
import { Loading } from './components/Loading';
import './App.css';

function AnimatedRoutes() {
  const location = useLocation();
  const { isNavigating } = useNavigation();

  return (
    <>
      {isNavigating && <Loading />}
      <PageTransition>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/home"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
          <Route
            path="/learn"
            element={
              <PrivateRoute>
                <Learn />
              </PrivateRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <PrivateRoute>
                <Messages />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
      </PageTransition>
    </>
  );
}

function App() {
  return (
    <Router>
      <NavigationProvider>
        <AuthProvider>
          <AnimatedRoutes />
        </AuthProvider>
      </NavigationProvider>
    </Router>
  );
}

export default App;
