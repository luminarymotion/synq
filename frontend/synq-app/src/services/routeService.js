const OPENROUTE_API_KEY = '5b3ce3597851110001cf62481b9d2755689b44ecb54413b5dbb1b309';

export const calculateRoute = async (start, end, via = []) => {
  try {
    // Prepare coordinates for the API
    const coordinates = [
      [start.lng, start.lat],
      ...via.map(point => [point.lng, point.lat]),
      [end.lng, end.lat]
    ];

    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
      },
      body: JSON.stringify({
        coordinates: coordinates,
        instructions: true,
        geometry_simplify: true,
        continue_straight: false,
        preference: 'fastest',
        units: 'm',
        language: 'en'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Route calculation failed:', errorData);
      throw new Error(`Failed to calculate route: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calculating route:', error);
    throw error;
  }
};

export const getTrafficInfo = async (route) => {
  try {
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
      throw new Error(`Failed to get traffic info: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting traffic info:', error);
    throw error;
  }
}; 