import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { updateUserLocation } from './firebaseOperations';
import { getAddressFromCoords } from './locationService';

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

// Enhanced permission manager
class LocationPermissionManager {
  constructor() {
    this.logger = new LocationLogger('PermissionManager');
    this.userPreferences = new Map(); // userId -> preferences
    this.contextState = new Map(); // userId -> current context
  }

  // Get user's location sharing preferences
  async getUserPreferences(userId) {
    try {
      // Check localStorage first
      const stored = localStorage.getItem(`location_prefs_${userId}`);
      if (stored) {
        const prefs = JSON.parse(stored);
        this.userPreferences.set(userId, prefs);
        this.logger.info('Loaded user preferences from localStorage', { userId, prefs });
        return prefs;
      }

      // Default preferences
      const defaultPrefs = {
        permissionLevel: LOCATION_PERMISSIONS.WHILE_USING,
        consentLevel: CONSENT_LEVELS.OPTIONAL,
        lastUpdated: Date.now(),
        features: {
          rideTracking: true,
          backgroundTracking: false,
          driverMode: true,
          analytics: false
        }
      };

      this.userPreferences.set(userId, defaultPrefs);
      this.logger.info('Using default preferences', { userId, prefs: defaultPrefs });
      return defaultPrefs;
    } catch (error) {
      this.logger.error('Error getting user preferences', { userId, error: error.message });
      throw error;
    }
  }

  // Save user's location sharing preferences
  async saveUserPreferences(userId, preferences) {
    try {
      const updatedPrefs = {
        ...preferences,
        lastUpdated: Date.now()
      };

      // Save to localStorage
      localStorage.setItem(`location_prefs_${userId}`, JSON.stringify(updatedPrefs));
      
      // Update in-memory cache
      this.userPreferences.set(userId, updatedPrefs);
      
      this.logger.info('Saved user preferences', { userId, prefs: updatedPrefs });
      return updatedPrefs;
    } catch (error) {
      this.logger.error('Error saving user preferences', { userId, error: error.message });
      throw error;
    }
  }

  // Update user's context (e.g., app active, ride active, driver mode)
  updateUserContext(userId, context) {
    try {
      this.contextState.set(userId, {
        ...this.contextState.get(userId),
        ...context,
        lastUpdated: Date.now()
      });
      
      this.logger.debug('Updated user context', { userId, context });
    } catch (error) {
      this.logger.error('Error updating user context', { userId, error: error.message });
    }
  }

  // Check if location sharing is allowed for current context
  async canShareLocation(userId, context = LOCATION_CONTEXTS.APP_ACTIVE) {
    try {
      const prefs = await this.getUserPreferences(userId);
      const userContext = this.contextState.get(userId) || {};

      this.logger.debug('Checking location sharing permission', { 
        userId, 
        context, 
        permissionLevel: prefs.permissionLevel,
        userContext 
      });

      // Check permission level
      switch (prefs.permissionLevel) {
        case LOCATION_PERMISSIONS.NEVER:
          return { allowed: false, reason: 'User has disabled location sharing' };

        case LOCATION_PERMISSIONS.WHILE_USING:
          return { 
            allowed: context === LOCATION_CONTEXTS.APP_ACTIVE || context === LOCATION_CONTEXTS.MANUAL_REQUEST,
            reason: context === LOCATION_CONTEXTS.APP_ACTIVE ? 'App is active' : 'Manual request'
          };

        case LOCATION_PERMISSIONS.RIDE_ONLY:
          return { 
            allowed: context === LOCATION_CONTEXTS.RIDE_ACTIVE || context === LOCATION_CONTEXTS.DRIVER_MODE,
            reason: context === LOCATION_CONTEXTS.RIDE_ACTIVE ? 'Ride is active' : 'Driver mode'
          };

        case LOCATION_PERMISSIONS.DRIVER_ONLY:
          return { 
            allowed: context === LOCATION_CONTEXTS.DRIVER_MODE,
            reason: context === LOCATION_CONTEXTS.DRIVER_MODE ? 'User is driver' : 'Driver mode required'
          };

        case LOCATION_PERMISSIONS.ALWAYS:
          return { allowed: true, reason: 'Always allowed' };

        default:
          return { allowed: false, reason: 'Invalid permission level' };
      }
    } catch (error) {
      this.logger.error('Error checking location sharing permission', { userId, error: error.message });
      return { allowed: false, reason: 'Error checking permissions' };
    }
  }

  // Get permission status for UI display
  async getPermissionStatus(userId) {
    try {
      const prefs = await this.getUserPreferences(userId);
      const browserPermission = await this.checkBrowserPermission();
      
      return {
        userPreference: prefs.permissionLevel,
        browserPermission: browserPermission.permission,
        canRequest: browserPermission.canRequest,
        features: prefs.features,
        lastUpdated: prefs.lastUpdated
      };
    } catch (error) {
      this.logger.error('Error getting permission status', { userId, error: error.message });
      throw error;
    }
  }

  // Check browser-level location permission
  async checkBrowserPermission() {
    try {
      if (!navigator.geolocation) {
        return { supported: false, permission: 'unsupported', canRequest: false };
      }

      // Modern browsers with permissions API
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          return { 
            supported: true, 
            permission: permission.state,
            canRequest: permission.state !== 'denied'
          };
        } catch (error) {
          this.logger.warn('Could not check permissions via permissions API', { error: error.message });
        }
      }

