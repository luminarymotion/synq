import React, { useState, useEffect, useRef } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
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

function Dashboard() {
  const { user } = useUserAuth();
  const [loading, setLoading] = useState(true);
  const [activeRides, setActiveRides] = useState([]);
  const mapRefs = useRef({});
  const [mapsInitialized, setMapsInitialized] = useState({});

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    // Subscribe to active rides
    const ridesQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(ridesQuery, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setActiveRides(rides);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
      // Cleanup maps
      Object.values(mapRefs.current).forEach(map => {
        if (map) map.setTarget(null);
      });
    };
  }, [user.uid]);

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
                    to={`/rides?rideId=${ride.rideId}`} 
                    key={ride.id} 
                    className="ride-card text-decoration-none"
                  >
                    <div className="card h-100">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start mb-3">
                          <div>
                            <h5 className="card-title mb-1">
                              <span className="badge bg-primary me-2">{ride.rideId}</span>
                              {ride.destination?.address}
                            </h5>
                            <p className="text-muted small mb-0">
                              Started {calculateETA(ride.createdAt)}
                            </p>
                          </div>
                          <span className={`badge ${
                            ride.status === 'active' ? 'bg-success' : 'bg-secondary'
                          }`}>
                            {ride.status}
                          </span>
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
                              className="progress-bar bg-success" 
                              role="progressbar" 
                              style={{ width: '25%' }}
                            ></div>
                          </div>
                          <small className="text-muted mt-2 d-block">
                            Ride in progress
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
            <p className="no-groups">No groups yet</p>
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
      `}</style>
    </div>
  );
}

export default Dashboard; 