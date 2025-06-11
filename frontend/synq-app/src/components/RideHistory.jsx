import React, { useState, useEffect, useCallback } from 'react';
import { useUserAuth } from '../services/auth';
import { getUserRideHistory } from '../services/firebaseOperations';
import { Link } from 'react-router-dom';
import '../styles/RideHistory.css';

function RideHistory({ userId }) {
  const { user } = useUserAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use the provided userId or fall back to the current user's ID
  const effectiveUserId = userId || user?.uid;

  const loadRideHistory = useCallback(async () => {
    if (!effectiveUserId) {
      setError('User ID is required to load ride history');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await getUserRideHistory(effectiveUserId);
      if (result.success) {
        setRides(result.rides);
      } else {
        setError(result.error || 'Failed to load ride history');
      }
    } catch (err) {
      console.error('Error loading ride history:', err);
      setError(err.message || 'Failed to load ride history');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    loadRideHistory();
  }, [loadRideHistory]);

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

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active':
        return 'bg-success';
      case 'completed':
        return 'bg-info';
      case 'cancelled':
        return 'bg-danger';
      case 'pending':
        return 'bg-warning';
      default:
        return 'bg-secondary';
    }
  };

  const getRoleBadgeClass = (role) => {
    return role === 'driver' ? 'bg-primary' : 'bg-info';
  };

  const getDestinationDisplay = (ride) => {
    if (!ride.destination) return 'No destination set';
    if (typeof ride.destination === 'string') return ride.destination;
    return ride.destination.address || 'Unknown destination';
  };

  if (loading) {
    return (
      <div className="card ride-history-card">
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
      <div className="card ride-history-card">
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

  if (rides.length === 0) {
    return (
      <div className="card ride-history-card">
        <div className="card-header">
          <h5 className="card-title mb-0">Recent Ride History</h5>
        </div>
        <div className="card-body text-center py-4">
          <div className="mb-3">
            <i className="bi bi-clock-history" style={{ fontSize: '2rem', color: '#6c757d' }}></i>
          </div>
          <h6 className="text-muted mb-0">No recent rides in the past 24 hours</h6>
        </div>
      </div>
    );
  }

  return (
    <div className="card ride-history-card">
      <div className="card-header">
        <h5 className="card-title mb-0">Recent Ride History</h5>
      </div>
      <div className="card-body p-0">
        <div className="list-group list-group-flush">
          {rides.map((ride) => (
            <div key={ride.id} className="list-group-item ride-history-item">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <Link 
                    to={`/rides/${ride.id}`}
                    className="text-decoration-none ride-link"
                  >
                    <h6 className="mb-1">Ride {ride.id}</h6>
                  </Link>
                  <small className="text-muted">
                    {formatDate(ride.createdAt)}
                  </small>
                </div>
                <div className="badge-container">
                  <span className={`badge ${getStatusBadgeClass(ride.status)} me-2`}>
                    {ride.status}
                  </span>
                  <span className={`badge ${getRoleBadgeClass(ride.role)}`}>
                    {ride.role}
                  </span>
                </div>
              </div>
              <div className="ride-details">
                <div className="destination">
                  <small className="text-muted">Destination:</small>
                  <p className="mb-0">{getDestinationDisplay(ride)}</p>
                </div>
                {ride.passengerUids && (
                  <div className="passengers">
                    <small className="text-muted">
                      {ride.passengerUids.length} {ride.passengerUids.length === 1 ? 'passenger' : 'passengers'}
                    </small>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RideHistory; 