// Simplified Location Service for SynqRoute
// Production-ready search architecture following industry standards

// Configuration
const CONFIG = {
  // API Configuration
  mapbox: {
    apiKey: import.meta.env.VITE_MAPBOX_API_KEY,
    searchBoxUrl: 'https://api.mapbox.com/search/searchbox/v1',
    geocodingUrl: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
    directionsUrl: 'https://api.mapbox.com/directions/v5/mapbox/driving',
    timeout: 5000,
    maxRetries: 2
  },
  
  // Fallback API (OpenStreetMap Nominatim)
  osm: {
    searchUrl: 'https://nominatim.openstreetmap.org/search',
    timeout: 3000
  },
  
  // Search Configuration
  search: {
    defaultLimit: 8,
    maxDistance: 25, // miles
    debounceMs: 150,
    cacheExpiry: 5 * 60 * 1000 // 5 minutes
  },
  
  // Rate Limiting
  rateLimit: {
    interval: 1000, // 1 second between requests
    maxRequests: 10 // max requests per interval
  }
};

// Simple rate limiter
class RateLimiter {
  constructor() {
    this.lastRequest = 0;
  }

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < CONFIG.rateLimit.interval) {
      const waitTime = CONFIG.rateLimit.interval - timeSinceLastRequest;
      console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequest = Date.now();
  }
}

// Search cache for performance
class SearchCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < CONFIG.search.cacheExpiry) {
      return cached.data;
    }
      this.cache.delete(key);
      return null;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  createKey(query, userLocation, limit) {
    let locationKey = 'no-location';
    
    if (userLocation) {
      // Handle both lat/lng and latitude/longitude formats
      const lat = userLocation.lat || userLocation.latitude;
      const lng = userLocation.lng || userLocation.longitude;
      
      if (typeof lat === 'number' && typeof lng === 'number' && 
          !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        // Round to 4 decimal places to avoid precision issues
        locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      }
    }
    
    return `${query.toLowerCase()}_${locationKey}_${limit}`;
  }
}

// Initialize instances
const rateLimiter = new RateLimiter();
const searchCache = new SearchCache();

// Utility functions
const isApiKeyConfigured = () => {
  console.log('🔍 API Key Debug:');
  console.log('  - API Key exists:', !!CONFIG.mapbox.apiKey);
  console.log('  - API Key value:', CONFIG.mapbox.apiKey);
  console.log('  - API Key starts with:', CONFIG.mapbox.apiKey?.substring(0, 10) + '...');
  console.log('  - API Key type:', CONFIG.mapbox.apiKey?.startsWith('pk.') ? 'public' : CONFIG.mapbox.apiKey?.startsWith('sk.') ? 'secret' : 'unknown');
  
  return CONFIG.mapbox.apiKey && CONFIG.mapbox.apiKey.startsWith('pk.');
};

