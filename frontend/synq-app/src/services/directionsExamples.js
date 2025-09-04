// Examples of using the enhanced Mapbox Directions API v5 functions
// This file demonstrates the new capabilities added to locationService.js

import {
  getDirections,
  getMultiWaypointDirections,
  // getEVDirections, // Commented out - EV routing not needed
  ROUTING_PROFILES,
  compareRoutes,
  extractTurnByTurnInstructions,
  getRouteSummary
} from './locationService.js';

// Example 1: Basic directions with different profiles
export const exampleBasicDirections = async () => {
  const startLocation = { lat: 40.7128, lng: -74.0060 }; // New York
  const endLocation = { lat: 34.0522, lng: -118.2437 };  // Los Angeles

  try {
    // Driving directions (default)
    const drivingRoute = await getDirections(startLocation, endLocation);
    console.log('Driving route:', drivingRoute);

    // Walking directions
    const walkingRoute = await getDirections(startLocation, endLocation, {
      profile: ROUTING_PROFILES.WALKING
    });
    console.log('Walking route:', walkingRoute);

    // Cycling directions
    const cyclingRoute = await getDirections(startLocation, endLocation, {
      profile: ROUTING_PROFILES.CYCLING
    });
    console.log('Cycling route:', cyclingRoute);

    // Traffic-aware driving
    const trafficRoute = await getDirections(startLocation, endLocation, {
      profile: ROUTING_PROFILES.DRIVING_TRAFFIC
    });
    console.log('Traffic-aware route:', trafficRoute);

  } catch (error) {
    console.error('Error getting basic directions:', error);
  }
};

// Example 2: Alternative routes
export const exampleAlternativeRoutes = async () => {
  const startLocation = { lat: 40.7128, lng: -74.0060 };
  const endLocation = { lat: 34.0522, lng: -118.2437 };

  try {
    const routes = await getDirections(startLocation, endLocation, {
      alternatives: true,
      profile: ROUTING_PROFILES.DRIVING_TRAFFIC
    });

    console.log('Found', routes.length, 'alternative routes');

    // Compare the routes
    const comparison = compareRoutes(routes);
    console.log('Route comparison:', comparison);

    // Get turn-by-turn for the fastest route
    const fastestRoute = routes[comparison.fastest.index];
    const instructions = extractTurnByTurnInstructions(fastestRoute);
    console.log('Turn-by-turn instructions:', instructions);

  } catch (error) {
    console.error('Error getting alternative routes:', error);
  }
};

// Example 3: Multi-waypoint routing (ride sharing scenario)
export const exampleMultiWaypointRouting = async () => {
  const waypoints = [
    {
      lat: 40.7128,
      lng: -74.0060,
      name: 'Driver Location',
      type: 'origin'
    },
    {
      lat: 40.7589,
      lng: -73.9851,
      name: 'Passenger 1',
      type: 'pickup'
    },
    {
      lat: 40.7505,
      lng: -73.9934,
      name: 'Passenger 2',
      type: 'pickup'
    },
    {
      lat: 34.0522,
      lng: -118.2437,
      name: 'Destination',
      type: 'destination'
    }
  ];

  try {
    const route = await getMultiWaypointDirections(waypoints, {
      profile: ROUTING_PROFILES.DRIVING_TRAFFIC,
      annotations: ['distance', 'duration', 'congestion'],
      avoid: ['tolls'],
      exclude: ['ferries']
    });

    console.log('Multi-waypoint route:', route);

    // Get detailed summary
    const summary = getRouteSummary(route[0]);
    console.log('Route summary:', summary);

  } catch (error) {
    console.error('Error getting multi-waypoint directions:', error);
  }
};

