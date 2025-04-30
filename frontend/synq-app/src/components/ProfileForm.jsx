import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ProfileForm = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    phoneNumber: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const formatPhoneNumber = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 6) {
      return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    } else {
      return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e) => {
    const formattedNumber = formatPhoneNumber(e.target.value);
    setFormData(prev => ({
      ...prev,
      phoneNumber: formattedNumber
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // TODO: Implement your own form submission logic here
      console.log('Form submitted:', formData);
    } catch (error) {
      console.error('Error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container vh-100 d-flex justify-content-center align-items-center">
      <div className="card shadow-lg border-0" style={{ 
        width: '100%', 
        maxWidth: '400px',
        borderRadius: '15px',
        backgroundColor: '#ffffff'
      }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <h2 className="mb-2" style={{ 
              color: '#2d3748',
              fontWeight: '600'
            }}>Create Your Account</h2>
            <p className="text-muted" style={{ fontSize: '0.95rem' }}>
              Choose a username and enter your phone number
            </p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert" style={{
              borderRadius: '10px',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="username" className="form-label" style={{ 
                color: '#4a5568',
                fontSize: '0.95rem',
                fontWeight: '500'
              }}>Username</label>
              <input
                type="text"
                className="form-control form-control-lg"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Choose a username"
                disabled={loading}
                style={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="phoneNumber" className="form-label" style={{ 
                color: '#4a5568',
                fontSize: '0.95rem',
                fontWeight: '500'
              }}>Phone Number</label>
              <input
                type="tel"
                className="form-control form-control-lg"
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handlePhoneChange}
                placeholder="(555) 555-5555"
                maxLength="14"
                disabled={loading}
                style={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  padding: '0.75rem 1rem',
                  fontSize: '0.95rem'
                }}
              />
              <div className="form-text mt-2" style={{ fontSize: '0.85rem' }}>
                Enter your 10-digit U.S. phone number
              </div>
            </div>

            <div className="d-grid gap-3">
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  backgroundColor: '#4299e1',
                  border: 'none',
                  boxShadow: '0 2px 4px rgba(66, 153, 225, 0.2)'
                }}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>

            <div className="d-grid gap-3 mt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate('/signup')}
                disabled={loading}
                style={{
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  border: '1px solid #e2e8f0',
                  color: '#4a5568'
                }}
              >
                Back to Sign Up
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileForm; 