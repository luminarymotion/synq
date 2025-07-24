// Simplified Location Service for SynqRoute
// Production-ready search architecture following industry standards

// Configuration
const CONFIG = {
  // API Configuration
  mapbox: {
    apiKey: import.meta.env.VITE_MAPBOX_API_KEY,
    searchUrl: 'https://api.mapbox.com/search/searchbox/v1/suggest',
    placesUrl: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
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
    this.requestCount = 0;
    this.resetTime = Date.now() + CONFIG.rateLimit.interval;
  }

  async wait() {
    const now = Date.now();
    
    // Reset counter if interval has passed
    if (now > this.resetTime) {
      this.requestCount = 0;
      this.resetTime = now + CONFIG.rateLimit.interval;
    }
    
    // Check if we're at the limit
    if (this.requestCount >= CONFIG.rateLimit.maxRequests) {
      const waitTime = this.resetTime - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.resetTime = Date.now() + CONFIG.rateLimit.interval;
    }
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < CONFIG.rateLimit.interval) {
      await new Promise(resolve => 
        setTimeout(resolve, CONFIG.rateLimit.interval - timeSinceLastRequest)
      );
    }
    
    this.lastRequest = Date.now();
    this.requestCount++;
  }
}

// Simple cache implementation
class SearchCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + CONFIG.search.cacheExpiry
    });
  }

  clear() {
    this.cache.clear();
  }

  createKey(query, userLocation, limit) {
    const locationKey = userLocation ? 
      `${userLocation.lat.toFixed(3)}_${userLocation.lng.toFixed(3)}` : 'no-location';
    return `${query.toLowerCase()}_${locationKey}_${limit}`;
  }
}

// Initialize instances
const rateLimiter = new RateLimiter();
const searchCache = new SearchCache();

