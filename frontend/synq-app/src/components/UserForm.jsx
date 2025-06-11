import { useEffect, useState, useRef } from 'react';
import '../styles/UserForm.css';
import FriendSelectionModal from './FriendSelectionModal';
import { useUserAuth } from '../services/auth';
import { MAPQUEST_SERVICE } from '../services/locationService';
import { 
  sendFriendRequest,
  getFriendsList,
  checkFriendshipStatus
} from '../services/firebaseOperations';

// Add fuzzy search helper
const fuzzySearch = (searchTerm, text) => {
  searchTerm = searchTerm.toLowerCase();
  text = text.toLowerCase();
  
  // Exact match
  if (text.includes(searchTerm)) return 1;
  
  // Remove common words and special characters
  const cleanText = text.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const cleanSearch = searchTerm.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  
  // Check if all words in search term are in text
  const searchWords = cleanSearch.split(' ');
  const allWordsMatch = searchWords.every(word => cleanText.includes(word));
  if (allWordsMatch) return 0.8;
  
  // Check for partial word matches
  const partialMatch = searchWords.some(word => 
    cleanText.split(' ').some(textWord => textWord.includes(word) || word.includes(textWord))
  );
  if (partialMatch) return 0.5;
  
  return 0;
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
      expiry: Date.now() + MAPQUEST_SERVICE.cacheExpiry
    });
  }
};

// Add rate limiter with queue
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
const rateLimiter = new RateLimiter(MAPQUEST_SERVICE.rateLimit);

// Add geocoding service
const geocodingService = {
  async search(query, options = {}) {
    const searchTerm = query.toLowerCase().trim();
    
    // First check common places
    const commonPlaceMatches = Object.entries(COMMON_PLACES)
      .map(([key, place]) => ({
        ...place,
        score: Math.max(
          fuzzySearch(searchTerm, key),
          ...place.aliases.map(alias => fuzzySearch(searchTerm, alias))
        )
      }))
      .filter(match => match.score > 0.3)
      .sort((a, b) => b.score - a.score);

    if (commonPlaceMatches.length > 0) {
      console.log('Found match in common places:', commonPlaceMatches[0]);
      return [commonPlaceMatches[0]];
    }

    // If no common place match, check cache
    const cacheKey = `search:${searchTerm}:${JSON.stringify(options)}`;
    const cachedResult = geocodingCache.get(cacheKey);
    if (cachedResult) {
      console.log('Using cached geocoding result for:', searchTerm);
      return cachedResult;
    }

    // If no cache hit, make API request
    await rateLimiter.wait();
    
    // Prepare search query
    let searchQuery = searchTerm;
    
    // Add common place name expansions
    if (searchTerm.includes('dfw')) {
      searchQuery = searchTerm.replace('dfw', 'dallas fort worth international airport');
    }
    
    const url = new URL(`${MAPQUEST_SERVICE.baseUrl}/address`);
    url.searchParams.append('key', MAPQUEST_SERVICE.apiKey);
    url.searchParams.append('location', searchQuery);
    url.searchParams.append('maxResults', options.limit || 10);
    url.searchParams.append('country', 'US');
    url.searchParams.append('outFormat', 'json');
    url.searchParams.append('thumbMaps', 'false'); // Reduce response size
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAPQUEST_SERVICE.timeout);
      
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Transform and score results
      const transformedResults = data.results[0].locations
        .map(location => {
          const fullAddress = location.street 
            ? `${location.street}, ${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
            : `${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`;
            
          return {
            display_name: fullAddress,
            lat: location.latLng.lat.toString(),
            lon: location.latLng.lng.toString(),
            importance: location.geocodeQuality === 'POINT' ? 1 : 0.5,
            type: location.geocodeQuality,
            score: fuzzySearch(searchTerm, fullAddress)
          };
        })
        .filter(result => result.score > 0.3)
        .sort((a, b) => b.score - a.score);
      
      // Cache results
      geocodingCache.set(cacheKey, transformedResults);
      
      // Also cache individual results for future partial matches
      transformedResults.forEach(result => {
        const words = result.display_name.toLowerCase().split(/[\s,]+/);
        words.forEach(word => {
          if (word.length > 2) { // Only cache words longer than 2 characters
            const wordCacheKey = `word:${word}`;
            const existingCache = geocodingCache.get(wordCacheKey) || [];
            if (!existingCache.some(item => item.display_name === result.display_name)) {
              geocodingCache.set(wordCacheKey, [...existingCache, result]);
            }
          }
        });
      });
      
      return transformedResults;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Geocoding request timed out for:', searchTerm);
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  },

  async reverseGeocode(lat, lng) {
    const cacheKey = `reverse:${lat}:${lng}`;
    const cachedResult = geocodingCache.get(cacheKey);
    if (cachedResult) {
      console.log('Using cached reverse geocoding result');
      return cachedResult;
    }

    await rateLimiter.wait();
    
    const url = new URL(`${MAPQUEST_SERVICE.baseUrl}/reverse`);
    url.searchParams.append('key', MAPQUEST_SERVICE.apiKey);
    url.searchParams.append('location', `${lat},${lng}`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAPQUEST_SERVICE.timeout);
      
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const location = data.results[0].locations[0];
      
      const result = {
        display_name: location.street 
          ? `${location.street}, ${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
          : `${location.adminArea5}, ${location.adminArea3} ${location.postalCode}`
      };
      
      geocodingCache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Reverse geocoding request timed out');
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  }
};

// Add fallback geocoding service
const fallbackGeocode = async (query) => {
  try {
    const response = await fetch(`https://api.geocode.earth/v1/search?text=${encodeURIComponent(query)}&api_key=ge-0c2c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0`);
    if (!response.ok) throw new Error('Fallback geocoding failed');
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        display_name: feature.place_name,
        lat: feature.center[1],
        lon: feature.center[0]
      };
    }
    return null;
  } catch (error) {
    console.warn('Fallback geocoding failed:', error);
    return null;
  }
};