const isApiKeyValid = async () => {
  if (!isApiKeyConfigured()) {
    return false;
  }
  
  try {
    // Test the API key with a simple request
    const testUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${CONFIG.mapbox.apiKey}&limit=1`;
    const response = await fetch(testUrl);
    return response.status !== 403 && response.status !== 401;
  } catch (error) {
    console.warn('API key validation failed:', error.message);
    return false;
  }
};

const generateSessionToken = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Helper function to geocode addresses to coordinates
const geocodeAddress = async (address) => {
  if (!address) return null;
  
  try {
    const url = new URL(`${CONFIG.mapbox.geocodingUrl}/${encodeURIComponent(address)}.json`);
    url.searchParams.append('access_token', CONFIG.mapbox.apiKey);
    url.searchParams.append('types', 'poi,address');
    url.searchParams.append('limit', '1');
    url.searchParams.append('country', 'us');
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn(`🔍 Geocoding failed for address: ${address}`);
      return null;
    }
    
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        lat: feature.center[1],
        lng: feature.center[0]
      };
    }
    
    return null;
  } catch (error) {
    console.warn(`🔍 Geocoding error for address: ${address}`, error);
    return null;
  }
};

const calculateDistanceInternal = (point1, point2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const calculateRelevanceScore = (result, query, userLocation) => {
  let score = 0;
  
  // Base relevance from API
  score += (result.relevance || 0) * 10;
  
  // Distance bonus (closer is better)
  if (result.distance !== null && result.distance < 10) {
    score += (10 - result.distance) * 2;
  }
  
  // Name match bonus
  const queryLower = query.toLowerCase();
  const nameLower = (result.name || '').toLowerCase();
  if (nameLower.includes(queryLower)) {
    score += 5;
  }
  
  return score;
};

const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Light mapping from common user queries to Mapbox category IDs
const queryToCategory = {
  'coffee': 'coffee',
  'coffee shop': 'coffee',
  'coffee shops': 'coffee',
  'gas': 'gas_station',
  'gas station': 'gas_station',
  'gas stations': 'gas_station',
  'food': 'restaurant',
  'restaurant': 'restaurant',
  'restaurants': 'restaurant',
  'lunch': 'restaurant',
  'grocery': 'supermarket',
  'grocery store': 'supermarket',
  'walmart': 'supermarket',
  'target': 'supermarket',
  'pharmacy': 'pharmacy',
  'cvs': 'pharmacy',
  'walgreens': 'pharmacy',
  'bank': 'bank',
  'atm': 'bank',
  'hospital': 'hospital',
  'doctor': 'hospital',
  'clinic': 'hospital',
  'hotel': 'hotel',
  'motel': 'hotel',
  'airport': 'airport',
  'parking': 'parking',
  'park': 'park',
  'gym': 'gym',
  'fitness': 'gym',
  'school': 'school',
  'university': 'school',
  'college': 'school',
  'library': 'library',
  'post office': 'post_office',
  'police': 'police',
  'fire station': 'fire_station',
  // Add more as needed
};

// Helper to normalize queries to possible category matches
function resolveCategory(query) {
  if (!query) return null;
  // Remove 'near me' and similar phrases, lowercase and trim
  let cleaned = query.toLowerCase()
    .replace(/near me|open now|now open/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();

  // Try direct match first
  if (queryToCategory[cleaned]) return queryToCategory[cleaned];

  // Try to match the start of the query
  for (const key in queryToCategory) {
    if (cleaned.startsWith(key)) return queryToCategory[key];
  }
  return null;
}

const fetchSuggestions = async (query, userLocation) => {
  console.log(`🔍 Mapbox hybrid search for: "${query}"`);

  const sessionToken = generateSessionToken();
  const category = resolveCategory(query);

  let url, usingCategory = false;
  
  // Add proximity if available - ensure correct order: longitude,latitude
  let proximityParam = null;
  if (userLocation) {
    const lat = userLocation.lat || userLocation.latitude;
    const lng = userLocation.lng || userLocation.longitude;
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      // Ensure correct order: longitude,latitude (as required by Mapbox)
      proximityParam = `${lng},${lat}`;
      console.log(`🔍 Added proximity: ${lng},${lat} (longitude,latitude)`);
      console.log(`🔍 UserLocation:`, userLocation);
    } else {
      console.log(`🔍 Invalid coordinates in userLocation:`, userLocation);
    }
  } else {
    console.log(`🔍 No userLocation provided`);
  }

  if (category) {
    // Use the category endpoint for common POI terms
    usingCategory = true;
    url = new URL(`${CONFIG.mapbox.searchBoxUrl}/category/${category}`);
    
    // Category endpoint parameters (NO session_token, NO q parameter)
    const categoryParams = {
      access_token: CONFIG.mapbox.apiKey,
      limit: '10',
      country: 'us',
      language: 'en'
    };
    
    // Add proximity if available
    if (proximityParam) {
      categoryParams.proximity = proximityParam;
    }
    
    // Add category params to URL
    for (const [k, v] of Object.entries(categoryParams)) {
      url.searchParams.append(k, v);
    }
    
    console.log(`🔍 Using category endpoint for: ${category}`);
  } else {
    // Use the /suggest endpoint for everything else
    url = new URL(`${CONFIG.mapbox.searchBoxUrl}/suggest`);
    
    // Suggest endpoint parameters (REQUIRES session_token and q parameter)
    const suggestParams = {
      q: query,
      types: 'poi,place,address',
      access_token: CONFIG.mapbox.apiKey,
      limit: '10',
      country: 'us',
      language: 'en',
      session_token: sessionToken
    };
    
    // Add proximity if available
    if (proximityParam) {
      suggestParams.proximity = proximityParam;
    }
    
    // Add suggest params to URL
    for (const [k, v] of Object.entries(suggestParams)) {
      url.searchParams.append(k, v);
    }
    
    console.log(`🔍 Using suggest endpoint for: "${query}"`);
  }

  console.log(`🔍 API URL: ${url.toString().replace(CONFIG.mapbox.apiKey, '***')}`);

  // Add detailed debugging for the request
  console.log('🔍 DEBUG - Full request details:', {
    url: url.toString().replace(CONFIG.mapbox.apiKey, '***'),
    method: 'GET',
    params: Object.fromEntries(url.searchParams.entries()),
    usingCategory,
    category,
    query: query || 'undefined'
  });

  try {
    console.log('🔍 DEBUG - Making fetch request...');
    const response = await fetch(url.toString());
    console.log('🔍 DEBUG - Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      // Try to get error details from response
      let errorDetails = '';
      try {
        const errorData = await response.text();
        errorDetails = `Response body: ${errorData}`;
      } catch (e) {
        errorDetails = 'Could not read error response body';
      }
      
      console.error('🔍 DEBUG - API Error Details:', {
        status: response.status,
        statusText: response.statusText,
        url: url.toString().replace(CONFIG.mapbox.apiKey, '***'),
        errorDetails
      });
      
      // If category endpoint fails with 400, try suggest endpoint as fallback
      if (usingCategory && response.status === 400) {
        console.log('🔍 Category endpoint failed with 400, trying suggest endpoint as fallback...');
        return await fetchSuggestionsFallback(query, userLocation, sessionToken);
      }
      
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorDetails}`);
    }
    const data = await response.json();
    console.log(`🔍 API response:`, data);

    // For category search, results are in .features; for suggest, in .suggestions
    let results = usingCategory ? data.features || [] : data.suggestions || [];

    // Normalize fields for downstream (make sure you always return {name, lat, lon, address, ...})
    let normalized = results.map(item => {
      // Different field sets between /features and /suggestions
      if (usingCategory) {
        const feat = item;
        return {
          name: feat.properties?.name || feat.text || '',
          lat: feat.geometry?.coordinates?.[1],
          lon: feat.geometry?.coordinates?.[0],
          address: feat.properties?.full_address || feat.place_name || '',
          feature_type: feat.properties?.feature_type,
          category: category,
          mapbox_id: feat.properties?.mapbox_id,
        };
      } else {
        const sug = item;
        return {
          name: sug.name || '',
          lat: sug.lat || sug.coordinate?.latitude,
          lon: sug.lon || sug.coordinate?.longitude,
          address: sug.full_address || sug.address || '',
          feature_type: sug.feature_type,
          category: sug.poi_category?.[0] || undefined,
          mapbox_id: sug.mapbox_id,
        };
      }
    });

    // Geocode results that don't have coordinates
    console.log(`🔍 Geocoding ${normalized.length} results...`);
    let resultsWithCoordinates = await Promise.all(
      normalized.map(async (result) => {
        if (result.lat && result.lon && !isNaN(result.lat) && !isNaN(result.lon)) {
          // Already has valid coordinates - use as is
          console.log(`🔍 Result "${result.name}" already has coordinates: ${result.lat}, ${result.lon}`);
          return result;
        } else if (result.address) {
          // Need to geocode the address
          console.log(`🔍 Geocoding address for "${result.name}": ${result.address}`);
          const coords = await geocodeAddress(result.address);
          if (coords) {
            console.log(`🔍 Geocoded "${result.name}" to: ${coords.lat}, ${coords.lng}`);
            return {
              ...result,
              lat: coords.lat,
              lon: coords.lng
            };
          } else {
            console.warn(`🔍 Failed to geocode "${result.name}"`);
            return result;
          }
        } else {
          console.warn(`🔍 Result "${result.name}" has no address to geocode`);
          return result;
        }
      })
    );

    // Filter out results without valid coordinates
    resultsWithCoordinates = resultsWithCoordinates.filter(loc => 
      loc.name && loc.lat && loc.lon && !isNaN(loc.lat) && !isNaN(loc.lon)
    );

    // Limit to 10 for consistency
    const finalResults = resultsWithCoordinates.slice(0, 10);

    console.log(`🔍 Returning ${finalResults.length} final suggestions`);
    return finalResults;

  } catch (error) {
    console.error('🔍 Mapbox Search Box API error:', error);
    throw error;
  }
};

