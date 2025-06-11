import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import RouteOptimizer from './pages/RouteOptimizer';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import Friends from './components/Friends';
import Rides from './pages/Rides';
import LiveRideView from './pages/LiveRideView';
import Header from './components/Header';
import { UserAuthContextProvider, useUserAuth } from './services/auth';
import './styles/theme.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user } = useUserAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
};

// Component that uses the auth context
const AppContent = () => {
  const { user, needsProfileSetup } = useUserAuth();

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
            <RouteOptimizer />
          </ProtectedRoute>
        } />
        <Route path="/join-group" element={
          <ProtectedRoute>
            <RouteOptimizer />
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
      </Routes>
    </div>
  );
};

// Main App component that provides the auth context
function App() {
  return (
    <UserAuthContextProvider>
      <AppContent />
    </UserAuthContextProvider>
  );
}

export default App;