// Utility functions
const isApiKeyConfigured = () => {
  const apiKey = CONFIG.mapbox.apiKey;
  return apiKey && apiKey.length > 0 && apiKey !== 'undefined' && apiKey.startsWith('pk.');
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

const generateSessionToken = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// Smart relevance scoring (industry standard approach)
const calculateRelevanceScore = (result, query, userLocation) => {
  let score = 0;
  const queryLower = query.toLowerCase();
  const nameLower = result.name?.toLowerCase() || '';
  const addressLower = result.address?.toLowerCase() || '';
  
  // Name match (highest weight)
  if (nameLower.includes(queryLower)) {
    score += 100;
  }
  
  // Exact name match
  if (nameLower === queryLower) {
    score += 50;
  }
  
  // Address match
  if (addressLower.includes(queryLower)) {
    score += 30;
  }
  
  // Distance bonus (closer is better)
  if (result.distance !== undefined) {
    if (result.distance < 1) score += 80;
    else if (result.distance < 3) score += 60;
    else if (result.distance < 5) score += 40;
    else if (result.distance < 10) score += 20;
    else if (result.distance < 15) score += 10;
  }
  
  // Type relevance
  if (result.type === 'poi') score += 10;
  
  // API relevance score (if available)
  if (result.relevance) {
    score += result.relevance * 20;
  }
  
  return score;
};

// Fetch with timeout and retry
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Primary search function using Mapbox Places API (Search Box API disabled due to 400 errors)
const searchWithMapbox = async (query, userLocation, limit = CONFIG.search.defaultLimit) => {
  if (!isApiKeyConfigured()) {
    throw new Error('Mapbox API key not configured');
  }
  
  console.log('📍 Mapbox API key configured:', CONFIG.mapbox.apiKey ? 'Yes' : 'No');
  console.log('📍 API key starts with:', CONFIG.mapbox.apiKey?.substring(0, 10) + '...');
  
  await rateLimiter.wait();
  
  // Determine category for enhanced search
  let detectedCategory = null;
  
  // Check for specific brand names to determine category
  const brandToCategory = {
    'mobil': 'gas station',
    'exxon': 'gas station',
    'shell': 'gas station',
    'chevron': 'gas station',
    'bp': 'gas station',
    'taco bell': 'restaurant',
    'mcdonalds': 'restaurant',
    'burger king': 'restaurant',
    'wendys': 'restaurant',
    'subway': 'restaurant',
    'dominos': 'restaurant',
    'pizza hut': 'restaurant',
    'kfc': 'restaurant',
    'chipotle': 'restaurant',
    'starbucks': 'coffee',
    'dunkin': 'coffee',
    'chick-fil-a': 'restaurant',
    'popeyes': 'restaurant',
    'arbys': 'restaurant',
    'sonic': 'restaurant',
    'whataburger': 'restaurant',
    'in-n-out': 'restaurant',
    'five guys': 'restaurant',
    'shake shack': 'restaurant'
  };
  
  for (const [brand, category] of Object.entries(brandToCategory)) {
    if (query.toLowerCase().includes(brand) || brand.includes(query.toLowerCase())) {
      detectedCategory = category;
      console.log(`📍 Detected brand: ${brand}, category: ${category}`);
      break;
    }
  }
  
  // Check for general categories
  if (!detectedCategory) {
    const categoryMap = {
      'gas station': 'gas station',
      'gas': 'gas station',
      'fuel': 'gas station',
      'restaurant': 'restaurant',
      'food': 'restaurant',
      'coffee': 'coffee',
      'coffee shop': 'coffee',
      'pharmacy': 'pharmacy',
      'drugstore': 'pharmacy',
      'grocery': 'grocery',
      'grocery store': 'grocery',
      'supermarket': 'grocery'
    };
    
    for (const [term, category] of Object.entries(categoryMap)) {
      if (query.toLowerCase().includes(term) || term.includes(query.toLowerCase())) {
        detectedCategory = category;
        console.log(`📍 Detected category: ${category}`);
        break;
      }
    }
  }
  
  // Use Mapbox Places API as primary method (Search Box API disabled)
  console.log('📍 Using Mapbox Places API for:', query, 'Category:', detectedCategory);
  return await searchWithMapboxPlaces(query, userLocation, limit, detectedCategory);
};

// Search for branded POIs using /suggest → /retrieve workflow
const searchBrandedPOI = async (query, userLocation, limit = CONFIG.search.defaultLimit) => {
  console.log(`📍 Searching for branded POI: "${query}"`);
  
  // Step 1: Get suggestions from Searchbox API
  const sessionToken = generateSessionToken();
  const suggestionsUrl = new URL(CONFIG.mapbox.searchUrl);
  
  suggestionsUrl.searchParams.append('access_token', CONFIG.mapbox.apiKey);
  suggestionsUrl.searchParams.append('q', query);
  suggestionsUrl.searchParams.append('limit', (limit * 2).toString()); // Request more results to filter
  suggestionsUrl.searchParams.append('language', 'en');
  suggestionsUrl.searchParams.append('country', 'us');
  suggestionsUrl.searchParams.append('session_token', sessionToken);
  suggestionsUrl.searchParams.append('types', 'poi,place,neighborhood,address'); // Required parameter
  suggestionsUrl.searchParams.append('routing', 'true'); // Enable routing for better results
  
  if (userLocation) {
    const proximityParam = `${userLocation.lng},${userLocation.lat}`;
    suggestionsUrl.searchParams.append('proximity', proximityParam);
    
    console.log('📍 Branded search request:', {
      query,
      userLocation,
      proximityParam,
      sessionToken: sessionToken.substring(0, 10) + '...'
    });
  }
  
  let suggestionsData;
  try {
    console.log('📍 Making Search Box API request to:', suggestionsUrl.toString().replace(CONFIG.mapbox.apiKey, '***'));
    suggestionsData = await fetchWithTimeout(suggestionsUrl.toString(), {}, CONFIG.mapbox.timeout);
    
    console.log('📍 Raw branded search response:', suggestionsData);
  
    if (!suggestionsData.suggestions) {
      console.warn('No suggestions in branded search response:', suggestionsData);
      return [];
    }
  } catch (error) {
    console.error('📍 Branded search API error:', error);
    console.error('📍 Full URL (with API key):', suggestionsUrl.toString());
    
    // If Search Box API fails, try Mapbox Places as fallback (NOT Geocoding API)
    console.log('📍 Falling back to Mapbox Places search for:', query);
    return await searchWithMapboxPlaces(query, userLocation, limit, null);
  }
  
  console.log(`📍 Branded search returned ${suggestionsData.suggestions.length} suggestions for "${query}"`);
  
  // Step 2: Process suggestions with improved fallback
  const results = [];
  
  for (const suggestion of suggestionsData.suggestions) {
    try {
      // Skip category and brand suggestions that don't have mapbox_id
      if (suggestion.feature_type === 'category' || suggestion.feature_type === 'brand') {
        console.log(`📍 Skipping ${suggestion.feature_type} suggestion: ${suggestion.name}`);
        continue;
      }
      
      let coordinates = null;
      let address = null;
      
      // Try to get coordinates from suggestion directly first
      if (suggestion.coordinates) {
        coordinates = { lat: suggestion.coordinates.lat, lng: suggestion.coordinates.lng };
        address = suggestion.full_address || suggestion.place_formatted || suggestion.address;
        console.log(`📍 Using direct coordinates for: ${suggestion.name}`);
      }
      // Try to get coordinates from center if available
      else if (suggestion.center) {
        const [lng, lat] = suggestion.center;
        coordinates = { lat, lng };
        address = suggestion.full_address || suggestion.place_formatted || suggestion.address;
        console.log(`📍 Using center coordinates for: ${suggestion.name}`);
      }
      // Try retrieve endpoint as fallback
      else if (suggestion.mapbox_id) {
        try {
      const retrieveUrl = new URL('https://api.mapbox.com/search/searchbox/v1/retrieve');
      retrieveUrl.searchParams.append('access_token', CONFIG.mapbox.apiKey);
      retrieveUrl.searchParams.append('session_token', sessionToken);
      retrieveUrl.searchParams.append('id', suggestion.mapbox_id);
      
          const retrieveData = await fetchWithTimeout(retrieveUrl.toString(), {}, CONFIG.mapbox.timeout);
        
        if (retrieveData.features && retrieveData.features.length > 0) {
          const feature = retrieveData.features[0];
          
          if (feature.geometry?.coordinates) {
            const [lng, lat] = feature.geometry.coordinates;
        coordinates = { lat, lng };
          } else if (feature.center) {
            const [lng, lat] = feature.center;
        coordinates = { lat, lng };
          }
          
            address = feature.properties?.full_address || suggestion.place_formatted || suggestion.full_address;
            console.log(`📍 Retrieved coordinates for: ${suggestion.name}`);
          }
        } catch (retrieveError) {
          console.log(`📍 Retrieve failed for ${suggestion.name}, trying geocoding:`, retrieveError.message);
        }
      }
      
      // Note: We don't use Geocoding API for POI search - it's only for address conversion
      // If we don't have coordinates by now, skip this suggestion
      if (!coordinates) {
        console.log(`📍 Skipping ${suggestion.name} - no coordinates available from Search Box API`);
      }
      
      // If we have coordinates, create the result
      if (coordinates) {
              const result = {
                name: suggestion.name,
          address: address || suggestion.place_formatted || suggestion.full_address || suggestion.address,
                lat: coordinates.lat,
                lng: coordinates.lng,
                type: suggestion.feature_type || 'poi',
                category: suggestion.feature_type || 'poi',
                relevance: suggestion.relevance || 0,
          coordinateSource: 'mapbox_enhanced',
                // Additional POI information for enhanced display
                phone: null,
                website: null,
                hours: null,
                rating: null,
                price: null
              };
              
              // Calculate distance if user location is available
              if (userLocation) {
                result.distance = calculateDistanceInternal(userLocation, coordinates);
              }
              
              results.push(result);
        console.log(`📍 Successfully processed: ${result.name} (${coordinates.lat}, ${coordinates.lng})`);
                      } else {
        console.log(`📍 Could not get coordinates for: ${suggestion.name}`);
      }
    } catch (error) {
      console.warn(`Failed to process suggestion ${suggestion.name}:`, error.message);
    }
  }
  
  return results;
};

// Search for category POIs using /category endpoint
const searchCategoryPOI = async (query, userLocation, limit = CONFIG.search.defaultLimit) => {
  console.log(`📍 Searching for category POI: "${query}"`);
  
  // Map common search terms to Mapbox category IDs
  const categoryMap = {
    'gas station': 'gas_station',
    'gas': 'gas_station',
    'fuel': 'gas_station',
    'restaurant': 'restaurant',
    'food': 'restaurant',
    'coffee': 'coffee_shop',
    'coffee shop': 'coffee_shop',
    'pharmacy': 'pharmacy',
    'drugstore': 'pharmacy',
    'grocery': 'grocery_store',
    'grocery store': 'grocery_store',
    'supermarket': 'grocery_store',
    'bank': 'bank',
    'atm': 'atm',
    'hotel': 'hotel',
    'lodging': 'hotel',
    'hospital': 'hospital',
    'clinic': 'hospital',
    'doctor': 'hospital',
    'medical': 'hospital',
    'parking': 'parking',
    'parking lot': 'parking',
    'shopping': 'shopping_center',
    'mall': 'shopping_center',
    'store': 'shopping_center',
    'airport': 'airport',
    'airports': 'airport',
    'taco bell': 'restaurant',
    'mcdonalds': 'restaurant',
    'burger king': 'restaurant',
    'wendys': 'restaurant',
    'subway': 'restaurant',
    'dominos': 'restaurant',
    'pizza hut': 'restaurant',
    'kfc': 'restaurant',
    'chipotle': 'restaurant',
    'starbucks': 'coffee_shop',
    'dunkin': 'coffee_shop',
    'chick-fil-a': 'restaurant',
    'popeyes': 'restaurant',
    'arbys': 'restaurant',
    'sonic': 'restaurant',
    'whataburger': 'restaurant',
    'in-n-out': 'restaurant',
    'five guys': 'restaurant',
    'shake shack': 'restaurant'
  };
  
  // Find the appropriate category ID
  const categoryId = categoryMap[query.toLowerCase()];
  
  if (!categoryId) {
    console.log(`📍 No category mapping found for: "${query}", falling back to branded search`);
    return await searchBrandedPOI(query, userLocation, limit);
  }
  
  // Use the category endpoint
  const categoryUrl = new URL(`https://api.mapbox.com/search/searchbox/v1/category/${categoryId}`);
  
  categoryUrl.searchParams.append('access_token', CONFIG.mapbox.apiKey);
  categoryUrl.searchParams.append('limit', limit.toString());
  categoryUrl.searchParams.append('language', 'en');
  categoryUrl.searchParams.append('country', 'us');
  categoryUrl.searchParams.append('routing', 'true'); // Enable routing for better results
  
  if (userLocation) {
    const proximityParam = `${userLocation.lng},${userLocation.lat}`;
    categoryUrl.searchParams.append('proximity', proximityParam);
    
    console.log('📍 Category search request:', {
      query,
      categoryId,
      userLocation,
      proximityParam
    });
  }
  
  let categoryData;
  try {
    categoryData = await fetchWithTimeout(categoryUrl.toString(), {}, CONFIG.mapbox.timeout);
    
    console.log('📍 Raw category search response:', categoryData);
  
    if (!categoryData.features) {
      console.warn('No features in category search response:', categoryData);
      return [];
    }
  } catch (error) {
    console.error('📍 Category search API error:', error);
    
    // If category search fails, try branded search as fallback (NOT Geocoding API)
    console.log('📍 Falling back to branded search for:', query);
    return await searchBrandedPOI(query, userLocation, limit);
  }
  
  console.log(`📍 Category search returned ${categoryData.features.length} features for "${query}" (${categoryId})`);
  
  // Process category results (these include coordinates directly)
  const results = [];
  
  for (const feature of categoryData.features) {
    try {
      // Extract coordinates from the feature
      let coordinates = null;
      if (feature.geometry?.coordinates) {
        const [lng, lat] = feature.geometry.coordinates;
        coordinates = { lat, lng };
      } else if (feature.center) {
        const [lng, lat] = feature.center;
        coordinates = { lat, lng };
      }
      
      if (coordinates) {
        const result = {
          name: feature.properties?.name || feature.text || 'Unknown',
          address: feature.properties?.full_address || feature.place_name || 'Address not available',
          lat: coordinates.lat,
          lng: coordinates.lng,
          type: feature.properties?.category || categoryId,
          category: feature.properties?.category || categoryId,
          relevance: feature.relevance || 0.5,
          coordinateSource: 'mapbox_category',
          // Additional POI information for enhanced display
          phone: feature.properties?.phone || null,
          website: feature.properties?.website || null,
          hours: feature.properties?.hours || null,
          rating: feature.properties?.rating || null,
          price: feature.properties?.price || null
        };
        
        // Calculate distance if user location is available
        if (userLocation) {
          result.distance = calculateDistanceInternal(userLocation, coordinates);
        }
        
        results.push(result);
        console.log(`📍 Successfully extracted coordinates for: ${result.name} (${coordinates.lat}, ${coordinates.lng})`);
      } else {
        console.log(`📍 No coordinates available for: ${feature.properties?.name || feature.text || 'Unknown'}`);
      }
    } catch (error) {
      console.warn('Failed to process category feature:', feature.properties?.name || feature.text || 'Unknown', error);
    }
  }
  
  return results;
};

// Fallback search using Mapbox Places API (much better than OSM)
const searchWithMapboxPlaces = async (query, userLocation, limit = CONFIG.search.defaultLimit, category = null) => {
  await rateLimiter.wait();
  
  // Add category-specific terms to improve search accuracy
  let searchQuery = query;
  if (category) {
    const categoryTerms = {
      'restaurant': ['restaurant', 'food', 'dining'],
      'gas station': ['gas station', 'fuel', 'gas'],
      'coffee': ['coffee', 'cafe'],
      'pharmacy': ['pharmacy', 'drugstore'],
      'grocery': ['grocery', 'supermarket', 'store']
    };
    
    if (categoryTerms[category]) {
      searchQuery = `${query} ${categoryTerms[category][0]}`;
      console.log(`📍 Enhanced Mapbox Places search query for ${category}: ${searchQuery}`);
    }
  }
  
  const url = new URL(`${CONFIG.mapbox.placesUrl}/${encodeURIComponent(searchQuery)}.json`);
  url.searchParams.append('access_token', CONFIG.mapbox.apiKey);
  url.searchParams.append('limit', (limit * 2).toString()); // Request more to filter
  url.searchParams.append('types', 'poi,place'); // Focus on POIs and places
  url.searchParams.append('country', 'us');
  url.searchParams.append('language', 'en');
  
  if (userLocation) {
    url.searchParams.append('proximity', `${userLocation.lng},${userLocation.lat}`);
  }
  
  console.log('📍 Making Mapbox Places API request to:', url.toString().replace(CONFIG.mapbox.apiKey, '***'));
  
  const data = await fetchWithTimeout(url.toString(), {}, CONFIG.mapbox.timeout);
  
  if (!data.features || data.features.length === 0) {
    console.log('📍 No results from Mapbox Places API');
    return [];
  }
  
  // Filter results by category if specified
  let filteredFeatures = data.features;
  if (category) {
    const categoryKeywords = {
      'restaurant': ['restaurant', 'food', 'dining', 'cafe', 'pizza', 'burger', 'taco', 'subway', 'mcdonalds', 'burger king', 'wendys', 'dominos', 'pizza hut', 'kfc', 'chipotle', 'starbucks', 'dunkin', 'chick-fil-a', 'popeyes', 'arbys', 'sonic', 'whataburger', 'in-n-out', 'five guys', 'shake shack'],
      'gas station': ['gas', 'fuel', 'exxon', 'shell', 'chevron', 'mobil', 'bp', '7-eleven', 'racetrac', 'quiktrip', 'wawa', 'speedway', 'circle k', 'valero', 'marathon', 'sunoco', 'conoco', 'phillips', 'texaco', 'arco', 'costco'],
      'coffee': ['coffee', 'cafe', 'starbucks', 'dunkin', 'peets', 'caribou', 'tim hortons'],
      'pharmacy': ['pharmacy', 'drugstore', 'cvs', 'walgreens', 'rite aid'],
      'grocery': ['grocery', 'supermarket', 'store', 'walmart', 'target', 'kroger', 'safeway', 'albertsons', 'publix', 'whole foods', 'trader joes', 'aldi', 'food lion', 'shoprite', 'wegmans', 'meijer', 'heb']
    };
    
    const keywords = categoryKeywords[category] || [];
    filteredFeatures = data.features.filter(feature => {
      const text = feature.text?.toLowerCase() || '';
      const placeName = feature.place_name?.toLowerCase() || '';
      const fullText = `${text} ${placeName}`;
      return keywords.some(keyword => fullText.includes(keyword));
    });
    
    console.log(`📍 Filtered Mapbox Places results for ${category}: ${filteredFeatures.length}/${data.features.length} results`);
  }
  
  const results = filteredFeatures.slice(0, limit).map(feature => {
    const [lng, lat] = feature.center;
    const distance = userLocation ? calculateDistanceInternal(userLocation, { lat, lng }) : undefined;
    
    console.log('📍 Mapbox Places result:', {
      name: feature.text,
      coordinates: { lat, lng },
      distance: distance ? `${distance.toFixed(1)} miles` : 'unknown',
      fullAddress: feature.place_name,
      category: category,
      relevance: feature.relevance
    });
    
    return {
      name: feature.text,
      address: feature.place_name,
      lat,
      lng,
      type: category || feature.place_type?.[0] || 'poi',
      relevance: feature.relevance || 0.5,
      coordinateSource: 'mapbox_places',
      distance
    };
  });
  
  return results;
};

// Legacy OSM fallback (only as last resort)
const searchWithOSM = async (query, userLocation, limit = CONFIG.search.defaultLimit, category = null) => {
  console.log('📍 Using OSM as last resort fallback for:', query);
  await rateLimiter.wait();
  
  const url = new URL(CONFIG.osm.searchUrl);
  url.searchParams.append('q', query);
  url.searchParams.append('format', 'json');
  url.searchParams.append('limit', limit.toString());
  url.searchParams.append('addressdetails', '1');
  url.searchParams.append('countrycodes', 'us');
  
  if (userLocation) {
    url.searchParams.append('lat', userLocation.lat.toString());
    url.searchParams.append('lon', userLocation.lng.toString());
    url.searchParams.append('radius', '50000'); // 50km radius
  }
  
  const data = await fetchWithTimeout(url.toString(), {}, CONFIG.osm.timeout);
  
  const results = data.slice(0, limit).map(item => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const distance = userLocation ? calculateDistanceInternal(userLocation, { lat, lng }) : undefined;
    
    return {
      name: item.display_name.split(',')[0],
      address: item.display_name,
      lat,
      lng,
      type: category || item.type || 'poi',
      relevance: 0.3, // Lower relevance for OSM results
      coordinateSource: 'osm',
      distance
    };
  });
  
  return results;
};