// Fallback function for suggest endpoint
const fetchSuggestionsFallback = async (query, userLocation, sessionToken) => {
  console.log(`🔍 Fallback to suggest endpoint for: "${query}"`);
  
  const apiUrl = new URL(`${CONFIG.mapbox.searchBoxUrl}/suggest`);
  apiUrl.searchParams.append('q', query);
  apiUrl.searchParams.append('types', 'poi,place,address');
  apiUrl.searchParams.append('access_token', CONFIG.mapbox.apiKey);
  apiUrl.searchParams.append('limit', '15');
  apiUrl.searchParams.append('language', 'en');
  apiUrl.searchParams.append('country', 'us');
  apiUrl.searchParams.append('session_token', sessionToken);
  
  // Add proximity if available
  if (userLocation) {
    const lat = userLocation.lat || userLocation.latitude;
    const lng = userLocation.lng || userLocation.longitude;
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      apiUrl.searchParams.append('proximity', `${lng},${lat}`);
    }
  }
  
  const response = await fetch(apiUrl.toString());
  
  if (!response.ok) {
    throw new Error(`Suggest endpoint also failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.suggestions && data.suggestions.length > 0) {
    const results = data.suggestions.map(suggestion => ({
      name: suggestion.name || 'Unknown',
      lat: suggestion.coordinates?.[1] || suggestion.lat,
      lon: suggestion.coordinates?.[0] || suggestion.lon,
      address: suggestion.full_address || suggestion.address || '',
      category: suggestion.poi_category?.[0] || undefined,
      mapbox_id: suggestion.mapbox_id,
      feature_type: suggestion.feature_type || 'poi'
    }));
    
    // Filter and return results
    const validResults = results.filter(result => {
      const hasName = result.name && result.name !== 'Unknown' && result.name.trim() !== '';
      const hasCoordinates = result.lat && result.lon && !isNaN(result.lat) && !isNaN(result.lon);
      return hasName && hasCoordinates;
    });
    
    return validResults.slice(0, 10);
  }
  
  return [];
};

async function fetchDetailsForSuggestions(suggestions, userLocation) {
  console.log(`🔍 Processing ${suggestions.length} suggestions from hybrid search`);
  const results = [];
  
  // Since we're using hybrid search, the suggestions already have the data we need
  // We just need to calculate distances and format the results
  for (const suggestion of suggestions) {
    try {
      console.log(`🔍 Processing suggestion: ${suggestion.name}`);
      
      const name = suggestion.name;
      const address = suggestion.address;
      const lat = suggestion.lat;
      const lon = suggestion.lon;
      const category = suggestion.category;
      
      // Calculate distance from user location if available
      let distanceInMiles = 0;
      if (userLocation && lat && lon) {
        const userLat = userLocation.lat || userLocation.latitude;
        const userLon = userLocation.lng || userLocation.longitude;
        
        if (userLat && userLon && !isNaN(userLat) && !isNaN(userLon)) {
          distanceInMiles = calculateDistanceInternal(
            { lat: userLat, lng: userLon },
            { lat, lng: lon }
          );
        }
      }
      
      const result = {
        name: name,
        address: address,
        lat: lat,
        lon: lon,
      category: category,
        distance: distanceInMiles,
        mapbox_id: suggestion.mapbox_id,
        feature_type: suggestion.feature_type
      };
      
      // Only add results with valid names and coordinates
      if (name && name !== 'Unknown' && lat && lon) {
        results.push(result);
        console.log(`🔍 Added result: ${result.name} at ${result.lat}, ${result.lon} (${result.distance.toFixed(2)} miles)`);
      } else {
        console.log(`🔍 Skipped result: Invalid data for ${suggestion.mapbox_id}`);
      }
      
    } catch (error) {
      console.error(`🔍 Error processing suggestion ${suggestion.name}:`, error);
      // Continue with other suggestions even if one fails
    }
  }
  
  console.log(`🔍 Processed ${results.length} valid results`);
  return results;
}

async function searchWithMapbox(query, userLocation) {
  const suggestions = await fetchSuggestions(query, userLocation);
  const results = await fetchDetailsForSuggestions(suggestions, userLocation);
  return results;
}

// Export the new search function
export const searchWithMapboxAPI = searchWithMapbox;
// Simplified main search function - just make the API call
export const searchDestinations = async (query, options = {}) => {
  const {
    limit = CONFIG.search.defaultLimit,
    userLocation
  } = options;
  
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  const cleanQuery = query.trim();
  console.log(`🔍 Searching for: "${cleanQuery}"`);
  
  try {
    // Use the new searchWithMapbox function
    const results = await searchWithMapbox(cleanQuery, userLocation);
    console.log(`🔍 Found ${results.length} results`);
    return results;
    
      } catch (error) {
    console.error(`🔍 Search failed for: "${cleanQuery}"`, error);
    return []; // Return empty array on error
  }
};

// Geocoding functions
export const getCoordsFromAddress = async (address, options = {}) => {
  if (!address) return null;
  
  if (!isApiKeyConfigured()) {
    throw new Error('Mapbox API key not configured');
  }
  
  await rateLimiter.wait();
  
  const url = new URL(`${CONFIG.mapbox.geocodingUrl}/${encodeURIComponent(address)}.json`);
  url.searchParams.append('access_token', CONFIG.mapbox.apiKey);
  url.searchParams.append('types', 'poi,address');
  url.searchParams.append('limit', '1');
  url.searchParams.append('country', 'us');
  
  if (options.userLocation) {
    const userLat = options.userLocation?.lat || options.userLocation?.latitude;
    const userLng = options.userLocation?.lng || options.userLocation?.longitude;
    if (userLat && userLng) {
      url.searchParams.append('proximity', `${userLng},${userLat}`);
    }
  }
  
  const data = await fetchWithTimeout(url.toString(), {}, CONFIG.mapbox.timeout);
  
  if (data.features && data.features.length > 0) {
    const feature = data.features[0];
    return {
      lat: feature.center[1],
      lng: feature.center[0],
      address: feature.place_name,
      name: feature.text,
      type: feature.place_type[0],
      relevance: feature.relevance
    };
  }
  
  return null;
};

export const getAddressFromCoords = async (lat, lng) => {
  if (!isApiKeyConfigured()) {
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  }
  
  await rateLimiter.wait();
  
  const url = new URL(`${CONFIG.mapbox.geocodingUrl}/${lng},${lat}.json`);
  url.searchParams.append('access_token', CONFIG.mapbox.apiKey);
  url.searchParams.append('types', 'poi,address');
  url.searchParams.append('limit', '1');
  
  const data = await fetchWithTimeout(url.toString(), {}, CONFIG.mapbox.timeout);
  
  if (data.features && data.features.length > 0) {
    return data.features[0].place_name || data.features[0].text;
  }
  
  return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
};

// Get realistic driving directions between two points
export const getDirections = async (startLocation, endLocation) => {
  if (!isApiKeyConfigured()) {
    throw new Error('Mapbox API key not configured');
  }

  try {
    await rateLimiter.wait();
    
    const coordinates = `${startLocation.lng},${startLocation.lat};${endLocation.lng},${endLocation.lat}`;
    const url = `${CONFIG.mapbox.directionsUrl}/${coordinates}.json?access_token=${CONFIG.mapbox.apiKey}&overview=full&geometries=geojson`;
    
    console.log('📍 Getting directions:', { start: startLocation, end: endLocation });
    console.log('📍 Directions URL coordinates:', coordinates);
    console.log('📍 Full directions URL:', url);
    
    const data = await fetchWithTimeout(url, {}, CONFIG.mapbox.timeout);
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        geometry: route.geometry,
        distance: route.distance * 0.000621371, // Convert meters to miles
        duration: route.duration / 60, // Convert seconds to minutes
        summary: {
          distance: (route.distance * 0.000621371).toFixed(1),
          duration: Math.round(route.duration / 60)
        }
      };
    }
    
    throw new Error('No route found');
  } catch (error) {
    console.error('Error getting directions:', error);
    throw error;
  }
};

// Location tracking
export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    };
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps'
        });
      },
      (error) => {
        reject(new Error(`Geolocation failed: ${error.message}`));
      },
      options
    );
  });
};

// Utility exports
export const calculateDistance = calculateDistanceInternal;
export const clearSearchCache = () => {
  searchCache.clear();
  console.log('📍 Search cache cleared');
};

// Force clear cache and retry search for debugging
export const forceRefreshSearch = async (query, options = {}) => {
  console.log('📍 Force refreshing search for:', query);
  searchCache.clear();
  return await searchDestinations(query, options);
};

// Debug function to clear cache and test fresh results
export const clearCacheAndSearch = async (query, options = {}) => {
  console.log('🧹 Clearing cache and performing fresh search for:', query);
  searchCache.clear();
  console.log('🧹 Cache cleared, performing fresh search...');
  return await searchDestinations(query, options);
};

// Debug function to test Search Box API directly
export const debugFetchSuggestions = async (query, userLocation) => {
  console.log('🧪 Debugging Search Box API for:', query);
  
  try {
    // Clear cache first
    searchCache.clear();
    
    // Test the Search Box API directly
    const results = await fetchSuggestions(query, userLocation);
    
    console.log('🧪 Search Box API Results:', results);
    
    // Compare with expected structure
    results.forEach((result, index) => {
      console.log(`🧪 Result ${index + 1}:`, {
        name: result.name,
        feature_type: result.feature_type,
        poi_category: result.poi_category,
        poi_category_ids: result.poi_category_ids,
        brand: result.brand,
        distance: result.distance,
        hasRichMetadata: !!(result.poi_category_ids || result.brand || result.feature_type)
      });
    });
    
    return results;
    } catch (error) {
    console.error('🧪 Debug Search Box API failed:', error);
    throw error;
  }
};

// Debug function for testing the new search implementation
export const debugSearchWithMapbox = async (query, userLocation) => {
  console.log('🔍 Testing new searchWithMapbox for:', query);
  try {
    const results = await searchWithMapbox(query, userLocation);
    console.log('🔍 New search results:', results);
      return results;
    } catch (error) {
    console.error('🔍 New search error:', error);
      return [];
    }
  };

// Debug function to test API key and endpoints
export const debugApiKey = () => {
  console.log('🔍 API Key Debug Information:');
  console.log('  - API Key exists:', !!CONFIG.mapbox.apiKey);
  console.log('  - API Key value:', CONFIG.mapbox.apiKey);
  console.log('  - API Key starts with:', CONFIG.mapbox.apiKey?.substring(0, 10) + '...');
  console.log('  - API Key type:', CONFIG.mapbox.apiKey?.startsWith('pk.') ? 'public' : CONFIG.mapbox.apiKey?.startsWith('sk.') ? 'secret' : 'unknown');
  
  // Test basic geocoding API
  if (CONFIG.mapbox.apiKey) {
    console.log('🔍 Testing basic geocoding API...');
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${CONFIG.mapbox.apiKey}&limit=1`)
      .then(response => {
        console.log('  - Geocoding API status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('  - Geocoding API response:', data);
      })
      .catch(error => {
        console.error('  - Geocoding API error:', error);
      });
  }
  
  return {
    exists: !!CONFIG.mapbox.apiKey,
    value: CONFIG.mapbox.apiKey,
    type: CONFIG.mapbox.apiKey?.startsWith('pk.') ? 'public' : CONFIG.mapbox.apiKey?.startsWith('sk.') ? 'secret' : 'unknown'
  };
};

