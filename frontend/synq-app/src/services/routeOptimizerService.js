import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import locationTrackingService, { useLocation as useLocationTracking } from './locationTrackingService';
import { MAPQUEST_SERVICE } from './locationService';

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
export const calculateOptimizedRoute = async (waypoints, constraints = {}) => {
  console.log('Starting optimized route calculation:', { 
    waypoints: waypoints.length, 
    constraints,
    waypointTypes: waypoints.map(wp => wp.type || wp.role || 'unknown')
  });
  
  // Validate input
  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required for route calculation');
  }

  // Special handling for simple routes (start to destination only)
  if (waypoints.length === 2) {
    console.log('Simple route detected (start to destination), using direct route calculation');
    return await calculateSimpleDirectRoute(waypoints, constraints);
  }

  // Apply VRP optimization for complex routes
  console.log('Complex route detected, calling optimizeRouteWithVRP...');
  const optimizedRoutes = await optimizeRouteWithVRP(waypoints, constraints);
  
  // Convert VRP routes to the format expected by MapView
  const routeData = {
    routes: optimizedRoutes,
    totalDistance: optimizedRoutes.reduce((sum, route) => sum + (route.totalDistance || 0), 0),
    totalDuration: optimizedRoutes.reduce((sum, route) => sum + (route.totalDuration || 0), 0),
    type: 'vrp_optimized'
  };
  
  console.log('VRP route data for MapView:', {
    routes: routeData.routes.length,
    totalDistance: routeData.totalDistance,
    totalDuration: routeData.totalDuration,
    type: routeData.type
  });
  
  return routeData;
};

/**
 * Calculate simple direct route from start to destination with road-following
 * @param {Array} waypoints - Array with exactly 2 waypoints [start, destination]
 * @param {Object} constraints - Route constraints
 * @returns {Promise<Object>} - Route data with road-following path
 */
const calculateSimpleDirectRoute = async (waypoints, constraints = {}) => {
  console.log('Calculating simple direct route:', {
    start: waypoints[0]?.displayName || waypoints[0]?.name || 'Start',
    destination: waypoints[1]?.displayName || waypoints[1]?.name || 'Destination'
  });

  try {
    // Try to get road-following route from MapQuest API
    const roadRoute = await getRoadRoute(waypoints);
    
    if (roadRoute && roadRoute.length > 2) {
      console.log('Successfully obtained road-following route from MapQuest:', roadRoute.length, 'points');
      
      // Calculate total distance and duration
      let totalDistance = 0;
      for (let i = 0; i < roadRoute.length - 1; i++) {
        const point1 = roadRoute[i].location || roadRoute[i];
        const point2 = roadRoute[i + 1].location || roadRoute[i + 1];
        totalDistance += calculateDistance(point1, point2);
      }
      
      const totalDuration = totalDistance / 1000 * 2 * 60; // 2 min per km estimate
      
      return {
        routes: [{
          driver: waypoints[0],
          passengers: [],
          waypoints: roadRoute,
          totalDistance: totalDistance,
          totalDuration: totalDuration,
          type: 'road_following'
        }],
        totalDistance: totalDistance,
        totalDuration: totalDuration,
        type: 'simple_road_route'
      };
    }
  } catch (error) {
    console.warn('Failed to get road route from MapQuest:', error.message);
  }

  // Fallback: use OpenStreetMap routing
  try {
    console.log('Trying OpenStreetMap routing as fallback...');
    const osmRoute = await callOpenStreetMapAPI(waypoints);
    
    if (osmRoute && osmRoute.length > 2) {
      console.log('Successfully obtained route from OpenStreetMap:', osmRoute.length, 'points');
      
      let totalDistance = 0;
      for (let i = 0; i < osmRoute.length - 1; i++) {
        const point1 = osmRoute[i].location || osmRoute[i];
        const point2 = osmRoute[i + 1].location || osmRoute[i + 1];
        totalDistance += calculateDistance(point1, point2);
      }
      
      const totalDuration = totalDistance / 1000 * 2 * 60;
      
      return {
        routes: [{
          driver: waypoints[0],
          passengers: [],
          waypoints: osmRoute,
          totalDistance: totalDistance,
          totalDuration: totalDuration,
          type: 'osm_route'
        }],
        totalDistance: totalDistance,
        totalDuration: totalDuration,
        type: 'simple_osm_route'
      };
    }
  } catch (error) {
    console.warn('Failed to get route from OpenStreetMap:', error.message);
  }

  // Final fallback: straight line with enhanced visualization
  console.log('Using enhanced straight line route as final fallback');
  const straightRoute = createEnhancedStraightLineRoute(waypoints);
  
  const totalDistance = calculateDistance(
    waypoints[0].location || waypoints[0],
    waypoints[1].location || waypoints[1]
  );
  const totalDuration = totalDistance / 1000 * 2 * 60;
  
  return {
    routes: [{
      driver: waypoints[0],
      passengers: [],
      waypoints: straightRoute,
      totalDistance: totalDistance,
      totalDuration: totalDuration,
      type: 'straight_line'
    }],
    totalDistance: totalDistance,
    totalDuration: totalDuration,
    type: 'simple_straight_line'
  };
};