      // Fallback: test with getCurrentPosition
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ supported: true, permission: 'unknown', canRequest: true });
        }, 2000);

        navigator.geolocation.getCurrentPosition(
          () => {
            clearTimeout(timeout);
            resolve({ supported: true, permission: 'granted', canRequest: false });
          },
          (error) => {
            clearTimeout(timeout);
            if (error.code === 1) {
              resolve({ supported: true, permission: 'denied', canRequest: false });
            } else {
              resolve({ supported: true, permission: 'unknown', canRequest: true });
            }
          },
          { timeout: 2000, maximumAge: 60000, enableHighAccuracy: false }
        );
      });
    } catch (error) {
      this.logger.error('Error checking browser permission', { error: error.message });
      throw error;
    }
  }

  // Request location permission from user
  async requestLocationPermission(userId, context = LOCATION_CONTEXTS.APP_ACTIVE) {
    try {
      const canShare = await this.canShareLocation(userId, context);
      
      if (!canShare.allowed) {
        this.logger.warn('Location sharing not allowed for context', { 
          userId, 
          context, 
          reason: canShare.reason 
        });
        return { granted: false, reason: canShare.reason };
      }

      // Check browser permission
      const browserPermission = await this.checkBrowserPermission();
      
      if (browserPermission.permission === 'granted') {
        return { granted: true, reason: 'Already granted' };
      }

      if (!browserPermission.canRequest) {
        return { granted: false, reason: 'Browser permission denied' };
      }

      // Request browser permission
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            this.logger.info('Location permission granted', { userId, context });
            resolve({ granted: true, reason: 'Permission granted' });
          },
          (error) => {
            this.logger.warn('Location permission denied', { userId, context, error: error.message });
            resolve({ granted: false, reason: `Permission denied: ${error.message}` });
          },
          { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
        );
      });
    } catch (error) {
      this.logger.error('Error requesting location permission', { userId, error: error.message });
      return { granted: false, reason: 'Error requesting permission' };
    }
  }
}

// Create global permission manager instance
export const locationPermissionManager = new LocationPermissionManager();

// Parameter validation utility
class LocationValidator {
  static validateUserId(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (typeof userId !== 'string') {
      throw new Error('User ID must be a string');
    }
    if (userId.trim().length === 0) {
      throw new Error('User ID cannot be empty');
    }
    return true;
  }

  static validateCoordinates(latitude, longitude) {
    if (typeof latitude !== 'number' || isNaN(latitude)) {
      throw new Error('Latitude must be a valid number');
    }
    if (typeof longitude !== 'number' || isNaN(longitude)) {
      throw new Error('Longitude must be a valid number');
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error('Latitude must be between -90 and 90 degrees');
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error('Longitude must be between -180 and 180 degrees');
    }
    return true;
  }

  static validatePosition(position) {
    if (!position) {
      throw new Error('Position object is required');
    }
    if (!position.coords) {
      throw new Error('Position must have coords property');
    }
    
    const { latitude, longitude, accuracy } = position.coords;
    
    this.validateCoordinates(latitude, longitude);
    
    if (typeof accuracy !== 'number' || isNaN(accuracy)) {
      throw new Error('Accuracy must be a valid number');
    }
    if (accuracy < 0) {
      throw new Error('Accuracy cannot be negative');
    }
    
    return true;
  }

  static validateLocationData(locationData) {
    if (!locationData) {
      throw new Error('Location data is required');
    }
    
    const { latitude, longitude, accuracy, timestamp } = locationData;
    
    this.validateCoordinates(latitude, longitude);
    
    if (typeof accuracy !== 'number' || isNaN(accuracy)) {
      throw new Error('Accuracy must be a valid number');
    }
    if (accuracy < 0) {
      throw new Error('Accuracy cannot be negative');
    }
    
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      throw new Error('Timestamp must be a valid number');
    }
    if (timestamp <= 0) {
      throw new Error('Timestamp must be a positive number');
    }
    
    return true;
  }

  static validateConfig(config) {
    if (!config) {
      throw new Error('Configuration is required');
    }
    
    const numericFields = [
      'updateInterval', 'minDistance', 'maxAccuracy', 'maxAge',
      'retryAttempts', 'retryDelay', 'offlineQueueSize',
      'timeout', 'addressLookupInterval', 'firebaseBatchSize', 'firebaseBatchInterval'
    ];
    
    for (const field of numericFields) {
      if (typeof config[field] !== 'number' || isNaN(config[field])) {
        throw new Error(`Configuration field '${field}' must be a valid number`);
      }
      if (config[field] < 0) {
        throw new Error(`Configuration field '${field}' cannot be negative`);
      }
    }
    
    if (typeof config.enableHighAccuracy !== 'boolean') {
      throw new Error('enableHighAccuracy must be a boolean');
    }
    
    return true;
  }

  static validateOptions(options) {
    if (options && typeof options !== 'object') {
      throw new Error('Options must be an object');
    }
    
    if (options?.preset && typeof options.preset !== 'string') {
      throw new Error('Preset must be a string');
    }
    
    if (options?.updateFirebase !== undefined && typeof options.updateFirebase !== 'boolean') {
      throw new Error('updateFirebase must be a boolean');
    }
    
    if (options?.onLocationUpdate && typeof options.onLocationUpdate !== 'function') {
      throw new Error('onLocationUpdate must be a function');
    }
    
    if (options?.onError && typeof options.onError !== 'function') {
      throw new Error('onError must be a function');
    }
    
    if (options?.onStatusChange && typeof options.onStatusChange !== 'function') {
      throw new Error('onStatusChange must be a function');
    }
    
    return true;
  }
}

