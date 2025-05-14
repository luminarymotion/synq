import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { leaveRide } from '../services/firebaseOperations';

/*
 * Rides Page Component
 * 
 * This page will serve as the central hub for all ride-related information:
 * - Active rides (moved from dashboard)
 * - Ride history
 * - Ride statistics
 * - Ride preferences
 * - Group rides
 * - Ride invitations
 * 
 * The dashboard's "Your Active Rides" section will be moved here
 * to provide a more comprehensive ride management experience.
 */

function Rides() {
  const { user } = useUserAuth();
  const [searchParams] = useSearchParams();
  const [activeRides, setActiveRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leavingRideId, setLeavingRideId] = useState(null);

  // Handle scrolling to specific ride
  useEffect(() => {
    const rideId = searchParams.get('rideId');
    if (rideId && !loading && activeRides.length > 0) {
      const rideElement = document.getElementById(`ride-${rideId}`);
      if (rideElement) {
        console.log('Scrolling to ride element:', rideElement);
        rideElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        rideElement.classList.add('highlight-ride');
        setTimeout(() => {
          rideElement.classList.remove('highlight-ride');
        }, 2000);
      } else {
        console.log('Ride element not found in DOM');
      }
    }
  }, [searchParams, loading, activeRides]);

  useEffect(() => {
    if (!user) return;

    const rideId = searchParams.get('rideId');
    console.log('Looking for ride with ID:', rideId);

    // If we have a specific rideId, query for that ride first
    if (rideId) {
      const specificRideQuery = query(
        collection(db, 'rides'),
        where('rideId', '==', rideId)
      );

      const unsubscribeSpecific = onSnapshot(specificRideQuery, (snapshot) => {
        if (snapshot.empty) {
          console.log('No ride found with ID:', rideId);
          setError(null); // Clear any existing error
          setActiveRides([]); // Set empty rides array
          setLoading(false);
          return;
        }

        const specificRide = snapshot.docs[0].data();
        console.log('Found specific ride:', specificRide);
        
        // Check if user is either driver or passenger
        const isDriver = specificRide.driver?.uid === user.uid;
        const isPassenger = specificRide.passengerUids?.includes(user.uid);
        
        if (!isDriver && !isPassenger) {
          console.log('User is not authorized to view this ride');
          setError('You are not authorized to view this ride');
          setActiveRides([]);
          setLoading(false);
          return;
        }

        setError(null); // Clear any existing error
        setActiveRides([specificRide]);
        setLoading(false);
      }, (error) => {
        console.error('Error fetching specific ride:', error);
        setError('Failed to load ride details');
        setActiveRides([]);
        setLoading(false);
      });

      return () => unsubscribeSpecific();
    }

    // If no specific rideId, get all active rides for the user
    console.log('Fetching all active rides for user');
    
    // Split the queries to avoid composite index requirement
    const driverRidesQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', '==', 'active')
    );

    const passengerRidesQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('status', '==', 'active')
    );

    const unsubscribeDriver = onSnapshot(driverRidesQuery, (snapshot) => {
      const driverRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Get passenger rides
      onSnapshot(passengerRidesQuery, (passengerSnapshot) => {
        const passengerRides = passengerSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Combine and deduplicate rides, then sort by createdAt
        const allRides = [...driverRides, ...passengerRides];
        const uniqueRides = Array.from(new Map(allRides.map(ride => [ride.id, ride])).values())
          .sort((a, b) => {
            // Sort by createdAt if available, otherwise by id
            if (a.createdAt && b.createdAt) {
              return b.createdAt.toDate() - a.createdAt.toDate();
            }
            return b.id.localeCompare(a.id);
          });
        
        console.log('Found rides:', uniqueRides);
        setError(null); // Clear any existing error
        setActiveRides(uniqueRides);
        setLoading(false);
      }, (error) => {
        console.error('Error fetching passenger rides:', error);
        if (error.code === 'failed-precondition') {
          // Handle index requirement error
          console.log('Index not available, fetching without orderBy');
          setError(null);
          setActiveRides([]);
        } else {
          setError('Failed to load rides');
        }
        setLoading(false);
      });
    }, (error) => {
      console.error('Error fetching driver rides:', error);
      if (error.code === 'failed-precondition') {
        // Handle index requirement error
        console.log('Index not available, fetching without orderBy');
        setError(null);
        setActiveRides([]);
      } else {
        setError('Failed to load rides');
      }
      setLoading(false);
    });

    return () => {
      unsubscribeDriver();
    };
  }, [user, searchParams]);

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateETA = (createdAt) => {
    if (!createdAt) return 'N/A';
    const startTime = createdAt.toDate();
    const now = new Date();
    const duration = Math.round((now - startTime) / 1000 / 60); // in minutes
    return `${duration} min ago`;
  };

  const handleLeaveRide = async (rideId) => {
    try {
      if (!rideId) {
        throw new Error('Ride ID is required');
      }

      setLeavingRideId(rideId);
      console.log('Attempting to leave ride:', rideId);
      
      // Find the ride using the id field instead of rideId
      const ride = activeRides.find(r => r.id === rideId);
      if (!ride) {
        throw new Error('Ride not found in active rides');
      }

      const isDriver = ride?.driver?.uid === user.uid;
      console.log('User role:', isDriver ? 'driver' : 'passenger');
      
      const result = await leaveRide(rideId, user.uid, isDriver);
      
      if (result.success) {
        console.log('Successfully left the ride');
      } else {
        throw new Error(result.error || 'Failed to leave ride');
      }
    } catch (error) {
      console.error('Error leaving ride:', error);
      alert(error.message || 'Failed to leave ride. Please try again.');
    } finally {
      setLeavingRideId(null);
    }
  };

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Only show error message for actual errors
  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Your Rides</h2>
        <Link to="/create-group" className="btn btn-primary">
          <i className="bi bi-plus-circle me-2"></i>
          Create New Ride
        </Link>
      </div>

      {/* Active Rides Section */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title mb-0">Active Rides</h3>
        </div>
        <div className="card-body">
          {activeRides.length === 0 ? (
            <div className="text-center py-5">
              <div className="mb-4">
                <i className="bi bi-car-front" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
              </div>
              <h4 className="text-muted mb-3">No Active Rides</h4>
              <p className="text-muted mb-4">You don't have any active rides at the moment.</p>
              <Link to="/create-group" className="btn btn-primary">
                <i className="bi bi-plus-circle me-2"></i>
                Create Your First Ride
              </Link>
            </div>
          ) : (
            <div className="rides-list">
              {activeRides.map((ride) => (
                <div key={ride.id} id={`ride-${ride.id}`} className="ride-container mb-4">
                  <div className="card">
                    <div className="card-header bg-light">
                      <div className="d-flex justify-content-between align-items-center">
                        <h4 className="mb-0">
                          <span className="badge bg-primary me-2">{ride.id}</span>
                          {ride.destination?.address}
                        </h4>
                        <div className="d-flex align-items-center gap-2">
                          <span className={`badge ${ride.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                            {ride.status}
                          </span>
                          {ride.status === 'active' && (
                            <button
                              className={`btn btn-outline-danger btn-sm ${leavingRideId === ride.id ? 'disabled' : ''}`}
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to leave ride ${ride.id}?`)) {
                                  handleLeaveRide(ride.id);
                                }
                              }}
                              disabled={leavingRideId === ride.id}
                            >
                              {leavingRideId === ride.id ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                  Leaving...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-x-circle me-2"></i>
                                  Leave Ride
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-6">
                          <h5>Driver Information</h5>
                          <div className="mb-3">
                            <strong>Name:</strong> {ride.driver?.name}
                            <br />
                            <strong>Location:</strong> {ride.driver?.address}
                          </div>
                        </div>
                        <div className="col-md-6">
                          <h5>Ride Details</h5>
                          <div className="mb-3">
                            <strong>Ride ID:</strong> {ride.id}
                            <br />
                            <strong>Started:</strong> {formatTime(ride.createdAt)}
                            <br />
                            <strong>Duration:</strong> {calculateETA(ride.createdAt)}
                            <br />
                            <strong>Passengers:</strong> {ride.passengers?.length || 0}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h5>Passengers</h5>
                        <div className="list-group">
                          {ride.passengers?.map((passenger, index) => (
                            <div key={index} className="list-group-item">
                              <div className="d-flex justify-content-between align-items-center">
                                <div>
                                  <strong>{passenger.name}</strong>
                                  <br />
                                  <small className="text-muted">{passenger.address}</small>
                                </div>
                                <span className={`badge ${
                                  passenger.status === 'pending' ? 'bg-warning' :
                                  passenger.status === 'picked-up' ? 'bg-success' :
                                  'bg-secondary'
                                }`}>
                                  {passenger.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .rides-list {
          display: grid;
          gap: 1rem;
        }

        .ride-container {
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .ride-container:hover {
          transform: translateY(-2px);
        }

        .highlight-ride {
          animation: highlight 2s ease-out;
        }

        @keyframes highlight {
          0% {
            box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(33, 150, 243, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(33, 150, 243, 0);
          }
        }

        .card {
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .card-header {
          border-bottom: 1px solid rgba(0,0,0,0.1);
        }

        .badge {
          font-size: 0.9em;
          padding: 0.5em 1em;
        }

        .list-group-item {
          border: 1px solid rgba(0,0,0,0.1);
          margin-bottom: 0.5rem;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .card-header h4 {
            font-size: 1.1rem;
          }
        }

        .btn-outline-danger {
          border-color: #dc3545;
          color: #dc3545;
          transition: all 0.2s ease-in-out;
        }

        .btn-outline-danger:hover:not(:disabled) {
          background-color: #dc3545;
          color: white;
        }

        .btn-outline-danger:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .gap-2 {
          gap: 0.5rem;
        }
      `}</style>
    </div>
  );
}

export default Rides; 