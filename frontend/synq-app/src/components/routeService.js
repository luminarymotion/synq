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

// Function to find intermediate points for long routes
const findIntermediatePoints = (start, end, maxDistance = 140000) => { // 140km to be safe
  const distance = calculateDistance(start, end);
  if (distance <= maxDistance) return [start, end];

  const numSegments = Math.ceil(distance / maxDistance);
  const intermediatePoints = [];
  
  for (let i = 1; i < numSegments; i++) {
    const fraction = i / numSegments;
    const lat = start.lat + (end.lat - start.lat) * fraction;
    const lng = start.lng + (end.lng - start.lng) * fraction;
    intermediatePoints.push({ lat, lng });
  }

  return [start, ...intermediatePoints, end];
};

// Function to snap coordinates to nearest road with multiple attempts
const snapToRoad = async (point, attempt = 0) => {
  const maxAttempts = 3;
  const baseRadius = 1000; // Start with 1km
  const radiusMultiplier = 2; // Double the radius each attempt
  
  try {
    const radius = baseRadius * Math.pow(radiusMultiplier, attempt);
    console.log(`Attempting to snap coordinates (attempt ${attempt + 1}) with radius ${radius}m:`, point);
    
    const response = await fetch('https://api.openrouteservice.org/v2/snap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${OPENROUTE_API_KEY}`
      },
      body: JSON.stringify({
        locations: [[point.lng, point.lat]],
        radius: radius
      })
    });

    if (!response.ok) {
      if (attempt < maxAttempts - 1) {
        console.log(`Snap attempt ${attempt + 1} failed, trying with larger radius...`);
        return snapToRoad(point, attempt + 1);
      }
      console.warn('All snap attempts failed, using original point');
      return point;
    }

    const data = await response.json();
    if (data.locations && data.locations[0]) {
      const snapped = data.locations[0];
      const snappedPoint = { lat: snapped[1], lng: snapped[0] };
      
      // Verify the snapped point is actually on a road
      const isOnRoad = await verifyPointOnRoad(snappedPoint);
      if (isOnRoad) {
        console.log('Successfully snapped to road:', { original: point, snapped: snappedPoint });
        return snappedPoint;
      } else if (attempt < maxAttempts - 1) {
        console.log('Snapped point not on road, trying again with larger radius...');
        return snapToRoad(point, attempt + 1);
      }
    }
    
    if (attempt < maxAttempts - 1) {
      return snapToRoad(point, attempt + 1);
    }
    return point;
  } catch (error) {
    console.warn(`Error in snap attempt ${attempt + 1}:`, error);
    if (attempt < maxAttempts - 1) {
      return snapToRoad(point, attempt + 1);
    }
    return point;
  }
};

// Function to verify if a point is on a road
const verifyPointOnRoad = async (point) => {
  try {
    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Authorization': `Bearer ${OPENROUTE_API_KEY}`
      },
      body: JSON.stringify({
        coordinates: [[point.lng, point.lat], [point.lng, point.lat]],
        instructions: false,
        preference: 'fastest',
        units: 'm',
        language: 'en',
        geometry_simplify: true
      })
    });

    return response.ok;
  } catch (error) {
    console.warn('Error verifying point on road:', error);
    return false;
  }
};

// Function to validate and snap coordinates
const validateAndSnapCoordinates = async (coordinates) => {
  const snappedCoordinates = [];
  for (const coord of coordinates) {
    const snapped = await snapToRoad({ lat: coord[1], lng: coord[0] });
    snappedCoordinates.push([snapped.lng, snapped.lat]);
  }
  return snappedCoordinates;
};

