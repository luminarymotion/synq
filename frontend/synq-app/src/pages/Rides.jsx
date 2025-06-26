import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { updateRideParticipation } from '../services/firebaseOperations';
import SimpleLoading from '../components/SimpleLoading';
import '../styles/Rides.css';

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

  console.log('Rides component rendered:', {
    user: user?.uid,
    loading,
    error,
    activeRidesCount: activeRides.length,
    searchParams: Object.fromEntries(searchParams.entries())
  });

  // Handle scrolling to specific ride
  useEffect(() => {
    console.log('Scroll effect triggered:', {
      rideId: searchParams.get('rideId'),
      loading,
      activeRidesCount: activeRides.length
    });
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

  // Helper function to handle query errors
  const handleQueryError = (error) => {
    console.log('Handling query error:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });

    if (error.code === 'failed-precondition') {
      // Extract index URL from error message if available
      const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
      const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;
      
      console.log('Index building required:', {
        indexUrl,
        errorMessage: error.message
      });

      if (indexUrl) {
        setError(
          <div>
            <p>We're currently building the necessary database indexes. This usually takes a few minutes.</p>
            <p className="mb-2">You can check the status of the index build here:</p>
            <a 
              href={indexUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm"
            >
              <i className="bi bi-box-arrow-up-right me-1"></i>
              View Index Status
            </a>
            <p className="mt-2 text-muted small">
              Once the index is built, refresh this page to see your rides.
            </p>
          </div>
        );
      } else {
        setError(
          <div>
            <p>We're currently building the necessary database indexes. This usually takes a few minutes.</p>
            <p className="text-muted small">
              Please wait a few minutes and refresh this page to see your rides.
            </p>
          </div>
        );
      }
      setActiveRides([]);
    } else if (error.code === 'permission-denied') {
      console.error('Permission denied:', error);
      setError('You do not have permission to view these rides. Please check your account status.');
    } else if (error.code === 'unavailable') {
      console.error('Service unavailable:', error);
      setError(
        <div>
          <p>The database service is currently unavailable.</p>
          <p className="text-muted small">Please try again in a few minutes.</p>
        </div>
      );
    } else {
      console.error('Unexpected error:', error);
      setError(
        <div>
          <p>An unexpected error occurred while loading rides.</p>
          <p className="text-muted small">Error details: {error.message}</p>
        </div>
      );
    }
    setLoading(false);
  };

  // Add a function to check index status
  const checkIndexStatus = async (indexUrl) => {
    if (!indexUrl) return;
    
    try {
      console.log('Checking index status for:', indexUrl);
      // Extract project ID and index ID from the URL
      const projectIdMatch = indexUrl.match(/project\/([^/]+)/);
      const indexIdMatch = indexUrl.match(/indexes\/([^?]+)/);
      
      if (projectIdMatch && indexIdMatch) {
        const projectId = projectIdMatch[1];
        const indexId = indexIdMatch[1];
        console.log('Index details:', { projectId, indexId });
        
        // You could implement a backend endpoint to check index status
        // For now, we'll just log that we would check it
        console.log('Would check index status for:', { projectId, indexId });
      }
    } catch (error) {
      console.error('Error checking index status:', error);
    }
  };

  useEffect(() => {
    console.log('Main effect triggered:', {
      user: user?.uid,
      rideId: searchParams.get('rideId'),
      timestamp: new Date().toISOString()
    });

    if (!user) {
      console.log('No user found, returning early');
      return;
    }

    const rideId = searchParams.get('rideId');
    console.log('Looking for ride with ID:', rideId);

    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    console.log('Timestamp for 24 hours ago:', twentyFourHoursAgo.toISOString());

    // If we have a specific rideId, query for that ride first
    if (rideId) {
      console.log('Querying for specific ride:', rideId);
      const rideRef = doc(db, 'rides', rideId);
      const unsubscribeSpecific = onSnapshot(rideRef, 
        (doc) => {
          console.log('Specific ride document:', {
            exists: doc.exists(),
            id: doc.id,
            data: doc.data(),
            timestamp: new Date().toISOString()
          });
          
          if (!doc.exists()) {
          console.log('No ride found with ID:', rideId);
            setError('Ride not found');
            setActiveRides([]);
          setLoading(false);
          return;
        }

          const specificRide = {
            id: doc.id,
            ...doc.data()
          };
          console.log('Found specific ride:', {
            ...specificRide,
            timestamp: new Date().toISOString()
          });
        
        // Check if user is either driver or passenger
        const isDriver = specificRide.driver?.uid === user.uid;
        const isPassenger = specificRide.passengerUids?.includes(user.uid);
          
          console.log('User authorization check:', {
            isDriver,
            isPassenger,
            userId: user.uid,
            driverId: specificRide.driver?.uid,
            passengerUids: specificRide.passengerUids
          });
        
        if (!isDriver && !isPassenger) {
          console.log('User is not authorized to view this ride');
          setError('You are not authorized to view this ride');
          setActiveRides([]);
          setLoading(false);
          return;
        }

          setError(null);
        setActiveRides([specificRide]);
        setLoading(false);
        }, 
        (error) => {
          console.error('Error fetching specific ride:', {
            error,
            timestamp: new Date().toISOString()
          });
          handleQueryError(error);
        }
      );

      return () => {
        console.log('Cleaning up specific ride subscription');
        unsubscribeSpecific();
      };
    }

    // If no specific rideId, get all active and recent rides for the user
    console.log('Fetching all active and recent rides for user:', {
      userId: user.uid,
      timestamp: new Date().toISOString()
    });
    
    // Query for active rides where user is driver
    const driverActiveQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', '==', 'active')
    );

    // Query for active rides where user is passenger
    const passengerActiveQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('status', '==', 'active')
    );

    // Query for recent rides (within 24 hours) where user is driver
    const driverRecentQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('createdAt', '>=', twentyFourHoursAgo),
      where('status', '==', 'created')
    );

    // Query for recent rides (within 24 hours) where user is passenger
    const passengerRecentQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('createdAt', '>=', twentyFourHoursAgo),
      where('status', '==', 'created')
    );

    // Query for rides where user has pending invitations
    const pendingInvitationsQuery = query(
      collection(db, 'rides'),
      where(`invitations.${user.uid}.status`, '==', 'pending')
    );

    console.log('Setting up ride listeners');
    const unsubscribeDriverActive = onSnapshot(driverActiveQuery, (snapshot) => {
      console.log('Driver active rides snapshot:', {
        empty: snapshot.empty,
        docs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        timestamp: new Date().toISOString()
      });
      const driverActiveRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'active'
      }));
      
      const unsubscribePassengerActive = onSnapshot(passengerActiveQuery, (passengerSnapshot) => {
        console.log('Passenger active rides snapshot:', passengerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        const passengerActiveRides = passengerSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          type: 'active'
        }));

        const unsubscribeDriverRecent = onSnapshot(driverRecentQuery, (recentSnapshot) => {
          console.log('Driver recent rides snapshot:', recentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          const driverRecentRides = recentSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            type: 'recent'
          }));

          const unsubscribePassengerRecent = onSnapshot(passengerRecentQuery, (finalSnapshot) => {
            console.log('Passenger recent rides snapshot:', finalSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            const passengerRecentRides = finalSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              type: 'recent'
            }));

            const unsubscribePendingInvitations = onSnapshot(pendingInvitationsQuery, (pendingSnapshot) => {
              console.log('Pending invitations snapshot:', pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
              const pendingInvitationRides = pendingSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'invitation'
              }));

              // Combine all rides
              const allRides = [
                ...driverActiveRides,
                ...passengerActiveRides,
                ...driverRecentRides,
                ...passengerRecentRides,
                ...pendingInvitationRides
              ];

              // Deduplicate and sort rides
              const uniqueRides = Array.from(
                new Map(allRides.map(ride => [ride.id, ride])).values()
              ).filter(ride => {
                // Filter out rides where user has declined invitation
                if (ride.invitations && ride.invitations[user.uid]) {
                  const userInvitation = ride.invitations[user.uid];
                  if (userInvitation.status === 'declined') {
                    console.log('Filtering out declined ride:', ride.id);
                    return false;
                  }
                }
                return true;
              }).sort((a, b) => {
                // First sort by type (active rides first, then invitations, then recent)
                if (a.type !== b.type) {
                  if (a.type === 'active') return -1;
                  if (b.type === 'active') return 1;
                  if (a.type === 'invitation') return -1;
                  if (b.type === 'invitation') return 1;
                  return a.type === 'recent' ? -1 : 1;
                }
                // Then sort by creation time
                if (a.createdAt && b.createdAt) {
                  return b.createdAt.toDate() - a.createdAt.toDate();
                }
                return b.id.localeCompare(a.id);
              });
            
              console.log('Final unique rides:', uniqueRides);
              setError(null);
              setActiveRides(uniqueRides);
              setLoading(false);
            }, (error) => {
              console.error('Error fetching pending invitations:', error);
              handleQueryError(error);
            });

            return () => unsubscribePendingInvitations();
          }, (error) => {
            console.error('Error fetching passenger recent rides:', error);
            handleQueryError(error);
          });

          return () => unsubscribePassengerRecent();
        }, (error) => {
          console.error('Error fetching driver recent rides:', error);
          handleQueryError(error);
        });

        return () => unsubscribeDriverRecent();
      }, (error) => {
        console.error('Error fetching passenger active rides:', error);
        handleQueryError(error);
      });

      return () => unsubscribePassengerActive();
    }, (error) => {
      console.error('Error fetching driver active rides:', {
        error,
        timestamp: new Date().toISOString()
      });
      handleQueryError(error);
    });

    return () => {
      console.log('Cleaning up all ride subscriptions');
      unsubscribeDriverActive();
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
      setLeavingRideId(rideId);
      const rideDoc = await getDoc(doc(db, 'rides', rideId));
      if (!rideDoc.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = rideDoc.data();
      const isDriver = rideData.driverId === user.uid;

      // Use updateRideParticipation instead of leaveRide
      const result = await updateRideParticipation(rideId, user.uid, 'left');
      if (!result.success) {
        throw new Error(result.error || 'Failed to leave ride');
      }

      // Update local state
      setActiveRides(prevRides => prevRides.filter(ride => ride.id !== rideId));
    } catch (error) {
      console.error('Error leaving ride:', error);
      setError(error.message || 'Failed to leave ride');
    } finally {
      setLeavingRideId(null);
    }
  };

  console.log('Before render:', {
    loading,
    error,
    activeRidesCount: activeRides.length
  });

  if (loading) {
    console.log('Rendering loading state');
    return (
      <SimpleLoading 
        message="Loading your rides..."
        size="large"
      />
    );
  }

  if (error) {
    console.log('Rendering error state:', {
      error,
      timestamp: new Date().toISOString()
    });
    return (
      <div className="rides-page-container">
        <div className="rides-content-wrapper">
          <div className="alert alert-warning" role="alert">
            {typeof error === 'string' ? error : error}
          </div>
        </div>
      </div>
    );
  }

  console.log('Rendering main content');
  return (
    <div className="rides-page-container">
      <div className="rides-content-wrapper">
        <div className="rides-header">
          <h2>Your Rides</h2>
          <Link to="/create-group" className="btn btn-primary">
            <i className="bi bi-plus-circle me-2"></i>
            Create New Group
          </Link>
        </div>

        {/* Active Rides Section */}
        <div className="card mb-4">
          <div className="card-header">
            <h3 className="card-title mb-0">Active Rides</h3>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : activeRides.length === 0 ? (
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
                  <div key={ride.id} id={`ride-${ride.id}`} className={`ride-container mb-4 ${ride.type === 'recent' ? 'recent-ride' : ''} ${ride.type === 'invitation' ? 'invitation-ride' : ''}`}>
                    <div className="card">
                      <div className={`card-header ${ride.type === 'recent' ? 'bg-info bg-opacity-10' : ride.type === 'invitation' ? 'bg-warning bg-opacity-10' : 'bg-light'}`}>
                        <div className="d-flex justify-content-between align-items-center">
                          <h4 className="mb-0">
                            <Link to={`/rides/${ride.id}`} className="text-decoration-none">
                            <span className="badge bg-primary me-2">{ride.id}</span>
                            {ride.destination?.address}
                              {ride.type === 'recent' && (
                                <span className="badge bg-info ms-2">New</span>
                              )}
                              {ride.type === 'invitation' && (
                                <span className="badge bg-warning ms-2">Invitation</span>
                              )}
                            </Link>
                          </h4>
                          <div className="d-flex align-items-center gap-2">
                            <span className={`badge ${ride.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                              {ride.status}
                            </span>
                            {(ride.status === 'active' || ride.type === 'recent' || ride.type === 'invitation') && (
                              <>
                                <Link 
                                  to={`/rides/${ride.id}`}
                                  className="btn btn-outline-primary btn-sm"
                                >
                                  <i className="bi bi-map me-2"></i>
                                  {ride.type === 'invitation' ? 'Respond' : 'View Live'}
                                </Link>
                                {ride.status === 'active' && ride.type !== 'invitation' && (
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
                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                        Leaving...
                                      </>
                                    ) : (
                                      <>
                                        <i className="bi bi-box-arrow-right me-1"></i>
                                        Leave Ride
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
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
          .rides-page-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
            background-color: #f8f9fa;
          }

          .rides-content-wrapper {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
          }

          .rides-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
          }

          .rides-header h2 {
            margin: 0;
            color: #2c3e50;
          }

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

          .invitation-ride {
            border-left: 4px solid #ffc107;
          }

          .invitation-ride .card-header {
            background: linear-gradient(135deg, #fff3cd, #ffeaa7);
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

          .btn-outline-primary {
            border-color: #2196F3;
            color: #2196F3;
            transition: all 0.2s ease-in-out;
          }

          .btn-outline-primary:hover:not(:disabled) {
            background-color: #2196F3;
            color: white;
          }

          .btn-outline-primary:disabled {
            opacity: 0.65;
            cursor: not-allowed;
          }

          .text-decoration-none {
            color: inherit;
          }

          .text-decoration-none:hover {
            color: #2196F3;
          }

          .recent-ride {
            border-left: 4px solid #0dcaf0;
          }

          .recent-ride .card {
            border-color: #0dcaf0;
          }

          .recent-ride .card-header {
            border-bottom-color: #0dcaf0;
          }

          .badge.bg-info {
            background-color: #0dcaf0 !important;
            color: #000;
          }
        `}</style>
      </div>
    </div>
  );
}

export default Rides; 