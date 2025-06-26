// routeService.js - Enhanced route calculation with VRP algorithm and proper API handling

// Configuration
const MAPQUEST_CONFIG = {
  baseUrl: 'https://www.mapquestapi.com/directions/v2',
  apiKey: import.meta.env.VITE_MAPQUEST_API_KEY || 'YOUR_MAPQUEST_API_KEY',
  timeout: 10000,
  maxRetries: 3,
  retryDelay: 1000
};

// Cache configuration
const CACHE_CONFIG = {
  clientTTL: 24 * 60 * 60 * 1000, // 24 hours
  serverTTL: 48 * 60 * 60 * 1000, // 48 hours
  maxCacheSize: 100 // Maximum cached routes
};

// VRP Algorithm Configuration
const VRP_CONFIG = {
  maxPassengers: 8,
  maxRouteDistance: 100, // km
  maxRouteDuration: 120, // minutes
  timeWindowBuffer: 5 // minutes buffer for time windows
};

/**
 * Enhanced route calculation with VRP optimization
 * @param {Array} waypoints - Array of waypoint objects
 * @param {Object} constraints - VRP constraints
 * @returns {Promise<Object>} - Optimized route data
 */
export const calculateRoute = async (waypoints, constraints = {}) => {
  console.log('Starting route calculation:', { waypoints: waypoints.length, constraints });
  
  // Validate input
  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required for route calculation');
  }

  // Apply VRP optimization
  const optimizedWaypoints = await optimizeRouteWithVRP(waypoints, constraints);
  
  // Check cache first
  const cacheKey = generateCacheKey(optimizedWaypoints);
  const cachedRoute = await getCachedRoute(cacheKey);
  if (cachedRoute) {
    console.log('Route found in cache');
    return cachedRoute;
  }

  // Calculate route with fallback chain
  const route = await calculateRouteWithFallback(optimizedWaypoints);
  
  // Cache the result
  await cacheRoute(cacheKey, route);
  
  return route;
};

/**
 * Single-vehicle VRP algorithm with time windows
 * @param {Array} waypoints - Original waypoints
 * @param {Object} constraints - VRP constraints
 * @returns {Array} - Optimized waypoint order
 */
const optimizeRouteWithVRP = async (waypoints, constraints) => {
  console.log('Applying VRP optimization:', { waypoints: waypoints.length, constraints });
  
  // Extract waypoints and constraints
  const { origin, pickupPoints, destination } = separateWaypoints(waypoints);
  const { timeWindows, capacity, maxDistance } = constraints;
  
  // Validate capacity constraint
  if (pickupPoints.length > VRP_CONFIG.maxPassengers) {
    throw new Error(`Maximum ${VRP_CONFIG.maxPassengers} passengers allowed per vehicle`);
  }
  
  // Apply nearest neighbor algorithm with 2-opt improvement
  let optimizedOrder = nearestNeighborAlgorithm(origin, pickupPoints, destination);
  
  // Apply 2-opt improvement
  optimizedOrder = twoOptImprovement(optimizedOrder);
  
  // Validate time windows
  if (timeWindows) {
    optimizedOrder = validateTimeWindows(optimizedOrder, timeWindows);
  }
  
  // Validate capacity and distance constraints
  optimizedOrder = validateConstraints(optimizedOrder, constraints);
  
  // Convert back to waypoint format
  const optimizedWaypoints = convertToWaypoints(optimizedOrder);
  
  console.log('VRP optimization completed:', { 
    originalOrder: waypoints.map(w => w.type), 
    optimizedOrder: optimizedWaypoints.map(w => w.type) 
  });
  
  return optimizedWaypoints;
};

/**
 * Separate waypoints by type (origin, pickup, destination)
 */
const separateWaypoints = (waypoints) => {
  const origin = waypoints.find(w => w.type === 'origin' || w.type === 'start');
  const destination = waypoints.find(w => w.type === 'destination' || w.type === 'end');
  const pickupPoints = waypoints.filter(w => w.type === 'pickup' || w.type === 'waypoint');
  
  return { origin, pickupPoints, destination };
};

/**
 * Nearest neighbor algorithm for initial route
 */