// Optimized configuration for faster tracking
const LOCATION_CONFIG = {
  // Desktop-friendly tracking (optimized for desktop browsers)
  desktop: {
    updateInterval: 5000, // 5 seconds
    minDistance: 10, // 10 meters
    maxAccuracy: 1000, // 1km (more lenient for desktop)
    maxAge: 30000, // 30 seconds
    retryAttempts: 2, // More retries for desktop
    retryDelay: 1000, // 1 second
    offlineQueueSize: 10,
    enableHighAccuracy: false, // Use low accuracy for desktop
    timeout: 8000, // 8 seconds (shorter timeout)
    addressLookupInterval: 60000, // Only get address every minute
    firebaseBatchSize: 5, // Batch Firebase updates
    firebaseBatchInterval: 10000 // Send batches every 10 seconds
  },
  // Ultra-fast tracking (minimal overhead)
  ultra_fast: {
    updateInterval: 3000, // 3 seconds
    minDistance: 5, // 5 meters
    maxAccuracy: 50, // 50 meters
    maxAge: 15000, // 15 seconds
    retryAttempts: 1, // Minimal retries
    retryDelay: 500, // 0.5 seconds
    offlineQueueSize: 10,
    enableHighAccuracy: true,
    timeout: 15000, // 15 seconds
    addressLookupInterval: 30000, // Only get address every 30 seconds
    firebaseBatchSize: 5, // Batch Firebase updates
    firebaseBatchInterval: 10000 // Send batches every 10 seconds
  },
  // Fast tracking (optimized for speed)
  fast: {
    updateInterval: 5000, // 5 seconds
    minDistance: 10, // 10 meters
    maxAccuracy: 100, // 100 meters
    maxAge: 30000, // 30 seconds
    retryAttempts: 1, // Reduced retries
    retryDelay: 1000, // 1 second
    offlineQueueSize: 20,
    enableHighAccuracy: true,
    timeout: 20000, // 20 seconds
    addressLookupInterval: 60000, // Only get address every minute
    firebaseBatchSize: 3, // Batch Firebase updates
    firebaseBatchInterval: 15000 // Send batches every 15 seconds
  },
  // Balanced tracking (good accuracy and speed)
  balanced: {
    updateInterval: 10000, // 10 seconds
    minDistance: 20, // 20 meters
    maxAccuracy: 200, // 200 meters
    maxAge: 60000, // 1 minute
    retryAttempts: 2, // Moderate retries
    retryDelay: 1500, // 1.5 seconds
    offlineQueueSize: 30,
    enableHighAccuracy: true,
    timeout: 25000, // 25 seconds
    addressLookupInterval: 120000, // Only get address every 2 minutes
    firebaseBatchSize: 5, // Batch Firebase updates
    firebaseBatchInterval: 20000 // Send batches every 20 seconds
  },
  // Conservative tracking (for poor networks)
  conservative: {
    updateInterval: 30000, // 30 seconds
    minDistance: 50, // 50 meters
    maxAccuracy: 500, // 500 meters
    maxAge: 120000, // 2 minutes
    retryAttempts: 2, // Moderate retries
    retryDelay: 2000, // 2 seconds
    offlineQueueSize: 10,
    enableHighAccuracy: false,
    timeout: 35000, // 35 seconds
    addressLookupInterval: 300000, // Only get address every 5 minutes
    firebaseBatchSize: 3, // Batch Firebase updates
    firebaseBatchInterval: 30000 // Send batches every 30 seconds
  }
};

class LocationTrackingService {
  constructor() {
    this.logger = new LocationLogger('LocationTracking');
    this.logger.info('Initializing LocationTrackingService');
    
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
    
    // Auto-detect desktop vs mobile and use appropriate config
    const isDesktop = this.isDesktopBrowser();
    this.config = isDesktop ? LOCATION_CONFIG.desktop : LOCATION_CONFIG.ultra_fast;
    
    this.logger.info('Browser detection', { isDesktop, configPreset: isDesktop ? 'desktop' : 'ultra_fast' });
    
    this.listeners = new Set();
    this.addressCache = new Map(); // Cache addresses to avoid repeated lookups
    this.lastAddressLookup = 0; // Track when we last looked up an address
    this.firebaseBatch = []; // Batch Firebase updates
    this.firebaseBatchTimeout = null; // Timeout for batch processing
    this.pendingPositionRequest = null; // Prevent multiple simultaneous position requests
    this.addressLookupPromise = null; // Prevent multiple simultaneous address lookups
    
    this.logger.info('LocationTrackingService initialized successfully');
  }

  // Detect if we're on a desktop browser
  isDesktopBrowser() {
    try {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      const isTablet = /ipad|android(?=.*\b(?!.*mobile))/i.test(userAgent);
      
      // Consider it desktop if not mobile and not tablet
      const isDesktop = !isMobile && !isTablet;
      
      this.logger.debug('Browser detection', { userAgent, isMobile, isTablet, isDesktop });
      return isDesktop;
    } catch (error) {
      this.logger.warn('Browser detection failed, defaulting to mobile', { error: error.message });
      return false; // Default to mobile
    }
  }

  // Set configuration preset
  setConfig(preset) {
    try {
      this.logger.info('Setting configuration preset', { preset });
      
      if (!LOCATION_CONFIG[preset]) {
        throw new Error(`Invalid preset: ${preset}. Available presets: ${Object.keys(LOCATION_CONFIG).join(', ')}`);
      }
      
      this.config = LOCATION_CONFIG[preset];
      LocationValidator.validateConfig(this.config);
      
      this.logger.info('Configuration preset set successfully', { preset, config: this.config });
      return true;
    } catch (error) {
      this.logger.error('Failed to set configuration preset', { preset, error: error.message });
      return false;
    }
  }

  // Subscribe to location updates (for React hook)
  subscribe(listener) {
    try {
      if (typeof listener !== 'function') {
        throw new Error('Listener must be a function');
      }
      
      this.listeners.add(listener);
      this.logger.debug('Listener subscribed', { totalListeners: this.listeners.size });
      
      // If we already have a location, send it immediately
      if (this.lastLocation) {
        this.logger.debug('Sending existing location to new listener');
        listener(this.lastLocation);
      }
      
      return () => {
        this.listeners.delete(listener);
        this.logger.debug('Listener unsubscribed', { totalListeners: this.listeners.size });
      };
    } catch (error) {
      this.logger.error('Failed to subscribe listener', { error: error.message });
      throw error;
    }
  }

  // Check location permissions (optimized)
  async checkLocationPermission() {
    this.logger.info('Checking location permissions');
    
    try {
      if (!navigator.geolocation) {
        this.logger.warn('Geolocation not supported by browser');
        return { supported: false, permission: 'unsupported' };
      }

      // Check if we can get permissions (modern browsers)
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          this.logger.info('Permission status retrieved', { permission: permission.state });
          return { 
            supported: true, 
            permission: permission.state,
            canRequest: permission.state !== 'denied'
          };
        } catch (error) {
          this.logger.warn('Could not check permissions via permissions API', { error: error.message });
        }
      }

