import React, { useState } from 'react';
import { useLocation, locationTrackingService } from '../services/locationTrackingService';
import { searchDestinations, getAddressFromCoords, getCurrentLocation } from '../services/locationService';

const LocationTrackingTest = () => {
  const [testResults, setTestResults] = useState([]);
  const [userId, setUserId] = useState('test-user-123');
  const [preset, setPreset] = useState('ultra_fast');
  const [updateFirebase, setUpdateFirebase] = useState(false);
  
  const {
    location,
    status,
    error,
    isTracking,
    startTracking,
    stopTracking,
    calculateDistance,
    setManualLocation
  } = useLocation({
    preset,
    updateFirebase,
    onLocationUpdate: (loc) => {
      // Only log the first location update to prevent flooding
      if (!testResults.some(result => result.message === 'Location update received')) {
        addTestResult('SUCCESS', 'Location update received', loc);
      }
    },
    onError: (err) => {
      addTestResult('ERROR', 'Location error received', err);
    },
    onStatusChange: (newStatus) => {
      addTestResult('INFO', 'Status changed', newStatus);
    }
  });

  // Debug: Log current state values
  console.log('📍 Test component state:', { location, status, error, isTracking });

  const addTestResult = (type, message, data = null) => {
    const timestamp = new Date().toISOString();
    setTestResults(prev => [...prev, { type, message, data, timestamp }]);
  };

  const runValidationTests = () => {
    setTestResults([]);
    addTestResult('INFO', 'Starting validation tests...');

    // Test 1: Invalid user ID
    try {
      startTracking('');
      addTestResult('ERROR', 'Should have thrown error for empty user ID');
    } catch (error) {
      addTestResult('SUCCESS', 'Correctly rejected empty user ID', error.message);
    }

    // Test 2: Invalid coordinates
    try {
      setManualLocation('invalid', 'invalid');
      addTestResult('ERROR', 'Should have thrown error for invalid coordinates');
    } catch (error) {
      addTestResult('SUCCESS', 'Correctly rejected invalid coordinates', error.message);
    }

    // Test 3: Out of range coordinates
    try {
      setManualLocation(100, 200);
      addTestResult('ERROR', 'Should have thrown error for out of range coordinates');
    } catch (error) {
      addTestResult('SUCCESS', 'Correctly rejected out of range coordinates', error.message);
    }

    // Test 4: Valid coordinates
    try {
      setManualLocation(33.0198, -96.6989, 'Plano, TX');
      addTestResult('SUCCESS', 'Correctly set valid manual location');
    } catch (error) {
      addTestResult('ERROR', 'Failed to set valid manual location', error.message);
    }

    // Test 5: Distance calculation
    try {
      const distance = calculateDistance(33.0198, -96.6989, 32.7767, -96.7970);
      addTestResult('SUCCESS', 'Distance calculation successful', `${distance.toFixed(2)} miles`);
    } catch (error) {
      addTestResult('ERROR', 'Distance calculation failed', error.message);
    }

    // Test 6: API key configuration
    const apiKey = import.meta.env.VITE_MAPBOX_API_KEY;
    if (!apiKey || apiKey === 'undefined') {
      addTestResult('WARNING', 'Mapbox API key not configured', {
        message: 'Some location services may not work optimally',
        suggestion: 'Set VITE_MAPBOX_API_KEY for full functionality'
      });
    } else {
      addTestResult('SUCCESS', 'Mapbox API key is configured');
    }

    addTestResult('INFO', 'Validation tests completed');
  };

  const runTrackingTests = async () => {
    setTestResults([]);
    addTestResult('INFO', 'Starting tracking tests...');

    // Test 1: Start tracking
    try {
      const success = await startTracking(userId);
      if (success) {
        addTestResult('SUCCESS', 'Location tracking started successfully');
      } else {
        addTestResult('ERROR', 'Location tracking failed to start');
      }
    } catch (error) {
      addTestResult('ERROR', 'Start tracking threw error', error.message);
    }

    // Test 2: Wait a bit and check status
    setTimeout(() => {
      addTestResult('INFO', 'Current tracking status', { isTracking, status, hasLocation: !!location });
    }, 2000);

    // Test 3: Stop tracking after 5 seconds
    setTimeout(() => {
      try {
        stopTracking();
        addTestResult('SUCCESS', 'Location tracking stopped successfully');
      } catch (error) {
        addTestResult('ERROR', 'Stop tracking threw error', error.message);
      }
    }, 5000);
  };

  const runLocationServiceTests = async () => {
    setTestResults([]);
    addTestResult('INFO', 'Starting location service tests...');

    // Check if Mapbox API key is configured
    const apiKey = import.meta.env.VITE_MAPBOX_API_KEY;
    if (!apiKey || apiKey === 'undefined') {
      addTestResult('WARNING', 'Mapbox API key not configured', {
        message: 'Location services will use fallback or return basic results',
        suggestion: 'Set VITE_MAPBOX_API_KEY in your environment variables for full functionality'
      });
    } else {
      addTestResult('SUCCESS', 'Mapbox API key is configured');
    }

    try {
      // Test 1: Get current location
      addTestResult('INFO', 'Testing getCurrentLocation...');
      const currentLocation = await getCurrentLocation();
      addTestResult('SUCCESS', 'Current location obtained', currentLocation);

      // Test 2: Address lookup from coordinates
      addTestResult('INFO', 'Testing address lookup...');
      const address = await getAddressFromCoords(currentLocation.lat, currentLocation.lng);
      addTestResult('SUCCESS', 'Address lookup successful', address);

      // Test 3: Search for gas stations
      addTestResult('INFO', 'Testing gas station search...');
      const gasResults = await searchDestinations('gas station', {
        limit: 5,
        userLocation: currentLocation,
        enableFallback: true
      });
      addTestResult('SUCCESS', 'Gas station search completed', {
        count: gasResults.length,
        results: gasResults.map(r => ({ name: r.name, distance: r.distance, address: r.address }))
      });

      // Test 4: Search for restaurants
      addTestResult('INFO', 'Testing restaurant search...');
      const restaurantResults = await searchDestinations('restaurant', {
        limit: 5,
        userLocation: currentLocation,
        enableFallback: true
      });
      addTestResult('SUCCESS', 'Restaurant search completed', {
        count: restaurantResults.length,
        results: restaurantResults.map(r => ({ name: r.name, distance: r.distance, address: r.address }))
      });

      // Test 5: Search for convenience stores
      addTestResult('INFO', 'Testing convenience store search...');
      const storeResults = await searchDestinations('convenience store', {
        limit: 5,
        userLocation: currentLocation,
        enableFallback: true
      });
      addTestResult('SUCCESS', 'Convenience store search completed', {
        count: storeResults.length,
        results: storeResults.map(r => ({ name: r.name, distance: r.distance, address: r.address }))
      });

      addTestResult('INFO', 'Location service tests completed successfully');

    } catch (error) {
      addTestResult('ERROR', 'Location service test failed', error.message);
    }
  };

  const runIntegrationTests = async () => {
    setTestResults([]);
    addTestResult('INFO', 'Starting integration tests...');

    try {
      // Test 1: Start location tracking
      addTestResult('INFO', 'Starting location tracking for integration test...');
      const trackingSuccess = await startTracking(userId);
      if (!trackingSuccess) {
        addTestResult('ERROR', 'Failed to start tracking for integration test');
        return;
      }
      
      // Give React time to update the state
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test 2: Use the location tracking service directly to get current location
      addTestResult('INFO', 'Getting current location from service...');
      
      // Get the current location directly from the service
      const currentLocation = locationTrackingService.lastLocation;
      if (currentLocation) {
        addTestResult('SUCCESS', 'Location received from tracking service', {
          coordinates: { lat: currentLocation.latitude, lng: currentLocation.longitude },
          accuracy: currentLocation.accuracy,
          address: currentLocation.address
        });
        
        // Test 3: Use tracked location for suggestions with multiple POI types
        addTestResult('INFO', 'Testing suggestions with tracked location...');
        const userLocation = { lat: currentLocation.latitude, lng: currentLocation.longitude };
        
        // Debug: Show the location data structure
        console.log('📍 Location data structure:', {
          originalLocation: currentLocation,
          convertedUserLocation: userLocation,
          proximityParam: `${userLocation.lng},${userLocation.lat}`
        });
        
        // Test multiple POI types
        const poiTypes = [
          'gas station',
          'restaurant', 
          'coffee',
          'pharmacy',
          'grocery'
        ];
        
        const allResults = {};
        
        for (const poiType of poiTypes) {
          try {
            addTestResult('INFO', `Testing ${poiType} search...`);
            
            const suggestions = await searchDestinations(poiType, {
              limit: 3,
              userLocation,
              enableFallback: true
            });
            
            allResults[poiType] = {
              count: suggestions.length,
              suggestions: suggestions.map(s => ({ 
                name: s.name, 
                distance: s.distance,
                type: s.type,
                coordinateSource: s.coordinateSource
              }))
            };
            
            addTestResult('SUCCESS', `${poiType} search completed`, {
              found: suggestions.length,
              results: suggestions.map(s => ({ name: s.name, distance: s.distance }))
            });
            
          } catch (error) {
            addTestResult('ERROR', `${poiType} search failed`, error.message);
            allResults[poiType] = { count: 0, suggestions: [], error: error.message };
          }
        }

        addTestResult('SUCCESS', 'Integration test completed', {
          trackedLocation: userLocation,
          totalPOITypes: poiTypes.length,
          results: allResults
        });

        // Stop tracking
        stopTracking();
      } else {
        addTestResult('ERROR', 'No location available from tracking service');
      }

    } catch (error) {
      addTestResult('ERROR', 'Integration test failed', error.message);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Location Tracking Service Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Configuration</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <label>
            User ID:
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ marginLeft: '5px' }}
            />
          </label>
          <label>
            Preset:
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              style={{ marginLeft: '5px' }}
            >
              <option value="ultra_fast">Ultra Fast</option>
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="conservative">Conservative</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={updateFirebase}
              onChange={(e) => setUpdateFirebase(e.target.checked)}
            />
            Update Firebase
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Current Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>Tracking: {isTracking ? 'Yes' : 'No'}</div>
          <div>Status: {status}</div>
          <div>Error: {error || 'None'}</div>
          <div>Location: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'None'}</div>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Test Actions</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <button onClick={runValidationTests} style={{ padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>
            Run Validation Tests
          </button>
          <button onClick={runTrackingTests} style={{ padding: '10px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}>
            Run Tracking Tests
          </button>
          <button onClick={runLocationServiceTests} style={{ padding: '10px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px' }}>
            Test Location Services
          </button>
          <button onClick={runIntegrationTests} style={{ padding: '10px', backgroundColor: '#9C27B0', color: 'white', border: 'none', borderRadius: '4px' }}>
            Test Integration
          </button>
          <button onClick={clearResults} style={{ padding: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
            Clear Results
          </button>
        </div>
      </div>

      <div>
        <h3>Test Results</h3>
        <div style={{ 
          maxHeight: '400px', 
          overflowY: 'auto', 
          border: '1px solid #ccc', 
          padding: '10px',
          backgroundColor: '#f9f9f9'
        }}>
          {testResults.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>No test results yet. Run a test to see results.</div>
          ) : (
            testResults.map((result, index) => (
              <div 
                key={index} 
                style={{ 
                  marginBottom: '8px',
                  padding: '8px',
                  backgroundColor: result.type === 'SUCCESS' ? '#d4edda' : 
                                result.type === 'ERROR' ? '#f8d7da' : '#d1ecf1',
                  border: `1px solid ${result.type === 'SUCCESS' ? '#c3e6cb' : 
                                      result.type === 'ERROR' ? '#f5c6cb' : '#bee5eb'}`,
                  borderRadius: '4px'
                }}
              >
                <div style={{ fontWeight: 'bold', color: result.type === 'SUCCESS' ? '#155724' : 
                                                   result.type === 'ERROR' ? '#721c24' : '#0c5460' }}>
                  [{result.timestamp}] {result.type}: {result.message}
                </div>
                {result.data && (
                  <div style={{ marginTop: '4px', fontSize: '0.9em', color: '#666' }}>
                    {typeof result.data === 'object' ? JSON.stringify(result.data, null, 2) : result.data}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>Instructions</h3>
        <ul>
          <li><strong>Validation Tests:</strong> Tests parameter validation without starting actual location tracking</li>
          <li><strong>Tracking Tests:</strong> Tests actual location tracking functionality (requires location permissions)</li>
          <li><strong>Location Services Tests:</strong> Tests address lookup and proximity-based search (gas stations, restaurants, etc.)</li>
          <li><strong>Integration Tests:</strong> Tests the complete flow from location tracking to location-based suggestions</li>
          <li>Check the browser console for detailed logging from both services</li>
          <li>All validation errors should be caught and logged appropriately</li>
          <li>Location services require Mapbox API key to be configured in environment variables</li>
        </ul>
      </div>
    </div>
  );
};

export default LocationTrackingTest; 