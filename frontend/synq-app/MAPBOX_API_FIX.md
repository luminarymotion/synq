# Mapbox Search API Fix Guide

## Issues Identified

### 1. API Key Permission Issues
- **Problem**: The current Mapbox API key returns 403 Forbidden errors
- **Cause**: API key likely doesn't have the necessary scopes for Search Box API or is restricted to certain domains
- **Solution**: Configure API key with proper permissions or use fallback APIs

### 2. Inconsistent API Parameters
- **Problem**: Different components use different parameter names for the same API
- **Examples**: 
  - Some use `longitude`/`latitude`, others use `proximity`
  - Some use `country: 'US'`, others use `country: 'us'`
- **Solution**: Standardize all API calls to use consistent parameters

### 3. Incorrect Retrieve Endpoint URL
- **Problem**: Retrieve endpoint URL structure was malformed
- **Before**: `/retrieve?access_token=...&id=...`
- **After**: `/retrieve/{mapbox_id}?access_token=...`

### 4. Missing Error Handling
- **Problem**: No graceful fallback when API key is invalid
- **Solution**: Added API key validation and better error handling

## Complete Fixes Applied

### 1. Enhanced API Key Validation
```javascript
const isApiKeyValid = async () => {
  if (!isApiKeyConfigured()) {
    return false;
  }
  
  try {
    const testUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${CONFIG.mapbox.apiKey}&limit=1`;
    const response = await fetch(testUrl);
    return response.status !== 403 && response.status !== 401;
  } catch (error) {
    console.warn('API key validation failed:', error.message);
    return false;
  }
};
```

### 2. Standardized API Parameters
```javascript
// Consistent parameter usage across all components
const params = new URLSearchParams({
  q: query,
  proximity: `${lng},${lat}`,  // Use proximity instead of longitude/latitude
  limit: '5',
  country: 'us',               // Use lowercase
  language: 'en',
  types: 'poi,place,address',  // Include all relevant types
  access_token: apiKey,
});
```

### 3. Fixed Retrieve Endpoint URL
```javascript
// Before (incorrect)
const retrieveUrl = `${baseUrl}/retrieve?access_token=${apiKey}&id=${mapboxId}`;

// After (correct)
const retrieveUrl = `${baseUrl}/retrieve/${mapboxId}?access_token=${apiKey}`;
```

### 4. Improved Error Handling
```javascript
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
```

## API Key Configuration

### Current Status
- **API Key**: `pk.eyJ1IjoibHVtaW5hcnkwIiwiYSI6ImNtZGNhejZiajA5ajEybXB0MHJkMXNrNmEifQ.K2k49C746h1o6fw2BJBXGQ`
- **Status**: Returns 403 Forbidden
- **Issue**: Likely missing Search Box API permissions

### Required API Key Permissions
To use the Search Box API, your Mapbox API key needs:
1. **Search Box API** scope enabled
2. **Geocoding API** scope enabled
3. **No domain restrictions** (for development) or proper domain whitelist

### How to Fix API Key
1. Go to [Mapbox Account](https://account.mapbox.com/access-tokens/)
2. Find your current token or create a new one
3. Ensure the following scopes are enabled:
   - `search:read` (for Search Box API)
   - `geocoding:read` (for Geocoding API)
4. Remove domain restrictions for development
5. Update your `.env` file with the new key

## Fallback Strategy

### Current Fallback Chain
1. **Primary**: Mapbox Search Box API (suggest → retrieve)
2. **Fallback 1**: Mapbox Places API (geocoding)
3. **Fallback 2**: OpenStreetMap Nominatim

### Enhanced Fallback with API Key Validation
```javascript
export const searchDestinations = async (query, options = {}) => {
  // ... existing code ...
  
  try {
    // Primary: Search Box API (with validation)
    console.log(`🔍 Primary search: Search Box API`);
    results = await searchWithSearchBoxAPI(cleanQuery, userLocation, limit);
    
    if (results.length > 0) {
      console.log(`🔍 Search Box API successful: ${results.length} results`);
    } else {
      throw new Error('No results from Search Box API');
    }
  } catch (error) {
    console.warn(`🔍 Search Box API failed:`, error.message);
    
    if (enableFallback) {
      try {
        // Fallback 1: Mapbox Places API (with validation)
        console.log(`🔍 Fallback 1: Mapbox Places API`);
        results = await searchWithMapboxPlaces(cleanQuery, userLocation, limit);
        
        if (results.length > 0) {
          console.log(`🔍 Places API successful: ${results.length} results`);
        } else {
          throw new Error('No results from Places API');
        }
      } catch (placesError) {
        console.warn(`🔍 Places API failed:`, placesError.message);
        
        try {
          // Fallback 2: OpenStreetMap (always works)
          console.log(`🔍 Fallback 2: OpenStreetMap`);
          results = await searchWithOSM(cleanQuery, userLocation, limit);
          
          if (results.length > 0) {
            console.log(`🔍 OSM successful: ${results.length} results`);
          } else {
            throw new Error('No results from OSM');
          }
        } catch (osmError) {
          console.error(`🔍 All search methods failed:`, osmError.message);
          results = [];
        }
      }
    }
  }
  
  // ... rest of function ...
};
```

## Testing

### Test Script
A test script has been created at `test-mapbox-api.js` to verify API functionality:

```bash
node test-mapbox-api.js
```

### Manual Testing
1. Open browser console
2. Navigate to the search functionality
3. Check for error messages
4. Verify fallback APIs are working

## Next Steps

### Immediate Actions
1. **Fix API Key**: Update Mapbox API key with proper permissions
2. **Test**: Run the test script to verify fixes
3. **Deploy**: Test in development environment

### Long-term Improvements
1. **API Key Management**: Implement proper API key rotation
2. **Caching**: Enhance caching for better performance
3. **Monitoring**: Add API usage monitoring
4. **Rate Limiting**: Implement more sophisticated rate limiting

## Troubleshooting

### Common Issues
1. **403 Forbidden**: API key permissions or domain restrictions
2. **401 Unauthorized**: Invalid API key
3. **429 Too Many Requests**: Rate limiting
4. **No Results**: Query too specific or location too remote

### Debug Steps
1. Check browser console for error messages
2. Verify API key in `.env` file
3. Test API key manually with curl or Postman
4. Check Mapbox account for usage limits
5. Verify domain restrictions in Mapbox account

## Files Modified
- `src/services/locationService.js` - Main service with fixes
- `src/pages/MobileRideCreator.jsx` - Component fixes
- `test-mapbox-api.js` - Test script
- `MAPBOX_API_FIX.md` - This documentation 