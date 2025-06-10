import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { updateUserLocation } from './firebaseOperations';
import { getAddressFromCoords } from './locationService';

// Configuration with different presets for different use cases
const LOCATION_CONFIG = {
  // Basic tracking (for simple location display)
  basic: {
    updateInterval: 10000, // 10 seconds
    minDistance: 20, // 20 meters
    maxAccuracy: 200, // 200 meters (increased from 100)
    maxAge: 30000, // 30 seconds
    retryAttempts: 2,
    retryDelay: 1000,
    offlineQueueSize: 10
  },
  // Real-time tracking (for ride sharing)
  realtime: {
    updateInterval: 5000, // 5 seconds
    minDistance: 10, // 10 meters
    maxAccuracy: 200, // 200 meters (increased from 50)
    maxAge: 15000, // 15 seconds
    retryAttempts: 3,
    retryDelay: 1000,
    offlineQueueSize: 50
  }
};

class LocationTrackingService {
  constructor() {
    this.watchId = null;
    this.lastUpdate = null;
    this.lastLocation = null;
    this.isTracking = false;
    this.offlineQueue = [];
    this.retryCount = 0;
    this.updateTimeout = null;
    this.onLocationUpdate = null;
    this.onError = null;
    this.onStatusChange = null;
    this.config = LOCATION_CONFIG.basic; // Default to basic config
    this.listeners = new Set(); // For React hook subscribers
  }

  // Set configuration preset
  setConfig(preset) {
    if (LOCATION_CONFIG[preset]) {
      this.config = LOCATION_CONFIG[preset];
      return true;
    }
    return false;
  }

  // Subscribe to location updates (for React hook)
  subscribe(listener) {
    this.listeners.add(listener);
    // If we already have a location, send it immediately
    if (this.lastLocation) {
      listener(this.lastLocation);
    }
    return () => this.listeners.delete(listener);
  }

  // Start location tracking with optional Firebase integration
  async startTracking(userId, options = {}) {
    console.log('Starting location tracking with options:', {
      userId,
      options,
      currentStatus: this.isTracking,
      config: this.config
    });

    if (this.isTracking) {
      console.warn('Location tracking is already active');
      return false;
    }

    // Set configuration based on options
    if (options.preset && LOCATION_CONFIG[options.preset]) {
      console.log('Setting config preset:', options.preset);
      this.setConfig(options.preset);
    }

    this.userId = userId;
    this.onLocationUpdate = options.onLocationUpdate;
    this.onError = options.onError;
    this.onStatusChange = options.onStatusChange;
    this.updateFirebase = options.updateFirebase ?? false;

    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        console.error('Geolocation not supported');
        throw new Error('Geolocation is not supported by your browser');
      }

