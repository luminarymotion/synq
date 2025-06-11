/**
 * Location service for handling geolocation functionality
 */

/**
 * Get the current location of the user
 * @returns {Promise<GeolocationPosition>} Promise that resolves with the current position
 * @throws {Error} If geolocation is not supported or permission is denied
 */
export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    // First try with high accuracy
    const highAccuracyOptions = {
      enableHighAccuracy: true,
      timeout: 20000, // Increased to 20 seconds
      maximumAge: 0
    };

    // Fallback options if high accuracy fails
    const fallbackOptions = {
      enableHighAccuracy: false,
      timeout: 30000, // 30 seconds for fallback
      maximumAge: 60000 // Allow cached position up to 1 minute old
    };

    let timeoutId;

    const tryGetLocation = (options, isFallback = false) => {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set a timeout to handle cases where the browser doesn't respond
      timeoutId = setTimeout(() => {
        if (isFallback) {
          reject(new Error('Location request timed out. Please check your internet connection and try again.'));
        } else {
          console.log('High accuracy location timed out, trying fallback...');
          tryGetLocation(fallbackOptions, true);
        }
      }, options.timeout + 1000); // Add 1 second buffer

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          resolve(position);
        },
        (error) => {
          clearTimeout(timeoutId);
          
          if (isFallback) {
            // If fallback also fails, reject with error
            let errorMessage = 'Failed to get location';
    switch (error.code) {
      case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied. Please enable location services in your browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information is unavailable. Please check your device\'s location services.';
        break;
      case error.TIMEOUT:
                errorMessage = 'Location request timed out. Please check your internet connection and try again.';
        break;
      default:
                errorMessage = 'An unknown error occurred while getting location. Please try again.';
    }
            reject(new Error(errorMessage));
          } else {
            // If high accuracy fails, try fallback
            console.log('High accuracy location failed, trying fallback...', error);
            tryGetLocation(fallbackOptions, true);
          }
        },
        options
      );
    };

    // Start with high accuracy
    tryGetLocation(highAccuracyOptions);

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });
};

/**
 * Calculate the distance between two points using the Haversine formula
 * @param {Object} point1 - First point with lat and lng
 * @param {Object} point2 - Second point with lat and lng
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (point1, point2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(point2.lat - point1.lat);
  const dLon = toRad(point2.lng - point1.lng);
  const lat1 = toRad(point1.lat);
  const lat2 = toRad(point2.lat);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
const toRad = (degrees) => {
  return degrees * (Math.PI / 180);
};

// Add MapQuest configuration
const MAPQUEST_CONFIG = {
  baseUrl: 'https://www.mapquestapi.com/geocoding/v1',
  apiKey: import.meta.env.VITE_MAPQUEST_API_KEY,
  rateLimit: 100,
  maxRetries: 2,
  timeout: 5000,
  cacheExpiry: 30 * 24 * 60 * 60 * 1000
};

// Add geocoding cache
const geocodingCache = {
  cache: new Map(),
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  },
  
  set(key, data) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + MAPQUEST_CONFIG.cacheExpiry
    });
  }
};

// Add rate limiter
class RateLimiter {
  constructor(interval) {
    this.interval = interval;
    this.lastRequestTime = 0;
    this.queue = [];
    this.processing = false;
  }

  async wait() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.interval) {
      await new Promise(resolve => setTimeout(resolve, this.interval - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
    const resolve = this.queue.shift();
    resolve();
    this.processing = false;
    
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }
}

// Create rate limiter instance
const rateLimiter = new RateLimiter(MAPQUEST_CONFIG.rateLimit);

// Add fetch with retry helper
const fetchWithRetry = async (url, options = {}, maxRetries = MAPQUEST_CONFIG.maxRetries) => {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await rateLimiter.wait();
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      lastError = error;
      
      if (i < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, i), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

/**
 * Get address from coordinates using MapQuest
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} - Formatted address
 */
