import React, { useState } from 'react';
import { searchDestinations, getAddressFromCoords, getCurrentLocation } from '../services/locationService';

const LocationTrackingTestSimple = () => {
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const addTestResult = (type, message, data = null) => {
    const timestamp = new Date().toISOString();
    setTestResults(prev => [...prev, { type, message, data, timestamp }]);
  };

  const runBasicTests = async () => {
    setIsLoading(true);
    setTestResults([]);
    addTestResult('INFO', 'Starting basic location service tests...');

    try {
      // Test 1: Check API key
      const apiKey = import.meta.env.VITE_MAPBOX_API_KEY;
      if (!apiKey || apiKey === 'undefined') {
        addTestResult('WARNING', 'Mapbox API key not configured', {
          message: 'Some tests may not work optimally',
          suggestion: 'Set VITE_MAPBOX_API_KEY for full functionality'
        });
      } else {
        addTestResult('SUCCESS', 'Mapbox API key is configured');
      }

      // Test 2: Get current location
      addTestResult('INFO', 'Testing getCurrentLocation...');
      const currentLocation = await getCurrentLocation();
      addTestResult('SUCCESS', 'Current location obtained', currentLocation);

      // Test 3: Address lookup
      addTestResult('INFO', 'Testing address lookup...');
      const address = await getAddressFromCoords(currentLocation.lat, currentLocation.lng);
      addTestResult('SUCCESS', 'Address lookup successful', address);

      // Test 4: Search for gas stations
      addTestResult('INFO', 'Testing gas station search...');
      const gasResults = await searchDestinations('gas station', {
        limit: 3,
        userLocation: currentLocation,
        enableFallback: true
      });
      addTestResult('SUCCESS', 'Gas station search completed', {
        count: gasResults.length,
        results: gasResults.map(r => ({ name: r.name, distance: r.distance, address: r.address }))
      });

      addTestResult('INFO', 'Basic tests completed successfully');

    } catch (error) {
      addTestResult('ERROR', 'Test failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Location Services Test (Simple)</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Test Actions</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <button 
            onClick={runBasicTests} 
            disabled={isLoading}
            style={{ 
              padding: '10px', 
              backgroundColor: '#4CAF50', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? 'Running Tests...' : 'Run Basic Tests'}
          </button>
          <button 
            onClick={clearResults} 
            style={{ 
              padding: '10px', 
              backgroundColor: '#f44336', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px' 
            }}
          >
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
            <div style={{ color: '#666', fontStyle: 'italic' }}>No test results yet. Click "Run Basic Tests" to start.</div>
          ) : (
            testResults.map((result, index) => (
              <div 
                key={index} 
                style={{ 
                  marginBottom: '8px',
                  padding: '8px',
                  backgroundColor: result.type === 'SUCCESS' ? '#d4edda' : 
                                result.type === 'ERROR' ? '#f8d7da' : 
                                result.type === 'WARNING' ? '#fff3cd' : '#d1ecf1',
                  border: `1px solid ${result.type === 'SUCCESS' ? '#c3e6cb' : 
                                      result.type === 'ERROR' ? '#f5c6cb' : 
                                      result.type === 'WARNING' ? '#ffeaa7' : '#bee5eb'}`,
                  borderRadius: '4px'
                }}
              >
                <div style={{ 
                  fontWeight: 'bold', 
                  color: result.type === 'SUCCESS' ? '#155724' : 
                         result.type === 'ERROR' ? '#721c24' : 
                         result.type === 'WARNING' ? '#856404' : '#0c5460' 
                }}>
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
          <li><strong>Basic Tests:</strong> Tests location services without authentication</li>
          <li>Check the browser console for detailed logging</li>
          <li>Location services require Mapbox API key for full functionality</li>
          <li>Allow location permissions when prompted</li>
        </ul>
      </div>
    </div>
  );
};

export default LocationTrackingTestSimple; 