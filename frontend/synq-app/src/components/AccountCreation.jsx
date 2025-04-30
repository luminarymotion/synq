// src/components/AccountCreation.jsx
import React from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../services/firebase';

const AccountCreation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Debug current route
  React.useEffect(() => {
    console.log('AccountCreation location:', location.pathname);
  }, [location]);

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      navigate('/signup/verify', { 
        state: { 
          mode: 'google',
          user: {
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL
          }
        }
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
    }
  };

  const handleRegister = () => {
    console.log('Navigating to profile...');
    navigate('profile');
  };

  // If we're on a child route, only render the Outlet
  if (location.pathname !== '/signup') {
    return <Outlet />;
  }

  return (
    <div className="container vh-100 d-flex justify-content-center align-items-center">
      <div className="card shadow-sm p-4" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="text-center mb-4">
          <h2 className="mb-1">Welcome to SynqRoute</h2>
          <p className="text-muted small">Choose your sign-in method</p>
        </div>
        
        <div className="d-grid gap-3">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleRegister}
          >
            Create Account
          </button>

          <div className="text-center text-muted">or</div>

          <button
            className="btn btn-outline-primary btn-lg d-flex align-items-center justify-content-center gap-2"
            onClick={handleGoogleSignIn}
          >
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              style={{ width: '18px', height: '18px' }}
            />
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountCreation;
