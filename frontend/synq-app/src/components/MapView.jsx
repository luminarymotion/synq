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
import { calculateOptimizedRoute } from '../services/routeOptimizerService';
import { calculateDistance } from '../services/locationService';
import '../styles/MapView.css';
import { Overlay } from 'ol';

function MapView({ users = [], destination, userLocation, calculatedRoute, onSetDestinationFromMap, onRouteUpdate, onMapClick }) {
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
    // Use OpenStreetMap tiles for better reliability
    const baseLayer = new TileLayer({
      source: new OSM()
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
        
        if (onMapClick) {
            // Use the new onMapClick handler for different click modes
            onMapClick({ latlng: { lat, lng } });
        } else if (onSetDestinationFromMap) {
            // Fallback to the old behavior for backward compatibility
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
        
        // If driver has moved more than 100 meters, notify parent to recalculate
        if (lastLocation && calculateDistance(currentLocation, lastLocation) > 0.1) {
          console.log('Driver moved significantly, route may need recalculation');
          // Route recalculation should be handled by parent component
        }
      }
    }
  }, [userLocation, users, route]);

  // Add debugging for users prop
  useEffect(() => {
    console.log('MapView - Received users prop:', {
      totalUsers: users.length,
      users: users.map(u => ({
        uid: u.uid,
        displayName: u.displayName,
        role: u.role,
        hasLocation: !!u.location,
        location: u.location,
        invitationStatus: u.invitationStatus
        }))
      });
  }, [users]);

  // Update internal route state when calculatedRoute prop changes
  useEffect(() => {
    console.log('MapView - calculatedRoute prop changed:', calculatedRoute);
    if (calculatedRoute) {
      setRoute(calculatedRoute);
    }
  }, [calculatedRoute]);

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

      // Handle multi-vehicle routes
      if (route.routes && Array.isArray(route.routes)) {
        // Multi-vehicle route
        const routeColors = ['#2196F3', '#FF5722', '#4CAF50', '#9C27B0', '#FF9800'];
        const routeFeatures = [];
        
        route.routes.forEach((vehicleRoute, index) => {
          if (vehicleRoute.waypoints && vehicleRoute.waypoints.length > 1) {
            const coordinates = vehicleRoute.waypoints.map(waypoint => 
              fromLonLat([waypoint.location.lng, waypoint.location.lat])
            );
            
            const routeFeature = new Feature({
              geometry: new LineString(coordinates),
              name: `Route ${index + 1}`,
              driver: vehicleRoute.driver?.displayName || `Driver ${index + 1}`
            });

            // Style the route with different colors for each vehicle
            const routeStyle = new Style({
              stroke: new Stroke({
                color: routeColors[index % routeColors.length],
                width: 6,
                lineDash: [8, 4],
              }),
            });

            routeFeature.setStyle(routeStyle);
            routeFeatures.push(routeFeature);
          }
        });

        // Create route layer for all vehicles
        const newRouteLayer = new VectorLayer({
          source: new VectorSource({
            features: routeFeatures
          })
        });

        map.addLayer(newRouteLayer);
        setRouteLayer(newRouteLayer);
      } else if (route.features && route.features[0]) {
        // Single vehicle route (existing logic)
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
      } else if (route.waypoints && route.waypoints.length > 1) {
        // Simple route format
        const coordinates = route.waypoints.map(waypoint => 
          fromLonLat([waypoint.lng || waypoint.location.lng, waypoint.lat || waypoint.location.lat])
        );
        
        const routeFeature = new Feature({
          geometry: new LineString(coordinates),
          name: 'Route',
        });

        const routeStyle = new Style({
          stroke: new Stroke({
            color: '#2196F3',
            width: 6,
            lineDash: [5, 5],
          }),
        });

        routeFeature.setStyle(routeStyle);
        vectorSourceRef.current.addFeature(routeFeature);
      }

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

      // Only fit map if we have valid coordinates
      if (allCoordinates.length > 0) {
      // Calculate the extent with additional padding
      const extent = boundingExtent(allCoordinates);
      
      // Add 20% padding to the extent
      const [minX, minY, maxX, maxY] = extent;
      const width = maxX - minX;
      const height = maxY - minY;
        const paddingX = width * 0.2;
        const paddingY = height * 0.2;
        
        const paddedExtent = [minX - paddingX, minY - paddingY, maxX + paddingX, maxY + paddingY];
        
        map.getView().fit(paddedExtent, {
          padding: [50, 50, 50, 50],
          maxZoom: 16,
          duration: 1000,
        });
      }
        } catch (error) {
      console.error('Error updating route visualization:', error);
        }
  }, [route]); // Only depend on route, not routeLayer to prevent infinite loops

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
      // Handle nested location data from participants
      let userLat, userLng;
      
      // For drivers, prioritize currentLocation over location for real-time updates
      if (user.role === 'driver' && user.currentLocation) {
        // Use real-time current location for driver
        userLat = user.currentLocation.lat;
        userLng = user.currentLocation.lng;
        console.log('Using driver currentLocation for real-time update:', userLat, userLng);
      } else if (user.location) {
        // Location data is nested in user.location
        userLat = user.location.lat;
        userLng = user.location.lng;
      } else if (user.lat && user.lng) {
        // Location data is directly on user object
        userLat = user.lat;
        userLng = user.lng;
      } else {
        // No location data available, skip this user
        console.log('Skipping user without location data:', user.displayName || user.name);
        return;
      }

      const userFeature = new Feature({
        geometry: new Point(fromLonLat([userLng, userLat])),
        name: user.displayName || user.name,
      });

      const userStyle = new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ 
            color: user.color || (user.role === 'driver' ? '#2196F3' : '#FF5722')
          }),
          stroke: new Stroke({ 
            color: '#ffffff',
            width: 2
          }),
        }),
      });

      userFeature.setStyle(userStyle);
      features.push(userFeature);
      
      console.log('Added user marker for:', user.displayName || user.name, 'at:', userLat, userLng, 'role:', user.role);
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
  }, []);

  // Expose updateRoute method to parent component
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.updateRoute = updateRoute;
    }
  }, [updateRoute]);

  // Update route when calculatedRoute prop changes
  useEffect(() => {
    if (calculatedRoute && mapInstanceRef.current) {
      console.log('Updating route on map:', calculatedRoute);
      console.log('Route features:', calculatedRoute.features);
      console.log('Route geometry:', calculatedRoute.features?.[0]?.geometry);

    // Remove existing route layer if it exists
    if (routeLayer) {
      mapInstanceRef.current.removeLayer(routeLayer);
    }

    try {
        // Handle different route data formats
        let routeFeatures = [];
        
        if (calculatedRoute.features && calculatedRoute.features.length > 0) {
          // GeoJSON format
          routeFeatures = calculatedRoute.features;
        } else if (calculatedRoute.routes && calculatedRoute.routes.length > 0) {
          // VRP format - convert to GeoJSON
          const route = calculatedRoute.routes[0];
          if (route.waypoints && route.waypoints.length > 0) {
            const coordinates = route.waypoints.map(wp => [wp.lng, wp.lat]);
            routeFeatures = [{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coordinates
              },
              properties: {
                summary: {
                  distance: route.totalDistance || calculatedRoute.totalDistance || 0,
                  duration: route.totalDuration || calculatedRoute.totalDuration || 0
                }
              }
            }];
          }
        }

        if (routeFeatures.length > 0) {
          const routeFeature = routeFeatures[0];
          const coordinates = routeFeature.geometry.coordinates;
          console.log('Route coordinates:', coordinates);
          
          if (!coordinates || coordinates.length < 2) {
            console.warn('Invalid route coordinates:', coordinates);
            return;
          }
          
          const routeFeatureObj = new Feature({
            geometry: new LineString(coordinates)
        });

        // Style the route
        const routeStyle = new Style({
          stroke: new Stroke({
            color: '#2196F3',
            width: 4,
            lineDash: [10, 5]
          })
        });

          routeFeatureObj.setStyle(routeStyle);

        // Create route layer
        const newRouteLayer = new VectorLayer({
          source: new VectorSource({
              features: [routeFeatureObj]
          }),
          zIndex: 10
        });

        // Add route layer to map
        mapInstanceRef.current.addLayer(newRouteLayer);
        setRouteLayer(newRouteLayer);

        // Fit map to show the entire route
          try {
            const extent = routeFeatureObj.getGeometry().getExtent();
        mapInstanceRef.current.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 1000
        });
          } catch (fitError) {
            console.warn('Could not fit map to route extent:', fitError);
            // Fallback: fit to a reasonable area around the route
            const center = routeFeatureObj.getGeometry().getFirstCoordinate();
            if (center) {
              mapInstanceRef.current.getView().setCenter(center);
              mapInstanceRef.current.getView().setZoom(12);
            }
          }

        console.log('Route displayed successfully on map');
        } else {
          console.warn('No valid route features found:', calculatedRoute);
      }
    } catch (error) {
        console.error('Error updating route visualization:', error);
    }

      setRoute(calculatedRoute);
    }
  }, [calculatedRoute]); // Removed displayRouteOnMap from dependencies

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
    </div>
  );
}

export default MapView;
