// locationService.js - Handles geolocation functionality
import { db } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

class LocationService {
  constructor() {
    this.watchId = null;
    this.isTracking = false;
    this.onLocationUpdate = null;
    this.onError = null;
    this.updateInterval = 10000; // Update every 10 seconds
    this.lastUpdate = null;
  }

  // Check if geolocation is supported
  isGeolocationSupported() {
    return 'geolocation' in navigator;
  }

  // Request location permission and get current position
  async getCurrentPosition() {
    if (!this.isGeolocationSupported()) {
      throw new Error('Geolocation is not supported by your browser');
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };
    } catch (error) {
      this.handleLocationError(error);
      throw error;
    }
  }

  // Start tracking user's location
  async startTracking(userId, onUpdate, onError) {
    if (this.isTracking) {
      console.warn('Location tracking is already active');
      return;
    }

    if (!this.isGeolocationSupported()) {
      throw new Error('Geolocation is not supported by your browser');
    }

    this.onLocationUpdate = onUpdate;
    this.onError = onError;
    this.isTracking = true;

    try {
      // First get the current position
      const initialPosition = await this.getCurrentPosition();
      await this.updateLocationInFirebase(userId, initialPosition);
      if (this.onLocationUpdate) {
        this.onLocationUpdate(initialPosition);
      }

      // Then start watching position
      this.watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };

          // Only update if enough time has passed
          if (!this.lastUpdate || (Date.now() - this.lastUpdate) >= this.updateInterval) {
            await this.updateLocationInFirebase(userId, locationData);
            this.lastUpdate = Date.now();
            
            if (this.onLocationUpdate) {
              this.onLocationUpdate(locationData);
            }
          }
        },
        (error) => this.handleLocationError(error),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );

      console.log('Location tracking started');
    } catch (error) {
      this.handleLocationError(error);
      throw error;
    }
  }

  // Stop tracking user's location
  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.isTracking = false;
      this.onLocationUpdate = null;
      this.onError = null;
      this.lastUpdate = null;
      console.log('Location tracking stopped');
    }
  }

  // Update location in Firebase
  async updateLocationInFirebase(userId, locationData) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          lastUpdated: serverTimestamp()
        }
      });
    } catch (error) {
      console.error('Error updating location in Firebase:', error);
      throw error;
    }
  }

  // Handle location errors
  handleLocationError(error) {
    console.error('Location error:', error);
    
    let errorMessage = 'An error occurred while getting your location';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location access was denied. Please enable location services to use this feature.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable. Please try again.';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out. Please try again.';
        break;
      default:
        errorMessage = 'An unknown error occurred while getting your location.';
    }

    if (this.onError) {
      this.onError(errorMessage);
    }

    return errorMessage;
  }

  // Get location permission status
  async getPermissionStatus() {
    if (!this.isGeolocationSupported()) {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch (error) {
      console.error('Error checking permission status:', error);
      return 'unknown';
    }
  }
}

// Create a singleton instance
const locationService = new LocationService();
export default locationService; 