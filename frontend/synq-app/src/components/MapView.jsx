import React, { useEffect, useRef, useState, useCallback } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import { OSM } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Fill, Stroke, Circle as CircleStyle, Icon, Text } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { defaults as defaultControls } from 'ol/control';
import { LineString } from 'ol/geom';
import { calculateRoute, getTrafficInfo } from './routeService';
import { calculateDistance } from '../services/locationService';
import '../styles/MapView.css';
import { Overlay } from 'ol';

function MapView({ users, destination, userLocation, onSetDestinationFromMap, onRouteUpdate }) {
  const mapRef = useRef();
  const vectorSourceRef = useRef(new VectorSource());
  const mapInstanceRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [trafficData, setTrafficData] = useState(null);
  const [error, setError] = useState(null);
  const [routeDetails, setRouteDetails] = useState(null);
  const [warning, setWarning] = useState(null);
  const [routeLayer, setRouteLayer] = useState(null);
  const [driverMarker, setDriverMarker] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    // Use CartoDB's Voyager tiles for a modern look
    const baseLayer = new TileLayer({
      source: new OSM({
        url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      })
    });

    const vectorLayer = new VectorLayer({
      source: vectorSourceRef.current,
    });

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, vectorLayer],
      view: new View({
        center: fromLonLat([-96.7970, 32.7767]), // Dallas default
        zoom: 12,
      }),
      controls: defaultControls({
        zoom: true,
        rotate: false,
        attribution: true
      }).extend([])
    });

    mapInstanceRef.current = map;
    map.on('click', function (event) {
        const coordinate = toLonLat(event.coordinate);
        const [lng, lat] = coordinate;
        if (onSetDestinationFromMap) {
            onSetDestinationFromMap({ lat, lng });
        }
    });

    return () => {
      map.setTarget(null);
    };
  }, []);

  // Add effect to handle driver location updates
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation) return;

    const map = mapInstanceRef.current;
    const source = vectorSourceRef.current;

    // Update or create driver marker
    const driverFeature = new Feature({
      geometry: new Point(fromLonLat([userLocation.lng, userLocation.lat])),
      name: 'Driver Location',
    });

    driverFeature.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: '#2196F3' }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        }),
      })
    );

    // Remove old driver marker if it exists
    if (driverMarker) {
      source.removeFeature(driverMarker);
    }

    source.addFeature(driverFeature);
    setDriverMarker(driverFeature);

    // If we have a route, check if we need to recalculate
    if (route && !isRecalculating) {
      const driver = users.find(u => u.role === 'driver');
      if (driver && driver.isCreator) {
        const currentLocation = { lat: userLocation.lat, lng: userLocation.lng };
        const lastLocation = driver.userLocationCoords;
        
        // If driver has moved more than 100 meters, recalculate route
        if (lastLocation && calculateDistance(currentLocation, lastLocation) > 0.1) {
          setIsRecalculating(true);
          calculateOptimizedRoute().finally(() => setIsRecalculating(false));
        }
      }
    }
  }, [userLocation, users, route]);

  // Update route calculation to handle driver location updates
  const calculateOptimizedRoute = useCallback(async () => {
    if (!users.length || !destination) {
      console.log('Missing required data for route calculation:', { users, destination });
            return;
          }

    try {
      // Find the driver (either creator or assigned driver)
      const driver = users.find(u => u.role === 'driver');
      if (!driver) {
        console.warn('No driver found in the route');
        setError('No driver assigned for the route');
        return;
      }

      // Get driver's starting location
      const startLocation = driver.isCreator ? userLocation : driver.userLocationCoords;
      if (!startLocation) {
        console.warn('Driver location not available');
        setError('Driver location not available');
        return;
      }

      console.log('Calculating route with:', {
        startLocation,
        destination,
        pickupPoints: users.filter(u => u.role === 'passenger' && u.userLocationCoords)
      });

      // Get all pickup points (excluding driver)
      const pickupPoints = users
        .filter(u => u.role === 'passenger' && u.userLocationCoords)
        .map(u => ({
          ...u,
          location: u.userLocationCoords,
          type: 'pickup',
          passengerId: u.tempId
        }));

      // Create waypoints array with start, pickup points, and destination
      const waypoints = [
        { location: startLocation, type: 'start' },
        ...pickupPoints,
        { location: destination, type: 'destination' }
      ];

      console.log('Calculating route with waypoints:', waypoints);
      const route = await calculateRoute(waypoints);

      if (!route || !route.features || !route.features[0]) {
        throw new Error('Invalid route data received');
      }

      console.log('Route calculated successfully:', route);

      // Update route with pickup order information and estimated times
      const optimizedRoute = {
        ...route,
        pickupOrder: route.waypoints
          .filter(wp => wp.type === 'pickup')
          .map((waypoint, index) => {
            const estimatedTime = calculateEstimatedPickupTime(route, index);
            return {
              passenger: waypoint.name,
              location: waypoint.location,
              order: index + 1,
              estimatedPickupTime: estimatedTime,
              distance: calculateDistance(startLocation, waypoint.location)
            };
          }),
        lastUpdate: new Date().toISOString()
      };

      setRoute(optimizedRoute);
      setRouteDetails({
        totalDistance: route.features[0].properties.summary.distance,
        totalDuration: route.features[0].properties.summary.duration,
        segments: optimizedRoute.pickupOrder.map((pickup, index) => ({
          type: 'pickup',
          passenger: {
            name: pickup.passenger,
            address: pickup.location.address || 'Location not available'
          },
          distance: pickup.distance * 1000, // Convert to meters
          duration: pickup.estimatedPickupTime * 60, // Convert to seconds
          cumulativeTime: pickup.estimatedPickupTime * 60
        }))
      });
      setError(null); // Clear any previous errors
    } catch (error) {
      console.error('Error calculating optimized route:', error);
      setError(error.message || 'Failed to calculate route. Please try again.');
      setRoute(null); // Clear the route on error
      setRouteDetails(null);
    }
  }, [users, destination, userLocation]);

  // Add effect to trigger route calculation when needed
  useEffect(() => {
    if (users.length > 0 && destination && userLocation) {
      calculateOptimizedRoute();
    }
  }, [users, destination, userLocation, calculateOptimizedRoute]);

  // Calculate estimated pickup time based on route segments
  const calculateEstimatedPickupTime = (route, pickupIndex) => {
    if (!route || !route.features || pickupIndex >= route.features[0].geometry.coordinates.length) {
      return null;
    }

    // Sum up the duration of all segments up to this pickup point
    const totalDuration = route.features[0].geometry.coordinates
      .slice(0, pickupIndex + 1)
      .reduce((sum, coord) => sum + coord[2], 0);

    // Convert seconds to minutes and round to nearest minute
    return Math.round(totalDuration / 60);
  };

  // Update the route visualization
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !route) return;

    try {
      // Clear existing route layer if it exists
      if (routeLayer) {
        map.removeLayer(routeLayer);
        setRouteLayer(null);
      }

      // Create new route layer
      const coordinates = route.features[0].geometry.coordinates.map(coord => fromLonLat(coord));
      const routeFeature = new Feature({
        geometry: new LineString(coordinates),
        name: 'Route',
      });

      // Style the route with a more prominent line
      const routeStyle = new Style({
        stroke: new Stroke({
          color: '#2196F3',
          width: 8,
          lineDash: [5, 5],
        }),
      });

      routeFeature.setStyle(routeStyle);
      vectorSourceRef.current.addFeature(routeFeature);

      // Create a new vector layer for the route
      const newRouteLayer = new VectorLayer({
        source: new VectorSource({
          features: [routeFeature]
        })
      });

      map.addLayer(newRouteLayer);
      setRouteLayer(newRouteLayer);

      // Get all features to include in the extent calculation
      const allFeatures = vectorSourceRef.current.getFeatures();
      const allCoordinates = allFeatures.map(feature => {
        const geometry = feature.getGeometry();
        if (geometry instanceof Point) {
          return geometry.getCoordinates();
        } else if (geometry instanceof LineString) {
          return geometry.getCoordinates();
        }
        return null;
      }).filter(coord => coord !== null).flat();

      // Calculate the extent with additional padding
      const extent = boundingExtent(allCoordinates);
      
      // Add 20% padding to the extent
      const [minX, minY, maxX, maxY] = extent;
      const width = maxX - minX;
      const height = maxY - minY;
      const paddedExtent = [
        minX - width * 0.2,
        minY - height * 0.2,
        maxX + width * 0.2,
        maxY + height * 0.2
      ];

      // Fit map to show all features with padding and smooth animation
      map.getView().fit(paddedExtent, {
        padding: [50, 50, 50, 50], // Padding around the extent
        maxZoom: 16, // Prevent zooming in too close
        minZoom: 4,  // Prevent zooming out too far
        duration: 1500, // Longer duration for smoother animation
        easing: (t) => {
          // Custom easing function for smoother animation
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        }
      });

      // Add a small delay and then adjust zoom if needed
      setTimeout(() => {
        const currentZoom = map.getView().getZoom();
        const extentSize = Math.max(width, height);
        
        // If the route is very long, zoom out a bit more
        if (extentSize > 100000) { // If route is longer than 100km
          map.getView().animate({
            zoom: Math.min(currentZoom - 1, 12),
            duration: 1000
          });
        }
      }, 1600);

      console.log('Route visualization updated successfully');
    } catch (error) {
      console.error('Error updating route visualization:', error);
      setError('Failed to display route on map');
    }
  }, [route, destination]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    const map = mapInstanceRef.current;
    if (!map) return;

    source.clear();

    const features = [];

    // Add user location if available
    if (userLocation) {
      const userLocationFeature = new Feature({
        geometry: new Point(fromLonLat([userLocation.lng, userLocation.lat])),
        name: 'Your Location',
      });

      userLocationFeature.setStyle(
        new Style({
          image: new Icon({
            src: 'https://img.icons8.com/ios-filled/50/4CAF50/marker.png',
            scale: 0.8,
            anchor: [0.5, 1],
          }),
        })
      );

      features.push(userLocationFeature);
    }

    // Add users with different styles based on their role
    users.forEach((user) => {
      const userFeature = new Feature({
        geometry: new Point(fromLonLat([user.lng, user.lat])),
        name: user.name,
      });

      const userStyle = new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ 
            color: user.role === 'driver' ? '#2196F3' : user.color
          }),
          stroke: new Stroke({ 
            color: '#ffffff',
            width: 2
          }),
        }),
      });

      userFeature.setStyle(userStyle);
      features.push(userFeature);
    });

    // Add destination if available
    if (destination) {
      const destFeature = new Feature({
        geometry: new Point(fromLonLat([destination.lng, destination.lat])),
        name: 'Destination',
      });

      destFeature.setStyle(
        new Style({
          image: new Icon({
            src: 'https://img.icons8.com/ios-filled/50/fa314a/marker.png',
            scale: 0.8,
            anchor: [0.5, 1],
          }),
        })
      );

      features.push(destFeature);
    }

    // Add route if available
    if (route && route.features && route.features[0]) {
      try {
        console.log('Adding route to map:', route.features[0].geometry.coordinates);
        const coordinates = route.features[0].geometry.coordinates.map(coord => fromLonLat(coord));
        const routeFeature = new Feature({
          geometry: new LineString(coordinates),
          name: 'Route',
        });

        // Style the route with a more prominent line
        const routeStyle = new Style({
          stroke: new Stroke({
            color: '#2196F3',
            width: 8,
            lineDash: [5, 5],
          }),
        });

        routeFeature.setStyle(routeStyle);
        features.push(routeFeature);
      } catch (error) {
        console.error('Error adding route to map:', error);
      }
    }

    source.addFeatures(features);

    if (features.length > 0) {
      const extent = boundingExtent(features.map((f) => f.getGeometry().getCoordinates()));
      map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        maxZoom: 16,
        duration: 500,
      });
    } else {
      map.getView().setCenter(fromLonLat([-96.7970, 32.7767]));
      map.getView().setZoom(12);
    }
  }, [users, destination, userLocation, route]);

  // Helper function to get color based on traffic data
  const getTrafficColor = (trafficData) => {
    if (!trafficData || !trafficData.features || !trafficData.features[0]) {
      return '#3388ff'; // Default blue
    }
    // This is a simple example - you might want to implement more sophisticated logic
    const trafficLevel = trafficData.features[0].properties.traffic_level;
    switch (trafficLevel) {
      case 'low':
        return '#4CAF50'; // Green
      case 'medium':
        return '#FFC107'; // Yellow
      case 'high':
        return '#F44336'; // Red
      default:
        return '#3388ff'; // Blue
    }
  };

  // Helper function to format duration
  const formatDuration = (seconds) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
  };

  // Helper function to format distance
  const formatDistance = (meters) => {
    const kilometers = meters / 1000;
    return `${kilometers.toFixed(1)} km`;
  };

  // Add method to update route from parent component
  const updateRoute = useCallback((newRoute) => {
    if (!newRoute || !mapInstanceRef.current) return;
    
    setRoute(newRoute);
    setRouteDetails({
      totalDistance: newRoute.features[0].properties.summary.distance,
      totalDuration: newRoute.features[0].properties.summary.duration,
      segments: []
    });
    
    if (onRouteUpdate) {
      onRouteUpdate(newRoute);
    }
  }, [onRouteUpdate]);

  // Expose updateRoute method to parent component
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.updateRoute = updateRoute;
    }
  }, [updateRoute]);

  return (
    <div className="map-and-details-container">
      <div className="map-section">
        <div
          ref={mapRef}
          className="map-container"
        />
        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-circle"></i>
            <p>{error}</p>
          </div>
        )}
        {isRecalculating && (
          <div className="recalculating-message">
            <i className="fas fa-sync fa-spin"></i>
            <p>Updating route...</p>
          </div>
        )}
        {warning && (
          <div className="warning-message">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{warning}</p>
          </div>
        )}
      </div>
      {routeDetails && (
        <div className="route-details-section">
          <div className="route-info">
            <h5>Optimized Route Details</h5>
            <div className="route-status">
              <span className="last-update">
                Last updated: {new Date(route.lastUpdate).toLocaleTimeString()}
              </span>
              {isRecalculating && (
                <span className="updating-badge">
                  <i className="fas fa-sync fa-spin"></i> Updating...
                </span>
              )}
            </div>
            <div className="total-info">
              <p>
                <i className="fas fa-road"></i>
                Total Distance: {formatDistance(routeDetails.totalDistance)}
              </p>
              <p>
                <i className="fas fa-clock"></i>
                Total Duration: {formatDuration(routeDetails.totalDuration)}
              </p>
            </div>
            <div className="segments-info">
              <div className="segment start">
                <h6>
                  <i className="fas fa-car"></i>
                  Starting Point
                </h6>
                <p>Driver's Current Location</p>
              </div>
              {routeDetails.segments.map((segment, index) => (
                <div key={index} className="segment pickup">
                  <h6>
                    <i className="fas fa-user"></i>
                    Pickup {index + 1}: {segment.passenger.name}
                  </h6>
                  <p>
                    <i className="fas fa-map-marker-alt"></i>
                    {segment.passenger.address}
                  </p>
                  <p>
                    <i className="fas fa-road"></i>
                    Distance: {formatDistance(segment.distance)}
                  </p>
                  <p>
                    <i className="fas fa-clock"></i>
                    Estimated Pickup Time: {formatDuration(segment.duration)}
                  </p>
                </div>
              ))}
              <div className="segment destination">
                <h6>
                  <i className="fas fa-flag-checkered"></i>
                  Final Destination
                </h6>
                <p>
                  <i className="fas fa-road"></i>
                  Total Distance: {formatDistance(routeDetails.totalDistance)}
                </p>
                <p>
                  <i className="fas fa-clock"></i>
                  Total Duration: {formatDuration(routeDetails.totalDuration)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .map-and-details-container {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          position: relative;
        }
        .map-section {
          width: 100%;
          height: 100%;
          position: relative;
          flex: 1;
        }
        .route-details-section {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 0 20px;
        }
        .route-info {
          background-color: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .route-info h5 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
          font-size: 1.2em;
        }
        .route-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eee;
        }
        .last-update {
          color: #666;
          font-size: 0.9em;
        }
        .updating-badge {
          background-color: #e3f2fd;
          color: #2196F3;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.9em;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .total-info {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #eee;
        }
        .total-info p {
          margin: 8px 0;
          font-weight: 500;
          font-size: 1.1em;
        }
        .segments-info {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .segment {
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #eee;
        }
        .segment.start {
          background-color: #e3f2fd;
          border-color: #2196F3;
        }
        .segment h6 {
          margin: 0 0 10px 0;
          color: #2196F3;
          font-size: 1.1em;
          font-weight: 600;
        }
        .segment p {
          margin: 5px 0;
          color: #666;
        }
        .segment.pickup {
          border-left: 3px solid #2196F3;
        }
        .segment.destination {
          border-left: 3px solid #4CAF50;
        }
        .segment h6 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 10px 0;
        }
        .segment p {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 5px 0;
        }
        .recalculating-message {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(33, 150, 243, 0.9);
          color: white;
          padding: 10px 20px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .warning-message {
          position: absolute;
          top: 10px;
          left: 10px;
          background-color: rgba(255, 193, 7, 0.9);
          color: #000;
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          max-width: 300px;
          word-wrap: break-word;
        }
        .error-message {
          top: ${warning ? '60px' : '10px'};
        }
      `}</style>
    </div>
  );
}

export default MapView;