// Smart search terms for common POI types
// Updated to work with the new Mapbox Search Box API approach
const POI_SEARCH_TERMS = {
  'gas station': [
    'gas station', // Will use /category/gas_station
    'exxon',       // Will use /suggest → /retrieve
    'shell',       // Will use /suggest → /retrieve
    'chevron',     // Will use /suggest → /retrieve
    'mobil',       // Will use /suggest → /retrieve
    'bp',          // Will use /suggest → /retrieve
    '7-eleven',    // Will use /suggest → /retrieve
    'racetrac',    // Will use /suggest → /retrieve
    'quiktrip',    // Will use /suggest → /retrieve
    'wawa',        // Will use /suggest → /retrieve
    'speedway',    // Will use /suggest → /retrieve
    'circle k',    // Will use /suggest → /retrieve
    'valero',      // Will use /suggest → /retrieve
    'marathon',    // Will use /suggest → /retrieve
    'sunoco',      // Will use /suggest → /retrieve
    'conoco',      // Will use /suggest → /retrieve
    'phillips 66', // Will use /suggest → /retrieve
    'texaco',      // Will use /suggest → /retrieve
    'arco',        // Will use /suggest → /retrieve
    'costco gas'   // Will use /suggest → /retrieve
  ],
  'restaurant': [
    'restaurant',  // Will use /category/restaurant
    'mcdonalds',   // Will use /suggest → /retrieve
    'burger king', // Will use /suggest → /retrieve
    'wendys',      // Will use /suggest → /retrieve
    'subway',      // Will use /suggest → /retrieve
    'dominos',     // Will use /suggest → /retrieve
    'pizza hut',   // Will use /suggest → /retrieve
    'kfc',         // Will use /suggest → /retrieve
    'taco bell',   // Will use /suggest → /retrieve
    'chipotle',    // Will use /suggest → /retrieve
    'starbucks',   // Will use /suggest → /retrieve
    'dunkin',      // Will use /suggest → /retrieve
    'chick-fil-a', // Will use /suggest → /retrieve
    'popeyes',     // Will use /suggest → /retrieve
    'arbys',       // Will use /suggest → /retrieve
    'sonic',       // Will use /suggest → /retrieve
    'whataburger', // Will use /suggest → /retrieve
    'in-n-out',    // Will use /suggest → /retrieve
    'five guys',   // Will use /suggest → /retrieve
    'shake shack'  // Will use /suggest → /retrieve
  ],
  'coffee': [
    'coffee',      // Will use /category/coffee_shop
    'coffee shop', // Will use /category/coffee_shop
    'starbucks',   // Will use /suggest → /retrieve
    'dunkin',      // Will use /suggest → /retrieve
    'dunkin donuts', // Will use /suggest → /retrieve
    'peets coffee', // Will use /suggest → /retrieve
    'caribou coffee', // Will use /suggest → /retrieve
    'tim hortons', // Will use /suggest → /retrieve
    'cafe'         // Will use /category/coffee_shop
  ],
  'pharmacy': [
    'pharmacy',    // Will use /category/pharmacy
    'drugstore',   // Will use /category/pharmacy
    'cvs',         // Will use /suggest → /retrieve
    'walgreens',   // Will use /suggest → /retrieve
    'rite aid'     // Will use /suggest → /retrieve
  ],
  'grocery': [
    'grocery',     // Will use /category/grocery_store
    'grocery store', // Will use /category/grocery_store
    'supermarket', // Will use /category/grocery_store
    'walmart',     // Will use /suggest → /retrieve
    'target',      // Will use /suggest → /retrieve
    'kroger',      // Will use /suggest → /retrieve
    'safeway',     // Will use /suggest → /retrieve
    'albertsons',  // Will use /suggest → /retrieve
    'publix',      // Will use /suggest → /retrieve
    'whole foods', // Will use /suggest → /retrieve
    'trader joes', // Will use /suggest → /retrieve
    'aldi',        // Will use /suggest → /retrieve
    'food lion',   // Will use /suggest → /retrieve
    'shoprite',    // Will use /suggest → /retrieve
    'wegmans',     // Will use /suggest → /retrieve
    'meijer',      // Will use /suggest → /retrieve
    'heb'          // Will use /suggest → /retrieve
  ]
};