/**
 * Create enhanced straight line route with intermediate points for better visualization
 * @param {Array} waypoints - Array with exactly 2 waypoints
 * @returns {Array} - Enhanced route with intermediate points
 */
const createEnhancedStraightLineRoute = (waypoints) => {
  const start = waypoints[0].location || waypoints[0];
  const end = waypoints[1].location || waypoints[1];
  
  // Create intermediate points for smoother visualization
  const numPoints = Math.max(10, Math.floor(calculateDistance(start, end) / 1000)); // 1 point per km, minimum 10
  const route = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const ratio = i / numPoints;
    const lat = start.lat + (end.lat - start.lat) * ratio;
    const lng = start.lng + (end.lng - start.lng) * ratio;
    
    route.push({
      lat: lat,
      lng: lng,
      location: { lat: lat, lng: lng },
      type: i === 0 ? 'start' : i === numPoints ? 'destination' : 'intermediate'
    });
  }
  
  console.log('Created enhanced straight line route with', route.length, 'points');
  return route;
};

/**
 * Multi-vehicle VRP algorithm with traffic optimization
 * @param {Array} waypoints - Original waypoints
 * @param {Object} constraints - VRP constraints
 * @returns {Array} - Optimized routes for multiple vehicles
 */
const optimizeRouteWithVRP = async (waypoints, constraints) => {
  console.log('Applying multi-vehicle VRP optimization:', { 
    waypoints: waypoints.length, 
    constraints 
  });
  
  // Extract waypoints and constraints
  const { drivers, pickupPoints, destination } = separateWaypoints(waypoints);
  const { timeWindows, capacity, maxDistance, trafficConditions } = constraints;
  
  console.log('Separated waypoints:', {
    drivers: drivers.length,
    pickupPoints: pickupPoints.length,
    destination: destination ? 'found' : 'missing'
  });
  
  // Validate capacity constraint
  if (pickupPoints.length > VRP_CONFIG.maxPassengers * drivers.length) {
    throw new Error(`Maximum ${VRP_CONFIG.maxPassengers} passengers allowed per vehicle`);
  }
  
  // Multi-vehicle VRP with traffic optimization
  console.log('Calling multiVehicleVRP...');
  const optimizedRoutes = await multiVehicleVRP(drivers, pickupPoints, destination, {
    timeWindows,
    capacity,
    maxDistance,
    trafficConditions
  });
  
  console.log('Multi-vehicle VRP optimization completed:', { 
    originalOrder: waypoints.map(w => w.type), 
    optimizedRoutes: optimizedRoutes.map(r => ({ 
      driver: r.driver.displayName || r.driver.name, 
      passengers: r.passengers.length,
      totalDistance: r.totalDistance 
    }))
  });
  
  return optimizedRoutes;
};

/**
 * Multi-vehicle VRP algorithm
 */