      // Request permission explicitly
      console.log('Requesting geolocation permission...');
      try {
        // First try to get current position to trigger permission prompt
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { timeout: 10000 }
          );
        });
        console.log('Geolocation permission granted');
      } catch (error) {
        if (error.code === error.PERMISSION_DENIED) {
          console.error('Geolocation permission denied by user');
          throw new Error('Location permission denied. Please enable location access in your browser settings and reload the page.');
        }
        // For other errors, continue with the normal flow
        console.log('Initial position request failed, but continuing:', error.message);
      }

      console.log('Getting initial position...');
      // Get initial position
      const position = await this.getCurrentPosition();
      console.log('Initial position received:', {
        coords: position.coords,
        timestamp: position.timestamp ? new Date(position.timestamp).toISOString() : 'No timestamp'
      });
      
      await this.handleLocationUpdate(position);

      console.log('Setting up position watch...');
      // Start watching position
      this.watchId = navigator.geolocation.watchPosition(
        this.handleLocationUpdate.bind(this),
        this.handleLocationError.bind(this),
        {
          enableHighAccuracy: true,
          timeout: this.config.maxAge,
          maximumAge: this.config.maxAge
        }
      );
      console.log('Position watch set up with ID:', this.watchId);

      this.isTracking = true;
      this.onStatusChange?.('active');
      console.log('Location tracking started successfully');

      // Set up online/offline handling
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));

      return true;
    } catch (error) {
      console.error('Error in startTracking:', {
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      this.handleLocationError(error);
      return false;
    }
  }

  // Stop location tracking
  stopTracking() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }

    this.isTracking = false;
    this.lastUpdate = null;
    this.lastLocation = null;
    this.offlineQueue = [];
    this.retryCount = 0;

    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));

    this.onStatusChange?.('inactive');
  }

  // Get current position with retry
  async getCurrentPosition() {
    console.log('Getting current position...');
    return new Promise((resolve, reject) => {
      const tryGetPosition = (attempt = 1) => {
        console.log(`Attempt ${attempt} to get position...`);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('Position received:', {
              coords: position.coords,
              timestamp: new Date(position.timestamp).toISOString(),
              attempt
            });
            resolve(position);
          },
          (error) => {
            console.error(`Position error on attempt ${attempt}:`, {
              code: error.code,
              message: error.message
            });
            if (attempt < this.config.retryAttempts) {
              console.log(`Retrying in ${this.config.retryDelay}ms...`);
              setTimeout(() => tryGetPosition(attempt + 1), this.config.retryDelay);
            } else {
              reject(error);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: this.config.maxAge,
            maximumAge: this.config.maxAge
          }
        );
      };

      tryGetPosition();
    });
  }

  // Handle location updates with throttling and validation
  async handleLocationUpdate(position) {
    try {
      const { latitude, longitude, accuracy } = position.coords;
      const timestamp = position.timestamp || Date.now();

      // Only log significant changes or errors
      if (accuracy > this.config.maxAccuracy) {
        console.warn(`Location accuracy (${accuracy}m) is below threshold (${this.config.maxAccuracy}m)`);
      }

      // If we have valid coordinates, clear any error state
      if (latitude && longitude) {
        this.onError?.(null);
        this.onStatusChange?.('active');
      }

      // Check if enough time has passed since last update
      const now = Date.now();
      if (this.lastUpdate && now - this.lastUpdate < this.config.updateInterval) {
        return;
      }

      // Check if moved enough distance
      if (this.lastLocation) {
        const distance = this.calculateDistance(
          this.lastLocation.latitude,
          this.lastLocation.longitude,
          latitude,
          longitude
        );

        if (distance < this.config.minDistance) {
          return;
        }
      }

      // Get address for the location (only if accuracy is good)
      let address = null;
      if (accuracy <= this.config.maxAccuracy) {
        try {
          address = await getAddressFromCoords(latitude, longitude);
        } catch (error) {
          // Don't log address lookup errors unless they're persistent
          if (this.retryCount === 0) {
            console.warn('Address lookup failed:', error.message);
          }
        }
      }

      const locationData = {
        latitude,
        longitude,
        accuracy,
        address,
        timestamp
      };

      // Update last known location
      this.lastLocation = locationData;
      this.lastUpdate = now;

      // Batch update listeners to reduce render cycles
      if (this.listeners.size > 0) {
        requestAnimationFrame(() => {
          this.listeners.forEach(listener => listener(locationData));
        });
      }

      // If offline, queue the update
      if (!navigator.onLine) {
        this.queueOfflineUpdate(locationData);
        return;
      }

      // Update Firebase if enabled
      if (this.updateFirebase) {
        await this.updateLocationInFirebase(locationData);
      }

      // Notify callback if provided
      this.onLocationUpdate?.(locationData);
    } catch (error) {
      // Only log errors if they're not transient
      if (!this.lastLocation?.latitude || !this.lastLocation?.longitude) {
        console.error('Location update error:', error.message);
        this.handleLocationError(error);
      }
    }
  }

  // Handle location errors
  handleLocationError(error) {
    console.error('Location tracking error:', error);

    // Don't report errors if we have a valid location
    if (this.lastLocation?.latitude && this.lastLocation?.longitude) {
      console.warn('Ignoring error while we have a valid location:', error.message);
      return;
    }

    let errorMessage = 'Failed to track location. ';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage += 'Location permission denied. Please enable location access in your browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage += 'Location information is unavailable. Please check your device\'s location services.';
        break;
      case error.TIMEOUT:
        errorMessage += 'Location request timed out. Please check your internet connection.';
        break;
      default:
        errorMessage += `Error: ${error.message}`;
    }

    this.onError?.(errorMessage);
    this.onStatusChange?.('error');
  }

  // Update location in Firebase with retry
  async updateLocationInFirebase(locationData) {
    try {
      const result = await updateUserLocation(this.userId, locationData);
      if (!result.success) {
        throw new Error(result.error);
      }
      this.retryCount = 0;
    } catch (error) {
      if (this.retryCount < this.config.retryAttempts) {
        this.retryCount++;
        // Use exponential backoff for retries
        const delay = this.config.retryDelay * Math.pow(2, this.retryCount - 1);
        setTimeout(() => this.updateLocationInFirebase(locationData), delay);
      } else {
        // Only log persistent errors
        console.error('Failed to update location after retries:', error.message);
        throw error;
      }
    }
  }

  // Queue offline updates
  queueOfflineUpdate(locationData) {
    if (this.offlineQueue.length >= this.config.offlineQueueSize) {
      this.offlineQueue.shift(); // Remove oldest update
    }
    this.offlineQueue.push(locationData);
    this.onStatusChange?.('offline');
  }

  // Handle coming back online
  async handleOnline() {
    this.onStatusChange?.('syncing');
    
    // Process queued updates in batches
    const batchSize = 5;
    while (this.offlineQueue.length > 0) {
      const batch = this.offlineQueue.splice(0, batchSize);
      try {
        await Promise.all(
          batch.map(locationData => 
            this.updateFirebase ? 
              this.updateLocationInFirebase(locationData) :
              Promise.resolve()
          )
        );
        // Notify listeners of queued updates in a batch
        requestAnimationFrame(() => {
          batch.forEach(locationData => {
            this.listeners.forEach(listener => listener(locationData));
          });
        });
      } catch (error) {
        console.error('Error syncing offline updates:', error.message);
        // Put the failed batch back in the queue
        this.offlineQueue.unshift(...batch);
        break;
      }
    }

    this.onStatusChange?.('active');
  }

  // Handle going offline
  handleOffline() {
    this.onStatusChange?.('offline');
  }

  // Calculate distance between two points in meters
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  // Get current tracking status
  getStatus() {
    return {
      isTracking: this.isTracking,
      lastLocation: this.lastLocation,
      isOnline: navigator.onLine,
      queueSize: this.offlineQueue.length
    };
  }
}

