const OPENROUTE_API_KEY = '5b3ce3597851110001cf62481b9d2755689b44ecb54413b5dbb1b309';

// Helper function to calculate distance between two points using Haversine formula
const calculateDistance = (point1, point2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

// Function to optimize pickup order using nearest neighbor algorithm
const optimizePickupOrder = (start, passengers, destination) => {
  if (!passengers.length) return [];

  let remainingPassengers = [...passengers];
  let currentPoint = start;
  let optimizedOrder = [];

  while (remainingPassengers.length > 0) {
    // Find the nearest passenger
    let nearestIndex = 0;
    let minDistance = Infinity;

    remainingPassengers.forEach((passenger, index) => {
      const distance = calculateDistance(currentPoint, passenger);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    // Add the nearest passenger to the optimized order
    optimizedOrder.push(remainingPassengers[nearestIndex]);
    currentPoint = remainingPassengers[nearestIndex];
    remainingPassengers.splice(nearestIndex, 1);
  }

  return optimizedOrder;
};

export const calculateRoute = async (start, end, passengers = []) => {
  if (!start || !end) {
    throw new Error('Start and end locations are required');
  }

  if (!start.lat || !start.lng || !end.lat || !end.lng) {
    throw new Error('Invalid coordinates provided');
  }

  try {
    // Optimize the pickup order
    const optimizedPassengers = optimizePickupOrder(start, passengers, end);

    // Prepare coordinates array with optimized order
    const coordinates = [
      [start.lng, start.lat],
      ...optimizedPassengers.map(p => [p.lng, p.lat]),
      [end.lng, end.lat]
    ];

    console.log('Calculating route with coordinates:', coordinates);

    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Authorization': `Bearer ${OPENROUTE_API_KEY}`
      },
      body: JSON.stringify({
        coordinates: coordinates,
        instructions: true,
        preference: 'fastest',
        units: 'm',
        language: 'en',
        geometry_simplify: true,
        continue_straight: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Route calculation failed:', errorData);
      throw new Error(errorData.error?.message || 'Failed to calculate route');
    }

    const data = await response.json();
    console.log('Route calculation response:', data);
    return data;
  } catch (error) {
    console.error('Error in calculateRoute:', error);
    throw error;
  }
};

export const getTrafficInfo = async (route) => {
  try {
    if (!route || !route.features || !route.features[0]) {
      throw new Error('Invalid route data');
    }

    const response = await fetch('https://api.openrouteservice.org/v2/traffic/geojson', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        geometry: route.features[0].geometry,
        radius: 1000 // meters
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Traffic info failed:', errorData);
      if (errorData.error) {
        throw new Error(errorData.error.message || 'Failed to get traffic info');
      }
      throw new Error(`Failed to get traffic info: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting traffic info:', error);
    throw new Error(error.message || 'Failed to get traffic info');
  }
}; 