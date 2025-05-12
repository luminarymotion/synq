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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Welcome, {user?.displayName || 'User'}</h1>
      </div>
      
      <div className="dashboard-content">
        <div className="card">
          <div className="card-header">
            <h2>Your Active Rides</h2>
          </div>
          <div className="card-body">
            {activeRides.length === 0 ? (
              <p className="no-rides">No active rides at the moment</p>
            ) : (
              <div className="rides-list">
                {activeRides.map((ride) => (
                  <div key={ride.id} className="ride-card">
                    <div className="ride-header">
                      <div className="ride-title">
                        <h3>Ride to {ride.destination?.address || 'Destination'}</h3>
                        <span className="ride-time">
                          Started {calculateETA(ride.createdAt)}
                        </span>
                      </div>
                      <div className="ride-status">
                        <span className={`status-badge ${ride.status}`}>
                          {ride.status}
                        </span>
                      </div>
                    </div>

                    <div className="ride-content">
                      <div className="ride-map">
                        <div 
                          id={`map-${ride.id}`} 
                          className="map-snapshot"
                          style={{ minHeight: '250px', position: 'relative' }}
                        >
                          {!mapsInitialized[ride.id] && (
                            <div className="map-loading">
                              <div className="spinner-border text-primary" role="status">
                                <span className="visually-hidden">Loading map...</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="ride-info">
                        <div className="info-section">
                          <h4>Passengers</h4>
                          <div className="passengers-list">
                            {ride.passengers.map((passenger, index) => (
                              <div key={index} className={`passenger-item ${passenger.status}`}>
                                <span className="passenger-name">{passenger.name}</span>
                                <span className="passenger-status">{passenger.status}</span>
                                <span className="passenger-address">{passenger.address}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="info-section">
                          <h4>Route Details</h4>
                          <div className="route-details">
                            <div className="detail-item">
                              <span className="detail-label">Destination:</span>
                              <span className="detail-value">{ride.destination?.address}</span>
                            </div>
                            <div className="detail-item">
                              <span className="detail-label">Started:</span>
                              <span className="detail-value">{formatTime(ride.createdAt)}</span>
                            </div>
                            <div className="detail-item">
                              <span className="detail-label">Duration:</span>
                              <span className="detail-value">{calculateETA(ride.createdAt)}</span>
                            </div>
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

        <div className="card">
          <div className="card-header">
            <h2>Your Groups</h2>
          </div>
          <div className="card-body">
            <p className="no-groups">No groups yet</p>
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
        }

        .card-header {
          padding: 1.5rem;
          border-bottom: 1px solid #eee;
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

        .rides-list {
          display: grid;
          gap: 1.5rem;
        }

        .ride-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid #eee;
        }

        .ride-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }

        .ride-title h3 {
          margin: 0;
          color: #2196F3;
          font-size: 1.3rem;
        }

        .ride-time {
          color: #666;
          font-size: 0.9rem;
          display: block;
          margin-top: 0.5rem;
        }

        .status-badge {
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .status-badge.active {
          background: #e3f2fd;
          color: #1976D2;
        }

        .ride-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .map-snapshot {
          width: 100%;
          height: 250px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          background: #f8f9fa;
          position: relative;
        }

        .map-loading {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.8);
          z-index: 1;
        }

        .ride-info {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .info-section {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .info-section h4 {
          margin: 0 0 1rem 0;
          color: #333;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .passengers-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .passenger-item {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1rem;
          padding: 0.75rem;
          border-radius: 6px;
          background: #f8f9fa;
          font-size: 0.9rem;
        }

        .passenger-name {
          font-weight: 500;
          color: #333;
        }

        .passenger-status {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .passenger-status.pending {
          background: #fff3cd;
          color: #856404;
        }

        .passenger-status.picked-up {
          background: #d4edda;
          color: #155724;
        }

        .passenger-status.completed {
          background: #cce5ff;
          color: #004085;
        }

        .passenger-address {
          grid-column: 1 / -1;
          color: #666;
          font-size: 0.85rem;
        }

        .route-details {
          display: grid;
          gap: 0.75rem;
        }

        .detail-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 1rem;
          align-items: center;
        }

        .detail-label {
          color: #666;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .detail-value {
          color: #333;
          font-size: 0.9rem;
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
          .ride-content {
            grid-template-columns: 1fr;
          }

          .map-snapshot {
            height: 200px;
          }
        }
      `}</style>
    </div>
  );
}

export default Dashboard; 