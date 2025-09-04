import React, { useState, useEffect, useRef } from 'react';
import { useUserAuth } from '../services/auth';
import { getCurrentLocation, searchDestinations } from '../services/locationService';
import '../styles/UserForm.css';

function UserForm({ 
  form, 
  onChange, 
  onSubmit, 
  onDestinationChange,
  onUserLocationChange,
  creatorRole,
  existingParticipants,
  isTrackingLocation,
  rideId,
  groupCreated,
  hideNameInput = false,
  onSetDestinationFromMap = null,
  onLocationTrackingToggle = null,
  isLocationLoading = false,
  onSetManualLocationFromMap = null,
  locationStatusMessage = null
}) {
  const { user } = useUserAuth();
  const isControlled = form !== undefined && onChange !== undefined;
  const [formData, setFormData] = useState({
    name: user?.displayName || '',
    address: '',
    destination: '',
    role: 'passenger',
    userLocation: '',
    isCreator: creatorRole === 'driver',
    ...form
  });

  const [locationError, setLocationError] = useState(null);
  
  // Address suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const suggestionsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Separate state for pickup location suggestions
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [isSearchingPickup, setIsSearchingPickup] = useState(false);
  const pickupSuggestionsRef = useRef(null);
  const pickupSearchTimeoutRef = useRef(null);

  // Separate state for starting location suggestions
  const [startingLocationSuggestions, setStartingLocationSuggestions] = useState([]);
  const [showStartingLocationSuggestions, setShowStartingLocationSuggestions] = useState(false);
  const [isSearchingStartingLocation, setIsSearchingStartingLocation] = useState(false);
  const startingLocationSuggestionsRef = useRef(null);
  const startingLocationSearchTimeoutRef = useRef(null);

  // Debounced search function
  const debouncedSearch = (query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      if (query && query.length >= 2) {
        setIsSearching(true);
        try {
          const results = await searchDestinations(query, { limit: 5 });
          setSuggestions(results);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error searching addresses:', error);
          setSuggestions([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300); // 300ms debounce
  };

  // Handle destination input change
  const handleDestinationChange = (e) => {
    const { value } = e.target;
    
    // Update form state
    if (isControlled) {
      onChange(e);
    } else {
      setFormData(prev => ({
        ...prev,
        destination: value
      }));
    }

    // Trigger search for autocomplete
    debouncedSearch(value);
    
    // Notify parent of destination changes
    onDestinationChange?.(value);
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion) => {
    const selectedAddress = suggestion.display_name;
    
    // Update form state
    if (isControlled) {
      onChange({ target: { name: 'destination', value: selectedAddress } });
    } else {
      setFormData(prev => ({
        ...prev,
        destination: selectedAddress
      }));
    }

    // Notify parent with coordinates
    onDestinationChange?.({
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
      address: selectedAddress
    });

    // Hide suggestions
    setShowSuggestions(false);
    setSuggestions([]);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
      if (pickupSuggestionsRef.current && !pickupSuggestionsRef.current.contains(event.target)) {
        setShowPickupSuggestions(false);
      }
      if (startingLocationSuggestionsRef.current && !startingLocationSuggestionsRef.current.contains(event.target)) {
        setShowStartingLocationSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (pickupSearchTimeoutRef.current) {
        clearTimeout(pickupSearchTimeoutRef.current);
      }
      if (startingLocationSearchTimeoutRef.current) {
        clearTimeout(startingLocationSearchTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (isControlled) {
      onChange(e);
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Notify parent of destination changes
    if (name === 'destination') {
      onDestinationChange?.(value);
    }
  };

  const handleRoleChange = (e) => {
    const { value } = e.target;
    if (isControlled) {
      onChange({ target: { name: 'role', value } });
    } else {
      setFormData(prev => ({
        ...prev,
        role: value
      }));
    }
  };

  const handleGetCurrentLocation = async () => {
    try {
      setLocationError(null);

      const location = await getCurrentLocation();
      if (!location) {
        throw new Error('Could not get current location');
      }

      const { lat, lng, address } = location;
      if (isControlled) {
        onChange({ target: { name: 'userLocation', value: address || `${lat}, ${lng}` } });
        onChange({ target: { name: 'address', value: address || `${lat}, ${lng}` } });
      } else {
        setFormData(prev => ({
          ...prev,
          userLocation: address || `${lat}, ${lng}`,
          address: address || `${lat}, ${lng}`
        }));
      }

      onUserLocationChange?.(location);
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError(error.message);
    }
  };

  // Handle pickup location change with suggestions
  const handlePickupLocationChange = (e) => {
    const { value } = e.target;
    
    // Update form state
    if (isControlled) {
      onChange(e);
    } else {
      setFormData(prev => ({
        ...prev,
        userLocation: value
      }));
    }

    // Trigger search for autocomplete with separate timeout
    if (pickupSearchTimeoutRef.current) {
      clearTimeout(pickupSearchTimeoutRef.current);
    }

    if (!value || value.length < 2) {
      setPickupSuggestions([]);
      setShowPickupSuggestions(false);
      return;
    }

    pickupSearchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearchingPickup(true);
        const results = await searchDestinations(value, { limit: 5 });
        setPickupSuggestions(results);
        setShowPickupSuggestions(true);
      } catch (error) {
        console.error('Error searching addresses:', error);
        setPickupSuggestions([]);
      } finally {
        setIsSearchingPickup(false);
      }
    }, 300);
    
    // Notify parent of pickup location changes
    onUserLocationChange?.(value);
  };

  // Handle pickup location suggestion selection
  const handlePickupLocationSuggestionSelect = (suggestion) => {
    const selectedAddress = suggestion.display_name;
    
    // Update form state
    if (isControlled) {
      onChange({ target: { name: 'userLocation', value: selectedAddress } });
    } else {
      setFormData(prev => ({
        ...prev,
        userLocation: selectedAddress
      }));
    }

    // Notify parent with coordinates
    onUserLocationChange?.({
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
      address: selectedAddress
    });

    // Hide suggestions
    setShowPickupSuggestions(false);
    setPickupSuggestions([]);
  };

  // Handle starting location change with suggestions
  const handleStartingLocationChange = (e) => {
    const { value } = e.target;
    
    // Update form state
    if (isControlled) {
      onChange(e);
    } else {
      setFormData(prev => ({
        ...prev,
        startingLocation: value
      }));
    }

    // Trigger search for autocomplete with separate timeout
    if (startingLocationSearchTimeoutRef.current) {
      clearTimeout(startingLocationSearchTimeoutRef.current);
    }

    if (!value || value.length < 2) {
      setStartingLocationSuggestions([]);
      setShowStartingLocationSuggestions(false);
      return;
    }

    startingLocationSearchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearchingStartingLocation(true);
        const results = await searchDestinations(value, { limit: 5 });
        setStartingLocationSuggestions(results);
        setShowStartingLocationSuggestions(true);
      } catch (error) {
        console.error('Error searching addresses:', error);
        setStartingLocationSuggestions([]);
      } finally {
        setIsSearchingStartingLocation(false);
      }
    }, 300);
    
    // Notify parent of starting location changes
    onUserLocationChange?.(value);
  };

  // Handle starting location suggestion selection
  const handleStartingLocationSuggestionSelect = (suggestion) => {
    const selectedAddress = suggestion.display_name;
    
    // Update form state
    if (isControlled) {
      onChange({ target: { name: 'startingLocation', value: selectedAddress } });
    } else {
      setFormData(prev => ({
        ...prev,
        startingLocation: selectedAddress
      }));
    }

    // Notify parent with coordinates
    onUserLocationChange?.({
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
      address: selectedAddress
    });

    // Hide suggestions
    setShowStartingLocationSuggestions(false);
    setStartingLocationSuggestions([]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isControlled) {
      onSubmit?.(form);
    } else {
      onSubmit?.(formData);
    }
  };

  return (
    <div className="user-form-container">
      <form onSubmit={handleSubmit} className="user-form">
        {!hideNameInput && (
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={form.name}
              onChange={onChange}
              className="form-control"
              placeholder="Enter your name"
              required
            />
          </div>
        )}

        {/* Role Selection */}
        <div className="form-group">
          <label>Your Role</label>
          <div className="role-toggle">
            <button
              type="button"
              className={`role-option ${form.role === 'driver' ? 'active' : ''}`}
              onClick={() => onChange({ target: { name: 'role', value: 'driver' } })}
            >
              <i className="fas fa-car"></i>
              Driver
            </button>
            <button
              type="button"
              className={`role-option ${form.role === 'passenger' ? 'active' : ''}`}
              onClick={() => onChange({ target: { name: 'role', value: 'passenger' } })}
            >
              <i className="fas fa-user"></i>
              Passenger
            </button>
          </div>
        </div>

        {/* Starting Location - Only show for drivers */}
        {form.role === 'driver' && (
          <div className="form-group">
            <label>Starting Location</label>
            
            {/* Starting Location Input */}
            <div className="input-group mb-2">
              <div className="input-with-suggestions" ref={startingLocationSuggestionsRef}>
                <input
                  type="text"
                  id="startingLocation"
                  name="startingLocation"
                  value={form.startingLocation || ''}
                  onChange={handleStartingLocationChange}
                  className={`form-control ${isTrackingLocation && locationStatusMessage && !locationStatusMessage.includes('blocked') && !locationStatusMessage.includes('failed') ? 'disabled' : ''}`}
                  placeholder={isTrackingLocation && locationStatusMessage && !locationStatusMessage.includes('blocked') && !locationStatusMessage.includes('failed') ? "Using tracked location" : "Enter your starting location"}
                  required
                  autoComplete="off"
                  disabled={isTrackingLocation && locationStatusMessage && !locationStatusMessage.includes('blocked') && !locationStatusMessage.includes('failed')}
                />
                {isSearchingStartingLocation && (
                  <div className="searching-indicator">
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Searching...</span>
                  </div>
                )}
                {showStartingLocationSuggestions && startingLocationSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {startingLocationSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleStartingLocationSuggestionSelect(suggestion)}
                      >
                        <i className="fas fa-map-marker-alt suggestion-icon"></i>
                        <div className="suggestion-content">
                          <div className="suggestion-address">{suggestion.display_name}</div>
                          <div className="suggestion-type">{suggestion.type}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Location Tracking Button */}
            <button
              type="button"
              className={`btn ${isTrackingLocation ? 'btn-outline-primary' : 'btn-primary'} w-100`}
              onClick={onLocationTrackingToggle}
              disabled={isLocationLoading}
            >
              {isLocationLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Starting Location Tracking...
                </>
              ) : isTrackingLocation ? (
                <>
                  <i className="fas fa-location-arrow-slash me-2"></i>
                  Stop Location Tracking
                </>
              ) : (
                <>
                  <i className="fas fa-location-arrow me-2"></i>
                  Start Location Tracking
                </>
              )}
            </button>
            
            {/* Manual Location Button - Show when tracking is blocked */}
            {onSetManualLocationFromMap && (
              <button
                type="button"
                className="btn btn-outline-secondary w-100 mt-2"
                onClick={onSetManualLocationFromMap}
                title="Set location manually if GPS is blocked by network"
              >
                <i className="fas fa-map-marker-alt me-2"></i>
                Set Location from Map
              </button>
            )}
            
            {/* Location Status Indicator */}
            {locationStatusMessage && (
              <div className={`location-status ${locationStatusMessage.includes('manual') || locationStatusMessage.includes('blocked') || locationStatusMessage.includes('failed') ? 'manual-mode' : ''} ${locationStatusMessage.includes('set manually') || locationStatusMessage.includes('set from map') ? 'success-mode' : ''}`}>
                <i className={`fas ${locationStatusMessage.includes('manual') || locationStatusMessage.includes('blocked') || locationStatusMessage.includes('failed') ? 'fa-map-marker-alt' : 'fa-info-circle'} ${locationStatusMessage.includes('set manually') || locationStatusMessage.includes('set from map') ? 'fa-check-circle' : ''}`}></i>
                <span>{locationStatusMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Pickup Location - Only show for passengers */}
        {creatorRole === 'passenger' && (
          <div className="form-group">
            <label htmlFor="userLocation">Pickup Location</label>
            <div className="input-group">
              <div className="input-with-suggestions" ref={pickupSuggestionsRef}>
                <input
                  type="text"
                  id="userLocation"
                  name="userLocation"
                  value={form.userLocation}
                  onChange={handlePickupLocationChange}
                  className="form-control"
                  placeholder="Enter your pickup location"
                  required
                  autoComplete="off"
                />
                {isSearchingPickup && (
                  <div className="searching-indicator">
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Searching...</span>
                  </div>
                )}
                {showPickupSuggestions && pickupSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {pickupSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="suggestion-item"
                        onClick={() => handlePickupLocationSuggestionSelect(suggestion)}
                      >
                        <i className="fas fa-map-marker-alt suggestion-icon"></i>
                        <div className="suggestion-content">
                          <div className="suggestion-address">{suggestion.display_name}</div>
                          <div className="suggestion-type">{suggestion.type}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={handleGetCurrentLocation}
                disabled={isTrackingLocation}
              >
                <i className="fas fa-location-arrow"></i>
              </button>
            </div>
            {isTrackingLocation && (
              <small className="text-info">
                <i className="fas fa-info-circle"></i>
                Using your current location
              </small>
            )}
          </div>
        )}

        {/* Destination Input */}
        <div className="form-group">
          <label>Destination</label>
          <div className="destination-input-container" ref={suggestionsRef}>
            <input
              type="text"
              name="destination"
              value={form.destination}
              onChange={handleDestinationChange}
              className="form-control"
              placeholder="Enter destination"
              required
              autoComplete="off"
            />
            {isSearching && (
              <div className="searching-indicator">
                <i className="fas fa-spinner fa-spin"></i>
                <span>Searching...</span>
              </div>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="suggestion-item"
                    onClick={() => handleSuggestionSelect(suggestion)}
                  >
                    <i className="fas fa-map-marker-alt suggestion-icon"></i>
                    <div className="suggestion-content">
                      <div className="suggestion-address">{suggestion.display_name}</div>
                      <div className="suggestion-type">{suggestion.type}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// Add new styles
const styles = `
  .user-form-container {
    background: #ffffff;
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid #eef2f7;
  }

  .user-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 500;
    color: #1e293b;
    font-size: 0.875rem;
  }

  .form-control {
    padding: 0.75rem 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .form-control:focus {
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
  }

  .form-control.disabled {
    background-color: #f8f9fa;
    color: #6c757d;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .form-control.disabled:focus {
    border-color: #e2e8f0;
    box-shadow: none;
  }

  .input-group {
    display: flex;
    gap: 0.5rem;
  }

  .input-group .form-control {
    flex: 1;
  }

  .input-group .btn {
    padding: 0.75rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .input-group .btn:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
  }

  .role-selection {
    margin-bottom: 0.5rem;
  }

  .role-toggle {
    display: flex;
    gap: 0.5rem;
    background: #f8fafc;
    padding: 0.25rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .role-option {
    flex: 1;
    padding: 0.75rem;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: #64748b;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .role-option:hover {
    color: #1e293b;
    background: #f1f5f9;
  }

  .role-option.active {
    background: #2196F3;
    color: #ffffff;
    box-shadow: 0 2px 4px rgba(33, 150, 243, 0.2);
  }

  .role-option i {
    font-size: 1rem;
  }

  .submit-button {
    width: 100%;
    padding: 0.875rem;
    border-radius: 8px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
    margin-top: 0.5rem;
  }

  .submit-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(33, 150, 243, 0.15);
  }

  .submit-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .text-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #2196F3;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .text-info i {
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .user-form-container {
      padding: 1rem;
    }

    .role-option {
      padding: 0.625rem;
    }
  }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export default UserForm; 