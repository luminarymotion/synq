import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
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
    phoneNumber: '',
    // Placeholder for future community features
    communityTags: [] // Will be used for community preferences and interests
  });

  useEffect(() => {
    if (!user) {
      console.log('No user, redirecting to login');
      navigate('/login');
      return;
    }

    if (!needsProfileSetup) {
      console.log('Profile setup not needed, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }

    // Load existing profile data if available
    const loadProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setFormData(prev => ({
            ...prev,
            displayName: userData.profile?.displayName || prev.displayName,
            phoneNumber: userData.profile?.phoneNumber || prev.phoneNumber
          }));
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    };

    loadProfile();
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
      console.log('Starting profile update...');
      if (!formData.displayName || !formData.phoneNumber) {
        throw new Error('Please fill in all required fields');
      }

      // Format phone number to ensure it's just digits
      const formattedPhone = formData.phoneNumber.replace(/\D/g, '');
      
      // Get existing user data
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const existingData = userDoc.exists() ? userDoc.data() : {};

      // Prepare update data, preserving existing fields
      const updateData = {
        profile: {
          ...(existingData.profile || {}),
          displayName: formData.displayName.trim(),
          phoneNumber: formattedPhone,
          setupComplete: true,
          social: {
            ...(existingData.profile?.social || {}),
            communityTags: existingData.profile?.social?.communityTags || [],
            interests: existingData.profile?.social?.interests || [],
            preferredRoutes: existingData.profile?.social?.preferredRoutes || []
          }
        },
        reputation: {
          ...(existingData.reputation || {}),
          verification: {
            ...(existingData.reputation?.verification || {}),
            phone: true
          }
        },
        updatedAt: new Date().toISOString()
      };

      console.log('Updating profile with data:', updateData);
      
      // Use updateDoc instead of setDoc to ensure we only update the necessary fields
      await updateDoc(userRef, updateData);
      console.log('Profile updated successfully');

      // Update the needsProfileSetup state
      console.log('Setting needsProfileSetup to false');
      setNeedsProfileSetup(false);

      // Add a small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the update
      const verifyDoc = await getDoc(userRef);
      console.log('Verification - Profile updated:', verifyDoc.exists());
      console.log('Verification - Profile data:', verifyDoc.data());

      // Redirect to dashboard after successful profile update
      console.log('Navigating to dashboard');
      navigate('/dashboard');
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Error updating profile. Please try again.');
    } finally {
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
        <div className="col-md-8">
          <div className="card">
            <div className="card-body">
              <h2 className="text-center mb-4">Complete Your Profile</h2>
              <p className="text-center text-muted mb-4">
                Please provide some basic information to get started.
                {user?.providerData[0]?.providerId === 'google.com' && (
                  <span className="d-block mt-2">
                    We noticed you signed in with Google. Please customize your profile.
                  </span>
                )}
              </p>
              
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="displayName" className="form-label">Display Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    id="displayName"
                    name="displayName"
                    value={formData.displayName}
                    onChange={handleChange}
                    placeholder="Enter your display name"
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
                  <label htmlFor="phoneNumber" className="form-label">Phone Number *</label>
                  <input
                    type="tel"
                    className="form-control"
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    required
                    disabled={loading}
                  />
                  <small className="text-muted">
                    We'll use this to verify your account and for ride coordination
                  </small>
                </div>

                {/* Placeholder for future community features */}
                <div className="mb-3">
                  <div className="alert alert-info" role="alert">
                    <h5 className="alert-heading">Coming Soon!</h5>
                    <p className="mb-0">
                      In the future, you'll be able to:
                    </p>
                    <ul className="mb-0 mt-2">
                      <li>Join communities based on your interests</li>
                      <li>Set your preferred routes</li>
                      <li>Connect with like-minded riders</li>
                    </ul>
                  </div>
                </div>

                <div className="d-grid gap-2">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? 'Updating...' : 'Complete Profile'}
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