const multiVehicleVRP = async (drivers, pickupPoints, destination, constraints) => {
  console.log('Starting multi-vehicle VRP:', {
    drivers: drivers.length,
    pickupPoints: pickupPoints.length,
    destination: destination ? 'found' : 'missing'
  });
  
  const routes = [];
  const unassignedPassengers = [...pickupPoints];
  
  // Initialize routes for each driver
  for (const driver of drivers) {
    routes.push({
      driver,
      passengers: [],
      waypoints: [driver],
      totalDistance: 0,
      totalDuration: 0,
      capacity: constraints.capacity || VRP_CONFIG.maxPassengers
    });
  }
  
  // Assign passengers to vehicles using clustering
  console.log('Clustering passengers by proximity...');
  const clusters = clusterPassengersByProximity(unassignedPassengers, drivers);
  
  console.log('Clustering results:', clusters.map((cluster, i) => ({
    driver: drivers[i]?.displayName || drivers[i]?.name,
    passengers: cluster.length
  })));
  
  // Optimize each vehicle's route
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const clusterPassengers = clusters[i] || [];
    
    console.log(`Optimizing route for driver ${i + 1}:`, {
      driver: route.driver?.displayName || route.driver?.name,
      passengers: clusterPassengers.length
    });
    
    if (clusterPassengers.length > 0) {
      // Apply single-vehicle optimization for this cluster
      console.log(`Calling optimizeSingleVehicleRoute for driver ${i + 1}...`);
      const optimizedWaypoints = await optimizeSingleVehicleRoute(
        route.driver, 
        clusterPassengers, 
        destination, 
        constraints
      );
      
      route.passengers = clusterPassengers;
      route.waypoints = optimizedWaypoints;
      route.totalDistance = calculateTotalDistance(optimizedWaypoints);
      route.totalDuration = await estimateTotalDuration(optimizedWaypoints, constraints.trafficConditions);
      
      console.log(`Route ${i + 1} optimization completed:`, {
        waypoints: optimizedWaypoints.length,
        totalDistance: route.totalDistance,
        totalDuration: route.totalDuration
      });
    } else {
      // No passengers assigned, just go directly to destination
      console.log(`Driver ${i + 1} has no passengers, going directly to destination`);
      route.waypoints = [route.driver, destination];
      
      // Add null checks for driver and destination locations
      const driverLocation = route.driver?.location || route.driver;
      const destinationLocation = destination?.location || destination;
      
      if (driverLocation && destinationLocation) {
        route.totalDistance = calculateDistance(driverLocation, destinationLocation);
        route.totalDuration = route.totalDistance / 1000 * 2 * 60; // 2 min per km
      } else {
        console.warn('Driver or destination location missing:', { driverLocation, destinationLocation });
        route.totalDistance = 0;
        route.totalDuration = 0;
      }
    }
  }
  
  console.log('Multi-vehicle VRP completed:', routes.length, 'routes');
  return routes;
};

/**
 * Cluster passengers by proximity to drivers
 */
const clusterPassengersByProximity = (passengers, drivers) => {
  const clusters = Array(drivers.length).fill().map(() => []);
  
  for (const passenger of passengers) {
    let bestDriverIndex = 0;
    // Handle both formats: {lat, lng} and {location: {lat, lng}}
    const passengerLocation = passenger.location || passenger;
    const driverLocation = drivers[0].location || drivers[0];
    let minDistance = calculateDistance(passengerLocation, driverLocation);
    
    for (let i = 1; i < drivers.length; i++) {
      const currentDriverLocation = drivers[i].location || drivers[i];
      const distance = calculateDistance(passengerLocation, currentDriverLocation);
      if (distance < minDistance) {
        minDistance = distance;
        bestDriverIndex = i;
      }
    }
    
    clusters[bestDriverIndex].push(passenger);
  }
  
  return clusters;
};

/**
 * Optimize single vehicle route with traffic conditions
 */
