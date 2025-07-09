// Mapbox Location Service for SynqRoute
// Handles geocoding, search, and directions using Mapbox APIs

// Mapbox Configuration
const MAPBOX_CONFIG = {
  apiKey: import.meta.env.VITE_MAPBOX_API_KEY,
  baseUrl: 'https://api.mapbox.com',
  geocodingUrl: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
  directionsUrl: 'https://api.mapbox.com/directions/v5/mapbox/driving',
  matrixUrl: 'https://api.mapbox.com/directions-matrix/v1/mapbox/driving',
  searchUrl: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
  maxRetries: 3,
  timeout: 10000,
  rateLimit: 1000, // 1 second between requests
  cacheExpiry: 5 * 60 * 1000 // 5 minutes
};

// Simple cache for geocoding results
class GeocodingCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (item && Date.now() < item.expiry) {
      return item.data;
    }
    this.cache.delete(key);
    return null;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + MAPBOX_CONFIG.cacheExpiry
    });
  }

  clear() {
    this.cache.clear();
  }
}

const geocodingCache = new GeocodingCache();

// Rate limiter to prevent API abuse
class RateLimiter {
  constructor(interval) {
    this.interval = interval;
    this.lastRequestTime = 0;
  }

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.interval) {
      await new Promise(resolve => setTimeout(resolve, this.interval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new RateLimiter(MAPBOX_CONFIG.rateLimit);

// Helper function to check if API key is configured
const isApiKeyConfigured = () => {
  const apiKey = MAPBOX_CONFIG.apiKey;
  return apiKey && 
         apiKey.length > 0 && 
         apiKey !== 'undefined' && 
         apiKey.startsWith('pk.');
};

// Fetch with retry logic
const fetchWithRetry = async (url, options = {}, maxRetries = MAPBOX_CONFIG.maxRetries) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 Mapbox API attempt ${attempt}/${maxRetries}:`, url);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAPBOX_CONFIG.timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`🔍 Mapbox API success on attempt ${attempt}`);
      return data;
      
    } catch (error) {
      console.warn(`🔍 Mapbox API attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Get address from coordinates (reverse geocoding)
export const getAddressFromCoords = async (lat, lng) => {
  if (!isApiKeyConfigured()) {
    console.warn('Mapbox API key not configured');
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  }

  try {
    await rateLimiter.wait();
    
    const url = new URL(`${MAPBOX_CONFIG.geocodingUrl}/${lng},${lat}.json`);
    url.searchParams.append('access_token', MAPBOX_CONFIG.apiKey);
    url.searchParams.append('types', 'poi,address');
    url.searchParams.append('limit', '1');
    
    console.log('🔍 Reverse geocoding URL:', url.toString().replace(MAPBOX_CONFIG.apiKey, '***'));
    
    const data = await fetchWithRetry(url.toString());
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return feature.place_name || feature.text || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }
    
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  }
};

// Get coordinates from address (forward geocoding)
export const getCoordsFromAddress = async (address, options = {}) => {
  if (!address) return null;
  
  if (!isApiKeyConfigured()) {
    console.warn('Mapbox API key not configured');
    return null;
  }

  try {
    await rateLimiter.wait();
    
    const cacheKey = `geocode:${address}`;
    const cached = geocodingCache.get(cacheKey);
    if (cached) {
      console.log('🔍 Using cached geocoding result for:', address);
      return cached;
    }
    
    const url = new URL(`${MAPBOX_CONFIG.geocodingUrl}/${encodeURIComponent(address)}.json`);
    url.searchParams.append('access_token', MAPBOX_CONFIG.apiKey);
    url.searchParams.append('types', 'poi,address');
    url.searchParams.append('limit', '1');
    
    // Add proximity bias if user location is provided
    if (options.userLocation && options.userLocation.lat && options.userLocation.lng) {
      url.searchParams.append('proximity', `${options.userLocation.lng},${options.userLocation.lat}`);
    }
    
    console.log('🔍 Geocoding URL:', url.toString().replace(MAPBOX_CONFIG.apiKey, '***'));
    
    const data = await fetchWithRetry(url.toString());
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const result = {
        lat: feature.center[1],
        lng: feature.center[0],
        address: feature.place_name,
        name: feature.text,
        type: feature.place_type[0],
        relevance: feature.relevance
      };
      
      geocodingCache.set(cacheKey, result);
      return result;
    }
    
    return null;
    
  } catch (error) {
    console.error('Error in geocoding:', error);
    return null;
  }
};

// Calculate distance between two points using Haversine formula
export const calculateDistance = (point1, point2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
};

// Search for destinations (POIs and addresses)
export const searchDestinations = async (query, options = {}) => {
  if (!query || query.length < 2) {
    return [];
  }

  if (!isApiKeyConfigured()) {
    return [{
      display_name: '⚠️ Mapbox API key not configured.',
      lat: '0',
      lon: '0',
      type: 'error',
      isError: true
    }];
  }

  try {
    await rateLimiter.wait();
    
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    const cached = geocodingCache.get(cacheKey);
    if (cached) {
      console.log('🔍 Using cached search result for:', query);
      return cached;
    }

    console.log('🔍 ===== MAPBOX SEARCH DESTINATIONS =====');
    console.log('🔍 Query:', query);
    console.log('🔍 Options:', options);

    // Build search URL
    const url = new URL(`${MAPBOX_CONFIG.searchUrl}/${encodeURIComponent(query)}.json`);
    url.searchParams.append('access_token', MAPBOX_CONFIG.apiKey);
    url.searchParams.append('types', 'poi,address');
    url.searchParams.append('limit', options.limit || '8');
    url.searchParams.append('country', 'US');
    
    // Add proximity bias if user location is provided
    if (options.userLocation && options.userLocation.lat && options.userLocation.lng) {
      url.searchParams.append('proximity', `${options.userLocation.lng},${options.userLocation.lat}`);
    }
    
    console.log('🔍 Search URL:', url.toString().replace(MAPBOX_CONFIG.apiKey, '***'));
    
    const data = await fetchWithRetry(url.toString());
    
    if (data.features && data.features.length > 0) {
      const suggestions = data.features.map(feature => {
        const distance = options.userLocation ? 
          calculateDistance(
            { lat: options.userLocation.lat, lng: options.userLocation.lng },
            { lat: feature.center[1], lng: feature.center[0] }
          ) : 0;
        
        const distanceText = distance < 1 ? `${(distance * 1000).toFixed(0)}m` : `${distance.toFixed(1)}km`;
        
        let displayName = feature.place_name;
        if (distance > 0) {
          displayName += ` (${distanceText} away)`;
        }

        return {
          display_name: displayName,
          lat: feature.center[1].toString(),
          lon: feature.center[0].toString(),
          distance: distance,
          isNearby: distance < 100,
          isRealBusiness: feature.place_type.includes('poi'),
          quality: feature.relevance,
          type: feature.place_type[0],
          address: {
            street: feature.context?.find(c => c.id.startsWith('address'))?.text || '',
            city: feature.context?.find(c => c.id.startsWith('place'))?.text || '',
            state: feature.context?.find(c => c.id.startsWith('region'))?.text || '',
            zip: feature.context?.find(c => c.id.startsWith('postcode'))?.text || ''
          },
          name: feature.text,
          category: feature.place_type[0] === 'poi' ? 'Business/POI' : 'Address',
          source: 'mapbox_search'
        };
      });

      // Sort by relevance and distance
      suggestions.sort((a, b) => {
        // First by relevance (higher is better)
        if (a.quality !== b.quality) {
          return b.quality - a.quality;
        }
        // Then by distance (lower is better)
        return a.distance - b.distance;
      });

      geocodingCache.set(cacheKey, suggestions);
      console.log('🔍 Search results:', suggestions);
      return suggestions;
    }

    console.log('🔍 No search results found');
    return [];
    
  } catch (error) {
    console.error('🔍 Error searching destinations:', error);
    
    return [{
      display_name: '⚠️ Search failed. Please try again or enter an address manually.',
      lat: '0',
      lon: '0',
      importance: 0,
      type: 'error',
      isError: true,
      errorMessage: error.message,
      originalQuery: query
    }];
  }
};

// Get current location using browser geolocation
export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
};

// Clear geocoding cache
export const clearGeocodingCache = () => {
  geocodingCache.clear();
};

// Export the Mapbox service object
export const MAPBOX_SERVICE = {
  config: MAPBOX_CONFIG,
  cache: geocodingCache,
  rateLimiter,
  getAddressFromCoords,
  getCoordsFromAddress,
  searchDestinations,
  isApiKeyConfigured,
  calculateDistance,
  getCurrentLocation,
  clearGeocodingCache
}; 