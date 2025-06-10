import { MAPQUEST_SERVICE } from '../services/locationService';

const geocodeAddress = async (address) => {
  if (!address) return null;
  try {
    const result = await MAPQUEST_SERVICE.getCoordsFromAddress(address);
    return { lat: result.lat, lng: result.lng, address: result.address };
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
};

const getAddressFromCoords = async (lat, lng) => {
  try {
    return await MAPQUEST_SERVICE.getAddressFromCoords(lat, lng);
  } catch (error) {
    console.error('Error getting address from coordinates:', error);
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  }
};

// Update the handleChange function to use debouncing
const handleChange = (() => {
  let timeoutId = null;
  
  return async (e) => {
    const { name, value } = e.target;
    
    // Update form state immediately
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
    
    // If destination changed, geocode it with debouncing
    if (name === 'destination' && value) {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Set a new timeout
      timeoutId = setTimeout(async () => {
        try {
          const coords = await geocodeAddress(value);
          if (coords) {
            setDestinationCoords(coords);
            // Update form with the full address
            setForm(prev => ({
              ...prev,
              destination: coords.address
            }));
          }
        } catch (error) {
          console.error('Error geocoding destination:', error);
          // Don't show error to user, just log it
        }
      }, 500); // 500ms debounce
    }
  };
})();

// ... rest of the existing code ... 