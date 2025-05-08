import { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import '../styles/Dashboard.css';

function Dashboard() {
  const { user } = useUserAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading data
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Welcome, {user?.displayName || 'User'}</h1>
      </div>
      
      <div className="dashboard-content">
        <div className="row">
          <div className="col-md-6">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Your Groups</h5>
                <p className="card-text">No groups yet. Create or join a group to get started!</p>
              </div>
            </div>
          </div>
          
          <div className="col-md-6">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Upcoming Rides</h5>
                <p className="card-text">No upcoming rides scheduled.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard; 