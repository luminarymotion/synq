// LocationTracker.jsx - Component for testing location tracking
import React, { useEffect } from 'react';
import useLocation from '../hooks/useLocation';
import '../styles/LocationTracker.css';

const LocationTracker = () => {
  const {
    location,
    isTracking,
    error,
    permissionStatus,
    startTracking,
    stopTracking,
    isSupported
  } = useLocation();

  // Auto-start tracking when component mounts
  useEffect(() => {
    if (permissionStatus === 'granted' && !isTracking) {
      startTracking();
    }
  }, [permissionStatus, isTracking, startTracking]);

  if (!isSupported) {
    return (
      <div className="location-tracker error">
        <i className="fas fa-exclamation-triangle"></i>
        <p>Geolocation is not supported by your browser</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="location-tracker error">
        <i className="fas fa-exclamation-circle"></i>
        <p>{error}</p>
        {permissionStatus === 'denied' && (
          <button 
            className="location-tracker-button"
            onClick={() => window.location.reload()}
          >
            <i className="fas fa-sync-alt"></i>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="location-tracker">
      <div className="location-status">
        <div className="status-indicator">
          <span className={`status-dot ${isTracking ? 'active' : ''}`}></span>
          <span className="status-text">
            {isTracking ? 'Tracking Active' : 'Tracking Inactive'}
          </span>
        </div>
        <button
          className="location-tracker-button"
          onClick={isTracking ? stopTracking : startTracking}
        >
          <i className={`fas fa-${isTracking ? 'stop' : 'play'}-circle`}></i>
          {isTracking ? 'Stop Tracking' : 'Start Tracking'}
        </button>
      </div>

      {location && (
        <div className="location-details">
          <div className="location-coordinates">
            <div className="coordinate">
              <span className="label">Latitude:</span>
              <span className="value">{location.latitude.toFixed(6)}</span>
            </div>
            <div className="coordinate">
              <span className="label">Longitude:</span>
              <span className="value">{location.longitude.toFixed(6)}</span>
            </div>
            <div className="coordinate">
              <span className="label">Accuracy:</span>
              <span className="value">{Math.round(location.accuracy)}m</span>
            </div>
          </div>
          <div className="location-timestamp">
            Last updated: {new Date(location.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}

      {permissionStatus === 'prompt' && (
        <div className="location-permission-prompt">
          <i className="fas fa-map-marker-alt"></i>
          <p>Location access is required for this feature</p>
          <button 
            className="location-tracker-button"
            onClick={startTracking}
          >
            <i className="fas fa-lock-open"></i>
            Enable Location
          </button>
        </div>
      )}
    </div>
  );
};

export default LocationTracker; 