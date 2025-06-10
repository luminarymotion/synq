import React, { useState, useEffect, useRef } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { Map, View } from 'ol';
import { OSM } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Fill, Stroke, Circle as CircleStyle, Icon } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { LineString } from 'ol/geom';
import 'ol/ol.css';
import '../styles/Dashboard.css';
import { Link } from 'react-router-dom';
import RideHistory from '../components/RideHistory';
import { getPendingRideInvitations, updateRideInvitation } from '../services/firebaseOperations';

function Dashboard() {
  const { user } = useUserAuth();
  const [loading, setLoading] = useState(true);
  const [activeRides, setActiveRides] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [processingInvitation, setProcessingInvitation] = useState(null);
  const mapRefs = useRef({});
  const [mapsInitialized, setMapsInitialized] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;

    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

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

    console.log('Setting up ride listeners for dashboard');
    const unsubscribeDriverActive = onSnapshot(driverActiveQuery, (snapshot) => {
      console.log('Driver active rides snapshot:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

            // Combine all rides
            const allRides = [
              ...driverActiveRides,
              ...passengerActiveRides,
              ...driverRecentRides,
              ...passengerRecentRides
            ];

            // Deduplicate and sort rides
            const seenIds = new Set();
            const uniqueRides = allRides
              .filter(ride => {
                if (seenIds.has(ride.id)) {
                  return false;
                }
                seenIds.add(ride.id);
                return true;
              })
              .sort((a, b) => {
                // First sort by type (active rides first)
                if (a.type !== b.type) {
                  return a.type === 'active' ? -1 : 1;
                }
                // Then sort by creation time
                if (a.createdAt && b.createdAt) {
                  return b.createdAt.toDate() - a.createdAt.toDate();
                }
                return b.id.localeCompare(a.id);
              });

            console.log('Final unique rides for dashboard:', uniqueRides);
            setActiveRides(uniqueRides);
            setLoading(false);
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
      console.error('Error fetching driver active rides:', error);
      handleQueryError(error);
    });

    return () => unsubscribeDriverActive();
  }, [user]);

  // Add new useEffect for pending invitations
  useEffect(() => {
    if (!user) return;

    console.log('Setting up invitations listener for user:', user.uid, 'email:', user.email);

    // Query for pending invitations
    const invitationsQuery = query(
      collection(db, 'rideInvitations'),
      where('inviteeId', '==', user.uid),
      where('status', '==', 'pending')
    );

    console.log('Created invitations query:', invitationsQuery);

    // Set up real-time listener
    const unsubscribe = onSnapshot(invitationsQuery, 
      async (snapshot) => {
        try {
          console.log('Received invitations snapshot:', {
            empty: snapshot.empty,
            size: snapshot.size,
            docs: snapshot.docs.map(doc => ({
              id: doc.id,
              data: doc.data()
            }))
          });
          
          const invitations = await Promise.all(
            snapshot.docs.map(async (doc) => {
              try {
                const invitationData = doc.data();
                console.log('Processing invitation:', {
                  id: doc.id,
                  inviteeId: invitationData.inviteeId,
                  rideId: invitationData.rideId,
                  status: invitationData.status
                });
                
                // Get ride details
                const rideDoc = await getDoc(doc(db, 'rides', invitationData.rideId));
                console.log('Fetched ride document:', {
                  exists: rideDoc.exists(),
                  rideId: invitationData.rideId,
                  data: rideDoc.exists() ? rideDoc.data() : null
                });
                
                return {
                  id: doc.id,
                  ...invitationData,
                  ride: rideDoc.exists() ? rideDoc.data() : null
                };
              } catch (docError) {
                console.error('Error processing invitation document:', docError);
                return null;
              }
            })
          );

          // Filter out any null values from failed document processing
          const validInvitations = invitations.filter(inv => inv !== null);
          console.log('Final processed invitations:', validInvitations);
          setPendingInvitations(validInvitations);
        } catch (error) {
          console.error('Error processing invitations snapshot:', error);
          setError('Failed to process invitations. Please try refreshing the page.');
        }
      },
      (error) => {
        console.error('Error in invitations listener:', error);
        console.error('Full error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        
        if (error.code === 'permission-denied') {
          console.error('Permission denied accessing invitations. Please check Firebase security rules.');
          setError('You do not have permission to view invitations. Please contact support.');
        } else if (error.code === 'failed-precondition') {
          console.log('Index not ready, falling back to simple query');
          // Use a simpler query without expiration check
          const simpleQuery = query(
            collection(db, 'rideInvitations'),
            where('inviteeId', '==', user.uid),
            where('status', '==', 'pending')
          );

          console.log('Created fallback query:', simpleQuery);

          // Set up a new listener with the simple query
          const simpleUnsubscribe = onSnapshot(simpleQuery,
            async (snapshot) => {
              try {
                console.log('Received fallback invitations snapshot:', {
                  empty: snapshot.empty,
                  size: snapshot.size,
                  docs: snapshot.docs.map(doc => ({
                    id: doc.id,
                    data: doc.data()
                  }))
                });
                
                const invitations = await Promise.all(
                  snapshot.docs.map(async (doc) => {
                    try {
                      const invitationData = doc.data();
                      console.log('Processing fallback invitation:', {
                        id: doc.id,
                        inviteeId: invitationData.inviteeId,
                        rideId: invitationData.rideId,
                        status: invitationData.status
                      });
                      
                      // Get ride details
                      const rideDoc = await getDoc(doc(db, 'rides', invitationData.rideId));
                      return {
                        id: doc.id,
                        ...invitationData,
                        ride: rideDoc.exists() ? rideDoc.data() : null
                      };
                    } catch (docError) {
                      console.error('Error processing fallback invitation document:', docError);
                      return null;
                    }
                  })
                );

                // Filter out any null values from failed document processing
                const validInvitations = invitations.filter(inv => inv !== null);
                console.log('Final processed fallback invitations:', validInvitations);
                setPendingInvitations(validInvitations);
              } catch (error) {
                console.error('Error processing fallback invitations snapshot:', error);
                setError('Failed to process invitations. Please try refreshing the page.');
              }
            },
            (fallbackError) => {
              console.error('Error in fallback invitations listener:', fallbackError);
              console.error('Full fallback error details:', {
                code: fallbackError.code,
                message: fallbackError.message,
                stack: fallbackError.stack
              });
              setError('Failed to load invitations. Please try refreshing the page.');
            }
          );

          return simpleUnsubscribe;
        } else {
          setError('Failed to load invitations. Please try refreshing the page.');
        }
      }
    );

    return () => {
      console.log('Cleaning up invitations listener for user:', user.uid);
      unsubscribe();
    };
  }, [user]);

  // Helper function to handle query errors
  const handleQueryError = (error) => {
    if (error.code === 'failed-precondition') {
      console.log('Index not available, fetching without orderBy');
      setError('Please wait while we update our database indexes');
      setActiveRides([]);
    } else {
      setError('Failed to load rides');
    }
    setLoading(false);
  };

  // Separate useEffect for map initialization
  useEffect(() => {
    if (!loading && activeRides.length > 0) {
      activeRides.forEach(ride => {
        if (!mapsInitialized[ride.id]) {
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            initializeMap(ride);
            setMapsInitialized(prev => ({ ...prev, [ride.id]: true }));
          });
        }
      });
    }
  }, [loading, activeRides, mapsInitialized]);

  const initializeMap = (ride) => {
    const mapElement = document.getElementById(`map-${ride.id}`);
    if (!mapElement) {
      console.log(`Map element not found for ride ${ride.id}`);
      return;
    }

    if (mapRefs.current[ride.id]) {
      console.log(`Map already initialized for ride ${ride.id}`);
      return;
    }

    console.log(`Initializing map for ride ${ride.id}`, ride);

    try {
      const vectorSource = new VectorSource();
      const vectorLayer = new VectorLayer({
        source: vectorSource,
      });

      const map = new Map({
        target: mapElement,
        layers: [
          new TileLayer({
            source: new OSM({
              url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
            })
          }),
          vectorLayer
        ],
        view: new View({
          center: fromLonLat([-96.7970, 32.7767]), // Default to Dallas
          zoom: 12,
        }),
        controls: [] // Remove controls for snapshot view
      });

      // Add features to the map
      const features = [];

      // Add driver location
      if (ride.driver?.location) {
        console.log('Adding driver location:', ride.driver.location);
        const driverFeature = new Feature({
          geometry: new Point(fromLonLat([ride.driver.location.lng, ride.driver.location.lat])),
        });
        driverFeature.setStyle(new Style({
          image: new Icon({
            src: 'https://img.icons8.com/ios-filled/50/4CAF50/marker.png',
            scale: 0.6,
            anchor: [0.5, 1],
          }),
        }));
        features.push(driverFeature);
      }

      // Add passenger locations
      ride.passengers.forEach((passenger, index) => {
        if (passenger.location) {
          console.log(`Adding passenger ${index} location:`, passenger.location);
          const passengerFeature = new Feature({
            geometry: new Point(fromLonLat([passenger.location.lng, passenger.location.lat])),
          });
          passengerFeature.setStyle(new Style({
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color: '#FF9800' }),
              stroke: new Stroke({ color: '#fff', width: 2 }),
            }),
          }));
          features.push(passengerFeature);
        }
      });

      // Add destination
      if (ride.destination?.location) {
        console.log('Adding destination location:', ride.destination.location);
        const destFeature = new Feature({
          geometry: new Point(fromLonLat([ride.destination.location.lng, ride.destination.location.lat])),
        });
        destFeature.setStyle(new Style({
          image: new Icon({
            src: 'https://img.icons8.com/ios-filled/50/fa314a/marker.png',
            scale: 0.6,
            anchor: [0.5, 1],
          }),
        }));
        features.push(destFeature);
      }

      vectorSource.addFeatures(features);

      // Fit view to all features
      if (features.length > 0) {
        const extent = boundingExtent(features.map(f => f.getGeometry().getCoordinates()));
        map.getView().fit(extent, {
          padding: [20, 20, 20, 20],
          maxZoom: 14,
          duration: 0
        });
      }

      mapRefs.current[ride.id] = map;
      console.log(`Map initialized successfully for ride ${ride.id}`);
    } catch (error) {
      console.error(`Error initializing map for ride ${ride.id}:`, error);
    }
  };

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

  const handleInvitationResponse = async (invitationId, status) => {
    try {
      setProcessingInvitation(invitationId);
      const result = await updateRideInvitation(invitationId, status);
      
      if (result.success) {
        // Update local state
        setPendingInvitations(prev => 
          prev.filter(inv => inv.id !== invitationId)
        );
      } else {
        console.error('Error updating invitation:', result.error);
        setError('Failed to update invitation. Please try again.');
      }
    } catch (error) {
      console.error('Error in handleInvitationResponse:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setProcessingInvitation(null);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="dashboard-header">
        <h1>Welcome, {user?.displayName || 'User'}</h1>
      </div>
      
      <div className="dashboard-content">
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h2>Your Active Rides</h2>
            <Link to="/rides" className="btn btn-outline-primary btn-sm">
              View All Rides
            </Link>
          </div>
          <div className="card-body">
            {activeRides.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-muted mb-3">No active rides at the moment</p>
                <Link to="/create-group" className="btn btn-primary">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create New Ride
                </Link>
              </div>
            ) : (
              <div className="rides-grid">
                {activeRides.map((ride) => (
                  <Link 
                    to={`/rides/${ride.id}`} 
                    key={ride.id} 
                    className={`ride-card text-decoration-none ${ride.type === 'recent' ? 'recent-ride' : ''}`}
                  >
                    <div className="card h-100">
                      <div className={`card-body ${ride.type === 'recent' ? 'border-start border-info border-4' : ''}`}>
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <div>
                            <h5 className="card-title mb-1">
                              <span className="badge bg-primary me-2">{ride.id}</span>
                              {ride.destination?.address}
                              {ride.type === 'recent' && (
                                <span className="badge bg-info ms-2">New</span>
                              )}
                            </h5>
                            <p className="text-muted small mb-0">
                              Started {calculateETA(ride.createdAt)}
                            </p>
                          </div>
                          <div className="d-flex gap-2">
                            <span className={`badge ${
                              ride.status === 'active' ? 'bg-success' : 'bg-secondary'
                            }`}>
                              {ride.status}
                            </span>
                            {ride.type === 'recent' && (
                              <span className="badge bg-info">Recent</span>
                            )}
                          </div>
                        </div>

                        <div className="ride-info">
                          <div className="info-item">
                            <i className="bi bi-person-fill me-2"></i>
                            <span>{ride.driver?.name}</span>
                          </div>
                          <div className="info-item">
                            <i className="bi bi-people-fill me-2"></i>
                            <span>{ride.passengers?.length || 0} passengers</span>
                          </div>
                          <div className="info-item">
                            <i className="bi bi-clock-fill me-2"></i>
                            <span>{formatTime(ride.createdAt)}</span>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="progress" style={{ height: '4px' }}>
                            <div 
                              className={`progress-bar ${ride.type === 'recent' ? 'bg-info' : 'bg-success'}`}
                              role="progressbar" 
                              style={{ width: ride.type === 'recent' ? '10%' : '25%' }}
                            ></div>
                          </div>
                          <small className="text-muted mt-2 d-block">
                            {ride.type === 'recent' ? 'Ride created' : 'Ride in progress'}
                          </small>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Your Groups</h2>
          </div>
          <div className="card-body">
            {pendingInvitations.length === 0 ? (
              <p className="no-groups">No pending invitations</p>
            ) : (
              <div className="invitations-list">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className="invitation-item">
                    <div className="invitation-content">
                      <div className="inviter-info">
                        <img 
                          src={invitation.inviterPhotoURL || '/default-avatar.png'} 
                          alt={invitation.inviterName}
                          className="inviter-avatar"
                        />
                        <div className="invitation-details">
                          <h5>{invitation.inviterName} invited you to join their ride</h5>
                          {invitation.ride && (
                            <div className="ride-details">
                              <p className="destination">
                                <i className="fas fa-map-marker-alt"></i>
                                {invitation.ride.destination?.address}
                              </p>
                              <p className="time">
                                <i className="fas fa-clock"></i>
                                Created {new Date(invitation.createdAt?.toDate()).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="invitation-actions">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleInvitationResponse(invitation.id, 'accepted')}
                          disabled={processingInvitation === invitation.id}
                        >
                          {processingInvitation === invitation.id ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-1"></span>
                              Processing...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-check me-1"></i>
                              Accept
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleInvitationResponse(invitation.id, 'declined')}
                          disabled={processingInvitation === invitation.id}
                        >
                          {processingInvitation === invitation.id ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-1"></span>
                              Processing...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-times me-1"></i>
                              Decline
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ride History Section */}
        <div className="row mt-4">
          <div className="col-12">
            <RideHistory limit={5} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .dashboard-container {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .dashboard-header {
          margin-bottom: 2rem;
        }

        .dashboard-header h1 {
          color: #333;
          font-size: 2rem;
          font-weight: 600;
        }

        .dashboard-content {
          display: grid;
          gap: 2rem;
        }

        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          border: none;
        }

        .card-header {
          padding: 1.5rem;
          border-bottom: 1px solid #eee;
          background: white;
        }

        .card-header h2 {
          margin: 0;
          color: #333;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .card-body {
          padding: 1.5rem;
        }

        .rides-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .ride-card {
          color: inherit;
          transition: transform 0.2s;
        }

        .ride-card:hover {
          transform: translateY(-2px);
        }

        .ride-card .card {
          transition: box-shadow 0.2s;
        }

        .ride-card:hover .card {
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }

        .card-title {
          color: #2196F3;
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0;
        }

        .ride-info {
          display: grid;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .info-item {
          display: flex;
          align-items: center;
          color: #666;
          font-size: 0.9rem;
        }

        .info-item i {
          color: #2196F3;
        }

        .badge {
          font-size: 0.8em;
          padding: 0.5em 1em;
        }

        .no-rides, .no-groups {
          color: #666;
          text-align: center;
          padding: 2rem;
          background: #f8f9fa;
          border-radius: 8px;
          margin: 0;
        }

        .loading-spinner {
          width: 50px;
          height: 50px;
          border: 5px solid #f3f3f3;
          border-top: 5px solid #2196F3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 2rem auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .rides-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-container {
            padding: 1rem;
          }

          .card-header {
            padding: 1rem;
          }

          .card-body {
            padding: 1rem;
          }
        }

        .recent-ride .card {
          border-color: #0dcaf0;
        }

        .recent-ride .card-body {
          background-color: rgba(13, 202, 240, 0.05);
        }

        .badge.bg-info {
          background-color: #0dcaf0 !important;
          color: #000;
        }

        .border-info {
          border-color: #0dcaf0 !important;
        }

        .progress-bar.bg-info {
          background-color: #0dcaf0 !important;
        }

        .invitations-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .invitation-item {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
          transition: all 0.2s;
        }

        .invitation-item:hover {
          background: #e9ecef;
        }

        .invitation-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .inviter-info {
          display: flex;
          gap: 1rem;
          flex: 1;
        }

        .inviter-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
        }

        .invitation-details {
          flex: 1;
        }

        .invitation-details h5 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
          color: #333;
        }

        .ride-details {
          font-size: 0.875rem;
          color: #666;
        }

        .ride-details p {
          margin: 0.25rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .ride-details i {
          color: #2196F3;
          width: 16px;
        }

        .invitation-actions {
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
        }

        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
        }

        .btn-success {
          background-color: #28a745;
          border-color: #28a745;
        }

        .btn-success:hover {
          background-color: #218838;
          border-color: #1e7e34;
        }

        .btn-outline-danger {
          color: #dc3545;
          border-color: #dc3545;
        }

        .btn-outline-danger:hover {
          background-color: #dc3545;
          color: white;
        }

        .spinner-border {
          width: 1rem;
          height: 1rem;
          border-width: 0.15em;
        }

        @media (max-width: 576px) {
          .invitation-content {
            flex-direction: column;
          }

          .invitation-actions {
            width: 100%;
            justify-content: flex-end;
            margin-top: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

export default Dashboard; 