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
import { 
  getFriendsList,
  subscribeToFriendRequests,
  subscribeToFriendsList
} from '../services/firebaseOperations';

function Dashboard() {
  const { user } = useUserAuth();
  const [loading, setLoading] = useState(true);
  const [activeRides, setActiveRides] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState(null);
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

  // Load friends when component mounts
  useEffect(() => {
    if (!user) return;

    // Subscribe to friend requests
    const unsubscribeRequests = subscribeToFriendRequests(user.uid, (result) => {
      if (result.success) {
        setFriendRequests(result.requests);
      }
    });

    // Subscribe to friends list
    const unsubscribeFriends = subscribeToFriendsList(user.uid, (result) => {
      if (result.success) {
        setFriends(result.friends);
      }
    });

    // Cleanup subscriptions
    return () => {
      unsubscribeRequests();
      unsubscribeFriends();
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
            <h2>Friends</h2>
          </div>
          <div className="card-body">
            {isLoadingFriends ? (
              <div className="loading-friends">Loading friends...</div>
            ) : friendError ? (
              <div className="friend-error">{friendError}</div>
            ) : (
              <>
                {/* Friend Requests */}
                {friendRequests.length > 0 && (
                  <div className="friend-requests">
                    <h4>Friend Requests</h4>
                    {friendRequests.map(request => (
                      <div key={request.id} className="friend-request-item">
                        <div className="request-info">
                          <img 
                            src={request.senderProfile.photoURL || '/default-avatar.png'} 
                            alt={request.senderProfile.displayName} 
                            className="request-avatar"
                          />
                          <div className="request-details">
                            <span className="request-name">{request.senderProfile.displayName}</span>
                            <span className="request-email">{request.senderProfile.email}</span>
                            {request.message && (
                              <p className="request-message">{request.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="request-actions">
                          <button 
                            className="accept-button"
                            onClick={() => handleFriendRequest(request.id, 'accepted')}
                          >
                            Accept
                          </button>
                          <button 
                            className="reject-button"
                            onClick={() => handleFriendRequest(request.id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Friends List */}
                <div className="friends-list">
                  {friends.length === 0 ? (
                    <div className="no-friends">No friends yet</div>
                  ) : (
                    friends.map(friend => (
                      <div key={friend.id} className="friend-item">
                        <div className="friend-info">
                          <img 
                            src={friend.profile.photoURL || '/default-avatar.png'} 
                            alt={friend.profile.displayName} 
                            className="friend-avatar"
                          />
                          <div className="friend-details">
                            <span className="friend-name">{friend.profile.displayName}</span>
                            <span className="friend-email">{friend.profile.email}</span>
                          </div>
                        </div>
                        <div className="friend-status">
                          {friend.isOnline ? (
                            <span className="status-online">Online</span>
                          ) : (
                            <span className="status-offline">
                              Last seen: {friend.lastSeen?.toDate().toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
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

      <style>
        {`
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

          .no-rides, .no-friends {
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

          .friend-requests {
            margin-bottom: 2rem;
          }

          .friend-request-item {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1rem;
            transition: all 0.2s;
          }

          .friend-request-item:hover {
            background: #e9ecef;
          }

          .request-info {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
          }

          .request-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            object-fit: cover;
          }

          .request-details {
            flex: 1;
          }
        `}
      </style>
    </div>
  );
}

export default Dashboard; 