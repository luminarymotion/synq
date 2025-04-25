import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import { OSM } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Fill, Stroke, Circle as CircleStyle, Icon } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { defaults as defaultControls } from 'ol/control';
import { LineString } from 'ol/geom';
import { calculateRoute, getTrafficInfo } from './routeService';

function MapView({ users, destination, userLocation, onSetDestinationFromMap }) {
  const mapRef = useRef();
  const vectorSourceRef = useRef(new VectorSource());
  const mapInstanceRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [trafficData, setTrafficData] = useState(null);
  const [error, setError] = useState(null);
  const [routeDetails, setRouteDetails] = useState(null);

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

  // Calculate route when user location or destination changes
  useEffect(() => {
    const calculateAndDisplayRoute = async () => {
      if (userLocation && destination) {
        try {
          setError(null);
          // Get all passengers from the users array
          const passengers = users.filter(user => user.role === 'passenger');
          console.log('Calculating route with:', { userLocation, destination, passengers });
          
          // If there are no passengers, don't calculate route
          if (passengers.length === 0) {
            setRoute(null);
            setRouteDetails(null);
            return;
          }

          const routeData = await calculateRoute(userLocation, destination, passengers);
          console.log('Received route data:', routeData);
          
          if (!routeData || !routeData.features || !routeData.features[0]) {
            throw new Error('Invalid route data received');
          }

          setRoute(routeData);

          // Calculate route details
          const segments = routeData.features[0].properties.segments;
          console.log('Route segments:', segments);

          // Get the optimized passenger order from the route coordinates
          const optimizedPassengers = [];
          if (routeData.features[0].geometry.coordinates.length > 2) {
            // Skip first (start) and last (destination) coordinates
            const passengerCoordinates = routeData.features[0].geometry.coordinates.slice(1, -1);
            
            console.log('Passenger coordinates from route:', passengerCoordinates);
            console.log('Available passengers:', passengers);
            
            // Create a map of passenger coordinates for easier matching
            const passengerMap = new Map();
            passengers.forEach(passenger => {
              // Use a more precise key for matching
              const key = `${passenger.lng.toFixed(4)},${passenger.lat.toFixed(4)}`;
              passengerMap.set(key, passenger);
              console.log(`Added passenger to map: ${passenger.name} at ${key}`);
            });

            // Match coordinates to passengers
            passengerCoordinates.forEach((coord, index) => {
              const [lng, lat] = coord;
              console.log(`Processing coordinate ${index}: [${lng}, ${lat}]`);
              
              // Try exact match first
              let key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
              let passenger = passengerMap.get(key);

              // If no exact match, try finding the closest passenger
              if (!passenger) {
                let minDistance = Infinity;
                let closestPassenger = null;

                passengers.forEach(p => {
                  const distance = Math.sqrt(
                    Math.pow(p.lng - lng, 2) + Math.pow(p.lat - lat, 2)
                  );
                  if (distance < minDistance) {
                    minDistance = distance;
                    closestPassenger = p;
                  }
                });

                console.log(`Closest passenger distance: ${minDistance}`);
                // Increased threshold for matching
                if (minDistance < 0.001) { // More lenient threshold
                  passenger = closestPassenger;
                  console.log(`Matched to closest passenger: ${passenger?.name}`);
                }
              }

              if (passenger) {
                console.log(`Matched passenger: ${passenger.name} to coordinate ${index}`);
                optimizedPassengers.push(passenger);
              } else {
                console.log(`No passenger matched for coordinate ${index}`);
              }
            });
          }

          // If no passengers were matched, use the original passenger order
          if (optimizedPassengers.length === 0 && passengers.length > 0) {
            console.log('No passengers matched, using original order');
            optimizedPassengers.push(...passengers);
          }

          console.log('Final optimized passenger order:', optimizedPassengers);

          // Calculate cumulative times for each segment
          let cumulativeTime = 0;
          const segmentsWithCumulativeTime = segments.map((segment, index) => {
            cumulativeTime += segment.duration;
            return {
              ...segment,
              cumulativeTime
            };
          });

          // Create route details with the correct passenger order
          const details = {
            totalDistance: segments.reduce((sum, seg) => sum + seg.distance, 0),
            totalDuration: segments.reduce((sum, seg) => sum + seg.duration, 0),
            segments: []
          };

          // Add the first segment with the first passenger
          if (optimizedPassengers.length > 0) {
            details.segments.push({
              distance: segments[0].distance,
              duration: segments[0].duration,
              cumulativeTime: segmentsWithCumulativeTime[0].cumulativeTime,
              passenger: optimizedPassengers[0],
              isDestination: false,
              type: 'pickup'
            });
          }

          // Add the middle segments with the remaining passengers
          for (let i = 1; i < segments.length - 1; i++) {
            const passenger = optimizedPassengers[i];
            console.log(`Creating segment ${i} with passenger:`, passenger);
            details.segments.push({
              distance: segments[i].distance,
              duration: segments[i].duration,
              cumulativeTime: segmentsWithCumulativeTime[i].cumulativeTime,
              passenger: passenger || null,
              isDestination: false,
              type: passenger ? 'pickup' : 'travel'
            });
          }

          // Add the final destination segment
          details.segments.push({
            distance: segments[segments.length - 1].distance,
            duration: segments[segments.length - 1].duration,
            cumulativeTime: segmentsWithCumulativeTime[segments.length - 1].cumulativeTime,
            passenger: null,
            isDestination: true,
            type: 'destination'
          });

          console.log('Final route details:', details);
          setRouteDetails(details);
        } catch (error) {
          console.error('Error calculating route:', error);
          setError(error.message || 'Failed to calculate route');
          setRoute(null);
          setRouteDetails(null);
        }
      }
    };

    calculateAndDisplayRoute();
  }, [userLocation, destination, users]);

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

  return (
    <div className="map-and-details-container">
      <div className="map-section">
        <div
          ref={mapRef}
          style={{
            width: '100%',
            height: '500px',
            border: '1px solid #ccc',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        />
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
      </div>
      {routeDetails && (
        <div className="route-details-section">
          <div className="route-info">
            <h5>Optimized Route Details</h5>
            <div className="total-info">
              <p>Total Distance: {formatDistance(routeDetails.totalDistance)}</p>
              <p>Total Duration: {formatDuration(routeDetails.totalDuration)}</p>
            </div>
            <div className="segments-info">
              <div className="segment start">
                <h6>Starting Point</h6>
                <p>Your Location</p>
              </div>
              {routeDetails.segments.map((segment, index) => (
                <div key={index} className="segment">
                  {segment.type === 'pickup' && segment.passenger ? (
                    <div>
                      <h6>Pickup {index + 1}: {segment.passenger.name}</h6>
                      <p>Distance: {formatDistance(segment.distance)}</p>
                      <p>Time to Pickup: {formatDuration(segment.duration)}</p>
                      <p>Total Time from Start: {formatDuration(segment.cumulativeTime)}</p>
                      <p>Address: {segment.passenger.address}</p>
                    </div>
                  ) : segment.type === 'travel' ? (
                    <div>
                      <h6>Travel to Next Stop</h6>
                      <p>Distance: {formatDistance(segment.distance)}</p>
                      <p>Duration: {formatDuration(segment.duration)}</p>
                      <p>Total Time from Start: {formatDuration(segment.cumulativeTime)}</p>
                    </div>
                  ) : segment.type === 'destination' ? (
                    <div>
                      <h6>Final Destination</h6>
                      <p>Distance: {formatDistance(segment.distance)}</p>
                      <p>Time to Destination: {formatDuration(segment.duration)}</p>
                      <p>Total Time from Start: {formatDuration(segment.cumulativeTime)}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .map-and-details-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 20px;
          width: 100%;
        }
        .map-section {
          width: 100%;
          position: relative;
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
        .error-message {
          position: absolute;
          top: 10px;
          left: 10px;
          background-color: rgba(244, 67, 54, 0.9);
          color: white;
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          max-width: 300px;
          word-wrap: break-word;
        }
      `}</style>
    </div>
  );
}

export default MapView;