      // Fallback: try to get a quick position to test
      this.logger.debug('Using fallback permission check');
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn('Permission check timed out, assuming unknown');
          resolve({ supported: true, permission: 'unknown', canRequest: true });
        }, 2000);

        navigator.geolocation.getCurrentPosition(
          () => {
            clearTimeout(timeout);
            this.logger.info('Permission check successful - granted');
            resolve({ supported: true, permission: 'granted', canRequest: false });
          },
          (error) => {
            clearTimeout(timeout);
            this.logger.warn('Permission check failed', { errorCode: error.code, errorMessage: error.message });
            
            if (error.code === 1) {
              resolve({ supported: true, permission: 'denied', canRequest: false });
            } else {
              resolve({ supported: true, permission: 'unknown', canRequest: true });
            }
          },
          { timeout: 2000, maximumAge: 60000, enableHighAccuracy: false }
        );
      });
    } catch (error) {
      this.logger.error('Permission check failed with exception', { error: error.message });
      throw error;
    }
  }

  // Get helpful error message and suggestions
  getLocationErrorHelp(errorCode) {
    this.logger.debug('Getting error help', { errorCode });
    
    const help = {
      1: {
        title: 'Location Access Denied',
        message: 'Your browser has denied location access.',
        suggestions: [
          'Click the location icon in your browser address bar and select "Allow"',
          'Go to your browser settings and enable location access for this site',
          'Try refreshing the page and allowing location when prompted'
        ]
      },
      2: {
        title: 'Location Unavailable',
        message: 'Location information is currently unavailable.',
        suggestions: [
          'Check if your device has GPS enabled',
          'Try moving to an area with better GPS signal',
          'Wait a moment and try again'
        ]
      },
      3: {
        title: 'Location Request Timed Out',
        message: 'The location request took too long to complete.',
        suggestions: [
          'Check your internet connection',
          'Try moving to an area with better GPS signal',
          'Wait a moment and try again',
          'Try using a different browser'
        ]
      }
    };

    const result = help[errorCode] || {
      title: 'Location Error',
      message: 'An unknown error occurred while getting your location.',
      suggestions: [
        'Check your browser location permissions',
        'Try refreshing the page',
        'Contact support if the problem persists'
      ]
    };
    
    this.logger.debug('Error help retrieved', { errorCode, title: result.title });
    return result;
  }

  // Optimized location tracking with request deduplication
  async startTracking(userId, options = {}) {
    this.logger.info('Starting location tracking', { userId, options, currentStatus: this.isTracking });

    try {
      // Validate parameters
      LocationValidator.validateUserId(userId);
      LocationValidator.validateOptions(options);

      // Check location sharing permissions
      const context = options.context || LOCATION_CONTEXTS.APP_ACTIVE;
      const canShare = await locationPermissionManager.canShareLocation(userId, context);
      
      if (!canShare.allowed) {
        this.logger.warn('Location tracking not allowed', { userId, context, reason: canShare.reason });
        throw new Error(`Location tracking not allowed: ${canShare.reason}`);
      }

      // Request browser permission if needed
      const permissionResult = await locationPermissionManager.requestLocationPermission(userId, context);
      if (!permissionResult.granted) {
        this.logger.warn('Browser permission not granted', { userId, reason: permissionResult.reason });
        throw new Error(`Browser permission not granted: ${permissionResult.reason}`);
      }

      if (this.isTracking) {
        this.logger.warn('Location tracking is already active');
        return false;
      }

      // Check if geolocation is supported
      if (!navigator.geolocation) {
        const error = 'Geolocation is not supported by this browser';
        this.logger.error(error);
        this.onError?.(error);
        this.onStatusChange?.('error');
        return false;
      }

      // Set configuration based on options
      if (options.preset && LOCATION_CONFIG[options.preset]) {
        this.setConfig(options.preset);
      }

      this.userId = userId;
      this.onLocationUpdate = options.onLocationUpdate;
      this.onError = options.onError;
      this.onStatusChange = options.onStatusChange;
      this.updateFirebase = options.updateFirebase ?? false;

      this.logger.info('Configuration set', { 
        userId, 
        updateFirebase: this.updateFirebase, 
        config: this.config 
      });

      // Get initial position with minimal retries
      this.logger.info('Getting initial position');
      const initialPosition = await this.getCurrentPositionFast();
      
      if (initialPosition && initialPosition.coords) {
        this.logger.info('Initial position received', {
          coords: initialPosition.coords,
          accuracy: initialPosition.coords.accuracy
        });
        
        await this.handleLocationUpdate(initialPosition);
      }

      // Start watching position with optimized settings
      this.logger.info('Setting up position watch');
      this.watchId = navigator.geolocation.watchPosition(
        this.handleLocationUpdate.bind(this),
        this.handleLocationError.bind(this),
        {
          enableHighAccuracy: this.config.enableHighAccuracy,
          timeout: this.config.timeout,
          maximumAge: this.config.maxAge
        }
      );

      this.isTracking = true;
      this.onStatusChange?.('active');
      this.logger.info('Location tracking started successfully');

      // Set up online/offline handling
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));

      return true;

    } catch (error) {
      this.logger.error('Failed to start location tracking', { error: error.message, stack: error.stack });
      this.onError?.(error.message);
      this.onStatusChange?.('error');
      return false;
    }
  }

  // Fast position acquisition with minimal retries and request deduplication
  async getCurrentPositionFast() {
    this.logger.debug('Getting current position fast');
    
    // Prevent multiple simultaneous requests
    if (this.pendingPositionRequest) {
      this.logger.debug('Position request already in progress, waiting');
      return this.pendingPositionRequest;
    }

    this.pendingPositionRequest = new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = this.config.retryAttempts + 1; // +1 for initial attempt
      let triedLowAccuracy = false;

      const tryGetPosition = (isRetry = false, useLowAccuracy = false) => {
        attempts++;
        
        // Use consistent timeout (no progressive increase)
        const timeout = this.config.timeout;
        
        // Use low accuracy as fallback if high accuracy fails
        const enableHighAccuracy = useLowAccuracy ? false : this.config.enableHighAccuracy;
        
        // Use consistent maxAge
        const maxAge = this.config.maxAge;

        const options = {
          enableHighAccuracy,
          timeout,
          maximumAge: maxAge
        };

        this.logger.debug(`Position attempt ${attempts}/${maxAttempts}`, {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maxAge: options.maximumAge,
          useLowAccuracy
        });

        const successCallback = (position) => {
          try {
            // Validate position
            LocationValidator.validatePosition(position);
            
            this.logger.info('Position acquired successfully', {
              attempt: attempts,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp).toISOString(),
              usedLowAccuracy: useLowAccuracy,
              coordinates: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              }
            });
            
            this.pendingPositionRequest = null;
            resolve(position);
          } catch (error) {
            this.logger.error('Position validation failed', { error: error.message });
            this.pendingPositionRequest = null;
            reject(error);
          }
        };

        const errorCallback = (error) => {
          this.logger.warn(`Position error (attempt ${attempts})`, {
            code: error.code,
            message: error.message,
            useLowAccuracy
          });

          // Handle specific error codes
          if (error.code === 1) {
            // PERMISSION_DENIED
            this.pendingPositionRequest = null;
            const errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
            this.logger.error(errorMessage);
            reject(new Error(errorMessage));
            return;
          }

          // Try low accuracy as fallback if we haven't tried it yet
          if (!triedLowAccuracy && this.config.enableHighAccuracy) {
            this.logger.debug('Trying low accuracy fallback');
            triedLowAccuracy = true;
            setTimeout(() => {
              tryGetPosition(true, true);
            }, 500);
            return;
          }

          // Try next attempt if we have more attempts
          if (attempts < maxAttempts) {
            const delay = this.config.retryDelay;
            this.logger.debug(`Retrying in ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`);
            
            setTimeout(() => {
              tryGetPosition(true, triedLowAccuracy);
            }, delay);
          } else {
            // All attempts failed
            this.logger.error('All position attempts failed', { maxAttempts });
            this.pendingPositionRequest = null;
            
            // Provide helpful error message based on the last error
            let errorMessage = 'Location access failed. ';
            if (error.code === 1) {
              errorMessage += 'Please check your browser location permissions.';
            } else if (error.code === 2) {
              errorMessage += 'Location information is unavailable. Please try again later.';
            } else if (error.code === 3) {
              errorMessage += 'Location request timed out. Please check your GPS signal and try again.';
            } else {
              errorMessage += 'Please check your browser permissions and try again.';
            }
            
            this.logger.error('Final position error', { errorMessage, lastErrorCode: error.code });
            reject(new Error(errorMessage));
          }
        };

        navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
      };

      // Start the first attempt
      tryGetPosition();
    });

    return this.pendingPositionRequest;
  }

  // Optimized location update handler with async address lookup and batched Firebase updates
  async handleLocationUpdate(position) {
    try {
      this.logger.debug('Handling location update', { 
        hasPosition: !!position,
        hasCoords: !!(position?.coords)
      });

      // Validate position
      LocationValidator.validatePosition(position);
      
      const { latitude, longitude, accuracy } = position.coords;
      const timestamp = position.timestamp || Date.now();

      this.logger.debug('Location update coordinates', {
        latitude,
        longitude,
        accuracy,
        timestamp: new Date(timestamp).toISOString()
      });

      // Check if enough time has passed
      const now = Date.now();
      if (this.lastUpdate && now - this.lastUpdate < this.config.updateInterval) {
        this.logger.debug('Skipping update - too soon', {
          timeSinceLastUpdate: now - this.lastUpdate,
          updateInterval: this.config.updateInterval
        });
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

        this.logger.debug('Distance check', {
          distance,
          minDistance: this.config.minDistance,
          movedEnough: distance >= this.config.minDistance
        });

        if (distance < this.config.minDistance) {
          this.logger.debug('Skipping update - not moved enough');
          return;
        }
      }

      // Get address only if needed (async, don't block)
      let address = null;
      const locationKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      const shouldLookupAddress = accuracy <= this.config.maxAccuracy && 
                                 (now - this.lastAddressLookup) > this.config.addressLookupInterval;
      
      this.logger.debug('Address lookup decision', {
        shouldLookupAddress,
        accuracy,
        maxAccuracy: this.config.maxAccuracy,
        timeSinceLastLookup: now - this.lastAddressLookup,
        addressLookupInterval: this.config.addressLookupInterval,
        hasCachedAddress: this.addressCache.has(locationKey)
      });
      
      if (shouldLookupAddress) {
        if (this.addressCache.has(locationKey)) {
          address = this.addressCache.get(locationKey);
          this.logger.debug('Using cached address', { address });
        } else {
          // Start async address lookup (don't wait for it)
          this.logger.debug('Starting async address lookup');
          this.getAddressAsync(latitude, longitude, locationKey);
        }
      } else if (this.addressCache.has(locationKey)) {
        address = this.addressCache.get(locationKey);
        this.logger.debug('Using cached address (not time for new lookup)', { address });
      }

      const locationData = {
        latitude,
        longitude,
        accuracy,
        address,
        timestamp
      };

      // Validate location data
      LocationValidator.validateLocationData(locationData);

      // Update state
      this.lastLocation = locationData;
      this.lastUpdate = now;

      this.logger.info('Location updated successfully', {
        coordinates: { latitude, longitude },
        accuracy,
        address: address ? 'cached' : 'none',
        totalListeners: this.listeners.size,
        updateFirebase: this.updateFirebase,
        isOnline: navigator.onLine
      });

      // Notify listeners immediately
      this.logger.info('Notifying listeners', { 
        totalListeners: this.listeners.size,
        locationData: { latitude, longitude, accuracy }
      });
      
      this.listeners.forEach((listener, index) => {
        try {
          this.logger.debug(`Calling listener ${index + 1}/${this.listeners.size}`);
          listener(locationData);
        } catch (error) {
          this.logger.error('Listener callback failed', { error: error.message });
        }
      });

      // Queue for Firebase update (batched)
      if (this.updateFirebase && navigator.onLine) {
        this.queueFirebaseUpdate(locationData);
      }

      // Queue for offline if needed
      if (!navigator.onLine) {
        this.queueOfflineUpdate(locationData);
      }

      // Notify callback
      if (this.onLocationUpdate) {
        try {
          this.onLocationUpdate(locationData);
        } catch (error) {
          this.logger.error('Location update callback failed', { error: error.message });
        }
      }

    } catch (error) {
      this.logger.error('Location update error', { 
        error: error.message, 
        stack: error.stack,
        position: position ? 'valid' : 'invalid'
      });
    }
  }

  // Async address lookup with deduplication
  async getAddressAsync(latitude, longitude, locationKey) {
    this.logger.debug('Starting address lookup', { latitude, longitude, locationKey });
    
    // Validate coordinates
    try {
      LocationValidator.validateCoordinates(latitude, longitude);
    } catch (error) {
      this.logger.error('Invalid coordinates for address lookup', { error: error.message });
      return null;
    }
    
    // Prevent multiple simultaneous address lookups
    if (this.addressLookupPromise) {
      this.logger.debug('Address lookup already in progress, waiting');
      return this.addressLookupPromise;
    }

    this.addressLookupPromise = getAddressFromCoords(latitude, longitude)
      .then(address => {
        this.addressCache.set(locationKey, address);
        this.lastAddressLookup = Date.now();
        
        // Limit cache size
        if (this.addressCache.size > 50) {
          const firstKey = this.addressCache.keys().next().value;
          this.addressCache.delete(firstKey);
          this.logger.debug('Removed oldest address from cache', { cacheSize: this.addressCache.size });
        }
        
        this.logger.info('Address lookup successful', { 
          address, 
          locationKey,
          cacheSize: this.addressCache.size 
        });
        return address;
      })
      .catch(error => {
        this.logger.warn('Address lookup failed', { 
          error: error.message, 
          coordinates: { latitude, longitude } 
        });
        return null;
      })
      .finally(() => {
        this.addressLookupPromise = null;
        this.logger.debug('Address lookup completed');
      });

    return this.addressLookupPromise;
  }

  // Queue Firebase update for batching
  queueFirebaseUpdate(locationData) {
    this.logger.debug('Queueing Firebase update', { 
      batchSize: this.firebaseBatch.length,
      maxBatchSize: this.config.firebaseBatchSize 
    });
    
    // Validate location data
    try {
      LocationValidator.validateLocationData(locationData);
    } catch (error) {
      this.logger.error('Invalid location data for Firebase update', { error: error.message });
      return;
    }
    
    this.firebaseBatch.push(locationData);
    
    // Clear existing timeout
    if (this.firebaseBatchTimeout) {
      clearTimeout(this.firebaseBatchTimeout);
      this.logger.debug('Cleared existing Firebase batch timeout');
    }
    
    // Send batch if it's full or set timeout for partial batch
    if (this.firebaseBatch.length >= this.config.firebaseBatchSize) {
      this.logger.debug('Batch full, sending immediately');
      this.sendFirebaseBatch();
    } else {
      this.logger.debug('Setting Firebase batch timeout', { 
        interval: this.config.firebaseBatchInterval 
      });
      this.firebaseBatchTimeout = setTimeout(() => {
        this.sendFirebaseBatch();
      }, this.config.firebaseBatchInterval);
    }
  }

  // Send batched Firebase updates
  async sendFirebaseBatch() {
    if (this.firebaseBatch.length === 0) {
      this.logger.debug('No Firebase batch to send');
      return;
    }
    
    const batch = [...this.firebaseBatch];
    this.firebaseBatch = [];
    
    if (this.firebaseBatchTimeout) {
      clearTimeout(this.firebaseBatchTimeout);
      this.firebaseBatchTimeout = null;
    }
    
    this.logger.info('Sending Firebase batch', { 
      batchSize: batch.length,
      latestLocation: batch[batch.length - 1] 
    });
    
    try {
      // Send the most recent location from the batch
      const latestLocation = batch[batch.length - 1];
      await this.updateLocationInFirebase(latestLocation);
      this.logger.info('Firebase batch updated successfully', { batchSize: batch.length });
    } catch (error) {
      this.logger.error('Firebase batch update failed', { 
        error: error.message, 
        batchSize: batch.length 
      });
      // Re-queue failed updates
      this.firebaseBatch.push(...batch);
      this.logger.debug('Re-queued failed updates', { reQueuedSize: this.firebaseBatch.length });
    }
  }

  // Enhanced error handling with logging
  handleLocationError(error) {
    this.logger.warn('Location tracking error', {
      code: error.code,
      message: error.message,
      hasLastLocation: !!(this.lastLocation?.latitude && this.lastLocation?.longitude)
    });

    // Only report errors if we don't have a valid location
    if (!this.lastLocation?.latitude || !this.lastLocation?.longitude) {
      this.logger.error('No valid location available, reporting error to callback');
      if (this.onError) {
        try {
          this.onError(error.message);
        } catch (callbackError) {
          this.logger.error('Error callback failed', { error: callbackError.message });
        }
      }
    } else {
      this.logger.debug('Ignoring error - valid location available');
    }
  }

  // Stop location tracking
  stopTracking(skipStatusChange = false) {
    this.logger.info('Stopping location tracking', { skipStatusChange });
    
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.logger.debug('Cleared position watch');
    }

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
      this.logger.debug('Cleared update timeout');
    }

    // Send any pending Firebase batch
    if (this.firebaseBatch.length > 0) {
      this.logger.debug('Sending pending Firebase batch before stopping');
      this.sendFirebaseBatch();
    }

    if (this.firebaseBatchTimeout) {
      clearTimeout(this.firebaseBatchTimeout);
      this.firebaseBatchTimeout = null;
      this.logger.debug('Cleared Firebase batch timeout');
    }

    this.isTracking = false;
    this.pendingPositionRequest = null;
    this.addressLookupPromise = null;
    
    if (!skipStatusChange) {
      this.logger.debug('Notifying status change to stopped');
      if (this.onStatusChange) {
        try {
          this.onStatusChange('stopped');
        } catch (error) {
          this.logger.error('Status change callback failed', { error: error.message });
        }
      }
    }

    // Clean up event listeners
    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));
    this.logger.debug('Cleaned up event listeners');

    this.logger.info('Location tracking stopped successfully');
  }

  // Enhanced Firebase update with validation and logging
  async updateLocationInFirebase(locationData) {
    this.logger.debug('Updating location in Firebase', { 
      userId: this.userId,
      hasLocationData: !!locationData 
    });
    
    if (!this.userId) {
      this.logger.warn('No user ID for Firebase update');
      return;
    }

    try {
      // Validate location data
      LocationValidator.validateLocationData(locationData);
      
      const userRef = doc(db, 'users', this.userId);
      const updateData = {
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          address: locationData.address,
          timestamp: locationData.timestamp
        },
        lastLocationUpdate: serverTimestamp()
      };

      this.logger.debug('Firebase update data prepared', { 
        userId: this.userId,
        coordinates: { 
          latitude: locationData.latitude, 
          longitude: locationData.longitude 
        },
        accuracy: locationData.accuracy
      });

      await updateDoc(userRef, updateData);
      this.logger.info('Firebase location updated successfully', { userId: this.userId });
    } catch (error) {
      this.logger.error('Firebase update error', { 
        error: error.message, 
        userId: this.userId,
        locationData 
      });
      throw error;
    }
  }

  queueOfflineUpdate(locationData) {
    this.logger.debug('Queueing offline update', { 
      queueSize: this.offlineQueue.length,
      maxQueueSize: this.config.offlineQueueSize 
    });
    
    // Validate location data
    try {
      LocationValidator.validateLocationData(locationData);
    } catch (error) {
      this.logger.error('Invalid location data for offline queue', { error: error.message });
      return;
    }
    
    if (this.offlineQueue.length >= this.config.offlineQueueSize) {
      const removed = this.offlineQueue.shift(); // Remove oldest
      this.logger.debug('Removed oldest offline update', { removed });
    }
    this.offlineQueue.push(locationData);
    this.logger.debug('Added to offline queue', { newQueueSize: this.offlineQueue.length });
  }

  async handleOnline() {
    this.logger.info('Back online, processing queued updates', { 
      queuedUpdates: this.offlineQueue.length 
    });
    
    if (this.offlineQueue.length > 0) {
      const updates = [...this.offlineQueue];
      this.offlineQueue = [];
      
      this.logger.info('Processing offline updates', { updateCount: updates.length });
      
      for (let i = 0; i < updates.length; i++) {
        const locationData = updates[i];
        try {
          this.logger.debug(`Processing offline update ${i + 1}/${updates.length}`);
          await this.updateLocationInFirebase(locationData);
        } catch (error) {
          this.logger.error('Failed to process queued update', { 
            error: error.message, 
            updateIndex: i,
            locationData 
          });
        }
      }
      
      this.logger.info('Offline updates processing completed');
    } else {
      this.logger.debug('No offline updates to process');
    }
  }

  handleOffline() {
    this.logger.info('Gone offline, queuing updates', { 
      currentQueueSize: this.offlineQueue.length 
    });
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    try {
      // Validate coordinates
      LocationValidator.validateCoordinates(lat1, lon1);
      LocationValidator.validateCoordinates(lat2, lon2);
      
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      this.logger.debug('Distance calculated', { 
        from: { lat: lat1, lon: lon1 }, 
        to: { lat: lat2, lon: lon2 }, 
        distance 
      });
      
      return distance;
    } catch (error) {
      this.logger.error('Distance calculation failed', { 
        error: error.message, 
        coordinates: { lat1, lon1, lat2, lon2 } 
      });
      throw error;
    }
  }

  getStatus() {
    const status = {
      isTracking: this.isTracking,
      lastLocation: this.lastLocation,
      lastUpdate: this.lastUpdate,
      config: this.config,
      firebaseBatchSize: this.firebaseBatch.length,
      offlineQueueSize: this.offlineQueue.length,
      totalListeners: this.listeners.size,
      addressCacheSize: this.addressCache.size
    };
    
    this.logger.debug('Status requested', status);
    return status;
  }

  setManualLocation(latitude, longitude, address = null) {
    this.logger.info('Setting manual location', { latitude, longitude, address });
    
    try {
      // Validate coordinates
      LocationValidator.validateCoordinates(latitude, longitude);
      
      const locationData = {
        latitude,
        longitude,
        accuracy: 0, // Manual location has perfect accuracy
        address,
        timestamp: Date.now()
      };

      // Validate location data
      LocationValidator.validateLocationData(locationData);

      this.lastLocation = locationData;
      this.lastUpdate = Date.now();

      this.logger.info('Manual location set successfully', { 
        coordinates: { latitude, longitude },
        address,
        totalListeners: this.listeners.size
      });

      // Notify listeners
      this.listeners.forEach(listener => {
        try {
          listener(locationData);
        } catch (error) {
          this.logger.error('Manual location listener callback failed', { error: error.message });
        }
      });
      
      if (this.onLocationUpdate) {
        try {
          this.onLocationUpdate(locationData);
        } catch (error) {
          this.logger.error('Manual location update callback failed', { error: error.message });
        }
      }

      // Update Firebase if enabled
      if (this.updateFirebase) {
        this.updateLocationInFirebase(locationData).catch(error => {
          this.logger.error('Manual location Firebase update failed', { error: error.message });
        });
      }

    } catch (error) {
      this.logger.error('Failed to set manual location', { 
        error: error.message, 
        coordinates: { latitude, longitude } 
      });
      throw error;
    }
  }
}

