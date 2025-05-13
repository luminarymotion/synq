import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUserAuth } from '../services/auth';
import '../App.css';

function ProfileSetup() {
  const { user, needsProfileSetup, setNeedsProfileSetup } = useUserAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    displayName: user?.displayName || '',
    phoneNumber: ''
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // If user doesn't need profile setup, redirect to dashboard
    if (!needsProfileSetup) {
      navigate('/dashboard');
      return;
    }
  }, [user, needsProfileSetup, navigate]);

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

    try {
      if (!formData.displayName || !formData.phoneNumber) {
        throw new Error('Please fill in all required fields');
      }

      // Format phone number to ensure it's just digits
      const formattedPhone = formData.phoneNumber.replace(/\D/g, '');
      
      // Update user profile in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: formData.displayName.trim(),
        phoneNumber: formattedPhone,
        updatedAt: new Date().toISOString()
      });

      // Update the needsProfileSetup state
      setNeedsProfileSetup(false);

      // Redirect to dashboard after successful profile update
      navigate('/dashboard');
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Error updating profile. Please try again.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mt-5">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Updating your profile...</p>
        </div>
      </div>
    );
  }

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
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-10">
          <div className="card">
            <div className="card-body">
              <h2 className="text-center mb-4">Complete Your Profile</h2>
              <p className="text-center text-muted mb-4">
                Please provide some additional information to help us personalize your experience.
                {user?.providerData[0]?.providerId === 'google.com' && (
                  <span className="d-block mt-2">
                    We noticed you signed in with Google. Please customize your display name and add your phone number.
                  </span>
                )}
              </p>
              
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="displayName" className="form-label">Display Name</label>
                  <input
                    type="text"
                    className="form-control"
                    id="displayName"
                    name="displayName"
                    value={formData.displayName}
                    onChange={handleChange}
                    placeholder={user?.displayName || "Enter your display name"}
                    required
                    disabled={loading}
                    minLength={2}
                    maxLength={30}
                  />
                  <small className="text-muted">
                    This is how other users will see you in the app
                  </small>
                </div>

                <div className="mb-3">
                  <label htmlFor="phoneNumber" className="form-label">Phone Number</label>
                  <input
                    type="tel"
                    className="form-control"
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    placeholder="(123) 456-7890"
                    required
                    pattern="[0-9]{10}"
                    title="Please enter a valid 10-digit phone number"
                    disabled={loading}
                  />
                  <small className="text-muted">
                    We'll use this to notify you about ride updates
                  </small>
                </div>

                <div className="d-grid">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Complete Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileSetup; 