// Main search function with fallback
export const searchDestinations = async (query, options = {}) => {
  const {
    limit = CONFIG.search.defaultLimit,
    userLocation = null,
    enableFallback = true
  } = options;
  
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  const cleanQuery = query.trim().toLowerCase();
  
  // Check cache first
  const cacheKey = searchCache.createKey(cleanQuery, userLocation, limit);
  const cachedResults = searchCache.get(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }
  
  let results = [];
  
  // Determine search terms based on query
  let searchTerms = [cleanQuery];
  let detectedCategory = null;
  
  // Check if this is a known POI type and add relevant brand searches
  for (const [poiType, terms] of Object.entries(POI_SEARCH_TERMS)) {
    if (cleanQuery.includes(poiType) || poiType.includes(cleanQuery)) {
      console.log(`📍 Detected POI type: ${poiType}, adding brand searches`);
      searchTerms = terms.slice(0, 5); // Limit to top 5 brands to avoid too many requests
      detectedCategory = poiType;
      break;
    }
  }
  
  // Also check for specific brand names to determine category
  if (!detectedCategory) {
    const brandToCategory = {
      'mobil': 'gas station',
      'exxon': 'gas station',
      'shell': 'gas station',
      'chevron': 'gas station',
      'bp': 'gas station',
      'taco bell': 'restaurant',
      'mcdonalds': 'restaurant',
      'burger king': 'restaurant',
      'wendys': 'restaurant',
      'subway': 'restaurant',
      'dominos': 'restaurant',
      'pizza hut': 'restaurant',
      'kfc': 'restaurant',
      'chipotle': 'restaurant',
      'starbucks': 'coffee',
      'dunkin': 'coffee',
      'chick-fil-a': 'restaurant',
      'popeyes': 'restaurant',
      'arbys': 'restaurant',
      'sonic': 'restaurant',
      'whataburger': 'restaurant',
      'in-n-out': 'restaurant',
      'five guys': 'restaurant',
      'shake shack': 'restaurant'
    };
    
    for (const [brand, category] of Object.entries(brandToCategory)) {
      if (cleanQuery.includes(brand) || brand.includes(cleanQuery)) {
        detectedCategory = category;
        console.log(`📍 Detected brand: ${brand}, category: ${category}`);
        break;
      }
    }
  }
  
  console.log(`📍 Searching with terms:`, searchTerms);
  
  try {
    // Search with multiple terms
    const allResults = [];
    
    for (const searchTerm of searchTerms) {
      try {
        const termResults = await searchWithMapbox(searchTerm, userLocation, Math.ceil(limit / searchTerms.length));
        allResults.push(...termResults);
        // console.log(`📍 Found ${termResults.length} results for "${searchTerm}"`);
      } catch (error) {
        console.warn(`Search failed for "${searchTerm}":`, error);
      }
    }
    
    results = allResults;
  } catch (error) {
    console.warn('All Mapbox searches failed:', error);
    
    if (enableFallback) {
      try {
        console.log('Trying fallback search with Mapbox Places...');
        results = await searchWithMapboxPlaces(cleanQuery, userLocation, limit, detectedCategory);
      } catch (fallbackError) {
        console.error('Mapbox Places fallback failed, trying OSM as last resort...');
        try {
          results = await searchWithOSM(cleanQuery, userLocation, limit, detectedCategory);
        } catch (osmError) {
          console.error('All fallback searches failed:', osmError);
        return [];
        }
      }
    } else {
      return [];
    }
  }
  
        // console.log(`📍 Processing ${results.length} results before filtering`);
  
  // Deduplicate results by coordinates (within 100 meters)
  const deduplicatedResults = [];
  const seenCoordinates = new Set();
  
  for (const result of results) {
    if (!result.lat || !result.lng) {
      console.log(`📍 Filtered out "${result.name}" - no coordinates`);
      continue;
    }
    
    // Create a coordinate key rounded to ~100m precision
    const coordKey = `${Math.round(result.lat * 1000) / 1000},${Math.round(result.lng * 1000) / 1000}`;
    
    if (seenCoordinates.has(coordKey)) {
      console.log(`📍 Deduplicated "${result.name}" - same location as previous result`);
      continue;
    }
    
    seenCoordinates.add(coordKey);
    deduplicatedResults.push(result);
  }
  
        // console.log(`📍 After deduplication: ${deduplicatedResults.length} unique results`);
  
  // Filter and rank results
  const filteredResults = deduplicatedResults
    .filter(result => {
      // Filter by distance if user location is available
      if (userLocation && result.distance !== undefined) {
        if (result.distance > CONFIG.search.maxDistance) {
          console.log(`📍 Filtered out "${result.name}" - too far (${result.distance.toFixed(1)} miles > ${CONFIG.search.maxDistance} miles)`);
          return false;
        }
      }
      
      return true;
    })
    .map(result => ({
      ...result,
      relevanceScore: calculateRelevanceScore(result, cleanQuery, userLocation)
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
    
        // console.log(`📍 After filtering: ${filteredResults.length} results within ${CONFIG.search.maxDistance} miles`);
  
  // Cache results
  searchCache.set(cacheKey, filteredResults);
  
  return filteredResults;
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
    url.searchParams.append('proximity', `${options.userLocation.lng},${options.userLocation.lat}`);
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
export const clearSearchCache = () => searchCache.clear();

// Export configuration for debugging
export const MAPBOX_CONFIG = CONFIG.mapbox;
export const SEARCH_CONFIG = CONFIG.search;

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
  
  // Add test function for the new simplified system
  window.testSimplifiedSearch = async () => {
    console.log('🧪 ===== TESTING SIMPLIFIED SEARCH SYSTEM =====');
    
    try {
      const userLocation = await getCurrentLocation();
      console.log('🧪 User location:', userLocation);
      
      // Test 1: Gas station search
      console.log('\n🧪 Test 1: Gas station search');
      const gasResults = await searchDestinations('gas station', {
        limit: 5,
        userLocation,
        enableFallback: true
      });
      console.log('🧪 Gas station results:', gasResults.length);
      gasResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.name} (${result.distance?.toFixed(1)} mi) - ${result.address}`);
      });
      
      // Test 2: Walmart search
      console.log('\n🧪 Test 2: Walmart search');
      const walmartResults = await searchDestinations('walmart', {
        limit: 5,
        userLocation,
        enableFallback: true
      });
      console.log('🧪 Walmart results:', walmartResults.length);
      walmartResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.name} (${result.distance?.toFixed(1)} mi) - ${result.address}`);
      });
      
      // Test 3: Restaurant search
      console.log('\n🧪 Test 3: Restaurant search');
      const restaurantResults = await searchDestinations('restaurant', {
        limit: 5,
        userLocation,
        enableFallback: true
      });
      console.log('🧪 Restaurant results:', restaurantResults.length);
      restaurantResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.name} (${result.distance?.toFixed(1)} mi) - ${result.address}`);
      });
      
      // Summary
      console.log('\n🧪 Summary:');
      console.log(`  Gas stations: ${gasResults.length} results`);
      console.log(`  Walmart: ${walmartResults.length} results`);
      console.log(`  Restaurants: ${restaurantResults.length} results`);
      
      // Check for nearby results (within 5 miles)
      const nearbyGas = gasResults.filter(r => r.distance && r.distance <= 5);
      const nearbyWalmart = walmartResults.filter(r => r.distance && r.distance <= 5);
      const nearbyRestaurant = restaurantResults.filter(r => r.distance && r.distance <= 5);
      
      console.log(`  Nearby results (≤5mi): Gas: ${nearbyGas.length}, Walmart: ${nearbyWalmart.length}, Restaurant: ${nearbyRestaurant.length}`);
      
    } catch (error) {
      console.error('🧪 Test failed:', error);
    }
  };

  // Test function to debug coordinate extraction
  window.testCoordinateExtraction = async (query = 'gas station') => {
    console.log('🔧 Testing coordinate extraction for:', query);
    
    try {
      const userLocation = { lat: 33.0198, lng: -96.6989 }; // Plano, TX
      console.log('📍 Test location:', userLocation);
      
      // Test the raw Mapbox API response
      const results = await searchDestinations(query, { 
        userLocation, 
        limit: 5 
      });
      
      console.log('🔍 Raw results with coordinate analysis:');
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.name}`);
        console.log(`   Address: ${result.address}`);
        console.log(`   Coordinates: lat=${result.lat}, lng=${result.lng}`);
        console.log(`   Source: ${result.coordinateSource}`);
        console.log(`   Distance: ${result.distance} mi`);
        console.log('   ---');
      });
      
      // Check for missing coordinates
      const withCoords = results.filter(r => r.lat && r.lng);
      const withoutCoords = results.filter(r => !r.lat || !r.lng);
      
      console.log('📊 Coordinate analysis:');
      console.log(`  Total results: ${results.length}`);
      console.log(`  With coordinates: ${withCoords.length}`);
      console.log(`  Without coordinates: ${withoutCoords.length}`);
      
      if (withoutCoords.length > 0) {
        console.log('❌ Results missing coordinates:', withoutCoords);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Coordinate extraction test failed:', error);
      return [];
    }
  };

  // Test function to verify map display of suggestions
  window.testMapDisplay = async (query = 'gas station') => {
    console.log('🗺️ Testing map display for:', query);
    
    try {
      const userLocation = { lat: 33.0198, lng: -96.6989 }; // Plano, TX
      
      // Get search results
      const results = await searchDestinations(query, { 
        userLocation, 
        limit: 5 
      });
      
      console.log('🗺️ Search results for map display:', results);
      
      // Simulate what the MapView component receives
      console.log('🗺️ Suggestions that should appear on map:');
      results.forEach((result, index) => {
        console.log(`  Marker ${index + 1}: ${result.name} at (${result.lat}, ${result.lng})`);
      });
      
      // Check if results have the expected format for MapView
      const validForMap = results.filter(r => 
        r.lat && r.lng && 
        typeof r.lat === 'number' && 
        typeof r.lng === 'number' &&
        r.name && r.address
      );
      
      console.log('🗺️ Results valid for map display:', validForMap.length);
      
      if (validForMap.length !== results.length) {
        console.warn('🗺️ Some results may not display on map due to missing data');
      }
      
      return results;
    } catch (error) {
      console.error('❌ Map display test failed:', error);
      return [];
    }
  };
}