// Example 4: Electric Vehicle routing
// COMMENTED OUT - EV routing not needed at the moment
/*
export const exampleEVRouting = async () => {
  const startLocation = { lat: 40.7128, lng: -74.0060 };
  const endLocation = { lat: 34.0522, lng: -118.2437 };

  try {
    const evRoute = await getEVDirections(startLocation, endLocation, {
      batteryCapacity: 75000, // 75 kWh
      currentCharge: 60000,   // 60 kWh
      minChargeAtChargingStation: 30000, // 30 kWh
      minChargeAtDestination: 20000,     // 20 kWh
      chargingStations: true
    });

    console.log('EV route:', evRoute);
    console.log('Charging stops:', evRoute.chargingStops);

  } catch (error) {
    console.error('Error getting EV directions:', error);
  }
};
*/

// Example 5: Advanced routing with avoidances
export const exampleAdvancedRouting = async () => {
  const startLocation = { lat: 40.7128, lng: -74.0060 };
  const endLocation = { lat: 34.0522, lng: -118.2437 };

  try {
    const route = await getDirections(startLocation, endLocation, {
      profile: ROUTING_PROFILES.DRIVING_TRAFFIC,
      alternatives: true,
      avoid: ['tolls', 'highways'],
      exclude: ['ferries'],
      annotations: ['distance', 'duration', 'congestion', 'maxspeed'],
      continueStraight: false,
      avoidManeuverRadius: 100 // Avoid maneuvers within 100m of start
    });

    console.log('Advanced routing with avoidances:', route);

  } catch (error) {
    console.error('Error getting advanced directions:', error);
  }
};

// Example 6: Route optimization for ride sharing
export const exampleRideSharingOptimization = async () => {
  // Simulate a ride sharing scenario with multiple pickup points
  const waypoints = [
    { lat: 40.7128, lng: -74.0060, name: 'Driver', type: 'origin' },
    { lat: 40.7589, lng: -73.9851, name: 'Alice', type: 'pickup' },
    { lat: 40.7505, lng: -73.9934, name: 'Bob', type: 'pickup' },
    { lat: 40.7421, lng: -73.9911, name: 'Charlie', type: 'pickup' },
    { lat: 34.0522, lng: -118.2437, name: 'Destination', type: 'destination' }
  ];

  try {
    // Get optimized route
    const optimizedRoute = await getMultiWaypointDirections(waypoints, {
      profile: ROUTING_PROFILES.DRIVING_TRAFFIC,
      annotations: ['distance', 'duration', 'congestion'],
      alternatives: false
    });

    console.log('Optimized ride sharing route:', optimizedRoute[0]);

    // Extract detailed information
    const route = optimizedRoute[0];
    const summary = getRouteSummary(route);
    const instructions = extractTurnByTurnInstructions(route);

    console.log('Route summary:', summary);
    console.log('Total pickup points:', waypoints.filter(w => w.type === 'pickup').length);
    console.log('Total distance:', summary.totalDistance.toFixed(1), 'miles');
    console.log('Total duration:', summary.totalDuration.toFixed(0), 'minutes');

  } catch (error) {
    console.error('Error optimizing ride sharing route:', error);
  }
};

// Export all examples for easy testing
export const runAllExamples = async () => {
  console.log('🚗 Running all direction examples...');
  
  console.log('\n1. Basic directions with different profiles:');
  await exampleBasicDirections();
  
  console.log('\n2. Alternative routes:');
  await exampleAlternativeRoutes();
  
  console.log('\n3. Multi-waypoint routing:');
  await exampleMultiWaypointRouting();
  
                console.log('\n4. Electric Vehicle routing:');
              console.log('   (Skipped - EV routing commented out)');
              // await exampleEVRouting();
  
  console.log('\n5. Advanced routing with avoidances:');
  await exampleAdvancedRouting();
  
  console.log('\n6. Ride sharing optimization:');
  await exampleRideSharingOptimization();
  
  console.log('\n✅ All examples completed!');
};

// Make examples available globally for testing
if (typeof window !== 'undefined') {
  window.directionsExamples = {
    exampleBasicDirections,
    exampleAlternativeRoutes,
    exampleMultiWaypointRouting,
    // exampleEVRouting, // Commented out - EV routing not needed
    exampleAdvancedRouting,
    exampleRideSharingOptimization,
    runAllExamples
  };
} 