const optimizeSingleVehicleRoute = async (driver, passengers, destination, constraints) => {
  console.log('Starting single vehicle route optimization:', {
    driver: driver?.displayName || driver?.name,
    passengers: passengers.length,
    destination: destination?.displayName || destination?.name
  });
  
  // Apply nearest neighbor algorithm for initial route
  let route = [driver];
  let currentPoint = driver;
  const unvisited = [...passengers];
  
  while (unvisited.length > 0) {
    // Find nearest unvisited point
    let nearestIndex = 0;
    // Handle both formats: {lat, lng} and {location: {lat, lng}}
    const currentLocation = currentPoint.location || currentPoint;
    const firstUnvisitedLocation = unvisited[0].location || unvisited[0];
    let minDistance = calculateDistance(currentLocation, firstUnvisitedLocation);
    
    for (let i = 1; i < unvisited.length; i++) {
      const unvisitedLocation = unvisited[i].location || unvisited[i];
      const distance = calculateDistance(currentLocation, unvisitedLocation);
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
  
  console.log('Optimized waypoint order:', route.map(wp => wp.displayName || wp.name || 'Unknown'));
  
  // Try to get actual road route from MapQuest API
  console.log('Calling getRoadRoute for optimized waypoints...');
  try {
    const roadRoute = await getRoadRoute(route);
    
    if (roadRoute && roadRoute.length > 0) {
      console.log('Successfully obtained road route from MapQuest');
      return roadRoute;
    } else {
      console.log('MapQuest API returned empty route, using optimized waypoints as fallback');
      return route;
    }
  } catch (error) {
    console.log('MapQuest API failed, using optimized waypoints as fallback:', error.message);
    return route; // Fallback to optimized waypoints if API fails
  }
};

/**
 * Get actual road route from MapQuest API
 */
const getRoadRoute = async (waypoints) => {
  try {
    console.log('Getting road route from MapQuest API for waypoints:', waypoints.length);
    
    // Convert waypoints to MapQuest format
    const locations = waypoints.map(waypoint => {
      const { lat, lng } = waypoint.location || waypoint;
      // MapQuest expects "lat,lng" format
      return `${lat},${lng}`;
    });
    
    const response = await fetch(`${MAPQUEST_CONFIG.baseUrl}/route?key=${MAPQUEST_CONFIG.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations: locations,
        options: {
          routeType: 'fastest',
          traffic: true,
          narrativeType: 'none'
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`MapQuest API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('MapQuest API response:', data);
    
    if (data.route && data.route.legs) {
      // Extract route coordinates from MapQuest response
      const routeCoordinates = [];
      
      data.route.legs.forEach(leg => {
        if (leg.maneuvers) {
          leg.maneuvers.forEach(maneuver => {
            if (maneuver.startPoint) {
              routeCoordinates.push({
                lat: maneuver.startPoint.lat,
                lng: maneuver.startPoint.lng,
                location: {
                  lat: maneuver.startPoint.lat,
                  lng: maneuver.startPoint.lng
                }
              });
            }
          });
        }
      });
      
      // Add final destination
      if (waypoints[waypoints.length - 1]) {
        routeCoordinates.push(waypoints[waypoints.length - 1]);
      }
      
      console.log('Road route obtained from MapQuest:', routeCoordinates.length, 'points');
      return routeCoordinates;
    }
    
    // Fallback: try to extract coordinates from shape if available
    if (data.route && data.route.shape) {
      const shapePoints = data.route.shape.shapePoints;
      if (shapePoints && shapePoints.length > 0) {
        const routeCoordinates = [];
        
        // MapQuest shape points are in lat,lng format
        for (let i = 0; i < shapePoints.length; i += 2) {
          routeCoordinates.push({
            lat: shapePoints[i],
            lng: shapePoints[i + 1],
            location: {
              lat: shapePoints[i],
              lng: shapePoints[i + 1]
            }
          });
        }
        
        console.log('Road route obtained from MapQuest shape:', routeCoordinates.length, 'points');
        return routeCoordinates;
      }
    }
    
    throw new Error('Invalid MapQuest response format');
  } catch (error) {
    console.warn('Failed to get road route from MapQuest, using straight line:', error);
    return null; // Fallback to straight line
  }
};

/**
 * Calculate traffic-aware cost between two points
 */
const calculateTrafficAwareCost = async (point1, point2, trafficConditions) => {
  const baseDistance = calculateDistance(point1, point2);
  
  if (!trafficConditions) {
    return baseDistance;
  }
  
  try {
    // Get real-time traffic data for this route segment
    const trafficData = await getTrafficData(point1, point2);
    const trafficMultiplier = calculateTrafficMultiplier(trafficData);
    
    return baseDistance * trafficMultiplier;
  } catch (error) {
    console.warn('Failed to get traffic data, using base distance:', error);
    return baseDistance;
  }
};

/**
 * Get traffic data for route segment
 */
const getTrafficData = async (point1, point2) => {
  try {
    const response = await fetch(`${MAPQUEST_CONFIG.baseUrl}/route?key=${MAPQUEST_CONFIG.apiKey}&from=${point1.lat},${point1.lng}&to=${point2.lat},${point2.lng}&narrativeType=none&routeType=fastest&traffic=true`);
    
    if (!response.ok) {
      throw new Error(`Traffic API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.route?.trafficData || null;
  } catch (error) {
    console.error('Error fetching traffic data:', error);
    return null;
  }
};

/**
 * Calculate traffic multiplier based on traffic conditions
 */
const calculateTrafficMultiplier = (trafficData) => {
  if (!trafficData) return 1.0;
  
  // Analyze traffic conditions and return appropriate multiplier
  const congestionLevel = trafficData.congestionLevel || 'low';
  
  switch (congestionLevel) {
    case 'low': return 1.0;
    case 'medium': return 1.3;
    case 'high': return 1.8;
    case 'severe': return 2.5;
    default: return 1.0;
  }
};

/**
 * 2-opt improvement with traffic consideration
 */
const twoOptImprovementWithTraffic = async (route, trafficConditions) => {
  let improved = true;
  let bestCost = await calculateTotalTrafficAwareCost(route, trafficConditions);
  
  while (improved) {
    improved = false;
    
    for (let i = 1; i < route.length - 2; i++) {
      for (let j = i + 1; j < route.length - 1; j++) {
        // Try 2-opt swap
        const newRoute = [...route];
        const segment = newRoute.slice(i, j + 1).reverse();
        newRoute.splice(i, j - i + 1, ...segment);
        
        const newCost = await calculateTotalTrafficAwareCost(newRoute, trafficConditions);
        if (newCost < bestCost) {
          route = newRoute;
          bestCost = newCost;
          improved = true;
        }
      }
    }
  }
  
  return route;
};

/**
 * Calculate total traffic-aware cost for a route
 */
const calculateTotalTrafficAwareCost = async (route, trafficConditions) => {
  let totalCost = 0;
  
  for (let i = 0; i < route.length - 1; i++) {
    // Handle both formats: {lat, lng} and {location: {lat, lng}}
    const point1 = route[i].location || route[i];
    const point2 = route[i + 1].location || route[i + 1];
    const cost = await calculateTrafficAwareCost(point1, point2, trafficConditions);
    totalCost += cost;
  }
  
  return totalCost;
};

/**
 * Estimate total duration considering traffic
 */
const estimateTotalDuration = async (waypoints, trafficConditions) => {
  let totalDuration = 0;
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    // Handle both formats: {lat, lng} and {location: {lat, lng}}
    const point1 = waypoints[i].location || waypoints[i];
    const point2 = waypoints[i + 1].location || waypoints[i + 1];
    const baseDuration = calculateDistance(point1, point2) / 1000 * 2; // Rough estimate: 2 min per km
    const trafficMultiplier = trafficConditions ? await calculateTrafficMultiplier(await getTrafficData(point1, point2)) : 1.0;
    totalDuration += baseDuration * trafficMultiplier;
  }
  
  return totalDuration;
};

/**
 * Separate waypoints by type (drivers, pickup, destination)
 */
const separateWaypoints = (waypoints) => {
  const drivers = waypoints.filter(w => w.type === 'driver' || w.role === 'driver');
  const destination = waypoints.find(w => w.type === 'destination' || w.type === 'end');
  const pickupPoints = waypoints.filter(w => 
    (w.type === 'pickup' || w.type === 'waypoint' || w.type === 'passenger') && 
    w.role !== 'driver'
  );
  
  return { drivers, pickupPoints, destination };
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
    // Handle both formats: {lat, lng} and {location: {lat, lng}}
    const currentLocation = currentPoint.location || currentPoint;
    const firstUnvisitedLocation = unvisited[0].location || unvisited[0];
    let minDistance = calculateDistance(currentLocation, firstUnvisitedLocation);
    
    for (let i = 1; i < unvisited.length; i++) {
      const unvisitedLocation = unvisited[i].location || unvisited[i];
      const distance = calculateDistance(currentLocation, unvisitedLocation);
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
  // Add null checks
  if (!point1 || !point2) {
    console.warn('calculateDistance: One or both points are undefined/null:', { point1, point2 });
    return 0;
  }
  
  // Handle both formats: {lat, lng} and {location: {lat, lng}}
  const p1 = point1.location || point1;
  const p2 = point2.location || point2;
  
  if (!p1 || !p2 || typeof p1.lat === 'undefined' || typeof p2.lat === 'undefined') {
    console.warn('calculateDistance: Invalid point format:', { p1, p2 });
    return 0;
  }
  
  const R = 6371; // Earth's radius in km
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const deltaLat = (p2.lat - p1.lat) * Math.PI / 180;
  const deltaLng = (p2.lng - p1.lng) * Math.PI / 180;
  
  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
};

/**
 * Calculate total distance for a route
 */
const calculateTotalDistance = (route) => {
  let totalDistance = 0;
  
  for (let i = 0; i < route.length - 1; i++) {
    const point1 = route[i].location || route[i];
    const point2 = route[i + 1].location || route[i + 1];
    totalDistance += calculateDistance(point1, point2);
  }
  
  return totalDistance;
};

/**
 * Convert multi-vehicle routes to waypoint format
 */
const convertToMultiVehicleWaypoints = (routes) => {
  const waypoints = [];
  
  routes.forEach((route, routeIndex) => {
    // Add route separator
    if (routeIndex > 0) {
      waypoints.push({
        type: 'route_separator',
        routeIndex,
        driver: route.driver.displayName || route.driver.name
      });
    }
    
    // Add waypoints for this route
    route.waypoints.forEach((waypoint, waypointIndex) => {
      waypoints.push({
        ...waypoint,
        routeIndex,
        waypointIndex,
        vehicleId: route.driver.uid,
        driverName: route.driver.displayName || route.driver.name
      });
    });
  });
  
  return waypoints;
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
    const { lat, lng } = waypoint.location || waypoint;
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
    const { lng, lat } = waypoint.location || waypoint; // OSRM expects lng,lat
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
    (waypoint.location || waypoint).lng,
    (waypoint.location || waypoint).lat
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
          distance: route.distance, // Keep in meters (OSRM returns meters)
          duration: route.duration, // Keep in seconds (OSRM returns seconds)
          waypoints: waypoints.map((wp, index) => ({
            ...wp,
            order: index
          }))
        }
      }
    }],
    properties: {
      summary: {
        distance: route.distance, // Keep in meters
        duration: route.duration // Keep in seconds
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
  const waypointString = waypoints.map(wp => `${(wp.location || wp).lat},${(wp.location || wp).lng}`).join('|');
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
      distance: 8500, // meters
      duration: 1500 // seconds (25 minutes)
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
      distance: 12300, // meters
      duration: 2100 // seconds (35 minutes)
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
      distance: 18700, // meters
      duration: 3120 // seconds (52 minutes)
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
    
    const optimizedRoutes = await optimizeRouteWithVRP(testWaypoints, {});
    console.log('VRP algorithm test successful:', optimizedRoutes);
    return { success: true, routes: optimizedRoutes };
  } catch (error) {
    console.error('VRP algorithm test failed:', error);
    return { success: false, error: error.message };
  }
};

// Legacy compatibility - keep the old class for existing code
class RouteOptimizerService {
  constructor() {
    this.subscribers = new Set();
    this.currentRoute = null;
    this.isOptimizing = false;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(route) {
    this.subscribers.forEach(callback => callback(route));
  }

  async optimizeRoute(waypoints) {
    if (this.isOptimizing) {
      console.warn('Route optimization already in progress');
      return null;
    }

    try {
      this.isOptimizing = true;
      const route = await calculateOptimizedRoute(waypoints);
      
      if (route) {
        this.currentRoute = route;
        this.notifySubscribers(route);
      }
      
      return route;
    } catch (error) {
      console.error('Error optimizing route:', error);
      throw error;
    } finally {
      this.isOptimizing = false;
    }
  }
}

// Create singleton instance
const routeOptimizerService = new RouteOptimizerService();

// React hook for using the route optimizer service
export const useRouteOptimizer = ({ 
  waypoints,
  driverLocation,
  onRouteUpdate,
  onError
} = {}) => {
  const [route, setRoute] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to route updates
  useEffect(() => {
    const unsubscribe = routeOptimizerService.subscribe(updatedRoute => {
      setRoute(updatedRoute);
      onRouteUpdate?.(updatedRoute);
    });

    return () => unsubscribe();
  }, [onRouteUpdate]);

  // Optimize route when waypoints or driver location changes
  useEffect(() => {
    if (!waypoints?.length) return;

    const optimize = async () => {
      try {
        setIsOptimizing(true);
        setError(null);

        const updatedWaypoints = driverLocation
          ? waypoints.map(wp => 
              wp.type === 'start' ? { ...wp, location: driverLocation } : wp
            )
          : waypoints;

        await routeOptimizerService.optimizeRoute(updatedWaypoints);
      } catch (error) {
        console.error('Error optimizing route:', error);
        setError(error.message);
        onError?.(error);
      } finally {
        setIsOptimizing(false);
      }
    };

    optimize();
  }, [waypoints, driverLocation, onError]);

  return {
    route,
    isOptimizing,
    error,
    optimizeRoute: routeOptimizerService.optimizeRoute.bind(routeOptimizerService)
  };
};

export default routeOptimizerService; 