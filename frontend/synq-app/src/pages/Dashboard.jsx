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
  subscribeToFriendsList,
  getUserRideHistory
} from '../services/firebaseOperations';
import SimpleLoading from '../components/SimpleLoading';

function Dashboard() {
  const { user } = useUserAuth();
  const [loading, setLoading] = useState(true);
  const [allRides, setAllRides] = useState([]);
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState(null);
  const mapRefs = useRef({});
  const [mapsInitialized, setMapsInitialized] = useState({});
  const [error, setError] = useState(null);

  // Helper function to handle query errors
  const handleQueryError = (error) => {
    console.error('Query error:', error);
    if (error.code === 'failed-precondition') {
      setError('Please wait while we update our database indexes');
    } else {
      setError('Failed to load rides');
    }
    setLoading(false);
  };

  // Helper function to format time
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to calculate ETA
  const calculateETA = (createdAt) => {
    if (!createdAt) return 'N/A';
    const startTime = createdAt.toDate();
    const now = new Date();
    const duration = Math.round((now - startTime) / 1000 / 60); // in minutes
    return `${duration} min ago`;
  };

  // Main ride fetching effect
  useEffect(() => {
    if (!user) return;

    console.log('Setting up ride listeners for dashboard');

    // Simple queries that should work with existing indexes
    const queries = [];

    // Query for rides where user is driver
    const driverQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid)
    );
    queries.push({ query: driverQuery, type: 'driver' });

    // Query for rides where user is passenger
    const passengerQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid)
    );
    queries.push({ query: passengerQuery, type: 'passenger' });

    // Set up subscriptions
    const unsubscribes = [];

    queries.forEach(({ query: firestoreQuery, type }) => {
      const unsubscribe = onSnapshot(firestoreQuery, 
        (snapshot) => {
          const rides = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            userType: type
          }));
          console.log(`${type} rides:`, rides);

          // Update all rides state
          setAllRides(prevRides => {
            // Remove rides from this type and add new ones
            const filteredRides = prevRides.filter(ride => ride.userType !== type);
            return [...filteredRides, ...rides];
          });
            setLoading(false);
        },
        handleQueryError
      );
      unsubscribes.push(unsubscribe);
    });

    // Cleanup function
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [user]);

  // Friends loading effect
  useEffect(() => {
    if (!user) return;

    setIsLoadingFriends(true);
    const unsubscribeFriends = subscribeToFriendsList(user.uid, (result) => {
      if (result.success) {
        setFriends(result.friends);
      } else {
        setFriendError(result.error);
      }
      setIsLoadingFriends(false);
    });

    return () => {
      unsubscribeFriends();
    };
  }, [user]);

  // Map initialization effect
  useEffect(() => {
    if (!loading && allRides.length > 0) {
      allRides.forEach(ride => {
        if (!mapsInitialized[ride.id]) {
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            initializeMap(ride);
            setMapsInitialized(prev => ({ ...prev, [ride.id]: true }));
          });
        }
      });
    }
  }, [loading, allRides, mapsInitialized]);

  // Map initialization function
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
      if (ride.passengers) {
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
      }

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

  // Process and sort rides
  const seenIds = new Set();
  const uniqueRides = allRides
    .filter(ride => {
      if (seenIds.has(ride.id)) {
        return false;
      }
      seenIds.add(ride.id);
      
      // Filter out rides where user has declined invitation
      if (ride.invitations && ride.invitations[user?.uid]) {
        const userInvitation = ride.invitations[user.uid];
        if (userInvitation.status === 'declined') {
          console.log('Filtering out declined ride:', ride.id);
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      // Sort by status priority (active first, then created, then others)
      const statusOrder = { active: 0, created: 1, forming: 2, cancelled: 3 };
      const aOrder = statusOrder[a.status] || 4;
      const bOrder = statusOrder[b.status] || 4;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Then sort by creation time (newest first)
      if (a.createdAt && b.createdAt) {
        return b.createdAt.toDate() - a.createdAt.toDate();
      }
      
      return b.id.localeCompare(a.id);
    });

  console.log('Final unique rides for dashboard:', uniqueRides);

  if (loading) {
    return (
      <SimpleLoading 
        message="Loading your dashboard..."
        size="large"
      />
    );
  }

  return (
    <div className="container mt-4">
      <div className="dashboard-header">
        <h1>Welcome, {user?.displayName || 'User'}</h1>
      </div>
      
      <div className="dashboard-content">
        {/* Rides Section */}
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h2>Your Rides</h2>
            <Link to="/rides" className="btn btn-outline-primary btn-sm">
              View All Rides
            </Link>
          </div>
          <div className="card-body">
            {error ? (
              <div className="alert alert-warning">{error}</div>
            ) : uniqueRides.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-muted mb-3">No rides at the moment</p>
                <Link to="/create-group" className="btn btn-primary">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create New Group
                </Link>
              </div>
            ) : (
              <div className="rides-grid">
                {uniqueRides.map((ride) => (
                  <Link 
                    to={`/rides/${ride.id}`} 
                    key={ride.id} 
                    className={`ride-card text-decoration-none ${ride.status === 'created' ? 'recent-ride' : ''}`}
                  >
                    <div className="card h-100">
                      <div className={`card-body ${ride.status === 'created' ? 'border-start border-info border-4' : ''}`}>
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <div>
                            <h5 className="card-title mb-1">
                              <span className="badge bg-primary me-2">{ride.id}</span>
                              {ride.destination?.address || 'Unknown Destination'}
                              {ride.status === 'created' && (
                                <span className="badge bg-info ms-2">New</span>
                              )}
                            </h5>
                            <p className="text-muted small mb-0">
                              Started {calculateETA(ride.createdAt)}
                            </p>
                          </div>
                          <div className="d-flex gap-2">
                            <span className={`badge ${
                              ride.status === 'active' ? 'bg-success' : 
                              ride.status === 'created' ? 'bg-warning' : 
                              ride.status === 'forming' ? 'bg-info' : 'bg-secondary'
                            }`}>
                              {ride.status}
                            </span>
                            <span className={`badge ${
                              ride.userType === 'driver' ? 'bg-primary' : 'bg-secondary'
                            }`}>
                              {ride.userType === 'driver' ? 'Driver' : 'Passenger'}
                            </span>
                          </div>
                        </div>

                        <div className="ride-info">
                          <div className="info-item">
                            <i className="bi bi-person-fill me-2"></i>
                            <span>{ride.driver?.name || 'Unknown Driver'}</span>
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

                        {/* Map Preview */}
                        <div className="map-preview">
                          <div 
                            id={`map-${ride.id}`} 
                            className="ride-map"
                            style={{ height: '120px', width: '100%', borderRadius: '8px' }}
                          ></div>
                        </div>

                        <div className="mt-3">
                          <div className="progress" style={{ height: '4px' }}>
                            <div 
                              className={`progress-bar ${
                                ride.status === 'active' ? 'bg-success' : 
                                ride.status === 'created' ? 'bg-warning' : 'bg-info'
                              }`}
                              role="progressbar" 
                              style={{ 
                                width: ride.status === 'active' ? '75%' : 
                                       ride.status === 'created' ? '25%' : '50%' 
                              }}
                            ></div>
                          </div>
                          <small className="text-muted mt-2 d-block">
                            {ride.status === 'active' ? 'Ride in progress' : 
                             ride.status === 'created' ? 'Ride created' : 
                             ride.status === 'forming' ? 'Forming group' : 'Ride status'}
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

        {/* Friends Section */}
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h2>Friends</h2>
            <Link to="/friends" className="btn btn-outline-primary btn-sm">
              Manage Friends
            </Link>
          </div>
          <div className="card-body">
            {isLoadingFriends ? (
              <div className="loading-friends">Loading friends...</div>
            ) : friendError ? (
              <div className="friend-error">{friendError}</div>
            ) : (
              <div className="friends-list">
                {friends.length === 0 ? (
                  <div className="no-friends">
                    <p>No friends yet</p>
                    <Link to="/friends" className="btn btn-primary">
                      Find Friends
                    </Link>
                  </div>
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

        .friends-list {
          display: grid;
          gap: 1rem;
          }

        .friend-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
            background: #f8f9fa;
            border-radius: 8px;
          transition: background-color 0.2s;
          }

        .friend-item:hover {
            background: #e9ecef;
          }

        .friend-info {
            display: flex;
          align-items: center;
            gap: 1rem;
          }

        .friend-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            object-fit: cover;
          }

        .friend-details {
          display: flex;
          flex-direction: column;
        }

        .friend-name {
          font-weight: 600;
          color: #333;
        }

        .friend-email {
          font-size: 0.9rem;
          color: #666;
        }

        .friend-status {
          text-align: right;
        }

        .status-online {
          color: #28a745;
          font-weight: 600;
        }

        .status-offline {
          color: #6c757d;
          font-size: 0.9rem;
        }

        .map-preview {
          margin: 1rem 0;
        }

        .ride-map {
          border: 1px solid #ddd;
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
        `}
      </style>
    </div>
  );
}

export default Dashboard; 