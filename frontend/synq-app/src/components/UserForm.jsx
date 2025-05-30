import { useEffect, useState, useRef } from 'react';
import '../styles/UserForm.css';
import FriendSelectionModal from './FriendSelectionModal';

function UserForm({ form, onChange, onSubmit, onDestinationChange, onUserLocationChange, creatorRole, existingParticipants = [] }) {
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

  // Function to get user's current location
  const getUserLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
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

  // Watch for changes in user coordinates
  useEffect(() => {
    getUserLocation();
    // Set up periodic location updates
    const locationInterval = setInterval(getUserLocation, 30000); // Update every 30 seconds
    return () => clearInterval(locationInterval);
  }, []);

  // Update suggestions for destination
  useEffect(() => {
    // Only show suggestions if:
    // 1. There is input
    // 2. The input is different from the last selected value
    // 3. The input is at least 3 characters
    // 4. The input is not exactly matching the last selected value
    if (!form.destination || 
        form.destination === lastSelectedDestination || 
        form.destination.length < 3 ||
        form.destination.trim() === lastSelectedDestination.trim()) {
      setDestinationSuggestions([]);
      return;
    }

    if (destinationTimeout.current) {
      clearTimeout(destinationTimeout.current);
    }

    destinationTimeout.current = setTimeout(async () => {
      try {
        const searchTerm = form.destination;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTerm)}&countrycodes=us&limit=10`
        );
        const data = await res.json();
        const processedSuggestions = processSuggestions(data, userCoordinates, searchTerm);
        setDestinationSuggestions(processedSuggestions);
      } catch (error) {
        console.error("Error fetching destination suggestions:", error);
        setDestinationSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(destinationTimeout.current);
  }, [form.destination, lastSelectedDestination, userCoordinates]);

  // Update suggestions for user location
  useEffect(() => {
    // Only show suggestions if:
    // 1. There is input
    // 2. The input is different from the last selected value
    // 3. The input is at least 3 characters
    // 4. The input is not exactly matching the last selected value
    if (!form.userLocation || 
        form.userLocation === lastSelectedUserLocation || 
        form.userLocation.length < 3 ||
        form.userLocation.trim() === lastSelectedUserLocation.trim()) {
      setUserLocationSuggestions([]);
      return;
    }

    if (userLocationTimeout.current) {
      clearTimeout(userLocationTimeout.current);
    }

    userLocationTimeout.current = setTimeout(async () => {
      try {
        const searchTerm = form.userLocation;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTerm)}&countrycodes=us&limit=10`
        );
        const data = await res.json();
        const processedSuggestions = processSuggestions(data, userCoordinates, searchTerm);
        setUserLocationSuggestions(processedSuggestions);
      } catch (error) {
        console.error("Error fetching user location suggestions:", error);
        setUserLocationSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(userLocationTimeout.current);
  }, [form.userLocation, lastSelectedUserLocation, userCoordinates]);

  const handleDestinationSelect = (place) => {
    const selectedDestination = place.display_name;
    setLastSelectedDestination(selectedDestination);
    onChange({ target: { name: 'destination', value: selectedDestination } });
    setDestinationSuggestions([]); // Clear suggestions immediately
    if (destinationTimeout.current) {
      clearTimeout(destinationTimeout.current);
    }
    if (onDestinationChange) {
      onDestinationChange({ lat: parseFloat(place.lat), lng: parseFloat(place.lon) });
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

  const handleAddFriend = (friend) => {
    setSelectedFriend(friend);
    // Pre-fill the form with friend's information
    setForm(prev => ({
      ...prev,
      name: friend.displayName,
      userLocation: '',
      destination: ''
    }));
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
        ...(selectedFriend && {
          id: selectedFriend.id,
          photoURL: selectedFriend.photoURL,
          email: selectedFriend.email
        })
      };

      await onSubmit(userData);
      
      // Reset form but keep destination
      setForm(prev => ({
        ...prev,
        name: '',
        userLocation: '',
        destination: prev.destination // Keep the destination
      }));
      
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

  return (
    <div className="user-form-container">
      {form.isCreator && (
        <div className="role-toggle-container">
          <div className="role-toggle">
            <input
              type="radio"
              id="driver-role"
              name="creatorRole"
              value="driver"
              checked={creatorRole === 'driver'}
              onChange={onChange}
              className="role-input"
            />
            <label htmlFor="driver-role" className="role-label">
              <i className="fas fa-car-side"></i>
            </label>

            <input
              type="radio"
              id="passenger-role"
              name="creatorRole"
              value="passenger"
              checked={creatorRole === 'passenger'}
              onChange={onChange}
              className="role-input"
            />
            <label htmlFor="passenger-role" className="role-label">
              <i className="fas fa-user-friends"></i>
            </label>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="user-form">
        {form.isCreator && creatorRole === 'passenger' && (
          <div className="form-group">
            <label htmlFor="userLocation">Pickup Location</label>
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

        {form.isCreator && (
          <div className="form-group">
            <button 
              type="submit"
              className="add-friend-button primary"
              onClick={() => setIsModalOpen(true)}
            >
              <i className="fas fa-user-plus"></i>
              Add from Friends
            </button>
          </div>
        )}
      </form>

      <div className="form-info">
        {form.isCreator && (
          <div className="alert alert-info">
            <i className="fas fa-info-circle"></i>
            {creatorRole === 'passenger' 
              ? "As a passenger, please provide your pickup location."
              : "As a driver, you'll be picking up passengers."}
          </div>
        )}
        {!form.isCreator && (
          <div className="alert alert-info">
            <i className="fas fa-info-circle"></i>
            Adding a new participant. You can change their role later.
          </div>
        )}
      </div>

      <FriendSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddFriend={handleAddFriend}
        existingParticipants={existingParticipants}
      />
    </div>
  );
}

export default UserForm;