// Function to calculate a single route segment with improved retry logic
const calculateRouteSegment = async (start, end, retryCount = 0) => {
  const maxRetries = 3;
  const baseRadius = 1000;
  const radiusMultiplier = 2;

  try {
    // Snap both start and end points to nearest road with increasing radius
    const radius = baseRadius * Math.pow(radiusMultiplier, retryCount);
    console.log(`Calculating route segment (attempt ${retryCount + 1}) with radius ${radius}m`);
    
    const [snappedStart, snappedEnd] = await Promise.all([
      snapToRoad({ ...start, radius }),
      snapToRoad({ ...end, radius })
    ]);

    // Try to find a route between the snapped points
    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Authorization': `Bearer ${OPENROUTE_API_KEY}`
      },
      body: JSON.stringify({
        coordinates: [[snappedStart.lng, snappedStart.lat], [snappedEnd.lng, snappedEnd.lat]],
        instructions: true,
        preference: 'fastest',
        units: 'm',
        language: 'en',
        geometry_simplify: true,
        continue_straight: false, // Allow the route to take turns
        radiuses: [radius, radius] // Search radius for each point
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.warn(`Route calculation attempt ${retryCount + 1} failed:`, errorData);
      
      if (retryCount < maxRetries - 1) {
        console.log(`Retrying with increased radius...`);
        return calculateRouteSegment(start, end, retryCount + 1);
      }
      
      throw new Error(errorData.error?.message || 'Failed to calculate route segment');
    }

    const data = await response.json();
    
    // Verify the route is valid
    if (!data.features?.[0]?.geometry?.coordinates?.length) {
      if (retryCount < maxRetries - 1) {
        console.log('Invalid route geometry, retrying...');
        return calculateRouteSegment(start, end, retryCount + 1);
      }
      throw new Error('Invalid route geometry');
    }

    // Check if the route is too short or too long compared to direct distance
    const directDistance = calculateDistance(snappedStart, snappedEnd);
    const routeDistance = data.features[0].properties.summary.distance;
    
    if (routeDistance < 10 || routeDistance > directDistance * 3) {
      if (retryCount < maxRetries - 1) {
        console.log('Route distance seems invalid, retrying...');
        return calculateRouteSegment(start, end, retryCount + 1);
      }
    }

    return data;
  } catch (error) {
    if (retryCount < maxRetries - 1) {
      console.log(`Error in attempt ${retryCount + 1}, retrying...`);
      return calculateRouteSegment(start, end, retryCount + 1);
    }
    throw error;
  }
};

// Function to create a fallback route that follows roads where possible
const createFallbackRoute = async (start, end) => {
  try {
    // Try to find intermediate points that might be on roads
    const midPoint = {
      lat: (start.lat + end.lat) / 2,
      lng: (start.lng + end.lng) / 2
    };

    // Try to snap the midpoint to a road
    const snappedMidPoint = await snapToRoad(midPoint);
    
    // Try to calculate routes through the snapped midpoint
    const firstSegment = await calculateRouteSegment(start, snappedMidPoint);
    const secondSegment = await calculateRouteSegment(snappedMidPoint, end);

    if (firstSegment && secondSegment) {
      return mergeRouteSegments([firstSegment, secondSegment]);
    }
  } catch (error) {
    console.warn('Failed to create fallback route through midpoint:', error);
  }

  // If all else fails, create a direct line
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        segments: [],
        summary: {
          distance: calculateDistance(start, end),
          duration: calculateDistance(start, end) / 13.89
        }
      },
      geometry: {
        type: 'LineString',
        coordinates: [[start.lng, start.lat], [end.lng, end.lat]]
      }
    }]
  };
};