// Export configuration for debugging
export const MAPBOX_CONFIG = CONFIG.mapbox;
export const SEARCH_CONFIG = CONFIG.search;

// Debug function that can be called from browser console
export const debugMapboxSearch = async (query = 'food', userLocation = null) => {
  console.log('🔍 DEBUG - Starting Mapbox search test...');
  console.log('🔍 DEBUG - Query:', query);
  console.log('🔍 DEBUG - User location:', userLocation);
  console.log('🔍 DEBUG - API Key configured:', isApiKeyConfigured());
  console.log('🔍 DEBUG - API Key valid:', await isApiKeyValid());
  
  try {
    const results = await searchDestinations(query, {
      limit: 5,
      userLocation: userLocation,
      enableFallback: false
    });
    
    console.log('🔍 DEBUG - Search successful, results:', results);
    return results;
  } catch (error) {
    console.error('🔍 DEBUG - Search failed:', error);
    throw error;
  }
};

// Export service object for backward compatibility
export const MAPBOX_SERVICE = {
  config: CONFIG.mapbox,
  searchDestinations,
  getCoordsFromAddress,
  getAddressFromCoords,
  getCurrentLocation,
  calculateDistance: calculateDistanceInternal,
  clearSearchCache,
  isApiKeyConfigured
};