// Create singleton instance
const locationTrackingService = new LocationTrackingService();

// Debug: Track hook instances
let hookInstanceCount = 0;

// React hook for location tracking with enhanced logging and validation
export const useLocation = ({ preset = 'ultra_fast', updateFirebase = false, onLocationUpdate, onError, onStatusChange } = {}) => {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('stopped');
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Create a logger for the hook
  const currentHookInstance = ++hookInstanceCount;
  const hookLogger = new LocationLogger(`useLocation-${currentHookInstance}`);

  // Initial setup effect (runs only once)
  useEffect(() => {
    hookLogger.info('useLocation hook initialized', { preset, updateFirebase });
  }, []); // Empty dependency array - runs only once

  // Validate hook parameters and set up subscription
  useEffect(() => {
    try {
      hookLogger.debug('useLocation hook effect running', { preset, updateFirebase, isSubscribed });
      
      // Validate preset
      if (preset && !LOCATION_CONFIG[preset]) {
        hookLogger.warn('Invalid preset provided', { preset, availablePresets: Object.keys(LOCATION_CONFIG) });
      }
      
      // Validate callbacks
      if (onLocationUpdate && typeof onLocationUpdate !== 'function') {
        hookLogger.warn('onLocationUpdate must be a function');
      }
      if (onError && typeof onError !== 'function') {
        hookLogger.warn('onError must be a function');
      }
      if (onStatusChange && typeof onStatusChange !== 'function') {
        hookLogger.warn('onStatusChange must be a function');
      }
      
      // Subscribe to location updates if service is already tracking and not already subscribed
      if (locationTrackingService.isTracking && !isSubscribed) {
        hookLogger.info('Service already tracking, subscribing to updates');
        setIsSubscribed(true);
        
        const unsubscribe = locationTrackingService.subscribe((loc) => {
          try {
            hookLogger.debug('Location update received via initial subscription', { 
              hasLocation: !!loc,
              coordinates: loc ? { lat: loc.latitude, lng: loc.longitude } : null
            });
            
            setLocation(loc);
            setError(null);
            setIsTracking(true);
            
            if (onLocationUpdate) {
              onLocationUpdate(loc);
            }
          } catch (error) {
            hookLogger.error('Initial subscription callback error', { error: error.message });
          }
        });
        
        // Return cleanup function
        return () => {
          hookLogger.info('Cleaning up useLocation subscription');
          setIsSubscribed(false);
          unsubscribe();
        };
      }
    } catch (error) {
      hookLogger.error('useLocation initialization error', { error: error.message });
    }
  }, [preset, updateFirebase, isSubscribed]); // Removed callback dependencies

  // Debug effect to track state changes
  useEffect(() => {
    console.log('📍 useLocation state changed:', { 
      hasLocation: !!location, 
      isTracking, 
      status, 
      hasError: !!error 
    });
  }, [location, isTracking, status, error]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (isSubscribed) {
        hookLogger.info('useLocation hook unmounting, cleaning up subscription');
        setIsSubscribed(false);
      }
    };
  }, [isSubscribed]);

  // Create stable callbacks to prevent unnecessary re-renders
  const handleLocationUpdate = useCallback((loc) => {
    try {
      hookLogger.info('Location update received in hook callback', { 
        hasLocation: !!loc,
        coordinates: loc ? { lat: loc.latitude, lng: loc.longitude } : null
      });
      
      console.log('📍 Hook callback - setting location:', loc);
      setLocation(loc);
      setError(null);
      setIsTracking(true);
      
      // Debug: Check if state actually changed
      console.log('📍 State after setLocation in hook callback - should trigger re-render');
      
      if (onLocationUpdate) {
        onLocationUpdate(loc);
      }
    } catch (error) {
      hookLogger.error('Location update callback error in hook', { error: error.message });
    }
  }, [onLocationUpdate]);

  const handleError = useCallback((err) => {
    try {
      hookLogger.warn('Location error received in hook', { error: err });
      
      setError(err);
      setIsTracking(false);
      
      if (onError) {
        onError(err);
      }
    } catch (error) {
      hookLogger.error('Error callback error in hook', { error: error.message });
    }
  }, [onError]);

  const handleStatusChange = useCallback((newStatus) => {
    try {
      hookLogger.info('Status change received in hook', { newStatus });
      
      setStatus(newStatus);
      setIsTracking(newStatus === 'active');
      
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    } catch (error) {
      hookLogger.error('Status change callback error in hook', { error: error.message });
    }
  }, [onStatusChange]);

  // Manual start/stop functions
  const startTracking = useCallback(async (userId = 'current-user') => {
    hookLogger.info('Starting location tracking for user', { userId });
    
    try {
      // Validate userId
      LocationValidator.validateUserId(userId);
      
      // Only subscribe if not already subscribed
      let unsubscribe = null;
      if (!isSubscribed) {
        hookLogger.info('Subscribing to location updates');
        setIsSubscribed(true);
        
        unsubscribe = locationTrackingService.subscribe((loc) => {
          try {
            hookLogger.info('Location update received via subscription', { 
              hasLocation: !!loc,
              coordinates: loc ? { lat: loc.latitude, lng: loc.longitude } : null
            });
            
            console.log('📍 Subscription callback - setting location:', loc);
            setLocation(loc);
            setError(null);
            setIsTracking(true);
            
            // Debug: Check if state actually changed
            console.log('📍 State after setLocation - should trigger re-render');
            
            if (onLocationUpdate) {
              onLocationUpdate(loc);
            }
          } catch (error) {
            hookLogger.error('Location update subscription callback error', { error: error.message });
          }
        });
      } else {
        hookLogger.info('Already subscribed to location updates');
      }
      
      const success = await locationTrackingService.startTracking(userId, {
        preset,
        updateFirebase,
        onLocationUpdate: handleLocationUpdate,
        onError: handleError,
        onStatusChange: handleStatusChange
      });

      if (success) {
        hookLogger.info('Location tracking started successfully in hook');
        setIsTracking(true);
      } else {
        hookLogger.warn('Location tracking failed to start in hook');
        if (unsubscribe) {
          unsubscribe(); // Clean up subscription if failed
          setIsSubscribed(false);
        }
      }

      return success;
    } catch (error) {
      hookLogger.error('Start tracking error in hook', { error: error.message });
      setError(error.message);
      setIsTracking(false);
      return false;
    }
  }, [preset, updateFirebase, handleLocationUpdate, handleError, handleStatusChange, isSubscribed]);

  const stopTracking = useCallback(() => {
    hookLogger.info('Stopping location tracking from hook');
    
    try {
      locationTrackingService.stopTracking();
      setIsTracking(false);
      setStatus('stopped');
      setIsSubscribed(false);
      hookLogger.info('Location tracking stopped successfully from hook');
    } catch (error) {
      hookLogger.error('Stop tracking error in hook', { error: error.message });
    }
  }, []);

  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    try {
      hookLogger.debug('Calculating distance in hook', { 
        from: { lat: lat1, lon: lon1 }, 
        to: { lat: lat2, lon: lon2 } 
      });
      
      return locationTrackingService.calculateDistance(lat1, lon1, lat2, lon2);
    } catch (error) {
      hookLogger.error('Distance calculation error in hook', { error: error.message });
      throw error;
    }
  }, []);

  const setManualLocation = useCallback((latitude, longitude, address = null) => {
    try {
      hookLogger.info('Setting manual location from hook', { latitude, longitude, address });
      locationTrackingService.setManualLocation(latitude, longitude, address);
    } catch (error) {
      hookLogger.error('Manual location error in hook', { error: error.message });
      throw error;
    }
  }, []);

  return {
    location,
    status,
    error,
    isTracking,
    startTracking,
    stopTracking,
    calculateDistance,
    setManualLocation
  };
};

export { locationTrackingService };
export default locationTrackingService; 