import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import StudentDashboard from './components/Student/Dashboard';
import StudentProfile from './components/Student/Profile';
import SemesterRecords from './components/Student/SemesterRecords';
import SavedIdeas from './components/Student/SavedIdeas';
import { Toaster } from 'sonner';

/**
 * Top-level React Error Boundary.
 * Catches unhandled render errors and displays a recovery screen
 * instead of a blank page. Shows error details in development mode.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#1A1A2E', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontFamily: 'Arial, sans-serif', padding: '2rem'
        }}>
          <h1 style={{ fontSize: '2rem', color: '#f87171', marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#9ca3af', marginBottom: '2rem', textAlign: 'center', maxWidth: '480px' }}>
            An unexpected error occurred. Please reload the page. If the problem
            persists, try clearing your browser cache.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 2rem', background: '#6366f1', border: 'none',
              borderRadius: '0.75rem', color: 'white', fontWeight: 'bold',
              fontSize: '1rem', cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{
              marginTop: '2rem', background: '#0f172a', color: '#f87171',
              padding: '1rem', borderRadius: '0.5rem', fontSize: '0.75rem',
              maxWidth: '640px', overflowX: 'auto'
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" />;
  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/student/dashboard" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute><StudentProfile /></ProtectedRoute>} />
      <Route path="/student/records" element={<ProtectedRoute><SemesterRecords /></ProtectedRoute>} />
      <Route path="/student/saved" element={<ProtectedRoute><SavedIdeas /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ duration: 4000 }}
          />
          <AppRoutes />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
