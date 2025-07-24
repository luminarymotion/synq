# Location Services Configuration Guide

## Required Environment Variables

### Mapbox API Key
The location services require a Mapbox API key for full functionality.

1. **Get a Mapbox API Key:**
   - Go to [Mapbox Account](https://account.mapbox.com/access-tokens/)
   - Sign up or log in
   - Create a new access token
   - Copy the token (starts with `pk.`)

2. **Configure the API Key:**
   Create a `.env` file in the `frontend/synq-app/` directory with:
   ```
   VITE_MAPBOX_API_KEY=your_mapbox_api_key_here
   ```

3. **Restart the development server** after adding the environment variable.

## What Works Without API Key

- Basic location tracking (GPS)
- Distance calculations
- Manual location setting
- Validation and error handling

## What Requires API Key

- Address lookup from coordinates
- Proximity-based search (gas stations, restaurants, etc.)
- Geocoding (address to coordinates)
- Fallback to OpenStreetMap (limited functionality)

## Testing Without API Key

The test component will still work and show:
- ✅ Validation tests
- ✅ Location tracking tests
- ⚠️ Location service tests (with warnings)
- ⚠️ Integration tests (with limited functionality)

## Getting Started

1. **Without API Key (Basic Testing):**
   - Run validation tests
   - Run tracking tests
   - Check console for detailed logging

2. **With API Key (Full Testing):**
   - All tests will work with full functionality
   - Location-based suggestions will work
   - Address lookup will work

## Troubleshooting

### "Mapbox API key not configured" Warning
- This is expected if you haven't set up the API key
- Basic functionality will still work
- Set up the API key for full features

### Location Permission Issues
- Allow location access when prompted
- Check browser settings if permission is denied
- Try refreshing the page

### Network Issues
- Check internet connection
- Mapbox API requires internet access
- Fallback to OpenStreetMap may work

## Next Steps

1. **Test Basic Functionality:** Run validation and tracking tests
2. **Set Up API Key:** Get Mapbox API key for full features
3. **Test Location Services:** Run location service tests
4. **Test Integration:** Run integration tests
5. **Implement in App:** Use the services in your application 