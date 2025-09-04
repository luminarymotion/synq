// Test file to validate route structure
import { getDirections, ROUTING_PROFILES } from './services/locationService';

// Test coordinates
const testStartLocation = { lat: 40.7128, lng: -74.0060 }; // New York
const testEndLocation = { lat: 40.7589, lng: -73.9851 };   // Times Square

async function testRouteStructure() {
  try {
    console.log('🧪 Testing route structure...');
    
    const directions = await getDirections(testStartLocation, testEndLocation, {
      profile: ROUTING_PROFILES.DRIVING_TRAFFIC,
      alternatives: false,
      annotations: ['distance', 'duration']
    });
    
    console.log('✅ getDirections returned:', directions);
    console.log('📊 Directions structure:', {
      isArray: Array.isArray(directions),
      length: directions.length,
      firstRoute: directions[0] ? {
        hasGeometry: !!directions[0].geometry,
        geometryType: directions[0].geometry?.type,
        hasCoordinates: !!directions[0].geometry?.coordinates,
        coordinatesCount: directions[0].geometry?.coordinates?.length || 0,
        distance: directions[0].distance,
        duration: directions[0].duration
      } : null
    });
    
    // Test creating the expected route structure
    const firstRoute = directions[0];
    const route = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: firstRoute.geometry,
        properties: {
          name: 'Test Route',
          summary: {
            distance: firstRoute.distance * 1609.34,
            duration: firstRoute.duration * 60
          }
        }
      }],
      totalDistance: firstRoute.distance * 1609.34,
      totalDuration: firstRoute.duration * 60
    };
    
    console.log('✅ Created route structure:', {
      type: route.type,
      hasFeatures: !!route.features,
      featuresCount: route.features.length,
      firstFeature: route.features[0] ? {
        type: route.features[0].type,
        hasGeometry: !!route.features[0].geometry,
        geometryType: route.features[0].geometry?.type,
        hasCoordinates: !!route.features[0].geometry?.coordinates,
        coordinatesCount: route.features[0].geometry?.coordinates?.length || 0
      } : null
    });
    
    // Test the coordinates access that was causing the error
    if (route.features && route.features.length > 0) {
      const feature = route.features[0];
      if (feature.geometry && feature.geometry.coordinates && Array.isArray(feature.geometry.coordinates)) {
        const coordinates = feature.geometry.coordinates;
        console.log('✅ Successfully accessed coordinates:', coordinates.length);
        console.log('📍 First coordinate:', coordinates[0]);
        console.log('📍 Last coordinate:', coordinates[coordinates.length - 1]);
      } else {
        console.log('❌ Failed to access coordinates');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use in browser console
window.testRouteStructure = testRouteStructure;

export { testRouteStructure }; 