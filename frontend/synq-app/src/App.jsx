import './App.css';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ResponsiveRideCreator from './pages/ResponsiveRideCreator';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import Friends from './components/Friends';
import Rides from './pages/Rides';
import LiveRideView from './pages/LiveRideView';
import Header from './components/Header';
import GlobalLoading from './components/GlobalLoading';
import LocationTrackingTest from './components/LocationTrackingTest';
import LocationTrackingTestSimple from './components/LocationTrackingTestSimple';
import ReviewRideDetailsDemo from './components/ReviewRideDetailsDemo';
import { UserAuthContextProvider, useUserAuth } from './services/auth';
import errorLogger from './services/errorLogger';
import './styles/theme.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useUserAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <GlobalLoading 
        title="Authenticating"
        subtitle="Verifying your account"
        icon="fas fa-shield-alt"
        steps={[
          "Checking credentials",
          "Loading profile",
          "Preparing dashboard"
        ]}
      />
    );
  }
  
  if (!user) {
    // Store the intended destination for redirect after login
    const redirectPath = location.pathname + location.search;
    console.log('🔐 Redirecting to login with path:', redirectPath);
    
    // Log deep link access attempt for debugging
    errorLogger.logDeepLinkError({
      originalPath: redirectPath,
      referrer: document.referrer
    });
    
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  return children;
};

// Main App component that provides the auth context
function App() {
  return (
    <UserAuthContextProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            style: {
              background: '#4CAF50',
            },
          },
          error: {
            duration: 4000,
            style: {
              background: '#f44336',
            },
          },
          info: {
            duration: 3000,
            style: {
              background: '#2196F3',
            },
          },
        }}
      />
      <AppContent />
    </UserAuthContextProvider>
  );
}

// Component that uses the auth context - moved inside the provider
const AppContent = () => {
  const { user, loading, needsProfileSetup } = useUserAuth();
  const location = useLocation();

  // Show global loading during authentication
  if (loading) {
    return (
      <GlobalLoading 
        title="Welcome to SynqRoute"
        subtitle="Setting up your ride-sharing experience"
        icon="fas fa-car"
        steps={[
          "Initializing app",
          "Checking authentication",
          "Loading your profile"
        ]}
      />
    );
  }

  // Helper function to get the appropriate redirect path
  const getRedirectPath = () => {
    // If user is authenticated and trying to access auth pages, redirect appropriately
    if (user) {
      if (needsProfileSetup) {
        return '/settings';
      }
      
      // Check if there's a redirect parameter in the URL
      const searchParams = new URLSearchParams(location.search);
      const redirectParam = searchParams.get('redirect');
      
      if (redirectParam) {
        return redirectParam;
      }
      
      return '/dashboard';
    }
    
    return '/login';
  };

  return (
    <div className="App">
      {/* Show Header for authenticated users or on auth pages */}
      {(user || location.pathname === '/login' || location.pathname === '/signup') && <Header />}
      <Routes>
        {/* Root path - redirect based on auth and profile status */}
        <Route path="/" element={
          user ? (
            needsProfileSetup ? (
              <Navigate to="/settings" />
            ) : (
              <Navigate to="/dashboard" />
            )
          ) : (
            <Navigate to="/login" />
          )
        } />

        {/* Auth routes - redirect to settings if needed */}
        <Route path="/login" element={
          user ? (
            <Navigate to={getRedirectPath()} />
          ) : <Login />
        } />
        <Route path="/signup" element={
          user ? (
            <Navigate to={getRedirectPath()} />
          ) : <SignUp />
        } />

        {/* Settings route - includes profile setup */}
        <Route path="/settings" element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } />

        {/* Protected routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/create-group" element={
          <ProtectedRoute>
            <ResponsiveRideCreator mode="create" />
          </ProtectedRoute>
        } />
        <Route path="/join-group" element={
          <ProtectedRoute>
            <ResponsiveRideCreator mode="join" />
          </ProtectedRoute>
        } />
        <Route path="/friends" element={
          <ProtectedRoute>
            <Friends />
          </ProtectedRoute>
        } />
        <Route path="/rides" element={
          <ProtectedRoute>
            <Rides />
          </ProtectedRoute>
        } />
        <Route path="/rides/:rideId" element={
          <ProtectedRoute>
            <LiveRideView />
          </ProtectedRoute>
        } />
        <Route path="/test-location" element={
          <ProtectedRoute>
            <LocationTrackingTest />
          </ProtectedRoute>
        } />
        <Route path="/test-simple" element={
          <LocationTrackingTestSimple />
        } />
        <Route path="/review-modal-demo" element={
          <ProtectedRoute>
            <ReviewRideDetailsDemo />
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
};

export default App;
