import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import RouteOptimizer from './pages/RouteOptimizer';
import ProfileSetup from './pages/ProfileSetup';
import Dashboard from './pages/Dashboard';
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

function App() {
  return (
    <UserAuthContextProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/profile-setup" element={<ProfileSetup />} />
        
        {/* Protected Routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <RouteOptimizer />
          </ProtectedRoute>
        } />
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
            <div>Friends Page (Coming Soon)</div>
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
    </UserAuthContextProvider>
  );
}

export default App;
