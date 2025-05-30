// useLocation.js - Custom hook for location tracking
import { useState, useEffect, useCallback } from 'react';
import { useUserAuth } from '../services/auth';
import locationService from '../services/locationService';

const useLocation = () => {
  const { user } = useUserAuth();
  const [location, setLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('unknown');

  // Check permission status on mount
  useEffect(() => {
    const checkPermission = async () => {
      const status = await locationService.getPermissionStatus();
      setPermissionStatus(status);
    };
    checkPermission();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTracking) {
        locationService.stopTracking();
      }
    };
  }, [isTracking]);

  // Start tracking location
  const startTracking = useCallback(async () => {
    if (!user) {
      setError('User must be logged in to track location');
      return;
    }

    try {
      setError(null);
      await locationService.startTracking(
        user.uid,
        (locationData) => {
          setLocation(locationData);
          setIsTracking(true);
        },
        (errorMessage) => {
          setError(errorMessage);
          setIsTracking(false);
        }
      );
    } catch (error) {
      setError(error.message);
      setIsTracking(false);
    }
  }, [user]);

  // Stop tracking location
  const stopTracking = useCallback(() => {
    locationService.stopTracking();
    setIsTracking(false);
    setLocation(null);
  }, []);

  // Get current position once
  const getCurrentPosition = useCallback(async () => {
    try {
      setError(null);
      const position = await locationService.getCurrentPosition();
      setLocation(position);
      return position;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  return {
    location,
    isTracking,
    error,
    permissionStatus,
    startTracking,
    stopTracking,
    getCurrentPosition,
    isSupported: locationService.isGeolocationSupported()
  };
};

export default useLocation; 