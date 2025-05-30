import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
import '../styles/LiveRideView.css';

function LiveRideView() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isSharing, setIsSharing] = useState(false);

  console.log('LiveRideView component mounted:', {
    rideId,
    userId: user?.uid,
    timestamp: new Date().toISOString()
  });

  // Subscribe to ride updates
  useEffect(() => {
    console.log('LiveRideView effect triggered:', {
      rideId,
      userId: user?.uid,
      timestamp: new Date().toISOString()
    });

    if (!rideId) {
      console.error('No ride ID provided');
      setError('No ride ID provided');
      setLoading(false);
      return;
    }

    if (!user) {
      console.error('No user found');
      setError('Please log in to view ride details');
      setLoading(false);
      return;
    }

    const rideRef = doc(db, 'rides', rideId);
    console.log('Setting up ride subscription for:', rideId);

    const unsubscribe = onSnapshot(rideRef, 
      (doc) => {
        console.log('Ride snapshot received:', {
          exists: doc.exists(),
          id: doc.id,
          timestamp: new Date().toISOString()
        });

        if (doc.exists()) {
          const rideData = {
            id: doc.id,
            ...doc.data()
          };
          
          console.log('Raw ride data:', {
            id: rideData.id,
            driver: rideData.driver,
            destination: rideData.destination,
            timestamp: new Date().toISOString()
          });

          // Validate coordinates
          if (!rideData.driver?.location || 
              !rideData.destination?.location) {
            console.error('Invalid ride coordinates:', {
              driverLocation: rideData.driver?.location,
              destLocation: rideData.destination?.location,
              timestamp: new Date().toISOString()
            });
            setError('Invalid ride data: missing coordinates');
            setLoading(false);
            return;
          }

          // Convert coordinates to array format if they're objects
          const driverCoords = Array.isArray(rideData.driver.location) 
            ? rideData.driver.location 
            : [rideData.driver.location.lng, rideData.driver.location.lat];
          
          const destCoords = Array.isArray(rideData.destination.location)
            ? rideData.destination.location
            : [rideData.destination.location.lng, rideData.destination.location.lat];

          console.log('Converted coordinates:', {
            driverCoords,
            destCoords,
            originalDriverLocation: rideData.driver.location,
            originalDestLocation: rideData.destination.location,
            timestamp: new Date().toISOString()
          });

          // Validate coordinate format
          if (!Array.isArray(driverCoords) || driverCoords.length !== 2 ||
              !Array.isArray(destCoords) || destCoords.length !== 2) {
            console.error('Invalid coordinate format:', { 
              driverCoords, 
              destCoords,
              driverLocation: rideData.driver.location,
              destLocation: rideData.destination.location,
              timestamp: new Date().toISOString()
            });
            setError('Invalid coordinate format');
            setLoading(false);
            return;
          }

          // Validate coordinate ranges
          const [driverLng, driverLat] = driverCoords;
          const [destLng, destLat] = destCoords;
          
          if (driverLng < -180 || driverLng > 180 || driverLat < -90 || driverLat > 90 ||
              destLng < -180 || destLng > 180 || destLat < -90 || destLat > 90) {
            console.error('Coordinates out of valid range:', { 
              driverCoords, 
              destCoords,
              driverLocation: rideData.driver.location,
              destLocation: rideData.destination.location,
              timestamp: new Date().toISOString()
            });
            setError('Coordinates out of valid range');
            setLoading(false);
            return;
          }

          // Update the ride data with array coordinates
          const updatedRideData = {
            ...rideData,
            driver: {
              ...rideData.driver,
              location: driverCoords
            },
            destination: {
              ...rideData.destination,
              location: destCoords
            }
          };

          console.log('Setting ride data:', {
            id: updatedRideData.id,
            driverLocation: updatedRideData.driver.location,
            destLocation: updatedRideData.destination.location,
            timestamp: new Date().toISOString()
          });

          setRide(updatedRideData);
          setParticipants([
            { 
              ...updatedRideData.driver, 
              role: 'Driver',
              lat: Array.isArray(updatedRideData.driver.location) ? updatedRideData.driver.location[1] : updatedRideData.driver.location.lat,
              lng: Array.isArray(updatedRideData.driver.location) ? updatedRideData.driver.location[0] : updatedRideData.driver.location.lng
            },
            ...(updatedRideData.passengers || []).map(p => ({ 
              ...p, 
              role: 'Passenger',
              lat: Array.isArray(p.location) ? p.location[1] : p.location.lat,
              lng: Array.isArray(p.location) ? p.location[0] : p.location.lng
            }))
          ]);
          setLoading(false);
        } else {
          console.log('No ride found with ID:', rideId);
          setError('Ride not found');
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error fetching ride:', {
          error,
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        });
        setError('Failed to load ride information');
        setLoading(false);
      }
    );

    return () => {
      console.log('Cleaning up ride subscription:', {
        rideId,
        timestamp: new Date().toISOString()
      });
      unsubscribe();
    };
  }, [rideId, user]);

  const handleLeaveRide = async () => {
    // TODO: Implement leave ride functionality
    if (window.confirm('Are you sure you want to leave this ride?')) {
      // Call leaveRide function
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

  if (error) {
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
      <div className="live-ride-header">
        <div className="ride-info">
          <h2>
            <span className="badge bg-primary me-2">{ride.id}</span>
            {ride.destination?.address}
          </h2>
          <p className="text-muted">
            Started {new Date(ride.createdAt?.toDate()).toLocaleString()}
          </p>
        </div>
        <div className="ride-actions">
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

      <div className="live-ride-content">
        <div className="map-container">
          {ride && ride.driver?.location && ride.destination?.location ? (
            <MapView 
              users={participants}
              destination={{
                ...ride.destination,
                lat: Array.isArray(ride.destination.location) ? ride.destination.location[1] : ride.destination.location.lat,
                lng: Array.isArray(ride.destination.location) ? ride.destination.location[0] : ride.destination.location.lng
              }}
              userLocation={{
                lat: Array.isArray(ride.driver.location) ? ride.driver.location[1] : ride.driver.location.lat,
                lng: Array.isArray(ride.driver.location) ? ride.driver.location[0] : ride.driver.location.lng
              }}
              isLiveRide={true}
            />
          ) : (
            <div className="map-error">
              <div className="alert alert-warning">
                Unable to display map: Invalid location data
              </div>
            </div>
          )}
        </div>

        <div className="ride-details">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Ride Details</h5>
            </div>
            <div className="card-body">
              <div className="participants-list">
                <h6>Participants</h6>
                <ul className="list-group">
                  {participants.map((participant, index) => (
                    <li 
                      key={participant.uid || index} 
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <span className="badge bg-primary me-2">
                          {participant.role}
                        </span>
                        {participant.displayName || 'Unknown User'}
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

              {ride.routeDetails && (
                <div className="route-info mt-4">
                  <h6>Route Information</h6>
                  <div className="route-stats">
                    <div className="stat-item">
                      <i className="bi bi-arrow-right-circle"></i>
                      <span>Distance: {formatDistance(ride.routeDetails.totalDistance)}</span>
                    </div>
                    <div className="stat-item">
                      <i className="bi bi-clock"></i>
                      <span>Duration: {formatDuration(ride.routeDetails.totalDuration)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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

export default LiveRideView; 