// Update the fetchWithRetry function
const fetchWithRetry = async (url, options = {}, maxRetries = 2) => {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await rateLimiter.wait(); // Add rate limiting
      const response = await fetch(url, {
        ...options,
        headers: {
          ...NOMINATIM_HEADERS,
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      lastError = error;
      
      // If this is the last retry and it failed, try the fallback service
      if (i === maxRetries) {
        const query = url.split('q=')[1]?.split('&')[0];
        if (query) {
          console.log('Trying fallback geocoding service for:', query);
          const fallbackResult = await fallbackGeocode(decodeURIComponent(query));
          if (fallbackResult) {
            return [fallbackResult]; // Return in same format as Nominatim
          }
        }
      }
      
      if (i < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, i), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

// Function to search for suggestions
const searchSuggestions = async (query, options = {}) => {
  if (!query || query.length < 2) return [];

  try {
    const results = await MAPQUEST_SERVICE.searchAddress(query, options);
    return results;
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return [];
  }
};

// Update the geocodeAddress function
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

// Update the getAddressFromCoords function
const getAddressFromCoords = async (lat, lng) => {
  try {
    return await MAPQUEST_SERVICE.getAddressFromCoords(lat, lng);
  } catch (error) {
    console.error('Error getting address from coordinates:', error);
    return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  }
};

function UserForm({ form, onChange, onSubmit, onDestinationChange, onUserLocationChange, creatorRole, existingParticipants = [], isTrackingLocation, rideId, groupCreated }) {
  const [suggestions, setSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [userLocationSuggestions, setUserLocationSuggestions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [lastSelectedDestination, setLastSelectedDestination] = useState('');
  const [lastSelectedUserLocation, setLastSelectedUserLocation] = useState('');
  const [userCoordinates, setUserCoordinates] = useState(null);
  const destinationTimeout = useRef(null);
  const userLocationTimeout = useRef(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const successTimeout = useRef(null);
  const { user } = useUserAuth();
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState(null);

  // Add logging for initial props
  console.log('UserForm rendered with props:', {
    creatorRole,
    form,
    groupCreated
  });

  // Function to get user's current location
  const getUserLocation = async () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by your browser');
      return;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;
      const formattedAddress = await MAPQUEST_SERVICE.getAddressFromCoords(latitude, longitude);
      
      setUserCoordinates({ lat: latitude, lng: longitude });
      onChange({ target: { name: 'userLocation', value: formattedAddress } });
      if (onUserLocationChange) {
        onUserLocationChange(latitude, longitude, formattedAddress);
      }
    } catch (error) {
      console.error('Error getting user location:', error);
      setError('Failed to get your location. Please try again.');
    }
  };

  // Function to calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  };

  // Function to sort and filter suggestions based on relevance and distance
  const processSuggestions = (suggestions, userCoords, searchTerm) => {
    if (!suggestions || !suggestions.length) return [];

    // Add distance to each suggestion if we have user coordinates
    const suggestionsWithDistance = suggestions.map(sug => ({
      ...sug,
      distance: userCoords ? calculateDistance(
        userCoords.lat,
        userCoords.lng,
        parseFloat(sug.lat),
        parseFloat(sug.lon)
      ) : null
    }));

    // Sort suggestions based on relevance and distance
    return suggestionsWithDistance
      .sort((a, b) => {
        // If we have user coordinates, prioritize by distance
        if (userCoords) {
          // If distances are significantly different (more than 1km), sort by distance
          if (Math.abs(a.distance - b.distance) > 1) {
            return a.distance - b.distance;
          }
        }
        
        // Otherwise, sort by how well the suggestion matches the search term
        const aMatch = a.display_name.toLowerCase().includes(searchTerm.toLowerCase());
        const bMatch = b.display_name.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        
        // If both match or neither match, sort by distance
        return (a.distance || Infinity) - (b.distance || Infinity);
      })
      .slice(0, 5); // Limit to top 5 suggestions
  };

  // Update suggestions for destination
  useEffect(() => {
    // Don't search if:
    // 1. No input
    // 2. Same as last selected
    if (!form.destination || 
        form.destination === lastSelectedDestination || 
        form.destination.length < 2 ||
        form.destination.trim() === lastSelectedDestination.trim()) {
      setDestinationSuggestions([]);
      return;
    }

    if (destinationTimeout.current) {
      clearTimeout(destinationTimeout.current);
    }

    destinationTimeout.current = setTimeout(async () => {
      try {
        const suggestions = await searchSuggestions(form.destination, { limit: 5 });
        const processedSuggestions = processSuggestions(suggestions, userCoordinates, form.destination);
        setDestinationSuggestions(processedSuggestions);
      } catch (error) {
        console.error("Error fetching destination suggestions:", error);
        setDestinationSuggestions([]);
        setError(error.message || "Unable to fetch location suggestions. Please try again in a few seconds.");
        setTimeout(() => setError(null), 3000);
      }
    }, 500);

    return () => clearTimeout(destinationTimeout.current);
  }, [form.destination, lastSelectedDestination, userCoordinates]);

  // Update suggestions for user location
  useEffect(() => {
    if (!form.userLocation || 
        form.userLocation === lastSelectedUserLocation || 
        form.userLocation.length < 2 ||
        form.userLocation.trim() === lastSelectedUserLocation.trim()) {
      setUserLocationSuggestions([]);
      return;
    }

    if (userLocationTimeout.current) {
      clearTimeout(userLocationTimeout.current);
    }

    userLocationTimeout.current = setTimeout(async () => {
      try {
        const suggestions = await searchSuggestions(form.userLocation, { limit: 5 });
        const processedSuggestions = processSuggestions(suggestions, userCoordinates, form.userLocation);
        setUserLocationSuggestions(processedSuggestions);
      } catch (error) {
        console.error("Error fetching user location suggestions:", error);
        setUserLocationSuggestions([]);
        setError("Unable to fetch location suggestions. Please try again in a few seconds.");
        setTimeout(() => setError(null), 3000);
      }
    }, 500);

    return () => clearTimeout(userLocationTimeout.current);
  }, [form.userLocation, lastSelectedUserLocation, userCoordinates]);

  const handleDestinationSelect = (place) => {
    const selectedDestination = place.display_name;
    setLastSelectedDestination(selectedDestination);
    
    // Update form with the address
    onChange({ target: { name: 'destination', value: selectedDestination } });
    setDestinationSuggestions([]); // Clear suggestions immediately
    
    if (destinationTimeout.current) {
      clearTimeout(destinationTimeout.current);
    }
    
    // Call onDestinationChange with the coordinates
    if (onDestinationChange) {
      const coords = {
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon)
      };
      console.log('Setting destination coordinates:', coords);
      onDestinationChange(coords);
    }
  };

  const handleUserLocationSelect = (place) => {
    const selectedLocation = place.display_name;
    setLastSelectedUserLocation(selectedLocation);
    onChange({ target: { name: 'userLocation', value: selectedLocation } });
    setUserLocationSuggestions([]); // Clear suggestions immediately
    if (userLocationTimeout.current) {
      clearTimeout(userLocationTimeout.current);
    }
    if (onUserLocationChange) {
      onUserLocationChange(selectedLocation);
    }
  };

  // Load friends list when component mounts
  useEffect(() => {
    const loadFriends = async () => {
      if (!user) return;
      
      setIsLoadingFriends(true);
      setFriendError(null);
      
      try {
        const result = await getFriendsList(user.uid);
        if (result.success) {
          setFriends(result.friends);
        } else {
          setFriendError('Failed to load friends list');
        }
      } catch (error) {
        console.error('Error loading friends:', error);
        setFriendError('Error loading friends list');
      } finally {
        setIsLoadingFriends(false);
      }
    };

    loadFriends();
  }, [user]);

  const handleAddFriend = async (friend) => {
    if (!user) return;

    try {
      // Check if already friends
      const statusResult = await checkFriendshipStatus(user.uid, friend.id);
      if (statusResult.success && statusResult.areFriends) {
        console.log('Already friends with this user');
        return;
      }

      // Send friend request
      const result = await sendFriendRequest({
        senderId: user.uid,
        receiverId: friend.id,
        message: "Let's be friends!"
      });
      
      if (result.success) {
        console.log('Friend request sent successfully');
        // You might want to show a success notification here
      } else {
        console.error('Failed to send friend request:', result.error);
        // You might want to show an error notification here
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      // You might want to show an error notification here
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Store current values before clearing suggestions
    const currentDestination = form.destination;
    const currentUserLocation = form.userLocation;
    
    // Clear suggestions first
    setDestinationSuggestions([]);
    setUserLocationSuggestions([]);
    
    // Update last selected values
    setLastSelectedDestination(currentDestination);
    setLastSelectedUserLocation(currentUserLocation);

    if (!form.destination) {
      setError('Please enter a destination');
      return;
    }

    if (form.isCreator && form.role === 'passenger' && !form.userLocation) {
      setError('Please enter your pickup location');
      return;
    }

    try {
      // If a friend was selected, include their information
      const userData = {
        ...form,
        destination: currentDestination, // Use the stored destination
        ...(selectedFriend && {
          id: selectedFriend.id,
          photoURL: selectedFriend.photoURL,
          email: selectedFriend.email
        })
      };

      console.log('Submitting user data:', userData);
      await onSubmit(userData);
      
      // Reset form but keep destination
      onChange({ 
        target: { 
          name: 'name', 
          value: '' 
        } 
      });
      onChange({ 
        target: { 
          name: 'userLocation', 
          value: '' 
        } 
      });
      
      setError(null);
      setSelectedFriend(null); // Clear selected friend
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err.message || 'Failed to add participant');
    }
  };

  // Handle input focus to clear last selected values
  const handleInputFocus = (field) => {
    switch (field) {
      case 'destination':
        setLastSelectedDestination('');
        setDestinationSuggestions([]);
        break;
      case 'userLocation':
        setLastSelectedUserLocation('');
        setUserLocationSuggestions([]);
        break;
      default:
        break;
    }
  };

  // Update the suggestion item rendering to show distance
  const renderSuggestionItem = (suggestion, onClick) => (
    <li
      key={suggestion.place_id}
      className="suggestion-item"
      onClick={() => onClick(suggestion)}
      role="button"
    >
      <div className="suggestion-content">
        <div className="suggestion-name">{suggestion.display_name}</div>
        {suggestion.distance !== null && (
          <div className="suggestion-distance">
            {suggestion.distance < 1 
              ? `${Math.round(suggestion.distance * 1000)}m away`
              : `${suggestion.distance.toFixed(1)}km away`}
          </div>
        )}
      </div>
    </li>
  );

  // Add a new function to handle location button click
  const handleLocationButtonClick = () => {
    getUserLocation();
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeout.current) {
        clearTimeout(successTimeout.current);
      }
    };
  }, []);

  // Add a specific handler for role changes with detailed logging
  const handleRoleChange = (e) => {
    const { value } = e.target;
    console.log('Role change triggered:', {
      newRole: value,
      currentRole: creatorRole,
      event: e.target
    });

    // Call the parent's onChange with the correct event structure
    const eventObj = {
      target: {
        name: 'creatorRole',
        value: value
      }
    };
    console.log('Sending event to parent:', eventObj);
    
    try {
      onChange(eventObj);
      console.log('onChange called successfully');
    } catch (error) {
      console.error('Error in handleRoleChange:', error);
    }
  };

  // Add effect to monitor creatorRole changes
  useEffect(() => {
    console.log('creatorRole changed:', creatorRole);
  }, [creatorRole]);

  return (
    <div className="user-form-container">
      {error && (
        <div className="alert alert-danger" role="alert">
          <i className="fas fa-exclamation-circle me-2"></i>
          {error}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" role="alert">
          <i className="fas fa-check-circle me-2"></i>
          {successMessage}
        </div>
      )}

      {form.isCreator && (
        <div className="role-toggle-container">
          <div className="role-toggle">
            <input
              type="radio"
              id="driver-role"
              name="creatorRole"
              value="driver"
              checked={creatorRole === 'driver'}
              onChange={handleRoleChange}
              className="role-input"
              disabled={groupCreated}
              onClick={() => console.log('Driver radio clicked, current role:', creatorRole)}
            />
            <label 
              htmlFor="driver-role" 
              className="role-label"
              onClick={() => console.log('Driver label clicked, current role:', creatorRole)}
            >
              <i className="fas fa-car-side"></i>
              <span>Driver</span>
            </label>

            <input
              type="radio"
              id="passenger-role"
              name="creatorRole"
              value="passenger"
              checked={creatorRole === 'passenger'}
              onChange={handleRoleChange}
              className="role-input"
              disabled={groupCreated}
              onClick={() => console.log('Passenger radio clicked, current role:', creatorRole)}
            />
            <label 
              htmlFor="passenger-role" 
              className="role-label"
              onClick={() => console.log('Passenger label clicked, current role:', creatorRole)}
            >
              <i className="fas fa-user-friends"></i>
              <span>Passenger</span>
            </label>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="user-form">
        {form.isCreator && creatorRole === 'passenger' && (
          <div className="form-group">
            <label htmlFor="userLocation">Pickup Location</label>
            <div className="location-input-group">
            <input
              type="text"
              id="userLocation"
              name="userLocation"
              value={form.userLocation}
              onChange={onChange}
              onFocus={() => handleInputFocus('userLocation')}
              className="form-control"
              placeholder="Enter your pickup location"
              required
            />
              <button
                type="button"
                className="location-button"
                onClick={handleLocationButtonClick}
                title="Use current location"
              >
                <i className="fas fa-location-arrow"></i>
              </button>
            </div>
            {userLocationSuggestions.length > 0 && (
              <ul className="suggestions-list">
                {userLocationSuggestions.map(suggestion => 
                  renderSuggestionItem(suggestion, handleUserLocationSelect)
                )}
              </ul>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="destination">Destination</label>
          <input
            type="text"
            id="destination"
            name="destination"
            value={form.destination}
            onChange={onChange}
            onFocus={() => handleInputFocus('destination')}
            className="form-control"
            placeholder="Enter destination"
            required
          />
          {destinationSuggestions.length > 0 && (
            <ul className="suggestions-list">
              {destinationSuggestions.map(suggestion => 
                renderSuggestionItem(suggestion, handleDestinationSelect)
              )}
            </ul>
          )}
        </div>

        {/* Replace old invitation UI with friend system UI */}
        <div className="friends-section">
          <h3>Friends</h3>
          {isLoadingFriends ? (
            <div className="loading-friends">Loading friends...</div>
          ) : friendError ? (
            <div className="friend-error">{friendError}</div>
          ) : (
            <div className="friends-list">
              {friends.length === 0 ? (
                <div className="no-friends">No friends yet</div>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} className="friend-item">
                    <div className="friend-info">
                      <img 
                        src={friend.profile.photoURL || '/default-avatar.png'} 
                        alt={friend.profile.displayName} 
                        className="friend-avatar"
                      />
                      <div className="friend-details">
                        <span className="friend-name">{friend.profile.displayName}</span>
                        <span className="friend-email">{friend.profile.email}</span>
                      </div>
                    </div>
                    <div className="friend-status">
                      {friend.isOnline ? (
                        <span className="status-online">Online</span>
                      ) : (
                        <span className="status-offline">
                          Last seen: {friend.lastSeen?.toDate().toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          <button 
            type="button" 
            className="add-friend-button"
            onClick={() => setShowFriendModal(true)}
          >
            <i className="fas fa-user-plus"></i> Add Friend
          </button>
        </div>

        {/* Friend Selection Modal */}
        {showFriendModal && (
          <FriendSelectionModal
            onClose={() => setShowFriendModal(false)}
            onSelect={handleAddFriend}
            currentUserId={user?.uid}
          />
        )}

        {/* Location status for driver */}
        {creatorRole === 'driver' && (
          <div className="location-status mt-2">
            {isTrackingLocation ? (
              <div className="alert alert-success" role="alert">
                <i className="bi bi-geo-alt-fill me-2"></i>
                Location tracking active
              </div>
            ) : (
              <div className="alert alert-info" role="alert">
                <i className="bi bi-geo-alt me-2"></i>
                Waiting for location...
              </div>
            )}
          </div>
        )}
      </form>

      <div className="form-info">
        {form.isCreator && (
          <div className="alert alert-info">
            <i className="fas fa-info-circle"></i>
            {groupCreated 
              ? "Group has been created. Waiting for participants to join and provide their locations."
              : creatorRole === 'passenger' 
              ? "As a passenger, please provide your pickup location."
              : "As a driver, you'll be picking up passengers."}
          </div>
        )}
        {!form.isCreator && (
          <div className="alert alert-info">
            <i className="fas fa-info-circle"></i>
            {groupCreated
              ? "Group has been created. Please provide your pickup location."
              : "Adding a new participant. You can change their role later."}
          </div>
        )}
      </div>
    </div>
  );
}

// Update the styles
const styles = `
  .role-toggle-container {
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background-color: #f8f9fa;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .role-toggle {
    display: flex;
    background-color: #e9ecef;
    padding: 4px;
    border-radius: 8px;
    position: relative;
  }

  .role-input {
    display: none;
  }

  .role-label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
    color: #495057;
    position: relative;
    z-index: 1;
  }

  .role-label i {
    font-size: 1.1rem;
    transition: transform 0.2s ease;
  }

  .role-label:hover {
    color: #2196F3;
  }

  .role-label:hover i {
    transform: scale(1.1);
  }

  .role-input:checked + .role-label {
    color: #fff;
    background-color: #2196F3;
    box-shadow: 0 2px 4px rgba(33, 150, 243, 0.2);
  }

  .role-input:checked + .role-label i {
    transform: scale(1.1);
  }

  .role-input:disabled + .role-label {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #e9ecef;
    color: #6c757d;
  }

  .role-input:disabled + .role-label:hover {
    color: #6c757d;
  }

  .role-input:disabled + .role-label:hover i {
    transform: none;
  }

  .role-input:disabled:checked + .role-label {
    background-color: #90CAF9;
    color: #fff;
  }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export default UserForm;
