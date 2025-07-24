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
  mapClickMode = null // New prop for map click mode
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
          'circle-radius': 10,
          'circle-color': '#2196F3',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
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

      // Fit map to route bounds
      if (route.features && route.features.length > 0) {
        const coordinates = route.features[0].geometry.coordinates;
        const bounds = coordinates.reduce((bounds, coord) => {
          return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        map.current.fitBounds(bounds, {
          padding: 50,
          duration: 1000
        });
      }
        } catch (error) {
      console.error('Error updating route visualization:', error);
      setError('Failed to display route on map');
        }
  }, [route, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer]);

  // Add destination suggestions markers with enhanced coordinate handling
  useEffect(() => {
    if (!mapLoaded) return;

    // Remove existing suggestion layers and sources
    safeRemoveLayer('suggestions-labels-layer');
    safeRemoveLayer('suggestions-markers-layer');
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
            index: suggestion.originalIndex
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
          
          // Add markers with enhanced styling
          if (safeAddLayer({
            id: 'suggestions-markers-layer',
            type: 'circle',
            source: 'suggestions-markers',
            paint: {
              'circle-radius': [
                'case',
                ['==', ['get', 'coordinateSource'], 'fallback_geocoding'], 8, // Larger for geocoded
                ['==', ['get', 'coordinateSource'], 'api'], 6, // Standard for API
                7 // Default size
              ],
              'circle-color': [
                'case',
                ['==', ['get', 'coordinateSource'], 'api'], '#FF1744',
                ['==', ['get', 'coordinateSource'], 'fallback_geocoding'], '#FF9800',
                ['==', ['get', 'coordinateSource'], 'coordinates'], '#4CAF50',
                ['==', ['get', 'coordinateSource'], 'center'], '#2196F3',
                '#9C27B0' // Default purple
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': 0.9
            }
          })) {
            console.log('🔴 Successfully added enhanced markers layer');
            
            // Add enhanced text labels with more information
            if (safeAddLayer({
              id: 'suggestions-labels-layer',
              type: 'symbol',
              source: 'suggestions-markers',
              layout: {
                'text-field': [
                  'concat',
                  ['get', 'name'],
                  '\n',
                  ['case',
                    ['has', 'distance'], 
                    ['concat', ['number-format', ['get', 'distance'], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }], ' mi'],
                    'Distance unknown'
                  ]
                ],
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-offset': [0, 2.2],
                'text-anchor': 'top',
                'text-size': 11,
                'text-max-width': 10
              },
              paint: {
                'text-color': '#333333',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2
              }
            })) {
              console.log('🗺️ Successfully added enhanced text labels layer');
            }
            
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
            
            // Enhanced click handler with better popup content
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

            // Enhanced cursor handling
            map.current.on('mouseenter', 'suggestions-markers-layer', () => {
              map.current.getCanvas().style.cursor = 'pointer';
            });

            map.current.on('mouseleave', 'suggestions-markers-layer', () => {
              map.current.getCanvas().style.cursor = '';
            });
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
  }, [users?.length, destination?.lat, destination?.lng, destinationSuggestions?.length, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer, onSuggestionSelect]);

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

        if (destinationSuggestions && destinationSuggestions.length > 0) {
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

    // Add user markers
    const userFeatures = users
      .filter(user => user.location && user.location.lat && user.location.lng)
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
              ['==', ['get', 'role'], 'driver'], '#2196F3',
              ['==', ['get', 'role'], 'passenger'], '#4CAF50',
              '#FF9800'
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
  }, [users?.length, destination?.lat, destination?.lng, mapLoaded, safeRemoveLayer, safeRemoveSource, safeAddSource, safeAddLayer]);

  return (
    <div className="map-container">
      <div ref={mapContainer} className="map" />
      
      {/* Route Information Panel */}
      {route && routeDetails && (
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

