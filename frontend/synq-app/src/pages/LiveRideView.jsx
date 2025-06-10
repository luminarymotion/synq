import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
import { useLocation } from '../services/locationTrackingService';
import rideStatusService, { RIDE_STATUS, STATUS_METADATA, STATUS_TRANSITIONS } from '../services/rideStatusService';
import '../styles/LiveRideView.css';

function LiveRideView() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [statusHistory, setStatusHistory] = useState([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const mapRef = useRef(null);

  const {
    location,
    isTracking,
    status: locationStatus,
    error: locationServiceError,
    startTracking,
    stopTracking
  } = useLocation({
    preset: 'realtime',
    updateFirebase: true,
    onLocationUpdate: async (locationData) => {
      if (!ride || ride.driver?.uid !== user.uid) return;

      try {
        // Update ride document with new location
        const rideRef = doc(db, 'rides', rideId);
        await updateDoc(rideRef, {
          'driver.location': {
            lat: locationData.latitude,
            lng: locationData.longitude,
            accuracy: locationData.accuracy,
            address: locationData.address,
            lastUpdated: serverTimestamp()
          }
        });
        // Clear location error on successful update
        setLocationError(null);
      } catch (error) {
        console.error('Error updating ride with location:', error);
        setLocationError('Failed to update location in ride');
      }
    },
    onError: (errorMessage) => {
      console.error('Location tracking error:', errorMessage);
      // Only set location error for non-critical issues
      if (errorMessage && !errorMessage.includes('permission denied')) {
        setLocationError(errorMessage);
      } else if (errorMessage && errorMessage.includes('permission denied')) {
        setError('Location access is required for this ride. Please enable location services.');
      }
    },
    onStatusChange: (status) => {
      console.log('Location tracking status:', status);
      switch (status) {
        case 'offline':
          setLocationError('Location tracking paused - offline');
          break;
        case 'syncing':
          setLocationError('Syncing location data...');
          break;
        case 'active':
          setLocationError(null);
          break;
        case 'error':
          setLocationError('Location tracking failed');
          break;
      }
    }
  });

  // Subscribe to ride status updates
  useEffect(() => {
    if (!rideId) return;

    const unsubscribe = rideStatusService.subscribeToRideStatus(rideId, (statusData) => {
      if (statusData.error) {
        console.error('Error in status subscription:', statusData.error);
        return;
      }
      setStatusHistory(statusData.statusHistory || []);
    });

    return () => {
      rideStatusService.unsubscribeFromRideStatus(rideId);
    };
  }, [rideId]);

  // Subscribe to ride updates and optimize route when needed
  useEffect(() => {
    if (!rideId || !user) return;

    const rideRef = doc(db, 'rides', rideId);
    const unsubscribe = onSnapshot(rideRef, async (doc) => {
        if (doc.exists()) {
        const rideData = doc.data();
        setRide(rideData);

        // Update participants list
        const allParticipants = [
          rideData.driver,
          ...(rideData.passengers || [])
        ].filter(Boolean);
        setParticipants(allParticipants);

        // Optimize route if we have all necessary locations
        if (rideData.driver?.location && rideData.destination?.location) {
          try {
            const route = await optimizeRoute(rideData);
            setOptimizedRoute(route);
          } catch (error) {
            console.error('Error optimizing route:', error);
          }
        }

        // Start location tracking if user is the driver
        if (rideData.driver?.uid === user.uid && !isTracking) {
          startTracking(user.uid).catch(error => {
            console.error('Error starting location tracking:', error);
            setLocationError('Failed to start location tracking');
          });
        }
      } else {
        setError('Ride not found');
        navigate('/rides');
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      stopTracking();
    };
  }, [rideId, user, navigate, isTracking, startTracking, stopTracking]);

  const handleStatusUpdate = async (newStatus, reason = null) => {
    if (!ride || !user) return;

    try {
      setIsUpdatingStatus(true);
      const result = await rideStatusService.updateRideStatus(rideId, newStatus, user.uid, reason);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update ride status');
      }
    } catch (error) {
      console.error('Error updating ride status:', error);
      setError(error.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleLeaveRide = async () => {
    if (!ride || !user) return;

    const isDriver = ride.driver?.uid === user.uid;
    const newStatus = isDriver ? RIDE_STATUS.CANCELLED : null;
    
    if (window.confirm('Are you sure you want to leave this ride?')) {
      try {
        if (newStatus) {
          await handleStatusUpdate(newStatus, `${isDriver ? 'Driver' : 'Passenger'} left the ride`);
        }
        // Additional leave ride logic here
      } catch (error) {
        console.error('Error leaving ride:', error);
        setError('Failed to leave ride');
      }
    }
  };

  const handleShareRide = () => {
    setIsSharing(true);
    const shareUrl = `${window.location.origin}/rides/${rideId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        alert('Ride link copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy ride link');
      })
      .finally(() => {
        setIsSharing(false);
      });
  };

  // Get current status metadata
  const currentStatusMeta = ride ? STATUS_METADATA[ride.status] : null;

  // Get available status transitions for the current user
  const getAvailableTransitions = () => {
    if (!ride || !user) return [];
    
    const isDriver = ride.driver?.uid === user.uid;
    const isCreator = ride.creatorId === user.uid;
    
    if (!isDriver && !isCreator) return [];

    const transitions = STATUS_TRANSITIONS[ride.status] || [];
    return transitions.map(status => ({
      status,
      ...STATUS_METADATA[status]
    }));
  };

  // Add click handler for sidebar toggle
  const handleSidebarClick = (e) => {
    if (e.target === e.currentTarget) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  console.log('LiveRideView render state:', {
    loading,
    error,
    hasRide: !!ride,
    participantsCount: participants.length,
    timestamp: new Date().toISOString()
  });

  if (loading) {
    console.log('Rendering loading state');
    return (
      <div className="live-ride-container">
        <div className="loading-spinner">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p>Loading ride information...</p>
        </div>
      </div>
    );
  }

  if (error && !ride) {
    console.log('Rendering error state:', { error });
    return (
      <div className="live-ride-container">
        <div className="error-message">
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/rides')}
          >
            Back to Rides
          </button>
        </div>
      </div>
    );
  }

  if (!ride) {
    console.log('Rendering no ride state');
    return (
      <div className="live-ride-container">
        <div className="error-message">
          <div className="alert alert-warning" role="alert">
            Ride not found
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/rides')}
          >
            Back to Rides
          </button>
        </div>
      </div>
    );
  }

  console.log('Rendering main content:', {
    rideId: ride.id,
    hasDriverLocation: !!ride.driver?.location,
    hasDestLocation: !!ride.destination?.location,
    timestamp: new Date().toISOString()
  });

  return (
    <div className="live-ride-container">
      {/* Notifications */}
      {locationError && (
        <div className="alert alert-warning mb-3" role="alert">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {locationError}
        </div>
      )}

      <div className="live-ride-content">
        {/* Map Container - Now first in the DOM order */}
        <div className="live-ride-map-wrapper">
          <div className="live-ride-map-container">
            <MapView 
              ref={mapRef}
              users={participants}
              destination={{
                ...ride.destination,
                lat: Array.isArray(ride.destination.location) ? ride.destination.location[1] : ride.destination.location.lat,
                lng: Array.isArray(ride.destination.location) ? ride.destination.location[0] : ride.destination.location.lng
              }}
              userLocation={location ? {
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy
              } : null}
              optimizedRoute={optimizedRoute}
              isLiveRide={true}
            />
          </div>
        </div>

        {/* Sliding Sidebar - Now overlays the map */}
        <div 
          className={`live-ride-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}
          onClick={handleSidebarClick}
        >
          <div className="sidebar-handle">
            <button 
              className="sidebar-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setIsSidebarOpen(!isSidebarOpen);
              }}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <i className={`fas fa-${isSidebarOpen ? 'chevron-left' : 'chevron-right'}`}></i>
            </button>
          </div>

          <div className="sidebar-content">
            <div className="ride-info">
              <h2>
                <span className="badge bg-primary me-2">{ride.id}</span>
                {ride.destination?.address}
              </h2>
              <div className="ride-status-info">
                <span className={`badge bg-${currentStatusMeta?.color || 'secondary'} me-2`}>
                  <i className={`fas ${currentStatusMeta?.icon || 'fa-question-circle'} me-1`}></i>
                  {currentStatusMeta?.label || 'Unknown Status'}
                </span>
                <small className="text-muted">
                  Started {new Date(ride.createdAt?.toDate()).toLocaleString()}
                </small>
              </div>
            </div>

            <div className="ride-actions">
              {getAvailableTransitions().length > 0 && (
                <div className="status-actions">
                  {getAvailableTransitions().map(({ status, label, icon, color }) => (
                    <button
                      key={status}
                      className={`btn btn-outline-${color} me-2`}
                      onClick={() => handleStatusUpdate(status)}
                      disabled={isUpdatingStatus}
                    >
                      {isUpdatingStatus ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                          Updating...
                        </>
                      ) : (
                        <>
                          <i className={`fas ${icon} me-1`}></i>
                          {label}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="action-buttons">
                <button 
                  className="btn btn-outline-primary me-2"
                  onClick={handleShareRide}
                  disabled={isSharing}
                >
                  {isSharing ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      Sharing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-share me-1"></i>
                      Share Ride
                    </>
                  )}
                </button>
                <button 
                  className="btn btn-outline-danger"
                  onClick={handleLeaveRide}
                >
                  <i className="bi bi-box-arrow-right me-1"></i>
                  Leave Ride
                </button>
              </div>
            </div>

            <div className="ride-details">
              <div className="status-history">
                <h6>Status History</h6>
                <div className="timeline">
                  {statusHistory.map((entry, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-marker">
                        <i className={`fas ${STATUS_METADATA[entry.status]?.icon || 'fa-circle'}`}></i>
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className={`badge bg-${STATUS_METADATA[entry.status]?.color || 'secondary'}`}>
                            {STATUS_METADATA[entry.status]?.label || entry.status}
                          </span>
                          <small className="text-muted ms-2">
                            {new Date(entry.timestamp).toLocaleString()}
                          </small>
                        </div>
                        <p className="timeline-text mb-0">
                          {entry.reason || `Status changed to ${STATUS_METADATA[entry.status]?.label || entry.status}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="participants-list">
              <h6>Participants</h6>
              <ul className="list-group">
                {participants.map((participant, index) => (
                  <li 
                    key={participant.uid || index} 
                    className="list-group-item d-flex justify-content-between align-items-center"
                  >
                    <div className="d-flex align-items-center">
                      <span className="badge bg-primary me-2">
                        {participant.role || 'passenger'}
                      </span>
                      <div>
                        <div>{participant.name || participant.displayName || 'Unknown User'}</div>
                        {participant.invitationStatus && (
                          <small className={`text-${getInvitationStatusColor(participant.invitationStatus)}`}>
                            {getInvitationStatusText(participant.invitationStatus)}
                          </small>
                        )}
                      </div>
                    </div>
                    {participant.status && (
                      <span className={`badge ${
                        participant.status === 'active' ? 'bg-success' : 'bg-secondary'
                      }`}>
                        {participant.status}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {optimizedRoute && (
              <div className="route-info">
                <h6>Route Information</h6>
                <div className="route-stats">
                  <div className="stat-item">
                    <i className="bi bi-arrow-right-circle"></i>
                    <span>Distance: {formatDistance(optimizedRoute.totalDistance)}</span>
                  </div>
                  <div className="stat-item">
                    <i className="bi bi-clock"></i>
                    <span>Duration: {formatDuration(optimizedRoute.totalDuration)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .live-ride-container {
          position: fixed;
          top: 64px; /* Height of the header */
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          width: 100vw;
          height: calc(100vh - 64px);
          z-index: 1; /* Lower z-index to stay below header */
          pointer-events: none; /* Allow clicks to pass through to header */
        }

        .live-ride-content {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          pointer-events: auto; /* Re-enable pointer events for content */
        }

        .live-ride-map-wrapper {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }

        .live-ride-map-container {
          width: 100%;
          height: 100%;
        }

        .live-ride-sidebar {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: 400px;
          background: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          border-right: 1px solid #eef2f7;
          transition: transform 0.3s ease;
          z-index: 2; /* Higher than map but lower than header */
          height: 100%;
          pointer-events: auto;
        }

        .live-ride-sidebar.closed {
          transform: translateX(-400px);
        }

        .sidebar-handle {
          position: absolute;
          right: -16px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 3; /* Higher than sidebar */
          background: #ffffff;
          border-radius: 50%;
          padding: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          pointer-events: auto;
        }

        .sidebar-toggle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #eef2f7;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #2196F3;
        }

        .sidebar-toggle:hover {
          background: #2196F3;
          border-color: #2196F3;
          color: #ffffff;
        }

        .sidebar-content {
          padding: 1.5rem;
          height: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          background: #ffffff;
        }

        .ride-info {
          margin-bottom: 1.5rem;
        }

        .ride-status-info {
          display: flex;
          align-items: center;
          margin-top: 0.5rem;
        }

        .status-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .timeline {
          position: relative;
          padding-left: 2rem;
        }

        .timeline-item {
          position: relative;
          padding-bottom: 1.5rem;
        }

        .timeline-item:last-child {
          padding-bottom: 0;
        }

        .timeline-marker {
          position: absolute;
          left: -2rem;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 50%;
          background: #f8f9fa;
          border: 2px solid #dee2e6;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .timeline-content {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 0.5rem;
        }

        .timeline-header {
          display: flex;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .timeline-text {
          color: #6c757d;
          font-size: 0.875rem;
        }

        .route-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 0.5rem;
          border: 1px solid #eef2f7;
        }

        .stat-item i {
          color: #2196F3;
          font-size: 1.25rem;
        }

        @media (max-width: 768px) {
          .live-ride-container {
            top: 56px; /* Smaller header height on mobile */
            height: calc(100vh - 56px);
          }

          .live-ride-sidebar {
            width: 100%;
            max-width: 400px;
          }

          .live-ride-sidebar.closed {
            transform: translateX(-100%);
          }

          .sidebar-content {
            padding: 1rem;
          }
        }

        /* Add styles for notifications to ensure they're clickable */
        .alert {
          position: relative;
          z-index: 2;
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}

// Helper functions
function formatDistance(meters) {
  if (!meters) return 'N/A';
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// Route optimization function
async function optimizeRoute(rideData) {
  try {
    // Get all locations in the correct order
    const locations = [
      rideData.driver.location,
      ...(rideData.passengers || [])
        .filter(p => p.location)
        .map(p => p.location),
      rideData.destination.location
    ];

    // Call your route optimization service here
    // This is a placeholder - implement your actual route optimization logic
    const optimizedRoute = {
      path: locations,
      totalDistance: 10000, // meters
      totalDuration: 1800, // seconds
      waypoints: locations.slice(1, -1)
    };

    return optimizedRoute;
  } catch (error) {
    console.error('Error optimizing route:', error);
    throw error;
  }
}

function getInvitationStatusColor(status) {
  const colors = {
    pending: 'warning',
    accepted: 'success',
    declined: 'danger',
    maybe: 'info'
  };
  return colors[status] || 'secondary';
}

function getInvitationStatusText(status) {
  const texts = {
    pending: 'Pending Response',
    accepted: 'Accepted',
    declined: 'Declined',
    maybe: 'Considering'
  };
  return texts[status] || status;
}

export default LiveRideView; 