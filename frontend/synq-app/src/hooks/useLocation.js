import { useState, useEffect, useCallback, useRef } from 'react';
import { locationTrackingService } from '../services/locationTrackingService';

export const useLocation = (options = {}) => {
  const {
    preset = 'ultra_fast',
    updateFirebase = false,
    onLocationUpdate = () => {},
    onError = () => {},
    onStatusChange = () => {}
  } = options;

  const [location, setLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle');
  
  const trackingRef = useRef(false);
  const locationIntervalRef = useRef(null);

  const startTracking = useCallback(async () => {
    try {
      if (trackingRef.current) {
        console.log('📍 Location tracking already active');
        return;
      }

      console.log('📍 Starting location tracking with preset:', preset);
      setStatus('starting');
      setError(null);

      // Start location tracking service
      await locationTrackingService.startTracking(preset);
      
      trackingRef.current = true;
      setIsTracking(true);
      setStatus('active');

      // Set up location polling
      locationIntervalRef.current = setInterval(async () => {
        try {
          const currentLocation = await locationTrackingService.getCurrentLocation();
          if (currentLocation) {
            setLocation(currentLocation);
            onLocationUpdate(currentLocation);
          }
        } catch (err) {
          console.error('📍 Error getting current location:', err);
          setError(err.message);
          onError(err.message);
        }
      }, 5000); // Update every 5 seconds

      onStatusChange('active');
    } catch (err) {
      console.error('📍 Failed to start location tracking:', err);
      setError(err.message);
      onError(err.message);
      setStatus('error');
      onStatusChange('error');
    }
  }, [preset, onLocationUpdate, onError, onStatusChange]);

  const stopTracking = useCallback(async () => {
    try {
      if (!trackingRef.current) {
        console.log('📍 Location tracking not active');
        return;
      }

      console.log('📍 Stopping location tracking');
      setStatus('stopping');

      // Stop location tracking service
      await locationTrackingService.stopTracking();
      
      // Clear interval
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }

      trackingRef.current = false;
      setIsTracking(false);
      setStatus('idle');
      onStatusChange('idle');
    } catch (err) {
      console.error('📍 Error stopping location tracking:', err);
      setError(err.message);
      onError(err.message);
    }
  }, [onStatusChange, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
      if (trackingRef.current) {
        locationTrackingService.stopTracking().catch(console.error);
      }
    };
  }, []);

  return {
    location,
    isTracking,
    status,
    error,
    startTracking,
    stopTracking
  };
};

export default useLocation;