export const getAddressFromCoords = async (lat, lng) => {
  const cacheKey = `reverse:${lat}:${lng}`;
  const cachedResult = geocodingCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const url = new URL(`${MAPQUEST_CONFIG.baseUrl}/reverse`);
    url.searchParams.append('key', MAPQUEST_CONFIG.apiKey);
    url.searchParams.append('location', `${lat},${lng}`);
    url.searchParams.append('outFormat', 'json');
    url.searchParams.append('thumbMaps', 'false');

    const data = await fetchWithRetry(url.toString(), {
      signal: AbortSignal.timeout(MAPQUEST_CONFIG.timeout)
    });

    if (!data.results || !data.results[0].locations || data.results[0].locations.length === 0) {
      throw new Error('No results found');
    }

    const location = data.results[0].locations[0];
    const address = location.street 
      ? `${location.street}, ${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
      : `${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`;

    geocodingCache.set(cacheKey, address);
    return address;
  } catch (error) {
    console.error('Error getting address from coordinates:', error);
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }
};

/**
 * Get coordinates from address using MapQuest
 * @param {string} address - Address to geocode
 * @returns {Promise<{lat: number, lng: number, address: string}>} - Coordinates and formatted address
 */
export const getCoordsFromAddress = async (address) => {
  if (!address) return null;

  const cacheKey = `geocode:${address}`;
  const cachedResult = geocodingCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const url = new URL(`${MAPQUEST_CONFIG.baseUrl}/address`);
    url.searchParams.append('key', MAPQUEST_CONFIG.apiKey);
    url.searchParams.append('location', address);
    url.searchParams.append('maxResults', 1);
    url.searchParams.append('country', 'US');
    url.searchParams.append('outFormat', 'json');
    url.searchParams.append('thumbMaps', 'false');

    const data = await fetchWithRetry(url.toString(), {
      signal: AbortSignal.timeout(MAPQUEST_CONFIG.timeout)
    });

    if (!data.results || !data.results[0].locations || data.results[0].locations.length === 0) {
      throw new Error('No results found');
    }

    const location = data.results[0].locations[0];
    const result = {
      lat: location.latLng.lat,
      lng: location.latLng.lng,
      address: location.street 
        ? `${location.street}, ${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
        : `${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
    };

    geocodingCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error getting coordinates from address:', error);
    throw error;
  }
};

/**
 * Search for address suggestions using MapQuest
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of suggestions
 */
export const searchAddress = async (query, options = {}) => {
  if (!query || query.length < 2) return [];

  const cacheKey = `search:${query}:${JSON.stringify(options)}`;
  const cachedResult = geocodingCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const url = new URL(`${MAPQUEST_CONFIG.baseUrl}/address`);
    url.searchParams.append('key', MAPQUEST_CONFIG.apiKey);
    url.searchParams.append('location', query);
    url.searchParams.append('maxResults', options.limit || 10);
    url.searchParams.append('country', 'US');
    url.searchParams.append('outFormat', 'json');
    url.searchParams.append('thumbMaps', 'false');

    const data = await fetchWithRetry(url.toString(), {
      signal: AbortSignal.timeout(MAPQUEST_CONFIG.timeout)
    });

    if (!data.results || !data.results[0].locations) {
      return [];
    }

    const suggestions = data.results[0].locations.map(location => ({
      display_name: location.street 
        ? `${location.street}, ${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
        : `${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`,
      lat: location.latLng.lat.toString(),
      lon: location.latLng.lng.toString(),
      importance: location.geocodeQuality === 'POINT' ? 1 : 0.5,
      type: location.geocodeQuality
    }));

    geocodingCache.set(cacheKey, suggestions);
    return suggestions;
  } catch (error) {
    console.error('Error searching address:', error);
    return [];
  }
};

// Export the configuration for use in other files
export const MAPQUEST_SERVICE = {
  config: MAPQUEST_CONFIG,
  cache: geocodingCache,
  rateLimiter,
  getAddressFromCoords,
  getCoordsFromAddress,
  searchAddress
}; 