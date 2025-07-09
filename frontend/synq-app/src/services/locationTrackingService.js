import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { updateUserLocation } from './firebaseOperations';
import { getAddressFromCoords } from './locationService';

// Configuration with different presets for different use cases
const LOCATION_CONFIG = {
  // Basic tracking (for simple location display) - more lenient for office networks
  basic: {
    updateInterval: 30000, // 30 seconds (increased for office networks)
    minDistance: 50, // 50 meters (increased for office networks)
    maxAccuracy: 500, // 500 meters (increased for office networks)
    maxAge: 60000, // 60 seconds (increased for office networks)
    retryAttempts: 1, // Reduced retries to avoid endless loops
    retryDelay: 2000, // Increased delay
    offlineQueueSize: 10
  },
  // Real-time tracking (for ride sharing) - more lenient for office networks
  realtime: {
    updateInterval: 15000, // 15 seconds (increased for office networks)
    minDistance: 25, // 25 meters (increased for office networks)
    maxAccuracy: 300, // 300 meters (increased for office networks)
    maxAge: 30000, // 30 seconds (increased for office networks)
    retryAttempts: 2, // Reduced retries
    retryDelay: 2000, // Increased delay
    offlineQueueSize: 50
  },
  // Office-friendly tracking (for restricted networks)
  office: {
    updateInterval: 60000, // 60 seconds
    minDistance: 100, // 100 meters
    maxAccuracy: 1000, // 1000 meters
    maxAge: 120000, // 2 minutes
    retryAttempts: 1,
    retryDelay: 5000, // 5 seconds
    offlineQueueSize: 10
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
      config: this.config,
      geolocationSupported: 'geolocation' in navigator,
      protocol: location.protocol,
      hostname: location.hostname
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
      console.log('Getting initial position...');
      // Get initial position with more lenient settings for office networks
      let initialPosition = null;
      try {
        console.log('Calling getCurrentPosition...');
        initialPosition = await this.getCurrentPosition();
        console.log('Initial position received:', {
          coords: initialPosition.coords,
          timestamp: initialPosition.timestamp ? new Date(initialPosition.timestamp).toISOString() : 'No timestamp'
        });
        
        // Only call handleLocationUpdate if we have a valid position
        if (initialPosition && initialPosition.coords) {
          console.log('Processing initial position...');
          try {
            await this.handleLocationUpdate(initialPosition);
            console.log('Initial position processed successfully');
          } catch (error) {
            console.error('Error processing initial position:', error);
            // Don't fail the entire tracking start if initial position processing fails
            // The watchPosition will still work
          }
        }
      } catch (positionError) {
        console.warn('Failed to get initial position - likely blocked by office network:', {
          error: positionError.message,
          code: positionError.code,
          stack: positionError.stack
        });
        
        // For office networks, we'll start tracking in "manual mode"
        // The user can manually set their location
        this.isTracking = true;
        this.onStatusChange?.('manual');
        this.onError?.('Location tracking blocked by network. You can manually set your location.');
        console.log('Started location tracking in manual mode due to network restrictions');
        return true; // Return true to indicate "success" but in manual mode
      }

      // Only set up watchPosition if we successfully got initial position
      console.log('Setting up position watch...');
      // Start watching position with better accuracy settings for office networks
      this.watchId = navigator.geolocation.watchPosition(
        this.handleLocationUpdate.bind(this),
        this.handleLocationError.bind(this),
        {
          enableHighAccuracy: false, // Use low accuracy for office networks
          timeout: 30000, // 30 second timeout (increased for office networks)
          maximumAge: 300000 // Accept cached location up to 5 minutes old
        }
      );
      console.log('Position watch set up with ID:', this.watchId);

      this.isTracking = true;
      this.onStatusChange?.('active');
      console.log('Location tracking started successfully');

      // Set up online/offline handling
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));

      console.log('About to return true from startTracking');
      return true;
    } catch (error) {
      console.error('Error in startTracking:', {
        error: error.message,
        code: error.code,
        stack: error.stack,
        networkInfo: {
          protocol: location.protocol,
          hostname: location.hostname,
          userAgent: navigator.userAgent
        }
      });
      
      // Provide more specific error messages for office networks
      let userFriendlyError = error?.message || 'Unknown error';
      const errorMsg = error?.message || 'Unknown error';
      if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('blocked')) {
        userFriendlyError = 'Location tracking failed. Please enter your location manually';
      }
      
      this.onError?.(userFriendlyError);
      this.onStatusChange?.('error');
      return false;
    }
    
    // Fallback return - this should never be reached, but ensures we always return a value
    console.warn('Unexpected fallback return in startTracking');
    return false;
  }

  // Stop location tracking
  stopTracking(skipStatusChange = false) {
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

    // Only call status change if not skipping it (for error cases)
    if (!skipStatusChange) {
    this.onStatusChange?.('inactive');
    }
  }

  // Get current position with retry and fallback - more lenient for office networks
  async getCurrentPosition() {
    console.log('Getting current position...');
    return new Promise((resolve, reject) => {
      const tryGetPosition = (attempt = 1, useLowAccuracy = false) => {
        console.log(`Attempt ${attempt} to get position... (${useLowAccuracy ? 'low accuracy' : 'high accuracy'})`);
        
        const options = {
          enableHighAccuracy: !useLowAccuracy, // Start with high accuracy, fallback to low
          timeout: useLowAccuracy ? 30000 : 20000, // Longer timeout for low accuracy
          maximumAge: useLowAccuracy ? 300000 : 120000 // Accept older cached locations for low accuracy (5 min vs 2 min)
        };
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('Position received:', {
              coords: position.coords,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp).toISOString(),
              attempt,
              accuracyMode: useLowAccuracy ? 'low' : 'high'
            });
            resolve(position);
          },
          (error) => {
            console.error(`Position error on attempt ${attempt}:`, {
              code: error.code,
              message: error.message,
              accuracyMode: useLowAccuracy ? 'low' : 'high',
              networkInfo: {
                protocol: location.protocol,
                hostname: location.hostname
              }
            });
            
            // Provide more specific error messages
            if (error.code === error.TIMEOUT) {
              console.warn('Position request timed out - possible office network restriction');
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              console.warn('Position unavailable - device location services may be disabled');
            }
            
            // If high accuracy failed and we haven't tried low accuracy yet, try that
            if (!useLowAccuracy && attempt === 1) {
              console.log('High accuracy failed, trying low accuracy...');
              setTimeout(() => tryGetPosition(1, true), 1000);
              return;
            }
            
            // If we still have retries left, try again
            if (attempt < this.config.retryAttempts) {
              console.log(`Retrying in ${this.config.retryDelay}ms...`);
              setTimeout(() => tryGetPosition(attempt + 1, useLowAccuracy), this.config.retryDelay);
            } else {
              // Final fallback: try to get any cached location
              console.log('Attempting to get any cached location as final fallback...');
              navigator.geolocation.getCurrentPosition(
                (cachedPosition) => {
                  console.log('Cached position received as final fallback:', {
                    coords: cachedPosition.coords,
                    accuracy: cachedPosition.coords.accuracy,
                    timestamp: new Date(cachedPosition.timestamp).toISOString()
                  });
                  resolve(cachedPosition);
                },
                (fallbackError) => {
                  console.error('All position attempts failed:', fallbackError);
                  // Provide user-friendly error message
                  let userFriendlyError = 'Failed to get location';
                  if (error.code === error.TIMEOUT) {
                    userFriendlyError = 'Location tracking blocked by network. You can manually set your location.';
                  } else if (error.code === error.POSITION_UNAVAILABLE) {
                    userFriendlyError = 'Location unavailable. Please check your device\'s location services.';
                  } else if (error.code === error.PERMISSION_DENIED) {
                    userFriendlyError = 'Location permission denied. Please enable location access.';
                  }
                  reject(new Error(userFriendlyError));
                },
                {
                  enableHighAccuracy: false, // Use low accuracy for final fallback
                  timeout: 45000, // Very long timeout for final attempt
                  maximumAge: 600000 // Accept cached location up to 10 minutes old
                }
              );
            }
          },
          options
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
        // Don't automatically clear errors or change status here
        // Let the parent component handle this based on its error state
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
            console.warn('Address lookup failed:', error?.message || 'Unknown error');
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
        console.log('About to update Firebase...');
        try {
          await this.updateLocationInFirebase(locationData);
          console.log('Firebase update completed in handleLocationUpdate');
        } catch (error) {
          console.error('Firebase update failed in handleLocationUpdate:', error);
          // Don't re-throw the error, just log it
          // The location tracking should continue even if Firebase update fails
        }
      }

      // Notify callback if provided
      this.onLocationUpdate?.(locationData);
    } catch (error) {
      // Only log errors if they're not transient
      if (!this.lastLocation?.latitude || !this.lastLocation?.longitude) {
        console.error('Location update error:', error?.message || 'Unknown error');
        this.handleLocationError(error);
      }
    }
  }

  // Handle location errors
  handleLocationError(error) {
    console.error('Location tracking error:', error);

    // Don't report errors if we have a valid location
    if (this.lastLocation?.latitude && this.lastLocation?.longitude) {
      console.warn('Ignoring error while we have a valid location:', error?.message || 'Unknown error');
      return;
    }

    let errorMessage = 'Failed to track location. ';
    const errorMsg = error?.message || 'Unknown error';
    
    switch (error?.code) {
      case error?.PERMISSION_DENIED:
        errorMessage += 'Location permission denied. Please enable location access in your browser settings.';
        break;
      case error?.POSITION_UNAVAILABLE:
        errorMessage += 'Location information is unavailable. Please check your device\'s location services.';
        break;
      case error?.TIMEOUT:
        errorMessage += 'Location request timed out. Please check your internet connection.';
        break;
      default:
        errorMessage += `Error: ${errorMsg}`;
    }

    this.onError?.(errorMessage);
    this.onStatusChange?.('error');
  }

  // Update location in Firebase with retry
  async updateLocationInFirebase(locationData) {
    try {
      console.log('Updating location in Firebase:', {
        userId: this.userId,
        updateFirebase: this.updateFirebase,
        locationData: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy
        }
      });
      
      // For driver location tracking, we need to update the ride document
      // with currentLocation instead of location to avoid overwriting pickup location
      if (this.userId && this.updateFirebase) {
        // Find active rides where this user is the driver
        const ridesRef = collection(db, 'rides');
        const driverRidesQuery = query(
          ridesRef,
          where('driver.uid', '==', this.userId),
          where('status', 'in', ['active', 'created', 'forming'])
        );
        
        const driverRidesSnapshot = await getDocs(driverRidesQuery);
        console.log('Found active rides for driver:', driverRidesSnapshot.size);
        
        if (!driverRidesSnapshot.empty) {
          // Update all active rides where user is driver
          const updatePromises = driverRidesSnapshot.docs.map(docSnapshot => {
            const rideRef = doc(db, 'rides', docSnapshot.id);
            return updateDoc(rideRef, {
              'driver.currentLocation': {
                lat: locationData.latitude,
                lng: locationData.longitude,
                accuracy: locationData.accuracy,
                address: locationData.address,
                lastUpdated: serverTimestamp()
              }
            });
          });
          
          await Promise.all(updatePromises);
          console.log(`Updated currentLocation for ${updatePromises.length} active rides`);
        }
      }
      
      // Also update user's general location (for backward compatibility)
      console.log('Updating user location...');
      const result = await updateUserLocation(this.userId, locationData);
      console.log('User location update result:', result);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.retryCount = 0;
      console.log('Firebase update completed successfully');
    } catch (error) {
      console.error('Firebase update error:', {
        error: error?.message || 'Unknown error',
        code: error?.code,
        stack: error?.stack
      });
      
      // Check if it's a permission error
      if (error?.message && error.message.includes('permission')) {
        console.warn('Permission denied for location update - stopping tracking:', error.message);
        this.stopTracking();
        return; // Don't retry permission errors
      }
      
      if (this.retryCount < this.config.retryAttempts) {
        this.retryCount++;
        // Use exponential backoff for retries
        const delay = this.config.retryDelay * Math.pow(2, this.retryCount - 1);
        console.log(`Retrying Firebase update in ${delay}ms (attempt ${this.retryCount})`);
        setTimeout(() => this.updateLocationInFirebase(locationData), delay);
      } else {
        // Only log persistent errors
        console.error('Failed to update location after retries:', error?.message || 'Unknown error');
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
        console.error('Error syncing offline updates:', error?.message || 'Unknown error');
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

  // Set location manually (for office networks where geolocation is blocked)
  setManualLocation(latitude, longitude, address = null) {
    console.log('Setting manual location:', { latitude, longitude, address });
    
    const locationData = {
      latitude,
      longitude,
      accuracy: 100, // Manual location has lower accuracy
      address,
      timestamp: Date.now(),
      isManual: true
    };

    this.lastLocation = locationData;
    this.lastUpdate = Date.now();

    // Notify listeners
    if (this.listeners.size > 0) {
      requestAnimationFrame(() => {
        this.listeners.forEach(listener => listener(locationData));
      });
    }

    // Update Firebase if enabled
    if (this.updateFirebase) {
      this.updateLocationInFirebase(locationData);
    }

    // Notify callback if provided
    this.onLocationUpdate?.(locationData);
    
    // Clear any error state
    this.onError?.(null);
    this.onStatusChange?.('manual');
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
      
      return success; // Return the success value
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }, [preset, updateFirebase, onLocationUpdate, onError, onStatusChange]);

  const stopTracking = useCallback((skipStatusChange = false) => {
    locationTrackingService.stopTracking(skipStatusChange);
    setIsTracking(false);
    if (!skipStatusChange) {
    setStatus('inactive');
    }
  }, []);

  return {
    location,
    isTracking,
    error,
    status,
    startTracking,
    stopTracking,
    setManualLocation: locationTrackingService.setManualLocation.bind(locationTrackingService),
    getCurrentPosition: locationTrackingService.getCurrentPosition.bind(locationTrackingService)
  };
};

export default locationTrackingService; 