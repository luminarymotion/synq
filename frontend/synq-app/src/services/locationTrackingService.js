// Location tracking service - no React hooks should be imported here
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { updateUserLocation } from './firebaseOperations';
import { getAddressFromCoords } from './locationService';
import { isSafariMobile, isDesktopBrowser } from '../utils/browserDetection';
import errorLogger from './errorLogger';

// Location permission and consent management
export const LOCATION_PERMISSIONS = {
  NEVER: 'never',           // Never share location
  WHILE_USING: 'while_using', // Share only while actively using the app
  ALWAYS: 'always',         // Always share location (background)
  RIDE_ONLY: 'ride_only',   // Share only during active rides
  DRIVER_ONLY: 'driver_only' // Share only when user is the driver
};

export const CONSENT_LEVELS = {
  REQUIRED: 'required',     // Required for app functionality
  OPTIONAL: 'optional',     // Optional for enhanced features
  DISABLED: 'disabled'      // Feature disabled
};

// Location sharing context for determining when to share
export const LOCATION_CONTEXTS = {
  APP_ACTIVE: 'app_active',     // App is in foreground
  RIDE_ACTIVE: 'ride_active',   // User is in an active ride
  DRIVER_MODE: 'driver_mode',   // User is the driver
  BACKGROUND: 'background',     // App is in background
  MANUAL_REQUEST: 'manual_request' // User manually requested location
};

// Enhanced logging utility
class LocationLogger {
  constructor(serviceName = 'LocationTracking') {
    this.serviceName = serviceName;
    this.enabled = true;
    this.logLevel = 'info'; // 'debug', 'info', 'warn', 'error'
  }

