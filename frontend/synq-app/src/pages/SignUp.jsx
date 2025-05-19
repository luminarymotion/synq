import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { createUserProfile } from '../services/firebaseOperations';
import '../App.css';

function SignUp() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // Create a basic profile that will be completed in profile-setup
      const profileResult = await createUserProfile(userCredential.user.uid, {
        email: formData.email,
        displayName: null, // Will be set in profile-setup
        photoURL: null,
        phoneNumber: null, // Will be set in profile-setup
        preferences: {
          notifications: true,
          locationSharing: false
        }
      });

      if (!profileResult.success) {
        throw new Error('Failed to create user profile');
      }

      console.log('User created:', userCredential.user);
      navigate('/profile-setup');
    } catch (error) {
      console.error('Error creating user:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="container mt-5">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
        <button 
          className="btn btn-primary mt-3"
          onClick={() => setError(null)}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-5" style={{ 
      minHeight: 'calc(100vh - 200px)', 
      display: 'flex', 
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div className="row justify-content-center w-100">
        <div className="col-md-6 col-lg-5">
          <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
            <div className="card-body">
              <h2 className="text-center mb-4">Sign Up</h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="password" className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    className="form-control"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="d-grid">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </button>
                </div>
              </form>

              <div className="text-center mt-3">
                <p>
                  Already have an account?{' '}
                  <Link to="/login">Back to Login</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phone authentication UI
      <div className="phone-sign-in">
        <PhoneInput
          country={'us'}
          value={phoneNumber}
          onChange={(number) => setPhoneNumber('+' + number)}
        />

        <button
          onClick={sendOTP}
          type="button"
          className="btn btn-primary"
          disabled={!recaptchaSolved || !phoneNumber}
        >
          Send OTP
        </button>

        <div id="recaptcha" className="mt-3"></div>

        {confirmationResult && (
          <>
            <div className="mt-3">
              <input
                type="text"
                className="form-control"
                placeholder="Enter verification code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
            </div>
            <div className="mt-2">
              <button
                onClick={verifyOTP}
                type="button"
                className="btn btn-success"
                disabled={!verificationCode}
              >
                Verify OTP
              </button>
            </div>
          </>
        )}
      </div>
      */}
    </div>
  );
}

export default SignUp;
 