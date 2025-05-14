import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import RouteOptimizer from './pages/RouteOptimizer';
import ProfileSetup from './pages/ProfileSetup';
import Dashboard from './pages/Dashboard';
import Friends from './components/Friends';
import Rides from './pages/Rides';
import Header from './components/Header';
import { UserAuthContextProvider, useUserAuth } from './services/auth';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user } = useUserAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <>
      <Header />
      {children}
    </>
  );
};

// Separate component that uses the auth context
function AppRoutes() {
  const { user, needsProfileSetup } = useUserAuth();

  return (
    <div className="App">
      <Header />
      <Routes>
        <Route path="/" element={
          user ? (
            needsProfileSetup ? (
              <Navigate to="/profile-setup" />
            ) : (
              <Navigate to="/dashboard" />
            )
          ) : (
            <Navigate to="/login" />
          )
        } />
        <Route path="/login" element={
          user ? <Navigate to={needsProfileSetup ? "/profile-setup" : "/dashboard"} /> : <Login />
        } />
        <Route path="/signup" element={
          user ? <Navigate to={needsProfileSetup ? "/profile-setup" : "/dashboard"} /> : <SignUp />
        } />
        <Route path="/profile-setup" element={
          user ? (
            needsProfileSetup ? (
              <ProfileSetup />
            ) : (
              <Navigate to="/dashboard" />
            )
          ) : (
            <Navigate to="/login" />
          )
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            {needsProfileSetup ? <Navigate to="/profile-setup" /> : <Dashboard />}
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
            {needsProfileSetup ? <Navigate to="/profile-setup" /> : <Friends />}
          </ProtectedRoute>
        } />
        <Route path="/rides" element={
          <ProtectedRoute>
            {needsProfileSetup ? <Navigate to="/profile-setup" /> : <Rides />}
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <div>Profile Settings (Coming Soon)</div>
          </ProtectedRoute>
        } />
        <Route path="/account" element={
          <ProtectedRoute>
            <div>Account Settings (Coming Soon)</div>
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}

// Main App component that provides the auth context
function App() {
  return (
    <UserAuthContextProvider>
      <AppRoutes />
    </UserAuthContextProvider>
  );
}

export default App;