  setLogLevel(level) {
    this.logLevel = level;
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.serviceName}] [${level.toUpperCase()}]`;
    
    if (data) {
      return `${prefix} ${message}`, data;
    }
    return `${prefix} ${message}`;
  }

  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      if (data) {
        console.log(this.formatMessage('debug', message), data);
      } else {
        console.log(this.formatMessage('debug', message));
      }
    }
  }

  info(message, data = null) {
    if (this.shouldLog('info')) {
      if (data) {
        console.log(this.formatMessage('info', message), data);
      } else {
        console.log(this.formatMessage('info', message));
      }
    }
  }

  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      if (data) {
        console.warn(this.formatMessage('warn', message), data);
      } else {
        console.warn(this.formatMessage('warn', message));
      }
    }
  }

  error(message, data = null) {
    if (this.shouldLog('error')) {
      if (data) {
        console.error(this.formatMessage('error', message), data);
      } else {
        console.error(this.formatMessage('error', message));
      }
    }
  }
}

// Location permission manager
class LocationPermissionManager {
  constructor() {
    this.permissions = new Map();
    this.consentLevels = new Map();
    this.logger = new LocationLogger('PermissionManager');
  }

  async getUserPreferences(userId) {
    try {
      this.logger.debug('Getting user preferences', { userId });
      
      const userDoc = doc(db, 'users', userId);
      const userSnapshot = await getDoc(userDoc);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.data();
        const preferences = {
          locationPermission: userData.locationPermission || LOCATION_PERMISSIONS.WHILE_USING,
          consentLevel: userData.consentLevel || CONSENT_LEVELS.OPTIONAL,
          lastUpdated: userData.locationPermissionUpdated || null
        };
        
        this.permissions.set(userId, preferences.locationPermission);
        this.consentLevels.set(userId, preferences.consentLevel);
        
        this.logger.info('User preferences loaded', { userId, preferences });
        return preferences;
      } else {
        this.logger.warn('User document not found', { userId });
        return null;
      }
    } catch (error) {
      this.logger.error('Error getting user preferences', { userId, error: error.message });
      throw error;
    }
  }

  async saveUserPreferences(userId, preferences) {
    try {
      this.logger.debug('Saving user preferences', { userId, preferences });
      
      const userDoc = doc(db, 'users', userId);
      await updateDoc(userDoc, {
        locationPermission: preferences.locationPermission,
        consentLevel: preferences.consentLevel,
        locationPermissionUpdated: serverTimestamp()
      });
      
      this.permissions.set(userId, preferences.locationPermission);
      this.consentLevels.set(userId, preferences.consentLevel);
      
      this.logger.info('User preferences saved', { userId, preferences });
      return true;
    } catch (error) {
      this.logger.error('Error saving user preferences', { userId, error: error.message });
      throw error;
    }
  }

  updateUserContext(userId, context) {
    try {
      this.logger.debug('Updating user context', { userId, context });
      
      if (!this.contextState) {
        this.contextState = new Map();
      }
      
      const userContext = this.contextState.get(userId) || {};
      userContext.currentContext = context;
      userContext.lastUpdated = new Date();
      
      this.contextState.set(userId, userContext);
      
      this.logger.info('User context updated', { userId, context });
      return true;
    } catch (error) {
      this.logger.error('Error updating user context', { userId, error: error.message });
      return false;
    }
  }

  async canShareLocation(userId, context = LOCATION_CONTEXTS.APP_ACTIVE) {
    try {
      this.logger.debug('Checking if can share location', { userId, context });
      
      const permission = this.permissions.get(userId) || LOCATION_PERMISSIONS.WHILE_USING;
      const consentLevel = this.consentLevels.get(userId) || CONSENT_LEVELS.OPTIONAL;

      // Check permission level
      if (permission === LOCATION_PERMISSIONS.NEVER) {
        this.logger.info('Location sharing blocked by user preference', { userId, permission });
        return false;
      }
      
      if (permission === LOCATION_PERMISSIONS.RIDE_ONLY && context !== LOCATION_CONTEXTS.RIDE_ACTIVE) {
        this.logger.info('Location sharing only allowed during rides', { userId, context });
        return false;
      }
      
      if (permission === LOCATION_PERMISSIONS.DRIVER_ONLY && context !== LOCATION_CONTEXTS.DRIVER_MODE) {
        this.logger.info('Location sharing only allowed in driver mode', { userId, context });
        return false;
      }
      
      // Check consent level
      if (consentLevel === CONSENT_LEVELS.DISABLED) {
        this.logger.info('Location sharing disabled by consent level', { userId, consentLevel });
        return false;
      }
      
      this.logger.info('Location sharing allowed', { userId, permission, consentLevel, context });
      return true;
    } catch (error) {
      this.logger.error('Error checking location sharing permission', { userId, error: error.message });
      return false;
    }
  }

  async getPermissionStatus(userId) {
    try {
      this.logger.debug('Getting permission status', { userId });
      
      const preferences = await this.getUserPreferences(userId);
      if (!preferences) {
        return { hasPermission: false, reason: 'User not found' };
      }
      
      const canShare = await this.canShareLocation(userId, LOCATION_CONTEXTS.APP_ACTIVE);
      
      return {
        hasPermission: canShare,
        permission: preferences.locationPermission,
        consentLevel: preferences.consentLevel,
        lastUpdated: preferences.lastUpdated
      };
    } catch (error) {
      this.logger.error('Error getting permission status', { userId, error: error.message });
      return { hasPermission: false, reason: error.message };
    }
  }

  async checkBrowserPermission() {
    try {
      this.logger.debug('Checking browser location permission');
      
      if (!navigator.permissions) {
        this.logger.warn('Permissions API not supported');
        return 'unknown';
      }
      
          const permission = await navigator.permissions.query({ name: 'geolocation' });
      this.logger.info('Browser permission status', { status: permission.state });
      
      return permission.state;
    } catch (error) {
      this.logger.error('Error checking browser permission', { error: error.message });
      return 'unknown';
    }
  }

  async requestLocationPermission(userId, context = LOCATION_CONTEXTS.APP_ACTIVE) {
    try {
      this.logger.info('Requesting location permission', { userId, context });
      
      // Check if already have permission
      const canShare = await this.canShareLocation(userId, context);
      if (canShare) {
        this.logger.info('Already have location permission', { userId });
        return { granted: true, reason: 'Already permitted' };
      }

      // Check browser permission
      const browserPermission = await this.checkBrowserPermission();
      if (browserPermission === 'denied') {
        this.logger.warn('Browser location permission denied', { userId });
        return { granted: false, reason: 'Browser permission denied' };
      }

      // Request browser permission if needed
      if (browserPermission === 'prompt') {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000
            });
          });
          
          this.logger.info('Browser location permission granted', { userId });
          
          // Update user preferences to allow location sharing
          await this.saveUserPreferences(userId, {
            locationPermission: LOCATION_PERMISSIONS.WHILE_USING,
            consentLevel: CONSENT_LEVELS.OPTIONAL
          });
          
          return { granted: true, reason: 'Permission granted' };
        } catch (error) {
          this.logger.warn('Failed to get current position', { userId, error: error.message });
          return { granted: false, reason: 'Failed to get location' };
        }
      }
      
      return { granted: false, reason: 'Permission not available' };
    } catch (error) {
      this.logger.error('Error requesting location permission', { userId, error: error.message });
      return { granted: false, reason: error.message };
    }
  }
}

// Location validator
class LocationValidator {
  static validateUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID: must be a non-empty string');
    }
    if (userId.trim().length === 0) {
      throw new Error('Invalid user ID: cannot be empty or whitespace');
    }
    return true;
  }

  static validateCoordinates(latitude, longitude) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error('Coordinates must be numbers');
    }
    if (isNaN(latitude) || isNaN(longitude)) {
      throw new Error('Coordinates cannot be NaN');
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }
    return true;
  }

  static validatePosition(position) {
    if (!position || typeof position !== 'object') {
      throw new Error('Position must be an object');
    }
    
    const { coords, timestamp } = position;
    if (!coords || typeof coords !== 'object') {
      throw new Error('Position must have coords property');
    }
    
    const { latitude, longitude, accuracy } = coords;
    this.validateCoordinates(latitude, longitude);
    
    if (accuracy !== undefined && (typeof accuracy !== 'number' || accuracy < 0)) {
      throw new Error('Accuracy must be a non-negative number');
    }
    
    if (timestamp !== undefined && typeof timestamp !== 'number') {
      throw new Error('Timestamp must be a number');
    }
    
    return true;
  }

  static validateLocationData(locationData) {
    if (!locationData || typeof locationData !== 'object') {
      throw new Error('Location data must be an object');
    }
    
    const { latitude, longitude, timestamp, userId } = locationData;
    
    this.validateCoordinates(latitude, longitude);
    this.validateUserId(userId);
    
    if (timestamp !== undefined && typeof timestamp !== 'number') {
      throw new Error('Timestamp must be a number');
    }
    
    return true;
  }

  static validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }
    
    const { preset, updateFirebase, onLocationUpdate, onError, onStatusChange } = config;
    
    if (preset && typeof preset !== 'string') {
      throw new Error('Preset must be a string');
    }
    
    if (updateFirebase !== undefined && typeof updateFirebase !== 'boolean') {
      throw new Error('updateFirebase must be a boolean');
    }
    
    if (onLocationUpdate && typeof onLocationUpdate !== 'function') {
      throw new Error('onLocationUpdate must be a function');
    }
    
    if (onError && typeof onError !== 'function') {
      throw new Error('onError must be a function');
    }
    
    if (onStatusChange && typeof onStatusChange !== 'function') {
      throw new Error('onStatusChange must be a function');
    }
    
    return true;
  }

  static validateOptions(options) {
    if (!options || typeof options !== 'object') {
      throw new Error('Options must be an object');
    }
    
    const { preset, updateFirebase, onLocationUpdate, onError, onStatusChange } = options;
    
    if (preset && typeof preset !== 'string') {
      throw new Error('Preset must be a string');
    }
    
    if (updateFirebase !== undefined && typeof updateFirebase !== 'boolean') {
      throw new Error('updateFirebase must be a boolean');
    }
    
    if (onLocationUpdate && typeof onLocationUpdate !== 'function') {
      throw new Error('onLocationUpdate must be a function');
    }
    
    if (onError && typeof onError !== 'function') {
      throw new Error('onError must be a function');
    }
    
    if (onStatusChange && typeof onStatusChange !== 'function') {
      throw new Error('onStatusChange must be a function');
    }
    
    return true;
  }
}

// Location configuration presets
const LOCATION_CONFIG = {
  ultra_fast: {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0,
    updateInterval: 1000,
    firebaseUpdateInterval: 2000
  },
  fast: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
    updateInterval: 2000,
    firebaseUpdateInterval: 5000
  },
  balanced: {
    enableHighAccuracy: false,
    timeout: 15000,
    maximumAge: 10000,
    updateInterval: 5000,
    firebaseUpdateInterval: 10000
  },
  battery_saver: {
    enableHighAccuracy: false,
    timeout: 20000,
    maximumAge: 30000,
    updateInterval: 10000,
    firebaseUpdateInterval: 30000
  }
};

// Main location tracking service
class LocationTrackingService {
  constructor() {
    this.isTracking = false;
    this.currentUserId = null;
    this.watchId = null;
    this.subscribers = new Set();
    this.logger = new LocationLogger('LocationTracking');
    this.permissionManager = new LocationPermissionManager();
    this.updateQueue = [];
    this.batchSize = 10;
    this.batchTimeout = null;
    this.isOnline = navigator.onLine;
    
    // Bind methods
    this.handleLocationUpdate = this.handleLocationUpdate.bind(this);
    this.handleLocationError = this.handleLocationError.bind(this);
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
    
    // Set up event listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    this.logger.info('Location tracking service initialized');
  }

  setConfig(preset) {
    try {
      this.logger.debug('Setting location config', { preset });
      
      if (!LOCATION_CONFIG[preset]) {
        throw new Error(`Invalid preset: ${preset}`);
      }
      
      this.config = { ...LOCATION_CONFIG[preset] };
      this.logger.info('Location config updated', { preset, config: this.config });
      
      return true;
    } catch (error) {
      this.logger.error('Error setting location config', { preset, error: error.message });
      return false;
    }
  }

  subscribe(listener) {
    try {
      this.logger.debug('Adding location subscriber');
      
      if (typeof listener !== 'function') {
        throw new Error('Listener must be a function');
      }
      
      this.subscribers.add(listener);
      
      this.logger.info('Location subscriber added', { totalSubscribers: this.subscribers.size });
      
      // Return unsubscribe function
      return () => {
        this.subscribers.delete(listener);
        this.logger.info('Location subscriber removed', { totalSubscribers: this.subscribers.size });
      };
    } catch (error) {
      this.logger.error('Error adding location subscriber', { error: error.message });
      throw error;
    }
  }

  async checkLocationPermission() {
    try {
      this.logger.debug('Checking location permission');
      
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
      }
      
      const browserPermission = await this.permissionManager.checkBrowserPermission();
      this.logger.info('Browser permission status', { status: browserPermission });
      
      if (browserPermission === 'denied') {
        throw new Error('Location permission denied by browser');
      }
      
      if (browserPermission === 'prompt') {
        this.logger.info('Location permission needs to be requested');
        return { hasPermission: false, needsRequest: true };
      }
      
      return { hasPermission: true, needsRequest: false };
    } catch (error) {
      this.logger.error('Error checking location permission', { error: error.message });
      throw error;
    }
  }

  getLocationErrorHelp(errorCode) {
    const errorMessages = {
      1: 'Location access denied. Please enable location permissions in your browser settings.',
      2: 'Location unavailable. Please check your device location settings.',
      3: 'Location request timed out. Please try again.',
      4: 'Location service error. Please refresh the page and try again.'
    };
    
    return errorMessages[errorCode] || 'Unknown location error occurred.';
  }

  async startTracking(userId, options = {}) {
    try {
      this.logger.info('Starting location tracking', { userId, options });
      
      // Validate parameters
      LocationValidator.validateUserId(userId);
      LocationValidator.validateOptions(options);

      // Check if already tracking
      if (this.isTracking) {
        this.logger.warn('Location tracking already active', { userId });
        return true;
      }
      
      // Check permissions
      const permissionStatus = await this.permissionManager.getPermissionStatus(userId);
      if (!permissionStatus.hasPermission) {
        this.logger.warn('Location permission denied', { userId, reason: permissionStatus.reason });
        throw new Error(`Location permission denied: ${permissionStatus.reason}`);
      }
      
      // Set configuration
      const preset = options.preset || 'balanced';
      this.setConfig(preset);
      
      // Store user ID and options
      this.currentUserId = userId;
      this.options = { ...options };
      
      // Start watching location
      const success = await this.startWatching();
      if (success) {
        this.isTracking = true;
        this.logger.info('Location tracking started successfully', { userId });
        return true;
      } else {
        this.logger.error('Failed to start location watching', { userId });
        return false;
      }
    } catch (error) {
      this.logger.error('Error starting location tracking', { userId, error: error.message });
      throw error;
    }
  }

  async startWatching() {
    try {
      this.logger.debug('Starting location watching');
      
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
      }
      
      const config = this.config || LOCATION_CONFIG.balanced;
      
      return new Promise((resolve) => {
      this.watchId = navigator.geolocation.watchPosition(
          this.handleLocationUpdate,
          this.handleLocationError,
          {
            enableHighAccuracy: config.enableHighAccuracy,
            timeout: config.timeout,
            maximumAge: config.maximumAge
          }
        );
        
        if (this.watchId) {
          this.logger.info('Location watching started', { watchId: this.watchId });
          resolve(true);
        } else {
          this.logger.error('Failed to start location watching');
          resolve(false);
        }
      });
    } catch (error) {
      this.logger.error('Error starting location watching', { error: error.message });
      return false;
    }
  }

  async getCurrentPositionFast() {
    try {
    this.logger.debug('Getting current position fast');
    
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
      }

      const tryGetPosition = (isRetry = false, useLowAccuracy = false) => {
        return new Promise((resolve, reject) => {
        const options = {
            enableHighAccuracy: !useLowAccuracy,
            timeout: isRetry ? 15000 : 5000,
            maximumAge: isRetry ? 30000 : 0
          };

        const successCallback = (position) => {
            this.logger.info('Current position obtained', { 
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp 
            });
            resolve(position);
        };

        const errorCallback = (error) => {
            this.logger.warn('Error getting current position', { 
            code: error.code,
            message: error.message,
              isRetry,
              useLowAccuracy
            });
            reject(error);
        };

        navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
        });
      };
      
      try {
        return await tryGetPosition();
      } catch (error) {
        if (error.code === 3 && !isRetry) { // Timeout error
          this.logger.info('Retrying with lower accuracy');
          return await tryGetPosition(true, true);
        }
        throw error;
      }
    } catch (error) {
      this.logger.error('Error getting current position', { error: error.message });
      throw error;
    }
  }

  async handleLocationUpdate(position) {
    try {
      this.logger.debug('Location update received', { 
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp 
      });

      // Validate position
      LocationValidator.validatePosition(position);
      
      // Create location data
      const locationData = {
        userId: this.currentUserId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.altitude,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp,
        clientTimestamp: Date.now(),
        isMobile: isSafariMobile() || isDesktopBrowser(),
        isSafari: isSafariMobile()
      };
      
      // Notify subscribers
      this.subscribers.forEach(listener => {
        try {
          listener(locationData);
        } catch (error) {
          this.logger.error('Subscriber error', { error: error.message });
        }
      });
      
      // Update Firebase if enabled
      if (this.options.updateFirebase) {
        await this.updateLocationInFirebase(locationData);
      }
      
      this.logger.info('Location update processed', { 
        userId: this.currentUserId,
        coordinates: { lat: locationData.latitude, lng: locationData.longitude }
      });
      
        } catch (error) {
      this.logger.error('Error handling location update', { error: error.message });
    }
  }

  async getAddressAsync(latitude, longitude, locationKey) {
    try {
      this.logger.debug('Getting address from coordinates', { latitude, longitude });
      
      if (!latitude || !longitude) {
        throw new Error('Invalid coordinates');
      }
      
      const address = await getAddressFromCoords(latitude, longitude);
      
      if (address) {
        this.logger.info('Address obtained', { address });
        return address;
      } else {
        this.logger.warn('No address found for coordinates', { latitude, longitude });
        return null;
      }
    } catch (error) {
      this.logger.error('Error getting address', { latitude, longitude, error: error.message });
      return null;
    }
  }

  queueFirebaseUpdate(locationData) {
    try {
      this.logger.debug('Queueing Firebase update');
      
      this.updateQueue.push(locationData);
      
      // Process batch if queue is full
      if (this.updateQueue.length >= this.batchSize) {
        this.processFirebaseBatch();
      } else if (!this.batchTimeout) {
        // Set timeout to process remaining updates
        this.batchTimeout = setTimeout(() => {
          this.processFirebaseBatch();
        }, 5000);
      }
      
      this.logger.debug('Firebase update queued', { 
        queueLength: this.updateQueue.length,
        batchSize: this.batchSize
      });
    } catch (error) {
      this.logger.error('Error queueing Firebase update', { error: error.message });
    }
  }

  async processFirebaseBatch() {
    try {
      this.logger.debug('Processing Firebase batch');
      
      if (this.updateQueue.length === 0) {
      return;
    }
    
      // Clear timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      
      // Process updates in batches
      const batch = this.updateQueue.splice(0, this.batchSize);
      
      for (const locationData of batch) {
        try {
          await this.updateLocationInFirebase(locationData);
    } catch (error) {
          this.logger.error('Error updating location in Firebase', { 
            userId: locationData.userId, 
            error: error.message 
          });
        }
      }
      
      this.logger.info('Firebase batch processed', { 
        processedCount: batch.length,
        remainingInQueue: this.updateQueue.length
      });
      
    } catch (error) {
      this.logger.error('Error processing Firebase batch', { error: error.message });
    }
  }

  async handleLocationError(error) {
    try {
      this.logger.error('Location error occurred', { 
      code: error.code,
        message: error.message 
      });
      
      // Get user-friendly error message
      const errorHelp = this.getLocationErrorHelp(error.code);
      
      // Notify subscribers of error
      this.subscribers.forEach(listener => {
        try {
          if (this.options.onError) {
            this.options.onError(error);
          }
        } catch (subscriberError) {
          this.logger.error('Subscriber error callback error', { error: subscriberError.message });
        }
      });
      
      // Log error for debugging
      errorLogger.logError('location_tracking_error', {
        errorCode: error.code,
        errorMessage: error.message,
        errorHelp,
        userId: this.currentUserId,
        timestamp: Date.now()
      });
      
    } catch (handlerError) {
      this.logger.error('Error handling location error', { error: handlerError.message });
    }
  }

  stopTracking(skipStatusChange = false) {
    try {
      this.logger.info('Stopping location tracking');
    
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
        this.logger.info('Location watching stopped');
      }
      
      this.isTracking = false;
      this.currentUserId = null;
      this.options = null;
      
      // Process any remaining Firebase updates
      if (this.updateQueue.length > 0) {
        this.processFirebaseBatch();
      }
      
      // Clear timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
    
    if (!skipStatusChange) {
        // Notify subscribers of status change
        this.subscribers.forEach(listener => {
        try {
            if (this.options && this.options.onStatusChange) {
              this.options.onStatusChange('stopped');
            }
        } catch (error) {
            this.logger.error('Subscriber status change error', { error: error.message });
        }
        });
    }

    this.logger.info('Location tracking stopped successfully');
      
    } catch (error) {
      this.logger.error('Error stopping location tracking', { error: error.message });
    }
  }

  async updateLocationInFirebase(locationData) {
    try {
      this.logger.debug('Updating location in Firebase', { userId: locationData.userId });
      
      // Validate location data
      LocationValidator.validateLocationData(locationData);
      
      // Update user location in Firebase
      await updateUserLocation(locationData.userId, {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
        altitude: locationData.altitude,
        heading: locationData.heading,
        speed: locationData.speed,
        timestamp: locationData.timestamp,
        lastUpdated: serverTimestamp(),
        isMobile: locationData.isMobile,
        isSafari: locationData.isSafari
      });
      
      this.logger.info('Location updated in Firebase', { userId: locationData.userId });
      
    } catch (error) {
      this.logger.error('Error updating location in Firebase', { 
        userId: locationData.userId, 
        error: error.message 
      });
      
      // Queue for retry if online
      if (this.isOnline) {
        this.queueOfflineUpdate(locationData);
      }
      
      throw error;
    }
  }

  queueOfflineUpdate(locationData) {
    try {
      this.logger.debug('Queueing offline update');
      
      // Store in localStorage for offline processing
      const offlineUpdates = JSON.parse(localStorage.getItem('offlineLocationUpdates') || '[]');
      offlineUpdates.push({
        ...locationData,
        queuedAt: Date.now()
      });
      
      // Keep only last 100 updates
      if (offlineUpdates.length > 100) {
        offlineUpdates.splice(0, offlineUpdates.length - 100);
      }
      
      localStorage.setItem('offlineLocationUpdates', JSON.stringify(offlineUpdates));
      
      this.logger.info('Offline update queued', { 
        totalOfflineUpdates: offlineUpdates.length 
      });
      
    } catch (error) {
      this.logger.error('Error queueing offline update', { error: error.message });
    }
  }

  async handleOnline() {
    try {
      this.logger.info('Device came online');
      
      this.isOnline = true;
      
      // Process offline updates
      const offlineUpdates = JSON.parse(localStorage.getItem('offlineLocationUpdates') || '[]');
      
      if (offlineUpdates.length > 0) {
        this.logger.info('Processing offline updates', { count: offlineUpdates.length });
        
        for (const update of offlineUpdates) {
          try {
            await this.updateLocationInFirebase(update);
        } catch (error) {
            this.logger.error('Error processing offline update', { error: error.message });
          }
        }
        
        // Clear offline updates
        localStorage.removeItem('offlineLocationUpdates');
        this.logger.info('Offline updates processed and cleared');
      }
      
    } catch (error) {
      this.logger.error('Error handling online event', { error: error.message });
    }
  }

  handleOffline() {
    try {
      this.logger.info('Device went offline');
      this.isOnline = false;
    } catch (error) {
      this.logger.error('Error handling offline event', { error: error.message });
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    try {
      this.logger.debug('Calculating distance', { 
        from: { lat: lat1, lon: lon1 }, 
        to: { lat: lat2, lon: lon2 } 
      });
      
      // Haversine formula
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      this.logger.debug('Distance calculated', { distance: distance.toFixed(2) });
      return distance;
      
    } catch (error) {
      this.logger.error('Error calculating distance', { error: error.message });
      throw error;
    }
  }

  getStatus() {
    return {
      isTracking: this.isTracking,
      currentUserId: this.currentUserId,
      watchId: this.watchId,
      subscriberCount: this.subscribers.size,
      updateQueueLength: this.updateQueue.length,
      isOnline: this.isOnline,
      config: this.config || LOCATION_CONFIG.balanced
    };
  }

  setManualLocation(latitude, longitude, address = null) {
    try {
    this.logger.info('Setting manual location', { latitude, longitude, address });
    
      // Validate coordinates
      LocationValidator.validateCoordinates(latitude, longitude);
      
      // Create location data
      const locationData = {
        userId: this.currentUserId,
        latitude,
        longitude,
        accuracy: 0, // Manual location has perfect accuracy
        timestamp: Date.now(),
        clientTimestamp: Date.now(),
        isManual: true,
        address,
        isMobile: isSafariMobile() || isDesktopBrowser(),
        isSafari: isSafariMobile()
      };
      
      // Notify subscribers
      this.subscribers.forEach(listener => {
        try {
          listener(locationData);
        } catch (error) {
          this.logger.error('Subscriber error for manual location', { error: error.message });
        }
      });
      
      // Update Firebase if enabled
      if (this.options && this.options.updateFirebase) {
        this.updateLocationInFirebase(locationData);
      }
      
      this.logger.info('Manual location set successfully', { 
        coordinates: { lat: latitude, lng: longitude } 
      });

    } catch (error) {
      this.logger.error('Error setting manual location', { error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
const locationTrackingService = new LocationTrackingService();

// Export the permission manager instance
const locationPermissionManager = locationTrackingService.permissionManager;

export { locationTrackingService, locationPermissionManager };
export default locationTrackingService; 