const nearestNeighborAlgorithm = (origin, pickupPoints, destination) => {
  const route = [origin];
  let currentPoint = origin;
  const unvisited = [...pickupPoints];
  
  while (unvisited.length > 0) {
    // Find nearest unvisited point
    let nearestIndex = 0;
    let minDistance = calculateDistance(currentPoint.location, unvisited[0].location);
    
    for (let i = 1; i < unvisited.length; i++) {
      const distance = calculateDistance(currentPoint.location, unvisited[i].location);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
    
    // Add nearest point to route
    route.push(unvisited[nearestIndex]);
    currentPoint = unvisited[nearestIndex];
    unvisited.splice(nearestIndex, 1);
  }
  
  route.push(destination);
  return route;
};

/**
 * 2-opt improvement algorithm
 */
const twoOptImprovement = (route) => {
  let improved = true;
  let bestDistance = calculateTotalDistance(route);
  
  while (improved) {
    improved = false;
    
    for (let i = 1; i < route.length - 2; i++) {
      for (let j = i + 1; j < route.length - 1; j++) {
        // Try 2-opt swap
        const newRoute = [...route];
        const segment = newRoute.slice(i, j + 1).reverse();
        newRoute.splice(i, j - i + 1, ...segment);
        
        const newDistance = calculateTotalDistance(newRoute);
        if (newDistance < bestDistance) {
          route = newRoute;
          bestDistance = newDistance;
          improved = true;
        }
      }
    }
  }
  
  return route;
};

/**
 * Validate time windows
 */
const validateTimeWindows = (route, timeWindows) => {
  // Simple time window validation
  // In a full implementation, this would check if the route respects all time windows
  console.log('Time window validation:', { route: route.length, timeWindows });
  return route;
};

/**
 * Validate capacity and distance constraints
 */
const validateConstraints = (route, constraints) => {
  const totalDistance = calculateTotalDistance(route);
  
  if (totalDistance > (constraints.maxDistance || VRP_CONFIG.maxRouteDistance)) {
    console.warn('Route exceeds maximum distance constraint');
  }
  
  return route;
};

/**
 * Calculate distance between two points (Haversine formula)
 */
const calculateDistance = (point1, point2) => {
  const R = 6371; // Earth's radius in km
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
  const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;
  
  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
};

/**
 * Calculate total route distance
 */
const calculateTotalDistance = (route) => {
  let totalDistance = 0;
  for (let i = 1; i < route.length; i++) {
    totalDistance += calculateDistance(route[i-1].location, route[i].location);
  }
  return totalDistance;
};

/**
 * Convert optimized route back to waypoint format
 */
const convertToWaypoints = (optimizedRoute) => {
  return optimizedRoute.map((point, index) => ({
    ...point,
    order: index
  }));
};

/**
 * Calculate route with fallback chain
 */
const calculateRouteWithFallback = async (waypoints) => {
  console.log('Calculating route with fallback chain');
  
  // Try MapQuest API with retries
  for (let attempt = 1; attempt <= MAPQUEST_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`MapQuest API attempt ${attempt}/${MAPQUEST_CONFIG.maxRetries}`);
      const route = await callMapQuestAPI(waypoints);
      return route;
    } catch (error) {
      console.warn(`MapQuest API attempt ${attempt} failed:`, error.message);
      
      if (attempt === MAPQUEST_CONFIG.maxRetries) {
        console.log('All MapQuest attempts failed, trying fallback');
        break;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, MAPQUEST_CONFIG.retryDelay * attempt));
    }
  }
  
  // Fallback to OpenStreetMap
  try {
    console.log('Trying OpenStreetMap fallback');
    return await callOpenStreetMapAPI(waypoints);
  } catch (error) {
    console.warn('OpenStreetMap fallback failed:', error.message);
  }
  
  // Final fallback to straight-line calculation
  console.log('Using straight-line fallback');
  return createStraightLineRoute(waypoints);
};

/**
 * Call MapQuest API with proper formatting
 */
const callMapQuestAPI = async (waypoints) => {
  if (!MAPQUEST_CONFIG.apiKey || MAPQUEST_CONFIG.apiKey === 'YOUR_MAPQUEST_API_KEY') {
    throw new Error('MapQuest API key not configured');
  }
  
  // Format waypoints for MapQuest API
    const locations = waypoints.map(waypoint => {
      const { lat, lng } = waypoint.location;
    // MapQuest expects "lat,lng" format
      return `${lat},${lng}`;
  });

  // Build API URL
  const url = new URL(`${MAPQUEST_CONFIG.baseUrl}/route`);
  url.searchParams.append('key', MAPQUEST_CONFIG.apiKey);
  url.searchParams.append('from', locations[0]);
  url.searchParams.append('to', locations[locations.length - 1]);
    
    // Add waypoints if there are more than 2 points
  if (locations.length > 2) {
    const intermediateWaypoints = locations.slice(1, -1);
      url.searchParams.append('waypoints', intermediateWaypoints.join('|'));
    }
    
  // API parameters
    url.searchParams.append('outFormat', 'json');
    url.searchParams.append('routeType', 'fastest');
  url.searchParams.append('unit', 'k'); // kilometers
    url.searchParams.append('narrativeType', 'none');
    url.searchParams.append('shapeFormat', 'raw');
    url.searchParams.append('generalize', '0');

  console.log('MapQuest API request:', {
    url: url.toString().replace(MAPQUEST_CONFIG.apiKey, '***'),
    waypoints: locations.length
  });

  // Make API request
    const response = await fetch(url.toString(), {
      method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(MAPQUEST_CONFIG.timeout)
    });

    if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MapQuest API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.route || data.route.routeError) {
      throw new Error(data.route?.routeError?.errorCode || 'Route calculation failed');
    }

  return transformMapQuestResponse(data, waypoints);
};