// Expose globally for debugging
if (typeof window !== 'undefined') {
  window.MAPBOX_SERVICE = MAPBOX_SERVICE;
  window.searchDestinations = searchDestinations;
  window.getCurrentLocation = getCurrentLocation;
  window.clearSearchCache = clearSearchCache;
}

// Expose debug function globally
if (typeof window !== 'undefined') {
  window.debugFetchSuggestions = debugFetchSuggestions;
  window.debugApiKey = debugApiKey;
  window.debugSearchWithMapbox = debugSearchWithMapbox;
}

// Make debug functions available globally for console access
if (typeof window !== 'undefined') {
  window.debugMapboxSearch = debugMapboxSearch;
  window.debugApiKey = debugApiKey;
  window.MAPBOX_CONFIG = MAPBOX_CONFIG;
  
  // Add a simple test function for direct API testing
  window.testMapboxAPI = async () => {
    console.log('🧪 Testing Mapbox API directly...');
    
    if (!CONFIG.mapbox.apiKey) {
      console.error('❌ No API key configured');
      return;
    }
    
    // Test 1: Basic suggest endpoint
    try {
      const suggestUrl = new URL(`${CONFIG.mapbox.searchBoxUrl}/suggest`);
      suggestUrl.searchParams.append('q', 'coffee');
      suggestUrl.searchParams.append('access_token', CONFIG.mapbox.apiKey);
      suggestUrl.searchParams.append('limit', '5');
      suggestUrl.searchParams.append('country', 'us');
      
      console.log('🧪 Testing suggest endpoint...');
      const suggestResponse = await fetch(suggestUrl.toString());
      console.log('🧪 Suggest response status:', suggestResponse.status);
      
      if (suggestResponse.ok) {
        const suggestData = await suggestResponse.json();
        console.log('🧪 Suggest data:', suggestData);
      } else {
        const errorText = await suggestResponse.text();
        console.error('🧪 Suggest error:', errorText);
      }
    } catch (error) {
      console.error('🧪 Suggest test failed:', error);
    }
    
    // Test 2: Category endpoint
    try {
      const categoryUrl = new URL(`${CONFIG.mapbox.searchBoxUrl}/category/restaurant`);
      categoryUrl.searchParams.append('access_token', CONFIG.mapbox.apiKey);
      categoryUrl.searchParams.append('limit', '5');
      categoryUrl.searchParams.append('country', 'us');
      
      console.log('🧪 Testing category endpoint...');
      const categoryResponse = await fetch(categoryUrl.toString());
      console.log('🧪 Category response status:', categoryResponse.status);
      
      if (categoryResponse.ok) {
        const categoryData = await categoryResponse.json();
        console.log('🧪 Category data:', categoryData);
      } else {
        const errorText = await categoryResponse.text();
        console.error('🧪 Category error:', errorText);
      }
    } catch (error) {
      console.error('🧪 Category test failed:', error);
    }
  };
}