// Function to merge route segments
const mergeRouteSegments = (segments) => {
  if (!segments.length) return null;

  const mergedFeature = {
    type: 'Feature',
    properties: {
      segments: [],
      summary: {
        distance: 0,
        duration: 0
      }
    },
    geometry: {
      type: 'LineString',
      coordinates: []
    }
  };

  segments.forEach((segment, index) => {
    if (!segment.features?.[0]) return;

    const feature = segment.features[0];
    
    // Merge coordinates (skip first point of subsequent segments to avoid duplicates)
    if (index === 0) {
      mergedFeature.geometry.coordinates.push(...feature.geometry.coordinates);
    } else {
      mergedFeature.geometry.coordinates.push(...feature.geometry.coordinates.slice(1));
    }

    // Merge segments and summary
    if (feature.properties.segments) {
      mergedFeature.properties.segments.push(...feature.properties.segments);
    }
    
    if (feature.properties.summary) {
      mergedFeature.properties.summary.distance += feature.properties.summary.distance;
      mergedFeature.properties.summary.duration += feature.properties.summary.duration;
    }
  });

  return {
    type: 'FeatureCollection',
    features: [mergedFeature]
  };
};

// Function to optimize pickup order using nearest neighbor algorithm
const optimizePickupOrder = (start, passengers, destination) => {
  if (!passengers.length) return [];

  let remainingPassengers = [...passengers];
  let currentPoint = start;
  let optimizedOrder = [];

  while (remainingPassengers.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    remainingPassengers.forEach((passenger, index) => {
      const distance = calculateDistance(currentPoint, passenger);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    optimizedOrder.push(remainingPassengers[nearestIndex]);
    currentPoint = remainingPassengers[nearestIndex];
    remainingPassengers.splice(nearestIndex, 1);
  }

  return optimizedOrder;
};

export const calculateRoute = async (waypoints) => {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    console.error('Invalid waypoints:', waypoints);
    throw new Error('At least two waypoints are required');
  }

  try {
    console.log('Starting route calculation with waypoints:', waypoints);

    // Validate and snap all waypoint coordinates
    const validatedCoordinates = await validateAndSnapCoordinates(
      waypoints.map(wp => [wp.location.lng, wp.location.lat])
    );

    console.log('Validated coordinates:', validatedCoordinates);

    // Try to calculate the full route first
    try {
      const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
          'Authorization': `Bearer ${OPENROUTE_API_KEY}`
        },
        body: JSON.stringify({
          coordinates: validatedCoordinates,
          instructions: true,
          preference: 'fastest',
          units: 'm',
          language: 'en',
          geometry_simplify: true,
          continue_straight: false,
          radiuses: validatedCoordinates.map(() => 2000) // 2km search radius for each point
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Route calculation failed:', errorData);
        throw new Error(errorData.error?.message || 'Failed to calculate route');
      }

      const routeData = await response.json();
      
      // Add waypoint information to the route data
      routeData.waypoints = waypoints.map((wp, index) => ({
        ...wp,
        order: index,
        type: wp.type || (index === 0 ? 'start' : index === waypoints.length - 1 ? 'destination' : 'pickup')
      }));

      console.log('Route calculated successfully:', routeData);
      return routeData;
    } catch (error) {
      console.warn('Full route calculation failed, falling back to segmented approach:', error);
      
      // Fall back to segmented approach
      const segments = [];
      
      // Calculate route segments between consecutive waypoints
      for (let i = 0; i < waypoints.length - 1; i++) {
        try {
          console.log(`Calculating segment ${i + 1}/${waypoints.length - 1}`);
          const segment = await calculateRouteSegment(
            waypoints[i].location,
            waypoints[i + 1].location
          );
          segments.push(segment);
        } catch (error) {
          console.warn(`Failed to calculate segment ${i}, trying fallback:`, error);
          const fallbackSegment = await createFallbackRoute(
            waypoints[i].location,
            waypoints[i + 1].location
          );
          segments.push(fallbackSegment);
        }
      }
      
      const mergedRoute = mergeRouteSegments(segments);
      
      // Add waypoint information to the merged route
      if (mergedRoute) {
        mergedRoute.waypoints = waypoints.map((wp, index) => ({
          ...wp,
          order: index,
          type: wp.type || (index === 0 ? 'start' : index === waypoints.length - 1 ? 'destination' : 'pickup')
        }));
      }
      
      console.log('Segmented route calculated successfully:', mergedRoute);
      return mergedRoute;
    }
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