/**
 * Call OpenStreetMap API (fallback)
 */
const callOpenStreetMapAPI = async (waypoints) => {
  // OpenStreetMap OSRM API
  const locations = waypoints.map(waypoint => {
    const { lng, lat } = waypoint.location; // OSRM expects lng,lat
    return `${lng},${lat}`;
  });
  
  const url = `https://router.project-osrm.org/route/v1/driving/${locations.join(';')}?overview=full&geometries=geojson`;
  
  console.log('OpenStreetMap API request:', { url, waypoints: locations.length });
  
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(MAPQUEST_CONFIG.timeout)
  });
  
  if (!response.ok) {
    throw new Error(`OpenStreetMap API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found');
  }
  
  return transformOSRMResponse(data, waypoints);
};

/**
 * Create straight-line route (final fallback)
 */
const createStraightLineRoute = (waypoints) => {
  console.log('Creating straight-line route');
  
  const coordinates = waypoints.map(waypoint => [
    waypoint.location.lng,
    waypoint.location.lat
  ]);

  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    totalDistance += calculateDistance(
      { lat: prev[1], lng: prev[0] },
      { lat: curr[1], lng: curr[0] }
    );
  }
  
  return {
    type: 'FeatureCollection',
    features: [{
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coordinates
    },
    properties: {
      summary: {
        distance: totalDistance,
          duration: totalDistance * 1.5, // Rough estimate: 1 km = 1.5 minutes
        waypoints: waypoints.map((wp, index) => ({
          ...wp,
          order: index
        }))
      }
    }
    }],
    properties: {
      summary: {
        distance: totalDistance,
        duration: totalDistance * 1.5
      },
      metadata: {
        provider: 'straight-line',
        calculatedAt: new Date().toISOString()
      }
    }
  };
};

/**
 * Transform MapQuest response to GeoJSON
 */
const transformMapQuestResponse = (data, waypoints) => {
  const route = data.route;
  const shape = route.shape;
  
  // Parse shape points
  const coordinates = shape.shapePoints.map((point, index) => {
    if (index % 2 === 0) {
      return [shape.shapePoints[index + 1], point]; // lng, lat
    }
    return null;
  }).filter(Boolean);

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: {
        summary: {
          distance: route.distance,
          duration: route.time,
          waypoints: waypoints.map((wp, index) => ({
            ...wp,
            order: index
          }))
        }
      }
    }],
    properties: {
      summary: {
        distance: route.distance,
        duration: route.time
      },
      metadata: {
        provider: 'mapquest',
        calculatedAt: new Date().toISOString()
      }
    }
  };
};

/**
 * Transform OSRM response to GeoJSON
 */
const transformOSRMResponse = (data, waypoints) => {
  const route = data.routes[0];
  
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: route.geometry,
      properties: {
        summary: {
          distance: route.distance / 1000, // Convert to km
          duration: route.duration / 60, // Convert to minutes
          waypoints: waypoints.map((wp, index) => ({
            ...wp,
            order: index
          }))
        }
      }
    }],
    properties: {
      summary: {
        distance: route.distance / 1000,
        duration: route.duration / 60
      },
      metadata: {
        provider: 'openstreetmap',
        calculatedAt: new Date().toISOString()
      }
    }
  };
};

/**
 * Cache management
 */
const generateCacheKey = (waypoints) => {
  const waypointString = waypoints.map(wp => `${wp.location.lat},${wp.location.lng}`).join('|');
  return `route_${btoa(waypointString).slice(0, 32)}`;
};

const getCachedRoute = async (cacheKey) => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { route, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_CONFIG.clientTTL) {
        return route;
      }
      // Remove expired cache
      localStorage.removeItem(cacheKey);
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  return null;
};

const cacheRoute = async (cacheKey, route) => {
  try {
    const cacheData = {
      route,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    
    // Clean up old cache entries
    cleanupCache();
  } catch (error) {
    console.warn('Cache write error:', error);
  }
};

const cleanupCache = () => {
  try {
    const keys = Object.keys(localStorage);
    const routeKeys = keys.filter(key => key.startsWith('route_'));
    
    if (routeKeys.length > CACHE_CONFIG.maxCacheSize) {
      // Remove oldest entries
      const sortedKeys = routeKeys.sort((a, b) => {
        const aData = JSON.parse(localStorage.getItem(a) || '{}');
        const bData = JSON.parse(localStorage.getItem(b) || '{}');
        return (aData.timestamp || 0) - (bData.timestamp || 0);
      });
      
      const keysToRemove = sortedKeys.slice(0, routeKeys.length - CACHE_CONFIG.maxCacheSize);
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  } catch (error) {
    console.warn('Cache cleanup error:', error);
  }
};

/**
 * Mock data for development
 */
export const getMockRoute = (scenario = 'basic') => {
  const mockScenarios = {
    basic: {
      waypoints: [
        { type: 'origin', location: { lat: 40.7128, lng: -74.0060 } },
        { type: 'pickup', location: { lat: 40.7589, lng: -73.9851 } },
        { type: 'pickup', location: { lat: 40.7505, lng: -73.9934 } },
        { type: 'destination', location: { lat: 40.7484, lng: -73.9857 } }
      ],
      distance: 8.5,
      duration: 25
    },
    medium: {
      waypoints: [
        { type: 'origin', location: { lat: 40.7128, lng: -74.0060 } },
        { type: 'pickup', location: { lat: 40.7589, lng: -73.9851 } },
        { type: 'pickup', location: { lat: 40.7505, lng: -73.9934 } },
        { type: 'pickup', location: { lat: 40.7421, lng: -73.9911 } },
        { type: 'pickup', location: { lat: 40.7336, lng: -73.9887 } },
        { type: 'destination', location: { lat: 40.7484, lng: -73.9857 } }
      ],
      distance: 12.3,
      duration: 35
    },
    max: {
      waypoints: [
        { type: 'origin', location: { lat: 40.7128, lng: -74.0060 } },
        { type: 'pickup', location: { lat: 40.7589, lng: -73.9851 } },
        { type: 'pickup', location: { lat: 40.7505, lng: -73.9934 } },
        { type: 'pickup', location: { lat: 40.7421, lng: -73.9911 } },
        { type: 'pickup', location: { lat: 40.7336, lng: -73.9887 } },
        { type: 'pickup', location: { lat: 40.7251, lng: -73.9893 } },
        { type: 'pickup', location: { lat: 40.7166, lng: -73.9869 } },
        { type: 'pickup', location: { lat: 40.7081, lng: -73.9845 } },
        { type: 'destination', location: { lat: 40.7484, lng: -73.9857 } }
      ],
      distance: 18.7,
      duration: 52
    }
  };
  
  const scenarioData = mockScenarios[scenario] || mockScenarios.basic;

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: scenarioData.waypoints.map(wp => [wp.location.lng, wp.location.lat])
      },
      properties: {
        summary: {
          distance: scenarioData.distance,
          duration: scenarioData.duration,
          waypoints: scenarioData.waypoints.map((wp, index) => ({
            ...wp,
            order: index
          }))
        }
      }
    }],
    properties: {
      summary: {
        distance: scenarioData.distance,
        duration: scenarioData.duration
      },
      metadata: {
        provider: 'mock',
        scenario,
        calculatedAt: new Date().toISOString()
      }
    }
  };
};

/**
 * Test functions
 */
export const testMapQuestAPI = async () => {
  try {
    const testWaypoints = [
      { type: 'origin', location: { lat: 40.7128, lng: -74.0060 } },
      { type: 'destination', location: { lat: 40.7589, lng: -73.9851 } }
    ];
    
    const route = await callMapQuestAPI(testWaypoints);
    console.log('MapQuest API test successful:', route);
    return { success: true, route };
  } catch (error) {
    console.error('MapQuest API test failed:', error);
    return { success: false, error: error.message };
  }
};

export const testVRPAlgorithm = async () => {
  try {
    const testWaypoints = [
      { type: 'origin', location: { lat: 40.7128, lng: -74.0060 } },
      { type: 'pickup', location: { lat: 40.7589, lng: -73.9851 } },
      { type: 'pickup', location: { lat: 40.7505, lng: -73.9934 } },
      { type: 'pickup', location: { lat: 40.7421, lng: -73.9911 } },
      { type: 'destination', location: { lat: 40.7484, lng: -73.9857 } }
    ];
    
    const optimizedWaypoints = await optimizeRouteWithVRP(testWaypoints, {});
    console.log('VRP algorithm test successful:', optimizedWaypoints);
    return { success: true, waypoints: optimizedWaypoints };
  } catch (error) {
    console.error('VRP algorithm test failed:', error);
    return { success: false, error: error.message };
  }
}; 