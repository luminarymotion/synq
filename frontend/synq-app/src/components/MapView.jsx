import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { calculateDistance } from '../services/locationService';
import '../styles/MapView.css';

// Set Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || 'pk.eyJ1IjoibHVtaW5hcnkwIiwiYSI6ImNtY3c2M2VjYTA2OWsybXEwYm12emU2MnkifQ.nC7J3ggSse2k9HYdJ1sdYg';

function MapView({ 
  users = [], 
  destination, 
  userLocation, 
  calculatedRoute, 
  destinationSuggestions = [], // New prop for suggestions
  onSetDestinationFromMap, 
  onSuggestionSelect, // New prop for handling suggestion selections
  onRouteUpdate, 
  onMapClick,
  mapClickMode = null, // New prop for map click mode
  autoFit = true, // New prop to control auto-fit behavior
  compact = false, // New prop for compact mode (smaller padding)
  hideRouteInfo = false, // New prop to hide route information panel
  poiMarkers = [], // New prop for POI markers
  onPoiMarkerClick = null // New prop for POI marker click handler
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [route, setRoute] = useState(null);
  const [trafficData, setTrafficData] = useState(null);
  const [error, setError] = useState(null);
  const [routeDetails, setRouteDetails] = useState(null);
  const [warning, setWarning] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Initialize map
  useEffect(() => {
    if (map.current) return; // Initialize map only once

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-96.7970, 32.7767], // Dallas default
        zoom: 12
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add click handler
      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        
        if (onMapClick) {
            // Use the new onMapClick handler for different click modes
            onMapClick({ latlng: { lat, lng } });
        } else if (onSetDestinationFromMap) {
            // Fallback to the old behavior for backward compatibility
            onSetDestinationFromMap({ lat, lng });
        }
    });

      // Wait for map to load before adding sources/layers
      map.current.on('load', () => {
        console.log('Mapbox map loaded successfully');
        setMapLoaded(true);
      });

      // Handle map errors
      map.current.on('error', (e) => {
        console.error('Mapbox error:', e);
        setError('Failed to load map');
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setError('Failed to initialize map');
    }

    // Cleanup on unmount
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
    };
  }, []);

  // Safe function to remove sources and layers
  const safeRemoveSource = useCallback((sourceId) => {
    if (!map.current || !mapLoaded) return;
    
    try {
      if (map.current.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    } catch (error) {
      console.warn(`Error removing source ${sourceId}:`, error);
    }
  }, [mapLoaded]);

  const safeRemoveLayer = useCallback((layerId) => {
    if (!map.current || !mapLoaded) return;
    
    try {
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
    } catch (error) {
      console.warn(`Error removing layer ${layerId}:`, error);
    }
  }, [mapLoaded]);

  const safeAddSource = useCallback((sourceId, sourceData) => {
    if (!map.current || !mapLoaded) return false;
    
    try {
      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, sourceData);
        return true;
      }
    } catch (error) {
      console.warn(`Error adding source ${sourceId}:`, error);
    }
    return false;
  }, [mapLoaded]);

  const safeAddLayer = useCallback((layerData) => {
    if (!map.current || !mapLoaded) return false;
    
    try {
      if (!map.current.getLayer(layerData.id)) {
        map.current.addLayer(layerData);
        return true;
      }
    } catch (error) {
      console.warn(`Error adding layer ${layerData.id}:`, error);
    }
    return false;
  }, [mapLoaded]);

  // Smooth map fitting function
  const smoothFitMapToPoints = useCallback((points, padding = 50, duration = 1500) => {
    if (!map.current || !mapLoaded || !points || points.length === 0) return;

    try {
      const bounds = new mapboxgl.LngLatBounds();
      
      // Add all points to bounds
      points.forEach(point => {
        if (point.lng && point.lat) {
          bounds.extend([point.lng, point.lat]);
        }
      });

      // Fit map to bounds with smooth animation
      map.current.fitBounds(bounds, {
        padding: padding,
        duration: duration,
        easing: (t) => t * (2 - t), // Smooth easing function
        maxZoom: 16 // Prevent zooming in too far
      });
    } catch (error) {
      console.warn('Error fitting map to points:', error);
    }
  }, [mapLoaded]);

  // Manual auto-fit function that can be called from parent
  const manualAutoFit = useCallback(() => {
    const allPoints = [];
    
    // Add user locations (only for accepted participants)
    users.forEach(user => {
      if (user.location && 
          user.location.lat && 
          user.location.lng && 
          (user.invitationStatus === 'accepted' || user.role === 'driver')) {
        allPoints.push({ lat: user.location.lat, lng: user.location.lng });
      }
    });
    
    // Add destination
    if (destination && destination.lat && destination.lng) {
      allPoints.push({ lat: destination.lat, lng: destination.lng });
    }
    
    // Add user location if available
    if (userLocation && userLocation.lat && userLocation.lng) {
      allPoints.push({ lat: userLocation.lat, lng: userLocation.lng });
    }
    
    // Add POI markers if available
    if (destinationSuggestions && destinationSuggestions.length > 0) {
      destinationSuggestions.forEach(suggestion => {
        if (suggestion.lat && suggestion.lng) {
          allPoints.push({ lat: suggestion.lat, lng: suggestion.lng });
        }
      });
    }
    
    // Add route coordinates if available
    if (route) {
      if (route.features && route.features.length > 0) {
        const coordinates = route.features[0].geometry.coordinates;
        coordinates.forEach(coord => {
          allPoints.push({ lng: coord[0], lat: coord[1] });
        });
      } else if (route.routes && Array.isArray(route.routes)) {
        route.routes.forEach(vehicleRoute => {
          if (vehicleRoute.waypoints) {
            vehicleRoute.waypoints.forEach(waypoint => {
              if (waypoint.location) {
                allPoints.push({ lat: waypoint.location.lat, lng: waypoint.location.lng });
              }
            });
          }
        });
      }
    }
    
    if (allPoints.length > 0) {
      const padding = compact ? 40 : 80;
      console.log('🗺️ Manual auto-fit triggered with', allPoints.length, 'points');
      smoothFitMapToPoints(allPoints, padding, 1000);
    }
  }, [users, destination, userLocation, route, destinationSuggestions, compact, smoothFitMapToPoints, mapLoaded]);

  // Add effect to handle driver location updates
  useEffect(() => {
    if (!mapLoaded || !userLocation) return;

    // Remove existing driver marker
    safeRemoveLayer('driver-marker');
    safeRemoveSource('driver-location');

    // Add driver marker
    if (safeAddSource('driver-location', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [userLocation.lng, userLocation.lat]
        },
        properties: {
          name: 'Driver Location'
        }
      }
    })) {
      safeAddLayer({
        id: 'driver-marker',
        type: 'circle',
        source: 'driver-location',
        paint: {
          'circle-radius': 12,
          'circle-color': '#4CAF50', // Green color to distinguish from blue POI markers
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-opacity': 0.9
        }
      });
    }

    // If we have a route, check if we need to recalculate
    if (route && !isRecalculating) {
      const driver = users.find(u => u.role === 'driver');
      if (driver && driver.isCreator) {
        const currentLocation = { lat: userLocation.lat, lng: userLocation.lng };
        const lastLocation = driver.userLocationCoords;
        
        // If driver has moved more than 0.1 miles, notify parent to recalculate
        if (lastLocation && calculateDistance(currentLocation, lastLocation) > 0.1) {
          console.log('Driver moved significantly, route may need recalculation');
          // Route recalculation should be handled by parent component
        }
      }
    }
  }, [userLocation, users, route, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer]);

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
    setRoute(calculatedRoute); // Set route to null when calculatedRoute is null
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
    if (!mapLoaded) return;

    // Clear route layers when route is null
    if (!route) {
      console.log('MapView - Clearing route layers');
      // Remove existing route layers safely
      for (let i = 0; i < 10; i++) {
        const layerId = `route-line-${i}`;
        const sourceId = `route-${i}`;
        safeRemoveLayer(layerId);
        safeRemoveSource(sourceId);
      }
      
      safeRemoveLayer('route-line');
      safeRemoveSource('route');
      return;
    }

    try {
      // Remove existing route layers safely
      for (let i = 0; i < 10; i++) {
        const layerId = `route-line-${i}`;
        const sourceId = `route-${i}`;
        safeRemoveLayer(layerId);
        safeRemoveSource(sourceId);
      }
      
      safeRemoveLayer('route-line');
      safeRemoveSource('route');

      // Handle multi-vehicle routes
      if (route.routes && Array.isArray(route.routes)) {
        // Multi-vehicle route
        const routeColors = ['#2196F3', '#FF5722', '#4CAF50', '#9C27B0', '#FF9800'];
        
        route.routes.forEach((vehicleRoute, index) => {
          if (vehicleRoute.waypoints && vehicleRoute.waypoints.length > 1) {
            const coordinates = vehicleRoute.waypoints.map(waypoint => 
              [waypoint.location.lng, waypoint.location.lat]
            );
            
            const routeId = `route-${index}`;
            
            if (safeAddSource(routeId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: coordinates
                },
                properties: {
              name: `Route ${index + 1}`,
              driver: vehicleRoute.driver?.displayName || `Driver ${index + 1}`
                }
              }
            })) {
              safeAddLayer({
                id: `route-line-${index}`,
                type: 'line',
                source: routeId,
                layout: {
                  'line-join': 'round',
                  'line-cap': 'round'
                },
                paint: {
                  'line-color': routeColors[index % routeColors.length],
                  'line-width': 6,
                  'line-dasharray': [8, 4]
                }
              });
            }
          }
        });
      } else if (route.features && route.features.length > 0) {
        // Single route
        const routeFeature = route.features[0];
        
        if (safeAddSource('route', {
          type: 'geojson',
          data: routeFeature
        })) {
          safeAddLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#2196F3',
              'line-width': 6
            }
          });
        }
      }

      // Auto-fit map to show route and all markers
      const allPoints = [];
      
      // Add route coordinates
      if (route.features && route.features.length > 0) {
        const coordinates = route.features[0].geometry.coordinates;
        coordinates.forEach(coord => {
          allPoints.push({ lng: coord[0], lat: coord[1] });
        });
      } else if (route.routes && Array.isArray(route.routes)) {
        // Multi-vehicle route
        route.routes.forEach(vehicleRoute => {
          if (vehicleRoute.waypoints) {
            vehicleRoute.waypoints.forEach(waypoint => {
              if (waypoint.location) {
                allPoints.push({ lat: waypoint.location.lat, lng: waypoint.location.lng });
              }
            });
          }
        });
      }
      
      // Add user locations (only for accepted participants)
      users.forEach(user => {
        if (user.location && 
            user.location.lat && 
            user.location.lng && 
            (user.invitationStatus === 'accepted' || user.role === 'driver')) {
          allPoints.push({ lat: user.location.lat, lng: user.location.lng });
        }
      });
      
      // Add destination
      if (destination && destination.lat && destination.lng) {
        allPoints.push({ lat: destination.lat, lng: destination.lng });
      }
      
      // Add user location if available
      if (userLocation && userLocation.lat && userLocation.lng) {
        allPoints.push({ lat: userLocation.lat, lng: userLocation.lng });
      }
      
      // Fit map to all points if we have any and auto-fit is enabled
      if (allPoints.length > 0 && autoFit) {
        const padding = compact ? 60 : 100;
        console.log('🗺️ Auto-fitting map to show route and all points:', allPoints.length, 'padding:', padding);
        smoothFitMapToPoints(allPoints, padding, 1200); // Adjustable padding, 1.2 second animation
      }
        } catch (error) {
      console.error('Error updating route visualization:', error);
      setError('Failed to display route on map');
        }
  }, [route, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer, smoothFitMapToPoints, users, destination, userLocation, autoFit, compact]);

  // Add destination suggestions markers with enhanced coordinate handling
  useEffect(() => {
    if (!mapLoaded) return;

    // Remove existing suggestion layers and sources
    safeRemoveLayer('suggestions-markers-regular-layer');
    safeRemoveLayer('suggestions-markers-exact-layer');
    safeRemoveSource('suggestions-markers');

    if (destinationSuggestions && destinationSuggestions.length > 0) {
      console.log('🗺️ Processing destination suggestions:', destinationSuggestions.length);
      console.log('🗺️ Raw destination suggestions:', destinationSuggestions);
      
      // Enhanced coordinate validation and extraction
      const suggestionsWithCoords = [];
      const suggestionsWithoutCoords = [];
      const invalidCoordinates = [];
      
      destinationSuggestions.forEach((suggestion, index) => {
        // Use enhanced coordinate validation - support both 'lon' and 'lng' properties
        const lat = suggestion.lat;
        const lng = suggestion.lng || suggestion.lon; // Support both lng and lon
        
        if (lat && lng) {
          const parsedLat = parseFloat(lat);
          const parsedLng = parseFloat(lng);
          
          // Validate coordinates using the same logic as the service
          if (!isNaN(parsedLat) && !isNaN(parsedLng) && 
              parsedLat >= -90 && parsedLat <= 90 && 
              parsedLng >= -180 && parsedLng <= 180) {
            suggestionsWithCoords.push({
              ...suggestion,
              lat: parsedLat,
              lng: parsedLng,
              originalIndex: index
            });
          } else {
            invalidCoordinates.push({
              index,
              name: suggestion.name || suggestion.display_name,
              lat: suggestion.lat,
              lng: suggestion.lng || suggestion.lon,
              parsedLat: parsedLat,
              parsedLng: parsedLng
            });
          }
        } else {
          suggestionsWithoutCoords.push({
            index,
            name: suggestion.name || suggestion.display_name,
            address: suggestion.address,
            coordinateSource: suggestion.coordinateSource || 'none',
            extractionMethod: suggestion.extractionMethod || 0
          });
        }
      });
      
      // Log detailed coordinate analysis
      console.log('🗺️ Coordinate analysis:', {
        total: destinationSuggestions.length,
        withValidCoordinates: suggestionsWithCoords.length,
        withoutCoordinates: suggestionsWithoutCoords.length,
        invalidCoordinates: invalidCoordinates.length,
        successRate: `${((suggestionsWithCoords.length / destinationSuggestions.length) * 100).toFixed(1)}%`
      });
      
      if (suggestionsWithoutCoords.length > 0) {
        console.log('🗺️ Suggestions missing coordinates:', suggestionsWithoutCoords);
      }
      
      if (invalidCoordinates.length > 0) {
        console.log('🗺️ Suggestions with invalid coordinates:', invalidCoordinates);
      }
      
      // Create features only for suggestions with valid coordinates
      const suggestionFeatures = suggestionsWithCoords.map((suggestion) => {
        // Use the isExactMatch property passed from the search results
        const isExactMatch = suggestion.isExactMatch || false;
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [suggestion.lng, suggestion.lat] // Mapbox expects [lng, lat] format
          },
          properties: {
            id: `suggestion-${suggestion.originalIndex}`,
            name: suggestion.name || suggestion.display_name,
            distance: suggestion.distance,
            address: suggestion.address,
            category: suggestion.category,
            availableServices: suggestion.availableServices,
            coordinateSource: suggestion.coordinateSource || 'api',
            extractionMethod: suggestion.extractionMethod || 0,
            searchMetadata: suggestion.searchMetadata,
            index: suggestion.originalIndex,
            isExactMatch: isExactMatch
          }
        };
      });

      console.log('🗺️ Created suggestion features:', suggestionFeatures.length);
      
      if (suggestionFeatures.length > 0) {
        console.log('🗺️ Adding suggestions source to map...');
        
        if (safeAddSource('suggestions-markers', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: suggestionFeatures
          }
        })) {
          console.log('🗺️ Successfully added suggestions source');
          
          // Enhanced marker styling with different colors based on coordinate source
          const getMarkerColor = (coordinateSource) => {
            switch (coordinateSource) {
              case 'api': return '#FF1744'; // Bright red for API coordinates
              case 'fallback_geocoding': return '#FF9800'; // Orange for geocoded coordinates
              case 'coordinates': return '#4CAF50'; // Green for direct coordinates
              case 'center': return '#2196F3'; // Blue for center coordinates
              default: return '#9C27B0'; // Purple for unknown source
            }
          };
          
          // Add regular suggestions layer (non-exact matches)
          if (safeAddLayer({
            id: 'suggestions-markers-regular-layer',
            type: 'circle',
            source: 'suggestions-markers',
            filter: ['!', ['get', 'isExactMatch']], // Only show non-exact matches
            paint: {
              'circle-radius': 6,
              'circle-color': '#1976d2', // Blue for regular matches
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': 0.9
            }
          })) {
            console.log('🗺️ Successfully added regular suggestions layer');
          }
          
          // Add exact match suggestions layer (prominent styling)
          if (safeAddLayer({
            id: 'suggestions-markers-exact-layer',
            type: 'circle',
            source: 'suggestions-markers',
            filter: ['get', 'isExactMatch'], // Only show exact matches
            paint: {
              'circle-radius': 10, // Larger for exact matches
              'circle-color': '#d32f2f', // Red for exact matches
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3, // Thicker border for exact matches
              'circle-opacity': 1.0
            }
          })) {
            console.log('🗺️ Successfully added exact match suggestions layer');
          }
          
          // Add click handlers for both layers
          if (onSuggestionSelect) {
            // Click handler for regular suggestions
            map.current.on('click', 'suggestions-markers-regular-layer', (e) => {
              console.log('🗺️ Regular suggestion clicked:', e.features[0]?.properties);
              console.log('🗺️ Click event details:', {
                features: e.features.length,
                point: e.point,
                lngLat: e.lngLat
              });
              if (e.features.length > 0) {
                showPOIPopup(e.features[0].properties, e.lngLat);
              }
            });
            
            // Click handler for exact match suggestions
            map.current.on('click', 'suggestions-markers-exact-layer', (e) => {
              console.log('🗺️ Exact match suggestion clicked:', e.features[0]?.properties);
              console.log('🗺️ Click event details:', {
                features: e.features.length,
                point: e.point,
                lngLat: e.lngLat
              });
              if (e.features.length > 0) {
                showPOIPopup(e.features[0].properties, e.lngLat);
              }
            });
            
            // Hover effects for both layers
            map.current.on('mouseenter', 'suggestions-markers-regular-layer', () => {
              map.current.getCanvas().style.cursor = 'pointer';
            });
            map.current.on('mouseenter', 'suggestions-markers-exact-layer', () => {
              map.current.getCanvas().style.cursor = 'pointer';
            });
            map.current.on('mouseleave', 'suggestions-markers-regular-layer', () => {
              map.current.getCanvas().style.cursor = '';
            });
            map.current.on('mouseleave', 'suggestions-markers-exact-layer', () => {
              map.current.getCanvas().style.cursor = '';
            });
          }
          
          if (suggestionFeatures.length > 0) {
            console.log('🔴 Successfully added enhanced markers layer');
            
            // Auto-zoom to fit suggestions and user location
            if (suggestionFeatures.length > 0) {
              const bounds = new mapboxgl.LngLatBounds();
              
              // Add user location to bounds if available
              if (userLocation && userLocation.lat && userLocation.lng) {
                bounds.extend([userLocation.lng, userLocation.lat]);
              }
              
              // Add all suggestions to bounds
              suggestionFeatures.forEach(feature => {
                const coords = feature.geometry.coordinates;
                bounds.extend(coords);
              });
              
              // Fit map to bounds with padding
              map.current.fitBounds(bounds, {
                padding: 80,
                duration: 1000,
                maxZoom: 15
              });
              
              console.log('🗺️ Auto-zoomed to fit suggestions and user location');
            }
            
            // Enhanced click handler with better popup content (DISABLED - using dual-layer system)
            /*
            map.current.on('click', 'suggestions-markers-layer', (e) => {
              console.log('📍 Suggestion marker clicked:', e.features[0]?.properties);
              
              if (e.features.length > 0) {
                const feature = e.features[0];
                const properties = feature.properties;
                
                console.log('📍 Creating enhanced popup for:', properties.name);
                
                // Remove any existing popups first
                const existingPopups = document.querySelectorAll('.mapboxgl-popup');
                existingPopups.forEach(popup => popup.remove());
                
                // Create enhanced popup content with Google Maps-like design
                const getCategoryIcon = (category) => {
                  const categoryMap = {
                    'gas_station': '⛽',
                    'restaurant': '🍽️',
                    'coffee_shop': '☕',
                    'pharmacy': '💊',
                    'grocery_store': '🛒',
                    'hospital': '🏥',
                    'bank': '🏦',
                    'school': '🏫',
                    'park': '🌳',
                    'shopping': '🛍️',
                    'entertainment': '🎬',
                    'hotel': '🏨',
                    'airport': '✈️',
                    'default': '📍'
                  };
                  return categoryMap[category] || categoryMap[category?.toLowerCase()] || categoryMap.default;
                };

                const getCategoryName = (category) => {
                  const nameMap = {
                    'gas_station': 'Gas Station',
                    'restaurant': 'Restaurant',
                    'coffee_shop': 'Coffee Shop',
                    'pharmacy': 'Pharmacy',
                    'grocery_store': 'Grocery Store',
                    'hospital': 'Hospital',
                    'bank': 'Bank',
                    'school': 'School',
                    'park': 'Park',
                    'shopping': 'Shopping',
                    'entertainment': 'Entertainment',
                    'hotel': 'Hotel',
                    'airport': 'Airport',
                    'poi': 'Point of Interest'
                  };
                  return nameMap[category] || nameMap[category?.toLowerCase()] || 'Location';
                };

                const formatDistance = (distance) => {
                  if (!distance) return 'Distance unknown';
                  if (distance < 0.1) return `${(distance * 5280).toFixed(0)} ft away`;
                  return `${distance.toFixed(1)} mi away`;
                };

                const getBusinessHours = (category) => {
                  // Mock business hours based on category - in real app, this would come from API
                  const hoursMap = {
                    'gas_station': '24/7',
                    'restaurant': '11:00 AM - 10:00 PM',
                    'coffee_shop': '6:00 AM - 8:00 PM',
                    'pharmacy': '8:00 AM - 9:00 PM',
                    'grocery_store': '6:00 AM - 11:00 PM',
                    'bank': '9:00 AM - 5:00 PM',
                    'default': 'Hours vary'
                  };
                  return hoursMap[category] || hoursMap[category?.toLowerCase()] || hoursMap.default;
                };

                const getRatingStars = () => {
                  // Mock rating - in real app, this would come from API
                  const rating = 4.2 + (Math.random() * 0.6); // Random rating between 4.2-4.8
                  const fullStars = Math.floor(rating);
                  const hasHalfStar = rating % 1 >= 0.5;
                  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
                  
                  return '★'.repeat(fullStars) + (hasHalfStar ? '☆' : '') + '☆'.repeat(emptyStars);
                };

                const categoryIcon = getCategoryIcon(properties.category);
                const categoryName = getCategoryName(properties.category);
                const formattedDistance = formatDistance(properties.distance);
                const businessHours = getBusinessHours(properties.category);
                const ratingStars = getRatingStars();
                const rating = 4.2 + (Math.random() * 0.6);

                const popupContent = `
                  <div class="poi-popup">
                    <!-- Header with icon and basic info -->
                    <div class="poi-header">
                      <div class="poi-icon">${categoryIcon}</div>
                      <div class="poi-title-section">
                        <h3 class="poi-name">${properties.name}</h3>
                        <div class="poi-category">${categoryName}</div>
                    </div>
                    </div>

                    <!-- Rating and distance -->
                    <div class="poi-rating-section">
                      <div class="poi-rating">
                        <span class="stars">${ratingStars}</span>
                        <span class="rating-text">${rating.toFixed(1)}</span>
                    </div>
                      <div class="poi-distance">
                        <span class="distance-icon">📍</span>
                        <span class="distance-text">${formattedDistance}</span>
                      </div>
                    </div>

                    <!-- Address -->
                    <div class="poi-address">
                      <span class="address-icon">🏠</span>
                      <span class="address-text">${properties.address || 'Address not available'}</span>
                    </div>

                    <!-- Business hours -->
                    <div class="poi-hours">
                      <span class="hours-icon">🕒</span>
                      <span class="hours-text">${businessHours}</span>
                    </div>

                    <!-- Action buttons -->
                    <div class="poi-actions">
                      <button class="poi-action-btn primary" data-index="${properties.index}">
                        <span class="btn-icon">✅</span>
                        <span class="btn-text">Select Destination</span>
                      </button>
                      <button class="poi-action-btn secondary directions-btn" data-address="${properties.address}">
                        <span class="btn-icon">🧭</span>
                        <span class="btn-text">Directions</span>
                    </button>
                    </div>

                    <!-- Additional info section -->
                    <div class="poi-additional">
                      <div class="additional-item">
                        <span class="item-label">Type:</span>
                        <span class="item-value">${categoryName}</span>
                      </div>
                      ${properties.coordinateSource ? `
                        <div class="additional-item">
                          <span class="item-label">Source:</span>
                          <span class="item-value">${properties.coordinateSource.replace('_', ' ')}</span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;

                // Create POI popup with Google Maps-like styling
                const popup = new mapboxgl.Popup({
                  closeButton: true,
                  closeOnClick: false,
                  maxWidth: '380px',
                  className: 'poi-popup-container',
                  offset: 15,
                  anchor: 'bottom'
                })
                .setLngLat(e.lngLat)
                .setHTML(popupContent)
                .addTo(map.current);

                console.log('📍 Enhanced popup created and added to map');

                // Enhanced event listener setup for new POI popup
                const setupPOIPopupListeners = () => {
                  console.log('📍 Setting up POI popup event listeners...');
                  
                  const popupContainer = document.querySelector('.mapboxgl-popup-content');
                  if (popupContainer) {
                    console.log('📍 Found POI popup container');
                    
                    // Select destination button
                    const selectBtn = popupContainer.querySelector('.poi-action-btn.primary');
                    if (selectBtn) {
                      console.log('📍 Found select destination button, adding click listener');
                      
                      // Remove any existing listeners to prevent duplicates
                      selectBtn.removeEventListener('click', handleSelectDestinationClick);
                      selectBtn.addEventListener('click', handleSelectDestinationClick);
                      
                      function handleSelectDestinationClick(event) {
                        event.preventDefault();
                        event.stopPropagation();
                        
                        console.log('📍 Select destination button clicked!');
                        
                        const suggestionIndex = parseInt(selectBtn.getAttribute('data-index'));
                        const selectedSuggestion = destinationSuggestions[suggestionIndex];
                        
                        console.log('📍 POI suggestion selection:', {
                          index: suggestionIndex,
                          suggestion: selectedSuggestion,
                          hasHandler: !!onSuggestionSelect
                        });
                        
                        if (selectedSuggestion && onSuggestionSelect) {
                          console.log('📍 Calling onSuggestionSelect with POI data:', selectedSuggestion);
                          onSuggestionSelect(selectedSuggestion);
                          popup.remove();
                        } else {
                          console.log('❌ Could not find suggestion or handler:', { 
                            suggestionIndex, 
                            selectedSuggestion, 
                            hasHandler: !!onSuggestionSelect 
                          });
                        }
                      }
                    } else {
                      console.log('❌ Could not find select destination button in popup');
                    }
                    
                    // Directions button
                    const directionsBtn = popupContainer.querySelector('.poi-action-btn.secondary.directions-btn');
                    if (directionsBtn) {
                      console.log('📍 Found directions button, adding click listener');
                      
                      directionsBtn.removeEventListener('click', handleDirectionsClick);
                      directionsBtn.addEventListener('click', handleDirectionsClick);
                      
                      function handleDirectionsClick(event) {
                        event.preventDefault();
                        event.stopPropagation();
                        
                        console.log('📍 Directions button clicked!');
                        
                        const address = directionsBtn.getAttribute('data-address');
                        if (address) {
                          // Open Google Maps directions
                          const encodedAddress = encodeURIComponent(address);
                          const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
                          window.open(directionsUrl, '_blank');
                        }
                      }
                    }
                    
                    // Close button handling
                    const closeBtn = popupContainer.parentElement?.querySelector('.mapboxgl-popup-close-button');
                    if (closeBtn) {
                      console.log('📍 Found close button, ensuring it works');
                      
                      closeBtn.removeEventListener('click', handleCloseClick);
                      closeBtn.addEventListener('click', handleCloseClick);
                      
                      function handleCloseClick() {
                        console.log('ℹ️ Close button clicked');
                        popup.remove();
                      }
                    }
                  } else {
                    console.log('❌ Could not find POI popup container');
                  }
                };

                // Try immediate setup first
                setupPOIPopupListeners();
                
                // Also try with a small delay as backup
                setTimeout(setupPOIPopupListeners, 50);

                // Feedback when popup is closed
                popup.on('close', () => {
                  console.log('ℹ️ POI popup closed for:', properties.name);
                });
              }
            });
            */

          } else {
            console.log('❌ Failed to add enhanced markers layer');
          }
        } else {
          console.log('❌ Failed to add suggestions source');
        }
      } else {
        console.log('🗺️ No valid suggestions to display on map');
      }
    }
  }, [users?.length, destination?.lat, destination?.lng, destinationSuggestions?.length, poiMarkers?.length, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer, onSuggestionSelect]);

  // Add POI markers functionality
  useEffect(() => {
    console.log('🗺️ POI markers useEffect triggered:', {
      mapLoaded,
      poiMarkersLength: poiMarkers?.length,
      poiMarkers: poiMarkers
    });
    
    if (!mapLoaded || !poiMarkers || poiMarkers.length === 0) {
      // Remove POI markers if none exist
      console.log('🗺️ Removing POI markers - no markers or map not loaded');
      safeRemoveLayer('poi-markers-regular-layer');
      safeRemoveLayer('poi-markers-exact-layer');
      safeRemoveSource('poi-markers');
      return;
    }

    console.log('🗺️ Adding POI markers:', poiMarkers.length, 'markers');

    // Remove existing POI markers
    safeRemoveLayer('poi-markers-regular-layer');
    safeRemoveLayer('poi-markers-exact-layer');
    safeRemoveSource('poi-markers');

    // Filter valid POI markers
    const validPoiMarkers = poiMarkers.filter(marker => 
      marker.lat && marker.lng && 
      !isNaN(parseFloat(marker.lat)) && !isNaN(parseFloat(marker.lng)) &&
      parseFloat(marker.lat) >= -90 && parseFloat(marker.lat) <= 90 &&
      parseFloat(marker.lng) >= -180 && parseFloat(marker.lng) <= 180
    );

    if (validPoiMarkers.length > 0) {
      console.log('🗺️ POI markers for map:', validPoiMarkers.map(m => ({
        name: m.name,
        isExactMatch: m.isExactMatch,
        matchType: m.matchType,
        isBrandSearch: m.isBrandSearch
      })));
      
      // Separate exact matches from regular matches
      const exactMatches = validPoiMarkers.filter(marker => marker.isExactMatch);
      const regularMatches = validPoiMarkers.filter(marker => !marker.isExactMatch);
      
      console.log('🗺️ Exact matches:', exactMatches.length, 'Regular matches:', regularMatches.length);
      
      // Add POI markers source
      if (safeAddSource('poi-markers', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: validPoiMarkers.map(marker => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(marker.lng), parseFloat(marker.lat)]
            },
            properties: {
              id: marker.id,
              name: marker.name,
              address: marker.address,
              distance: marker.distance,
              category: marker.category,
              type: marker.type,
              isBrandSearch: Boolean(marker.isBrandSearch),
              isExactMatch: Boolean(marker.isExactMatch),
              matchType: marker.matchType,
              searchQuery: marker.searchQuery
            }
          }))
        }
      })) {
        // Add regular POI markers layer (non-exact matches)
        if (safeAddLayer({
          id: 'poi-markers-regular-layer',
          type: 'symbol',
          source: 'poi-markers',
          filter: ['!', ['get', 'isExactMatch']], // Only show non-exact matches
          layout: {
            'icon-image': 'marker',
            'icon-size': 1.5,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': 11,
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#1976d2',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
          }
        })) {
          console.log('🗺️ Successfully added regular POI markers layer');
        }
        
        // Add exact match POI markers layer (prominent styling)
        if (safeAddLayer({
          id: 'poi-markers-exact-layer',
          type: 'symbol',
          source: 'poi-markers',
          filter: ['get', 'isExactMatch'], // Only show exact matches
          layout: {
            'icon-image': 'marker-15',
            'icon-size': 2.2,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': 14,
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#d32f2f',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2.5
          }
        })) {
          console.log('🗺️ Successfully added exact match POI markers layer');
        }
        
        // Add click handlers for both layers
        if (onPoiMarkerClick) {
          // Click handler for regular markers
          map.current.on('click', 'poi-markers-regular-layer', (e) => {
            console.log('🗺️ Regular POI marker clicked:', e.features[0]?.properties);
            const markerData = {
              id: e.features[0].properties.id,
              name: e.features[0].properties.name,
              address: e.features[0].properties.address,
              distance: e.features[0].properties.distance,
              category: e.features[0].properties.category,
              type: e.features[0].properties.type,
              isBrandSearch: e.features[0].properties.isBrandSearch,
              isExactMatch: e.features[0].properties.isExactMatch,
              searchQuery: e.features[0].properties.searchQuery,
              lat: e.lngLat.lat,
              lng: e.lngLat.lng
            };
            onPoiMarkerClick(markerData);
          });
          
          // Click handler for exact match markers
          map.current.on('click', 'poi-markers-exact-layer', (e) => {
            console.log('🗺️ Exact match POI marker clicked:', e.features[0]?.properties);
            const markerData = {
              id: e.features[0].properties.id,
              name: e.features[0].properties.name,
              address: e.features[0].properties.address,
              distance: e.features[0].properties.distance,
              category: e.features[0].properties.category,
              type: e.features[0].properties.type,
              isBrandSearch: e.features[0].properties.isBrandSearch,
              isExactMatch: e.features[0].properties.isExactMatch,
              searchQuery: e.features[0].properties.searchQuery,
              lat: e.lngLat.lat,
              lng: e.lngLat.lng
            };
            onPoiMarkerClick(markerData);
          });

          // Hover effects for both layers
          map.current.on('mouseenter', 'poi-markers-regular-layer', () => {
              map.current.getCanvas().style.cursor = 'pointer';
            });
          map.current.on('mouseenter', 'poi-markers-exact-layer', () => {
            map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'poi-markers-regular-layer', () => {
            map.current.getCanvas().style.cursor = '';
          });
          map.current.on('mouseleave', 'poi-markers-exact-layer', () => {
            map.current.getCanvas().style.cursor = '';
          });
        }
        
        if (exactMatches.length > 0 || regularMatches.length > 0) {
          console.log('🗺️ Successfully added POI markers layer');
          console.log('🗺️ Mapbox expressions used:');
          console.log('🗺️ - icon-image: case expression for isExactMatch');
          console.log('🗺️ - icon-size: case expression for isExactMatch');
          console.log('🗺️ - text-size: case expression for isExactMatch');
          console.log('🗺️ - text-color: case expression for isExactMatch');

          // Auto-fit map to show all POI markers
          if (validPoiMarkers.length > 0) {
            console.log('🗺️ Auto-fitting map to show POI markers');
            const bounds = new mapboxgl.LngLatBounds();
            
            // Add user location if available
            if (userLocation && userLocation.lat && userLocation.lng) {
              bounds.extend([userLocation.lng, userLocation.lat]);
            }
            
            // Add all POI markers
            validPoiMarkers.forEach(marker => {
              bounds.extend([parseFloat(marker.lng), parseFloat(marker.lat)]);
            });
            
            map.current.fitBounds(bounds, {
              padding: 120,
              duration: 2000,
              maxZoom: 14
            });
          }

          // Add click handler for POI markers
          if (onPoiMarkerClick) {
            map.current.on('click', 'poi-markers-layer', (e) => {
              console.log('🗺️ POI marker clicked:', e.features[0]?.properties);
              const markerData = {
                id: e.features[0].properties.id,
                name: e.features[0].properties.name,
                address: e.features[0].properties.address,
                distance: e.features[0].properties.distance,
                category: e.features[0].properties.category,
                type: e.features[0].properties.type,
                isBrandSearch: e.features[0].properties.isBrandSearch,
                searchQuery: e.features[0].properties.searchQuery,
                lat: e.lngLat.lat,
                lng: e.lngLat.lng
              };
              onPoiMarkerClick(markerData);
            });

            // Add hover effects
            map.current.on('mouseenter', 'poi-markers-layer', () => {
              map.current.getCanvas().style.cursor = 'pointer';
            });

            map.current.on('mouseleave', 'poi-markers-layer', () => {
              map.current.getCanvas().style.cursor = '';
            });
          }
          } else {
          console.log('❌ Failed to add POI markers layer');
          }
        } else {
        console.log('❌ Failed to add POI markers source');
        }
      } else {
      console.log('🗺️ No valid POI markers to display on map');
      }
  }, [poiMarkers?.length, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer, onPoiMarkerClick]);

  // Enhanced map fitting with better handling of coordinate availability
  useEffect(() => {
    if (!mapLoaded) return;

    const pointsToFit = [];

    // Add user location if available
    if (userLocation && userLocation.lat && userLocation.lng) {
      pointsToFit.push({ lat: userLocation.lat, lng: userLocation.lng });
    }

    // Add destination if available
    if (destination && destination.lat && destination.lng) {
      pointsToFit.push({ lat: destination.lat, lng: destination.lng });
    }

    // Add suggestions with valid coordinates
    if (destinationSuggestions && destinationSuggestions.length > 0) {
      destinationSuggestions.forEach(suggestion => {
        if (suggestion.lat && suggestion.lon) {
          const lat = parseFloat(suggestion.lat);
          const lon = parseFloat(suggestion.lon);
          
          // Only add if coordinates are valid
          if (!isNaN(lat) && !isNaN(lon) && 
              lat >= -90 && lat <= 90 && 
              lon >= -180 && lon <= 180) {
            pointsToFit.push({ lat: lat, lng: lon });
          }
        }
      });
    }

    // Add POI markers with valid coordinates
    if (poiMarkers && poiMarkers.length > 0) {
      poiMarkers.forEach(marker => {
        if (marker.lat && marker.lng) {
          const lat = parseFloat(marker.lat);
          const lng = parseFloat(marker.lng);
          
          // Only add if coordinates are valid
          if (!isNaN(lat) && !isNaN(lng) && 
              lat >= -90 && lat <= 90 && 
              lng >= -180 && lng <= 180) {
            pointsToFit.push({ lat: lat, lng: lng });
          }
        }
      });
    }

    // Enhanced map fitting logic
    if (pointsToFit.length > 0) {
      console.log('🗺️ Enhanced map fitting with points:', pointsToFit.length);
      
      // Check if the points are too far apart
      let shouldFitMap = true;
      const maxDistance = 500; // miles
      
      if (pointsToFit.length >= 2) {
        for (let i = 0; i < pointsToFit.length; i++) {
          for (let j = i + 1; j < pointsToFit.length; j++) {
            const distance = calculateDistance(pointsToFit[i], pointsToFit[j]);
            if (distance > maxDistance) {
              console.log('🗺️ Points too far apart, not fitting map:', {
                point1: pointsToFit[i],
                point2: pointsToFit[j],
                distance: distance.toFixed(2) + ' miles'
              });
              shouldFitMap = false;
              break;
            }
          }
          if (!shouldFitMap) break;
        }
      }

      // Additional check for destination and user location
      if (shouldFitMap && destination && userLocation && destinationSuggestions.length === 0) {
        const userDestDistance = calculateDistance(userLocation, destination);
        if (userDestDistance > 200) {
          console.log('🗺️ Destination too far from user, not fitting map:', {
            userLocation,
            destination,
            distance: userDestDistance.toFixed(2) + ' miles'
          });
          shouldFitMap = false;
        }
      }

      if (shouldFitMap) {
        // Enhanced padding and duration based on content
        let padding = 50;
        let duration = 1500;

        if (poiMarkers && poiMarkers.length > 0) {
          // When showing POI markers, give more space to show all markers
          padding = 120;
          duration = 2000;
          
          // Adjust based on number of POI markers
          if (poiMarkers.length > 5) {
            padding = 150;
            duration = 2500;
          }
          
          // Force zoom out for POI markers to ensure all are visible
          const bounds = new mapboxgl.LngLatBounds();
          pointsToFit.forEach(point => {
            bounds.extend([point.lng, point.lat]);
          });
          
          map.current.fitBounds(bounds, {
            padding: padding,
            duration: duration,
            maxZoom: 14 // Limit zoom to ensure markers are visible
          });
          return; // Skip the regular fitBounds call
        } else if (destinationSuggestions && destinationSuggestions.length > 0) {
          // When showing suggestions, give more space and slower animation
          padding = 80;
          duration = 2000;
          
          // Adjust based on number of suggestions
          if (destinationSuggestions.length > 5) {
            padding = 100;
            duration = 2500;
          }
        } else if (destination && userLocation) {
          // When showing route between two points
          padding = 60;
          duration = 1200;
        }

        console.log('🗺️ Fitting map with enhanced parameters:', { padding, duration, pointsCount: pointsToFit.length });
        smoothFitMapToPoints(pointsToFit, padding, duration);
      }
    }
  }, [userLocation?.lat, userLocation?.lng, destination?.lat, destination?.lng, destinationSuggestions?.length, mapLoaded, smoothFitMapToPoints]);

  // Traffic color utility function
  const getTrafficColor = (trafficData) => {
    if (!trafficData) return '#4CAF50';
    
    const severity = trafficData.severity || 'low';
    switch (severity) {
      case 'high': return '#FF5722';
      case 'medium': return '#FF9800';
      case 'low': return '#4CAF50';
      default: return '#4CAF50';
    }
  };

  // Format duration utility
  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  };

  // Format distance utility (now in miles)
  const formatDistance = (miles) => {
    if (!miles) return 'Unknown';
    if (miles < 1) {
      return `${Math.round(miles * 5280)} ft`;
    }
    return `${miles.toFixed(1)} mi`;
  };

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (point1, point2) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in miles
  };

  // Show POI popup with detailed information
  const showPOIPopup = (properties, lngLat) => {
    console.log('📍 Creating enhanced popup for:', properties.name);
    
    // Remove any existing popups first
    const existingPopups = document.querySelectorAll('.mapboxgl-popup');
    existingPopups.forEach(popup => popup.remove());
    
    // Helper functions for popup content
    const getCategoryIcon = (category) => {
      const categoryMap = {
        'gas_station': '⛽',
        'restaurant': '🍽️',
        'coffee_shop': '☕',
        'pharmacy': '💊',
        'grocery_store': '🛒',
        'hospital': '🏥',
        'bank': '🏦',
        'school': '🏫',
        'park': '🌳',
        'shopping': '🛍️',
        'entertainment': '🎬',
        'hotel': '🏨',
        'airport': '✈️',
        'default': '📍'
      };
      return categoryMap[category] || categoryMap[category?.toLowerCase()] || categoryMap.default;
    };

    const getCategoryName = (category) => {
      const nameMap = {
        'gas_station': 'Gas Station',
        'restaurant': 'Restaurant',
        'coffee_shop': 'Coffee Shop',
        'pharmacy': 'Pharmacy',
        'grocery_store': 'Grocery Store',
        'hospital': 'Hospital',
        'bank': 'Bank',
        'school': 'School',
        'park': 'Park',
        'shopping': 'Shopping',
        'entertainment': 'Entertainment',
        'hotel': 'Hotel',
        'airport': 'Airport',
        'poi': 'Point of Interest'
      };
      return nameMap[category] || nameMap[category?.toLowerCase()] || 'Location';
    };

    const formatDistance = (distance) => {
      if (!distance) return 'Distance unknown';
      if (distance < 0.1) return `${(distance * 5280).toFixed(0)} ft away`;
      return `${distance.toFixed(1)} mi away`;
    };

    const getBusinessHours = (category) => {
      // Mock business hours based on category - in real app, this would come from API
      const hoursMap = {
        'gas_station': '24/7',
        'restaurant': '11:00 AM - 10:00 PM',
        'coffee_shop': '6:00 AM - 8:00 PM',
        'pharmacy': '8:00 AM - 9:00 PM',
        'grocery_store': '6:00 AM - 11:00 PM',
        'bank': '9:00 AM - 5:00 PM',
        'default': 'Hours vary'
      };
      return hoursMap[category] || hoursMap[category?.toLowerCase()] || hoursMap.default;
    };

    const getRatingStars = () => {
      // Mock rating - in real app, this would come from API
      const rating = 4.2 + (Math.random() * 0.6); // Random rating between 4.2-4.8
      const fullStars = Math.floor(rating);
      const hasHalfStar = rating % 1 >= 0.5;
      const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
      
      return '★'.repeat(fullStars) + (hasHalfStar ? '☆' : '') + '☆'.repeat(emptyStars);
    };

    const categoryIcon = getCategoryIcon(properties.category);
    const categoryName = getCategoryName(properties.category);
    const formattedDistance = formatDistance(properties.distance);
    const businessHours = getBusinessHours(properties.category);
    const ratingStars = getRatingStars();
    const rating = 4.2 + (Math.random() * 0.6);

    const popupContent = `
      <div class="poi-popup">
        <!-- Header with icon and basic info -->
        <div class="poi-header">
          <div class="poi-icon">${categoryIcon}</div>
          <div class="poi-title-section">
            <h3 class="poi-name">${properties.name}</h3>
            <div class="poi-category">${categoryName}</div>
        </div>
        </div>

        <!-- Rating and distance -->
        <div class="poi-rating-section">
          <div class="poi-rating">
            <span class="stars">${ratingStars}</span>
            <span class="rating-text">${rating.toFixed(1)}</span>
        </div>
          <div class="poi-distance">
            <span class="distance-icon">📍</span>
            <span class="distance-text">${formattedDistance}</span>
          </div>
        </div>

        <!-- Address -->
        <div class="poi-address">
          <span class="address-icon">🏠</span>
          <span class="address-text">${properties.address || 'Address not available'}</span>
        </div>

        <!-- Business hours -->
        <div class="poi-hours">
          <span class="hours-icon">🕒</span>
          <span class="hours-text">${businessHours}</span>
        </div>

        <!-- Action buttons -->
        <div class="poi-actions">
          <button class="poi-action-btn primary" data-index="${properties.index}">
            <span class="btn-icon">✅</span>
            <span class="btn-text">Select Destination</span>
          </button>
          <button class="poi-action-btn secondary directions-btn" data-address="${properties.address}">
            <span class="btn-icon">🧭</span>
            <span class="btn-text">Directions</span>
        </button>
        </div>

        <!-- Additional info section -->
        <div class="poi-additional">
          <div class="additional-item">
            <span class="item-label">Type:</span>
            <span class="item-value">${categoryName}</span>
          </div>
          ${properties.coordinateSource ? `
            <div class="additional-item">
              <span class="item-label">Source:</span>
              <span class="item-value">${properties.coordinateSource.replace('_', ' ')}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Create POI popup with Google Maps-like styling
    const isMobile = window.innerWidth <= 480;
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: isMobile ? '280px' : '380px',
      className: 'poi-popup-container',
      offset: isMobile ? 10 : 15,
      anchor: 'bottom'
    })
    .setLngLat(lngLat)
    .setHTML(popupContent)
    .addTo(map.current);

    console.log('📍 Enhanced popup created and added to map');

    // Enhanced event listener setup for new POI popup
    const setupPOIPopupListeners = () => {
      console.log('📍 Setting up POI popup event listeners...');
      
      const popupContainer = document.querySelector('.mapboxgl-popup-content');
      if (popupContainer) {
        console.log('📍 Found POI popup container');
        
        // Select destination button
        const selectBtn = popupContainer.querySelector('.poi-action-btn.primary');
        if (selectBtn) {
          console.log('📍 Found select destination button, adding click listener');
          
          // Remove any existing listeners to prevent duplicates
          selectBtn.removeEventListener('click', handleSelectDestinationClick);
          selectBtn.addEventListener('click', handleSelectDestinationClick);
          
          function handleSelectDestinationClick(event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log('📍 Select destination button clicked!');
            
            const suggestionIndex = parseInt(selectBtn.getAttribute('data-index'));
            const selectedSuggestion = destinationSuggestions[suggestionIndex];
            
            console.log('📍 POI suggestion selection:', {
              index: suggestionIndex,
              suggestion: selectedSuggestion,
              hasHandler: !!onSuggestionSelect
            });
            
            if (selectedSuggestion && onSuggestionSelect) {
              console.log('📍 Calling onSuggestionSelect with POI data:', selectedSuggestion);
              onSuggestionSelect(selectedSuggestion);
              popup.remove();
            } else {
              console.log('❌ Could not find suggestion or handler:', { 
                suggestionIndex, 
                selectedSuggestion, 
                hasHandler: !!onSuggestionSelect 
              });
            }
          }
        } else {
          console.log('❌ Could not find select destination button in popup');
        }
        
        // Directions button
        const directionsBtn = popupContainer.querySelector('.poi-action-btn.secondary.directions-btn');
        if (directionsBtn) {
          console.log('📍 Found directions button, adding click listener');
          
          directionsBtn.removeEventListener('click', handleDirectionsClick);
          directionsBtn.addEventListener('click', handleDirectionsClick);
          
          function handleDirectionsClick(event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log('📍 Directions button clicked!');
            
            const address = directionsBtn.getAttribute('data-address');
            if (address) {
              // Open Google Maps directions
              const encodedAddress = encodeURIComponent(address);
              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
              window.open(directionsUrl, '_blank');
            }
          }
        }
        
        // Close button handling
        const closeBtn = popupContainer.parentElement?.querySelector('.mapboxgl-popup-close-button');
        if (closeBtn) {
          console.log('📍 Found close button, ensuring it works');
          
          closeBtn.removeEventListener('click', handleCloseClick);
          closeBtn.addEventListener('click', handleCloseClick);
          
          function handleCloseClick() {
            console.log('ℹ️ Close button clicked');
            popup.remove();
          }
        }
      } else {
        console.log('❌ Could not find POI popup container');
      }
    };

    // Try immediate setup first
    setupPOIPopupListeners();
    
    // Also try with a small delay as backup
    setTimeout(setupPOIPopupListeners, 50);

    // Feedback when popup is closed
    popup.on('close', () => {
      console.log('ℹ️ POI popup closed for:', properties.name);
    });
  };

  // Add debug log for all suggestions
  useEffect(() => {
    if (destinationSuggestions && destinationSuggestions.length > 0) {
      console.log('🗺️ All destination suggestions:', destinationSuggestions.map(s => ({
        name: s.display_name,
        address: s.address,
        distance: s.distance,
        lat: s.lat,
        lon: s.lon,
        category: s.category
      })));
      
      // Force map to refresh when suggestions change
      if (map.current && mapLoaded) {
        console.log('🗺️ Forcing map refresh due to new suggestions');
        map.current.triggerRepaint();
      }
    } else {
      console.log('🗺️ No destination suggestions to display');
    }
  }, [destinationSuggestions?.length, mapLoaded]);

  // Add user markers and destination marker
  useEffect(() => {
    if (!mapLoaded) return;

    // Remove existing user markers and destination marker safely
    safeRemoveLayer('users-markers-layer');
    safeRemoveLayer('destination-marker-layer');
    safeRemoveSource('users-markers');
    safeRemoveSource('destination-marker');

    // Add user markers (only for accepted participants)
    console.log('🗺️ MapView - Processing users for markers:', users.map(u => ({
      uid: u.uid,
      displayName: u.displayName,
      status: u.invitationStatus,
      role: u.role,
      hasLocation: !!(u.location && u.location.lat && u.location.lng),
      willShow: !!(u.location && u.location.lat && u.location.lng && (u.invitationStatus === 'accepted' || u.role === 'driver'))
    })));
    
    const userFeatures = users
      .filter(user => 
        user.location && 
        user.location.lat && 
        user.location.lng && 
        (user.invitationStatus === 'accepted' || user.role === 'driver')
      )
      .map(user => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [user.location.lng, user.location.lat]
        },
        properties: {
          id: user.uid,
          name: user.displayName || user.name,
          role: user.role,
          isCreator: user.isCreator,
          invitationStatus: user.invitationStatus
        }
      }));

    if (userFeatures.length > 0) {
      if (safeAddSource('users-markers', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: userFeatures
        }
      })) {
        safeAddLayer({
          id: 'users-markers-layer',
          type: 'circle',
          source: 'users-markers',
          paint: {
            'circle-radius': 8,
            'circle-color': [
              'case',
              ['==', ['get', 'role'], 'driver'], '#9C27B0', // Purple for driver
              ['==', ['get', 'role'], 'passenger'], '#607D8B', // Blue-grey for passengers
              '#FF9800' // Orange for others
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
          }
        });
      }
    }

    // Add destination marker
    if (destination && destination.lat && destination.lng) {
      if (safeAddSource('destination-marker', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [destination.lng, destination.lat]
          },
          properties: {
            name: destination.display_name || 'Destination'
          }
        }
      })) {
        safeAddLayer({
          id: 'destination-marker-layer',
          type: 'circle',
          source: 'destination-marker',
          paint: {
            'circle-radius': 12,
            'circle-color': '#FF5722',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3
          }
        });
      }
    }

    // Auto-fit map to show all markers and destination
    const allPoints = [];
    
    // Add user locations (only for accepted participants)
    users.forEach(user => {
      if (user.location && 
          user.location.lat && 
          user.location.lng && 
          (user.invitationStatus === 'accepted' || user.role === 'driver')) {
        allPoints.push({ lat: user.location.lat, lng: user.location.lng });
      }
    });
    
    // Add destination
    if (destination && destination.lat && destination.lng) {
      allPoints.push({ lat: destination.lat, lng: destination.lng });
    }
    
    // Add user location if available
    if (userLocation && userLocation.lat && userLocation.lng) {
      allPoints.push({ lat: userLocation.lat, lng: userLocation.lng });
      
      // Add a separate user location marker if not already in users array
      const userInUsersArray = users.some(u => 
        u.uid === 'current-user' || 
        (u.location && u.location.lat === userLocation.lat && u.location.lng === userLocation.lng)
      );
      
      if (!userInUsersArray) {
        console.log('🗺️ Adding separate user location marker');
        if (safeAddSource('user-location-marker', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [userLocation.lng, userLocation.lat]
            },
            properties: {
              name: 'Your Location'
            }
          }
        })) {
          safeAddLayer({
            id: 'user-location-marker-layer',
            type: 'circle',
            source: 'user-location-marker',
            paint: {
              'circle-radius': 12,
              'circle-color': '#FF9800', // Orange color to distinguish from blue POI markers and green driver marker
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
              'circle-opacity': 0.9
            }
          });
        }
      }
    }
    
    // Fit map to all points if we have any and auto-fit is enabled
    if (allPoints.length > 0 && autoFit) {
      const padding = compact ? 40 : 80;
      console.log('🗺️ Auto-fitting map to show all points:', allPoints.length, 'padding:', padding);
      smoothFitMapToPoints(allPoints, padding, 1000); // Adjustable padding, 1 second animation
    }
  }, [users?.length, destination?.lat, destination?.lng, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer, smoothFitMapToPoints, userLocation, autoFit, compact]);

  return (
    <div className="map-container">
      <div 
        ref={mapContainer} 
        className="map" 
        onClick={manualAutoFit}
        style={{ cursor: 'pointer' }}
        title="Click to fit all riders and destination in view"
      />
      
      {/* Route Information Panel */}
      {route && routeDetails && !hideRouteInfo && (
        <div className="route-info-panel">
          <h3>Route Information</h3>
          <div className="route-stats">
            <div className="stat">
              <span className="label">Distance:</span>
              <span className="value">{formatDistance(routeDetails.distance / 1609.34)}</span>
            </div>
            <div className="stat">
              <span className="label">Duration:</span>
              <span className="value">{formatDuration(routeDetails.duration)}</span>
            </div>
            <div className="stat">
              <span className="label">Waypoints:</span>
              <span className="value">{routeDetails.waypoints?.length || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Warning Display */}
      {warning && (
        <div className="warning-message">
          <span>{warning}</span>
          <button onClick={() => setWarning(null)}>×</button>
        </div>
      )}

      {/* Loading Indicator */}
      {isRecalculating && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Recalculating route...</span>
        </div>
      )}
    </div>
  );
}

export default MapView;

