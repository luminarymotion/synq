import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useUserAuth } from '../services/auth';
import '../App.css';

function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { googleSignIn } = useUserAuth();
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

    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      navigate('/dashboard'); // Redirect to dashboard after successful login
    } catch (error) {
      console.error('Error signing in:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);

    try {
      await googleSignIn();
      navigate('/dashboard'); // Redirect to dashboard after successful login
    } catch (error) {
      console.error('Error signing in with Google:', error);
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
              <h2 className="text-center mb-4">Login</h2>
              
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
                    placeholder="Enter your email"
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
                    placeholder="Enter your password"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="d-grid gap-2">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </div>
              </form>

              <div className="text-center mt-3">
                <p className="mb-3">Or</p>
                <div className="d-flex justify-content-center">
                  <button
                    onClick={handleGoogleSignIn}
                    className="btn btn-light d-flex align-items-center justify-content-center gap-2"
                    style={{
                      border: '1px solid #dadce0',
                      borderRadius: '4px',
                      padding: '8px 16px',
                      backgroundColor: '#fff',
                      color: '#3c4043',
                      fontSize: '14px',
                      fontWeight: '500',
                      width: '100%',
                      maxWidth: '400px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 1px 3px rgba(60,64,67,.08)',
                      transition: 'background-color 0.2s, box-shadow 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(60,64,67,.12)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(60,64,67,.08)';
                    }}
                    disabled={loading}
                  >
                    <img 
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt="Google"
                      style={{ width: '18px', height: '18px' }}
                    />
                    Sign in with Google
                  </button>
                </div>
              </div>

              <div className="text-center mt-3">
                <p>
                  Don't have an account?{' '}
                  <Link to="/signup">Sign up</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login; 