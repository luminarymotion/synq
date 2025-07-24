import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import RouteOptimizer from './pages/RouteOptimizer';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import Friends from './components/Friends';
import Rides from './pages/Rides';
import LiveRideView from './pages/LiveRideView';
import Header from './components/Header';
import GlobalLoading from './components/GlobalLoading';
import LocationTrackingTest from './components/LocationTrackingTest';
import LocationTrackingTestSimple from './components/LocationTrackingTestSimple';
import { UserAuthContextProvider, useUserAuth } from './services/auth';
import './styles/theme.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useUserAuth();
  
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
    return <Navigate to="/login" />;
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

  return (
    <div className="App">
      <Header />
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
            needsProfileSetup ? (
              <Navigate to="/settings" />
            ) : (
              <Navigate to="/dashboard" />
            )
          ) : <Login />
        } />
        <Route path="/signup" element={
          user ? (
            needsProfileSetup ? (
              <Navigate to="/settings" />
            ) : (
              <Navigate to="/dashboard" />
            )
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
            <RouteOptimizer mode="create" />
          </ProtectedRoute>
        } />
        <Route path="/join-group" element={
          <ProtectedRoute>
            <RouteOptimizer mode="join" />
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
      </Routes>
    </div>
  );
};

export default App;
