import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { getUserRideHistory, clearUserRideHistory } from '../services/firebaseOperations';
import { Link } from 'react-router-dom';

function RideHistory({ limit = 5 }) {
  const { user } = useUserAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const result = await getUserRideHistory(user.uid, showAll ? 20 : limit);
        
        if (result.success) {
          setHistory(result.rides);
          setError(null);
        } else if (result.error) {
          setError('Failed to load ride history');
        } else {
          setHistory([]);
          setError(null);
        }
      } catch (err) {
        console.error('Error loading ride history:', err);
        setError('Failed to load ride history');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [user, limit, showAll]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadgeClass = (type) => {
    switch (type) {
      case 'left':
        return 'bg-warning';
      case 'cancelled':
        return 'bg-danger';
      case 'completed':
        return 'bg-success';
      default:
        return 'bg-secondary';
    }
  };

  const getRoleBadgeClass = (role) => {
    return role === 'driver' ? 'bg-primary' : 'bg-info';
  };

  const handleClearHistory = async () => {
    if (!user) return;
    
    try {
      setClearing(true);
      const result = await clearUserRideHistory(user.uid);
      
      if (result.success) {
        setHistory([]);
        setError(null);
        setShowClearModal(false);
      } else {
        setError(result.error || 'Failed to clear ride history');
      }
    } catch (err) {
      console.error('Error clearing ride history:', err);
      setError('Failed to clear ride history');
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h5 className="card-title mb-0">Recent Ride History</h5>
        </div>
        <div className="card-body text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-header">
          <h5 className="card-title mb-0">Recent Ride History</h5>
        </div>
        <div className="card-body">
          <div className="alert alert-danger mb-0" role="alert">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="card-title mb-0">Recent Ride History</h5>
          <button 
            className="btn btn-outline-danger btn-sm"
            onClick={() => setShowClearModal(true)}
            disabled={clearing}
          >
            {clearing ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                Clearing...
              </>
            ) : (
              <>
                <i className="bi bi-trash me-1"></i>
                Clear History
              </>
            )}
          </button>
        </div>
        <div className="card-body text-center py-4">
          <div className="mb-3">
            <i className="bi bi-clock-history" style={{ fontSize: '2rem', color: '#6c757d' }}></i>
          </div>
          <h6 className="text-muted mb-0">No recent rides in the past 24 hours</h6>
        </div>

        {/* Clear History Modal */}
        {showClearModal && (
          <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Clear Ride History</h5>
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => setShowClearModal(false)}
                    disabled={clearing}
                  ></button>
                </div>
                <div className="modal-body">
                  <p>Are you sure you want to clear your ride history? This action cannot be undone.</p>
                </div>
                <div className="modal-footer">
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowClearModal(false)}
                    disabled={clearing}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-danger" 
                    onClick={handleClearHistory}
                    disabled={clearing}
                  >
                    {clearing ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                        Clearing...
                      </>
                    ) : (
                      'Clear History'
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show"></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center">
          <h5 className="card-title mb-0">Recent Ride History</h5>
          <button 
            className="btn btn-link btn-sm ms-3"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show Less' : 'Show More'}
          </button>
        </div>
        <button 
          className="btn btn-outline-danger btn-sm"
          onClick={() => setShowClearModal(true)}
          disabled={clearing}
        >
          {clearing ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              Clearing...
            </>
          ) : (
            <>
              <i className="bi bi-trash me-1"></i>
              Clear History
            </>
          )}
        </button>
      </div>
      <div className="card-body p-0">
        <div className="list-group list-group-flush">
          {history.map((ride) => (
            <div key={ride.id} className="list-group-item">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <Link 
                    to={`/rides?rideId=${ride.id}`}
                    className="text-decoration-none"
                  >
                    <h6 className="mb-1">
                      <span className="badge bg-primary me-2">{ride.id}</span>
                      {ride.destination?.address}
                    </h6>
                  </Link>
                  <small className="text-muted d-block">
                    {formatDate(ride.endedAt)}
                  </small>
                </div>
                <div className="d-flex gap-2">
                  <span className={`badge ${getRoleBadgeClass(ride.role)}`}>
                    {ride.role}
                  </span>
                  <span className={`badge ${getStatusBadgeClass(ride.history?.[0]?.type)}`}>
                    {ride.history?.[0]?.type || 'ended'}
                  </span>
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center">
                <small className="text-muted">
                  Duration: {ride.history?.[0]?.rideSnapshot?.duration || 'N/A'} min
                </small>
                <small className="text-muted">
                  {ride.passengers?.length || 0} passengers
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>
        {`
          .list-group-item {
            border-left: none;
            border-right: none;
            padding: 1rem;
            transition: background-color 0.2s;
          }

          .list-group-item:first-child {
            border-top: none;
          }

          .list-group-item:hover {
            background-color: rgba(0, 0, 0, 0.02);
          }

          .badge {
            font-weight: 500;
            padding: 0.5em 0.75em;
          }

          .btn-link {
            color: #6c757d;
            text-decoration: none;
          }

          .btn-link:hover {
            color: #0d6efd;
          }

          h6 {
            color: #212529;
          }

          h6:hover {
            color: #0d6efd;
          }

          .gap-2 {
            gap: 0.5rem;
          }

          .modal {
            background-color: rgba(0, 0, 0, 0.5);
          }

          .modal-content {
            border: none;
            border-radius: 0.5rem;
            box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
          }

          .modal-header {
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            padding: 1rem;
          }

          .modal-body {
            padding: 1.5rem;
          }

          .modal-footer {
            border-top: 1px solid rgba(0, 0, 0, 0.1);
            padding: 1rem;
          }

          .btn-outline-danger {
            border-color: #dc3545;
            color: #dc3545;
          }

          .btn-outline-danger:hover {
            background-color: #dc3545;
            color: white;
          }

          .btn-outline-danger:disabled {
            opacity: 0.65;
          }
        `}
      </style>
    </div>
  );
}

export default RideHistory; 