// Create singleton instance
const locationTrackingService = new LocationTrackingService();

// Create a React hook that uses the service
export const useLocation = ({ preset = 'default', updateFirebase = false, onLocationUpdate, onError, onStatusChange } = {}) => {
  const [location, setLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const lastUpdateTime = useRef(0);
  const lastLocation = useRef(null);
  const THROTTLE_INTERVAL = 5000; // 5 seconds between updates
  const MIN_DISTANCE = 10; // Minimum 10 meters between updates
  const MIN_ACCURACY = 100; // Maximum 100 meters accuracy required

  const updateLocation = useCallback((newLocation) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime.current;
    
    // Check if enough time has passed
    if (timeSinceLastUpdate < THROTTLE_INTERVAL) {
      return;
    }

    // Check if location has changed significantly
    if (lastLocation.current) {
      const distance = calculateDistance(
        lastLocation.current.latitude,
        lastLocation.current.longitude,
        newLocation.latitude,
        newLocation.longitude
      );
      
      if (distance < MIN_DISTANCE) {
        return;
      }
    }

    // Check accuracy
    if (newLocation.accuracy > MIN_ACCURACY) {
      console.warn('Location accuracy below threshold:', newLocation.accuracy);
      return;
    }

    // Update location
    lastUpdateTime.current = now;
    lastLocation.current = newLocation;
    setLocation(newLocation);
    
    if (onLocationUpdate) {
      onLocationUpdate(newLocation);
    }
  }, [onLocationUpdate]);

  // Helper function to calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  useEffect(() => {
    // Subscribe to location updates
    const unsubscribe = locationTrackingService.subscribe(setLocation);

    // Set initial tracking state
    setIsTracking(locationTrackingService.isTracking);

    return () => {
      unsubscribe();
      // Only stop tracking if this was the last subscriber
      if (preset === 'default' && locationTrackingService.listeners.size === 1) {
        locationTrackingService.stopTracking();
      }
    };
  }, [preset]);

  const startTracking = useCallback(async (userId) => {
    try {
      setError(null);
      const success = await locationTrackingService.startTracking(userId, {
        preset: preset || 'basic',
        updateFirebase: updateFirebase,
        onLocationUpdate: (locationData) => {
          setLocation(locationData);
          onLocationUpdate?.(locationData);
        },
        onError: (errorMessage) => {
          setError(errorMessage);
          onError?.(errorMessage);
        },
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
          setIsTracking(newStatus === 'active');
          onStatusChange?.(newStatus);
        }
      });

      if (!success) {
        throw new Error('Failed to start location tracking');
      }
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }, [preset, updateFirebase, onLocationUpdate, onError, onStatusChange]);

  const stopTracking = useCallback(() => {
    locationTrackingService.stopTracking();
    setIsTracking(false);
    setStatus('inactive');
  }, []);

  return {
    location,
    isTracking,
    error,
    status,
    startTracking,
    stopTracking,
    getCurrentPosition: locationTrackingService.getCurrentPosition.bind(locationTrackingService)
  };
};

export default locationTrackingService; 