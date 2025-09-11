import React, { useState, useEffect, useRef } from 'react';
<<<<<<< HEAD
=======
import {
  Box,
  Dialog,
  DialogContent,
  Typography,
  Button,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  FormControlLabel,
  Checkbox,
  Avatar
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  Check as CheckIcon,
  DirectionsCar as DriverIcon,
  Person as PassengerIcon,
  LocationOn as LocationIcon,
  LocationOff as LocationOffIcon,
  AccessTime as TimeIcon,
  Notes as NotesIcon,
  Group as GroupIcon
} from '@mui/icons-material';
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
import { respondToRideInvitation } from '../services/firebaseOperations';
import { searchDestinations } from '../services/locationService';
import '../styles/RideInvitationModal.css';

function RideInvitationModal({ 
  isOpen, 
  onClose, 
  ride, 
  inviter, 
  currentUserId,
  onRSVPSubmit 
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [rsvpStatus, setRsvpStatus] = useState(null);
  const [rideDetails, setRideDetails] = useState({
    pickupLocation: '',
    location: null,
    role: 'passenger',
    seatCapacity: 4,
    readyTime: '',
    live_location_consent: 'never', // NEW - granular location sharing control
    locationSharing: false, // Keep for backward compatibility, default to false
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [error, setError] = useState(null);
  
  // Debug: Log when modal opens/closes
  useEffect(() => {
    console.log('🔵 RideInvitationModal: Modal state changed:', {
      isOpen,
      showDetailsModal,
      selectedResponse,
      isSubmitting
    });
  }, [isOpen, showDetailsModal, selectedResponse, isSubmitting]);

  // Debug: Log when component mounts/unmounts
  useEffect(() => {
    console.log('🔵 RideInvitationModal: Component mounted');
    return () => {
      console.log('🔵 RideInvitationModal: Component unmounted');
    };
  }, []);
  
  // Address suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const suggestionsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Check if this is a status change (user already has a response)
  const isStatusChange = ride?.invitations?.[currentUserId]?.status && 
                        ride.invitations[currentUserId].status !== 'pending';
  const currentStatus = ride?.invitations?.[currentUserId]?.status;

  // Helper function to get invitation status text
  const getInvitationStatusText = (status) => {
    const texts = {
      pending: 'Pending Response',
      accepted: 'Accepted',
      declined: 'Declined',
      maybe: 'Considering'
    };
    return texts[status] || status;
  };

  // Debounced search for address suggestions
  const debouncedSearch = (query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await searchDestinations(query, { limit: 5 });
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error searching addresses:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Handle pickup location change with suggestions
  const handlePickupLocationChange = (value) => {
    setRideDetails(prev => ({
      ...prev,
      pickupLocation: value,
      location: null
    }));
    
    // Trigger search for autocomplete
    debouncedSearch(value);
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion) => {
    const selectedAddress = suggestion.name || suggestion.display_name || suggestion.address;
    console.log('RideInvitationModal - Selected suggestion:', suggestion);
    
    // Handle both 'lng' and 'lon' coordinate formats
    const longitude = suggestion.lng || suggestion.lon;
    const latitude = suggestion.lat;
    
    if (!latitude || !longitude) {
      console.error('RideInvitationModal - Invalid coordinates in suggestion:', suggestion);
      return;
    }
    
    const newRideDetails = {
      ...rideDetails,
      pickupLocation: selectedAddress,
      location: {
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
        address: selectedAddress
      }
    };
    
    console.log('RideInvitationModal - Updated rideDetails with location:', newRideDetails);
    setRideDetails(newRideDetails);
    
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
    };
  }, []);

  // Pre-populate form with existing data for status changes
  useEffect(() => {
    if (isStatusChange && ride?.invitations?.[currentUserId]?.response) {
      const existingResponse = ride.invitations[currentUserId].response;
      setRideDetails({
        pickupLocation: existingResponse.pickupLocation || '',
        location: existingResponse.location || null,
        role: existingResponse.role || 'passenger',
        readyTime: existingResponse.readyTime || '',
        locationSharing: existingResponse.locationSharing !== false,
        notes: existingResponse.notes || ''
      });
    }
  }, [isStatusChange, ride, currentUserId]);

  useEffect(() => {
    if (isOpen) {
      console.log('RideInvitationModal opened with props:', {
        isOpen,
        ride: ride?.id,
        inviter: inviter?.displayName,
        currentUserId
      });
    }
  }, [isOpen, ride, inviter, currentUserId]);

  const handleRSVP = async (response) => {
    console.log('RSVP button clicked:', response);
    if (response === 'accepted') {
      setShowDetailsModal(true);
      setSelectedResponse(response);
    } else {
      // For decline/maybe, submit immediately
      await submitResponse(response);
    }
  };

  const submitResponse = async (response, details = null) => {
    setIsSubmitting(true);
    setError(null);
    
    console.log('RideInvitationModal - Submitting response:', {
      response,
      details,
      rideDetails,
      hasLocation: !!rideDetails.location,
      locationData: rideDetails.location,
      role: rideDetails.role,
      seatCapacity: rideDetails.seatCapacity
    });
    
    try {
      // Use the onRSVPSubmit prop if provided, otherwise fall back to firebaseOperations
      if (onRSVPSubmit) {
<<<<<<< HEAD
        const rsvpData = {
          status: response,
          ...details,
          location: details?.location || rideDetails.location // Ensure location is included
=======
        console.log('🔵 RideInvitationModal: Using onRSVPSubmit prop');
        console.log('🔵 RideInvitationModal: onRSVPSubmit function:', typeof onRSVPSubmit);
        
        // Clean location data before submission
        let cleanedRideDetails = { ...rideDetails };
        if (cleanedRideDetails.location) {
          if (cleanedRideDetails.location.lng === undefined || 
              cleanedRideDetails.location.lat === undefined ||
              cleanedRideDetails.location.lng === null || 
              cleanedRideDetails.location.lat === null) {
            console.warn('Invalid location data detected, removing location before submission:', cleanedRideDetails.location);
            delete cleanedRideDetails.location;
          }
        }
        
        const rsvpData = {
          status: response,
          ...details,
          location: details?.location || cleanedRideDetails.location, // Use cleaned location
          pickupLocation: cleanedRideDetails.pickupLocation,
          readyTime: cleanedRideDetails.readyTime,
          live_location_consent: cleanedRideDetails.live_location_consent, // NEW - granular location sharing
          locationSharing: cleanedRideDetails.locationSharing, // Keep for backward compatibility
          notes: cleanedRideDetails.notes,
          role: cleanedRideDetails.role,
          seatCapacity: cleanedRideDetails.seatCapacity
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        };
        
        console.log('🔵 RideInvitationModal: Calling onRSVPSubmit with:', rsvpData);
        console.log('🔵 RideInvitationModal: RSVP Data details:', {
          status: rsvpData.status,
          role: rsvpData.role,
          seatCapacity: rsvpData.seatCapacity,
          location: rsvpData.location,
          pickupLocation: rsvpData.pickupLocation,
          locationSharing: rsvpData.locationSharing,
          readyTime: rsvpData.readyTime,
          notes: rsvpData.notes
        });
        
        await onRSVPSubmit(rsvpData);
        setSuccessMessage('Response submitted successfully!');
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        console.log('🔵 RideInvitationModal: No onRSVPSubmit prop, using fallback');
        // Fallback to firebaseOperations
        const result = await respondToRideInvitation(
          ride.id, 
          currentUserId, 
          response, 
          details
        );
        
        if (result.success) {
          setSuccessMessage(result.message);
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          setError(result.error || 'Failed to submit response');
        }
      }
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      setError('Failed to submit response. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDetailsChange = (field, value) => {
    setRideDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleBack = () => {
    setShowDetailsModal(false);
    setSelectedResponse(null);
  };

<<<<<<< HEAD
  if (!isOpen) return null;
=======
  const handleClose = () => {
    setErrors({});
    setError(null);
    setSuccessMessage(null);
    onClose();
  };

  const handlePickupLocationChange = (value) => {
    // If user is typing (not selecting from suggestions), store as string
    setRideDetails(prev => ({
      ...prev,
      pickupLocation: value
    }));
  };

  const handleSuggestionSelect = (suggestion) => {
    console.log('🔵 Suggestion selected:', suggestion);
    
    // Validate location data before setting it
    const hasValidLocation = suggestion.lat !== undefined && 
                            suggestion.lng !== undefined && 
                            suggestion.lat !== null && 
                            suggestion.lng !== null;
    
    if (!hasValidLocation) {
      console.warn('Invalid location data in suggestion, not setting location:', suggestion);
    }
    
    setRideDetails(prev => ({
      ...prev,
      pickupLocation: hasValidLocation ? {
        lat: suggestion.lat,
        lng: suggestion.lng,
        address: suggestion.address || suggestion.display_name || suggestion.name
      } : suggestion.address || suggestion.display_name || suggestion.name,
      location: hasValidLocation ? {
        lat: suggestion.lat,
        lng: suggestion.lng,
        address: suggestion.address || suggestion.display_name || suggestion.name
      } : null
    }));
    setShowSuggestions(false);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!isOpen || !ride) {
    console.log('🔴 Modal not rendering - conditions:', { isOpen, hasRide: !!ride });
    return null;
  }

  console.log('🟢 Rendering RideInvitationModal:', {
    isOpen,
    showDetailsModal,
    selectedResponse,
    isSubmitting,
    rideId: ride?.id
  });
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

  return (
    <div className="modal-backdrop" style={{ pointerEvents: 'auto' }} onClick={onClose}>
      <div className="ride-invitation-modal" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* RSVP Decision Section */}
        <div className={`rsvp-section ${showDetailsModal ? 'slide-out' : ''}`}>
          <div className="modal-header">
            <h2>{isStatusChange ? 'Change RSVP' : 'Ride Invitation'}</h2>
            <button className="close-button" onClick={() => {
              console.log('Close button clicked');
              onClose();
            }}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          <div className="modal-body">
            {/* Current Status Display for Status Changes */}
            {isStatusChange && (
              <div className="current-status-display">
                <div className="status-info">
                  <i className="fas fa-info-circle"></i>
                  <span>Current Status: <strong>{getInvitationStatusText(currentStatus)}</strong></span>
                </div>
              </div>
            )}

            <div className="invitation-info">
              <div className="inviter-info">
                <div className="inviter-avatar">
                  {inviter?.photoURL ? (
                    <img src={inviter.photoURL} alt={inviter.displayName} />
                  ) : (
                    <div className="avatar-placeholder">
                      {inviter?.displayName?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
                <div className="inviter-details">
                  <h3>{inviter?.displayName || 'Someone'}</h3>
                  <p>invited you to join their ride</p>
                </div>
              </div>

              <div className="ride-summary">
                <div className="destination">
                  <i className="fas fa-map-marker-alt"></i>
                  <span>{ride?.destination?.address || 'Destination'}</span>
                </div>
                {ride?.createdAt && (
                  <div className="ride-date">
                    <i className="fas fa-calendar"></i>
                    <span>{new Date(ride.createdAt.toDate()).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

<<<<<<< HEAD
            <div className="rsvp-actions">
              <h4>{isStatusChange ? 'Change your response:' : 'Will you join this ride?'}</h4>
              <div className="rsvp-buttons">
                <button 
                  className="rsvp-btn accept"
=======
            {isStatusChange && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Current status: {getInvitationStatusText(currentStatus)}
                  </Alert>
                )}

                {/* Ride Start Status Notification */}
                {(() => {
                  const startStatusMessage = getRideStartStatusMessage();
                  if (startStatusMessage) {
                    return (
                      <Alert 
                        severity={startStatusMessage.type} 
                        sx={{ 
                          mb: 2,
                          '& .MuiAlert-message': {
                            fontSize: '0.9rem',
                            lineHeight: 1.4
                          }
                        }}
                      >
                        {startStatusMessage.message}
                      </Alert>
                    );
                  }
                  return null;
                })()}
              </Box>

              {/* RSVP Actions */}
              <Box className="rsvp-actions">
                <Typography variant="h6" sx={{ color: '#4e342e', fontWeight: 600, mb: 2, textAlign: 'center' }}>
                  {isStatusChange ? 'Change your response:' : 'Will you join this ride?'}
                </Typography>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button
                    variant="contained"
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
                  onClick={() => handleRSVP('accepted')}
                  disabled={isSubmitting}
                >
                  <i className="fas fa-check"></i>
                  Accept
                </button>
                <button 
                  className="rsvp-btn maybe"
                  onClick={() => handleRSVP('maybe')}
                  disabled={isSubmitting}
                >
                  <i className="fas fa-question"></i>
                  Maybe
                </button>
                <button 
                  className="rsvp-btn decline"
                  onClick={() => handleRSVP('declined')}
                  disabled={isSubmitting}
                >
                  <i className="fas fa-times"></i>
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Ride Details Section - Slides over RSVP */}
        {showDetailsModal && (
<<<<<<< HEAD
          <div className="details-section slide-in">
            <div className="modal-header">
              <button className="back-button" onClick={handleBack}>
                <i className="fas fa-arrow-left"></i>
              </button>
              <h2>Ride Details</h2>
              <button className="close-button" onClick={onClose}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="details-form">
                <div className="form-group">
                  <label htmlFor="pickupLocation">Pickup Location *</label>
                  <div className="input-with-suggestions" ref={suggestionsRef}>
                    <input
                      type="text"
                      id="pickupLocation"
                      value={rideDetails.pickupLocation}
=======
          <Box className="details-section">
            {console.log('🟠 Rendering Details section')}
            {/* Header */}
            <Box className="modal-header">
              <IconButton onClick={handleBack} className="back-button">
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h6" className="modal-title">
                Ride Details
              </Typography>
              <IconButton onClick={handleClose} className="close-button">
                <CloseIcon />
              </IconButton>
            </Box>

            {/* Form */}
            <Box className="modal-body">
              <Box className="form-container" sx={{ pt: 2 }}>
                {/* Ride Start Status Notification */}
                {(() => {
                  const startStatusMessage = getRideStartStatusMessage();
                  if (startStatusMessage) {
                    return (
                      <Alert 
                        severity={startStatusMessage.type} 
                        sx={{ 
                          mb: 3,
                          '& .MuiAlert-message': {
                            fontSize: '0.9rem',
                            lineHeight: 1.4
                          }
                        }}
                      >
                        {startStatusMessage.message}
                      </Alert>
                    );
                  }
                  return null;
                })()}

                {/* Pickup Location */}
                <Box sx={{ position: 'relative', mb: 3 }}>
                  <TextField
                    fullWidth
                    label="Starting Location"
                      value={typeof rideDetails.pickupLocation === 'string' ? rideDetails.pickupLocation : (rideDetails.pickupLocation?.address || '')}
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
                      onChange={(e) => handlePickupLocationChange(e.target.value)}
                      placeholder="Enter your pickup address"
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
                        {suggestions.map((suggestion, index) => {
                          // Determine the icon based on the suggestion type
                          const getIcon = () => {
                            if (suggestion.type === 'poi' || suggestion.category === 'poi') {
                              return 'fas fa-building';
                            } else if (suggestion.type === 'address' || suggestion.category === 'address') {
                              return 'fas fa-map-marker-alt';
                            } else if (suggestion.type === 'neighborhood' || suggestion.category === 'neighborhood') {
                              return 'fas fa-home';
                            } else {
                              return 'fas fa-map-marker-alt';
                            }
                          };

<<<<<<< HEAD
                          // Get the primary display text
                          const getPrimaryText = () => {
                            if (suggestion.name && suggestion.name !== suggestion.address) {
                              return suggestion.name;
                            }
                            return suggestion.address || suggestion.display_name || 'Unknown location';
                          };

                          // Get the secondary display text
                          const getSecondaryText = () => {
                            const parts = [];
                            
                            // Add address if different from name
                            if (suggestion.address && suggestion.address !== suggestion.name) {
                              parts.push(suggestion.address);
                            }
                            
                            // Add type/category
                            if (suggestion.type && suggestion.type !== 'poi') {
                              parts.push(suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1));
                            }
                            
                            // Add distance if available
                            if (suggestion.distance) {
                              parts.push(`${suggestion.distance.toFixed(1)} mi`);
                            }
                            
                            return parts.join(' • ');
                          };

                          return (
                            <div
                              key={`${suggestion.name}-${suggestion.lat}-${suggestion.lng}-${index}`}
                              className="suggestion-item"
                              onClick={() => handleSuggestionSelect(suggestion)}
                            >
                              <i className={`${getIcon()} suggestion-icon`}></i>
                              <div className="suggestion-content">
                                <div className="suggestion-address">
                                  {getPrimaryText()}
                                </div>
                                <div className="suggestion-type">
                                  {getSecondaryText()}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={rideDetails.locationSharing}
                      onChange={(e) => handleDetailsChange('locationSharing', e.target.checked)}
                    />
                    <span>Share my location during the ride</span>
                  </label>
                </div>
=======
                {/* Location Sharing */}
                <FormControl fullWidth size="small" className="form-field" sx={{ mb: 3 }}>
                  <InputLabel id="location-sharing-label" sx={{ color: '#4e342e', fontWeight: 600 }}>
                    Location Sharing
                  </InputLabel>
                  <Select
                    labelId="location-sharing-label"
                    value={rideDetails.live_location_consent}
                    label="Location Sharing"
                    onChange={(e) => {
                      const newConsent = e.target.value;
                      handleDetailsChange('live_location_consent', newConsent);
                      // Update backward compatibility field
                      handleDetailsChange('locationSharing', newConsent !== 'never');
                    }}
                    sx={{ 
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0c9b3' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#b08968' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a47551' }
                    }}
                  >
                    <MenuItem value="never">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocationOffIcon fontSize="small" />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Never share location</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Your location will not be shared with other participants
                          </Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                    <MenuItem value="on_pickup">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocationIcon fontSize="small" />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Share after pickup</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Location sharing activates when driver is within 100m of your pickup
                          </Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                    <MenuItem value="during_ride">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocationIcon fontSize="small" />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Share during ride</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Location sharing active from ride start until dropoff
                          </Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

                <div className="form-group">
                  <label htmlFor="role">Role</label>
                  <select
                    id="role"
                    value={rideDetails.role}
                    onChange={(e) => handleDetailsChange('role', e.target.value)}
                  >
                    <option value="passenger">Passenger</option>
                    <option value="driver">Driver</option>
                  </select>
                </div>

<<<<<<< HEAD
                <div className="form-group">
                  <label htmlFor="readyTime">Ready Time</label>
                  <input
=======
                {/* Seat Capacity - Only show when driver is selected */}
                {rideDetails.role === 'driver' && (
                  <FormControl fullWidth size="small" className="form-field" sx={{ mb: 3 }}>
                    <InputLabel id="seat-capacity-label" sx={{ color: '#4e342e', fontWeight: 600 }}>Seats Available</InputLabel>
                    <Select
                      labelId="seat-capacity-label"
                      value={rideDetails.seatCapacity !== undefined ? rideDetails.seatCapacity : 4}
                      label="Seats Available"
                      onChange={(e) => handleDetailsChange('seatCapacity', parseInt(e.target.value))}
                      sx={{ 
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0c9b3' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#b08968' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a47551' }
                      }}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map(seats => (
                        <MenuItem key={seats} value={seats}>
                          {seats}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {/* Ready Time */}
                <TextField
                  fullWidth
                  label="Ready Time"
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
                    type="time"
                    id="readyTime"
                    value={rideDetails.readyTime}
                    onChange={(e) => handleDetailsChange('readyTime', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="notes">Notes (Optional)</label>
                  <textarea
                    id="notes"
                    value={rideDetails.notes}
                    onChange={(e) => handleDetailsChange('notes', e.target.value)}
                    placeholder="Any special instructions or accessibility needs..."
<<<<<<< HEAD
                    rows="3"
                  />
                </div>
              </div>
=======
                  className="form-field"
                  size="small"
                  InputProps={{
                    startAdornment: <NotesIcon sx={{ color: '#666', mr: 1 }} />
                  }}
                  sx={{ 
                    '& .MuiInputLabel-root': { 
                      color: '#4e342e',
                      fontWeight: 600 
                    },
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': { borderColor: '#e0c9b3' },
                      '&:hover fieldset': { borderColor: '#b08968' },
                      '&.Mui-focused fieldset': { borderColor: '#a47551' }
                    }
                  }}
                />

                {/* Participants Table with Driver-Passenger Mapping */}
                {ride?.participants && Object.keys(ride.participants).length > 0 && (
                  <Box sx={{ mt: 4 }}>
                    <Typography variant="h6" sx={{ 
                      color: '#4e342e', 
                      fontWeight: 600, 
                      mb: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1
                    }}>
                      <GroupIcon />
                      Ride Participants
                    </Typography>
                    
                    {(() => {
                      const allParticipants = Object.entries(ride.participants).map(([uid, data]) => ({
                        uid,
                        ...data,
                        displayName: ride.invitations?.[uid]?.inviteeName || data.displayName || `User ${uid.slice(-4)}`
                      }));
                      
                      // Filter to only show participants relevant to current user
                      const currentUserParticipant = allParticipants.find(p => p.uid === currentUserId);
                      if (!currentUserParticipant) return null;
                      
                      let relevantParticipants = [];
                      
                      if (currentUserParticipant.role === 'driver') {
                        // If current user is driver, show passengers they're picking up
                        const drivers = allParticipants.filter(p => p.role === 'driver' && p.status === 'accepted');
                        const passengers = allParticipants.filter(p => p.role === 'passenger' && p.status === 'accepted');
                        
                        // Simple assignment logic: distribute passengers evenly among drivers
                        const getDriverPassengerMapping = () => {
                          if (drivers.length === 0 || passengers.length === 0) return {};
                          
                          const mapping = {};
                          drivers.forEach((driver, index) => {
                            const startIndex = Math.floor((passengers.length * index) / drivers.length);
                            const endIndex = Math.floor((passengers.length * (index + 1)) / drivers.length);
                            mapping[driver.uid] = passengers.slice(startIndex, endIndex);
                          });
                          return mapping;
                        };
                        
                        const driverPassengerMapping = getDriverPassengerMapping();
                        const currentUserPassengers = driverPassengerMapping[currentUserId] || [];
                        
                        relevantParticipants = [
                          ...drivers.filter(d => d.uid === currentUserId),
                          ...currentUserPassengers
                        ];
                      } else {
                        // If current user is passenger, show their assigned driver
                        const drivers = allParticipants.filter(p => p.role === 'driver' && p.status === 'accepted');
                        const passengers = allParticipants.filter(p => p.role === 'passenger' && p.status === 'accepted');
                        
                        // Simple assignment logic: distribute passengers evenly among drivers
                        const getDriverPassengerMapping = () => {
                          if (drivers.length === 0 || passengers.length === 0) return {};
                          
                          const mapping = {};
                          drivers.forEach((driver, index) => {
                            const startIndex = Math.floor((passengers.length * index) / drivers.length);
                            const endIndex = Math.floor((passengers.length * (index + 1)) / drivers.length);
                            mapping[driver.uid] = passengers.slice(startIndex, endIndex);
                          });
                          return mapping;
                        };
                        
                        const driverPassengerMapping = getDriverPassengerMapping();
                        const assignedDriver = drivers.find(driver => 
                          driverPassengerMapping[driver.uid]?.some(p => p.uid === currentUserId)
                        );
                        
                        relevantParticipants = [
                          ...(assignedDriver ? [assignedDriver] : []),
                          ...passengers.filter(p => p.uid === currentUserId)
                        ];
                      }
                      
                      const drivers = relevantParticipants.filter(p => p.role === 'driver');
                      const passengers = relevantParticipants.filter(p => p.role === 'passenger');
                      
                      // Create mapping for relevant participants only
                      const getDriverPassengerMapping = () => {
                        if (drivers.length === 0 || passengers.length === 0) return {};
                        
                        const mapping = {};
                        drivers.forEach((driver, index) => {
                          const startIndex = Math.floor((passengers.length * index) / drivers.length);
                          const endIndex = Math.floor((passengers.length * (index + 1)) / drivers.length);
                          mapping[driver.uid] = passengers.slice(startIndex, endIndex);
                        });
                        return mapping;
                      };
                      
                      const driverPassengerMapping = getDriverPassengerMapping();
                      
                      return (
                        <Box sx={{ 
                          background: 'rgba(248, 249, 250, 0.4)',
                          borderRadius: '12px',
                          border: '1px solid rgba(0, 0, 0, 0.04)',
                          p: 3
                        }}>
                          {/* Drivers Section */}
                          {drivers.length > 0 && (
                            <Box sx={{ mb: 3 }}>
                              <Typography variant="subtitle2" sx={{ 
                                color: '#4e342e', 
                                fontWeight: 600, 
                                mb: 2,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontSize: '0.8rem'
                              }}>
                                Drivers ({drivers.length})
                              </Typography>
                              
                              {drivers.map((driver) => (
                                <Box key={driver.uid} sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 2, 
                                  p: 2,
                                  mb: 2,
                                  background: 'white',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(0, 0, 0, 0.06)',
                                  borderLeft: '4px solid #4caf50'
                                }}>
                                  <Avatar 
                                    sx={{ 
                                      width: 40, 
                                      height: 40, 
                                      background: '#4caf50',
                                      color: 'white',
                                      fontWeight: 600
                                    }}
                                  >
                                    <DriverIcon />
                                  </Avatar>
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="body1" fontWeight={600} color="text.primary">
                                      {driver.displayName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {driver.seatCapacity !== undefined ? `${driver.seatCapacity} seats available` : 'Seat capacity not specified'}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="caption" color="text.secondary">
                                      Assigned passengers:
                                    </Typography>
                                    <Typography variant="body2" fontWeight={600} color="primary">
                                      {driverPassengerMapping[driver.uid]?.length || 0}
                                    </Typography>
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          )}
                          
                          {/* Passengers Section */}
                          {passengers.length > 0 && (
                            <Box>
                              <Typography variant="subtitle2" sx={{ 
                                color: '#4e342e', 
                                fontWeight: 600, 
                                mb: 2,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontSize: '0.8rem'
                              }}>
                                Passengers ({passengers.length})
                              </Typography>
                              
                              {passengers.map((passenger) => {
                                const assignedDriver = Object.entries(driverPassengerMapping).find(([_, passengers]) => 
                                  passengers.some(p => p.uid === passenger.uid)
                                )?.[0];
                                const driverName = drivers.find(d => d.uid === assignedDriver)?.displayName;
                                
                                return (
                                  <Box key={passenger.uid} sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 2, 
                                    p: 2,
                                    mb: 2,
                                    background: 'white',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(0, 0, 0, 0.06)',
                                    borderLeft: '4px solid #2196f3'
                                  }}>
                                    <Avatar 
                                      sx={{ 
                                        width: 40, 
                                        height: 40, 
                                        background: '#2196f3',
                                        color: 'white',
                                        fontWeight: 600
                                      }}
                                    >
                                      <PassengerIcon />
                                    </Avatar>
                                    <Box sx={{ flex: 1 }}>
                                      <Typography variant="body1" fontWeight={600} color="text.primary">
                                        {passenger.displayName}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {passenger.pickupLocation?.address || 'Pickup location pending'}
                                      </Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'right' }}>
                                      <Typography variant="caption" color="text.secondary">
                                        Assigned to:
                                      </Typography>
                                      <Typography variant="body2" fontWeight={600} color="primary">
                                        {driverName || 'Unassigned'}
                                      </Typography>
                                    </Box>
                                  </Box>
                                );
                              })}
                            </Box>
                          )}
                          
                          {/* Summary */}
                          <Box sx={{ 
                            mt: 3, 
                            p: 2, 
                            background: 'rgba(76, 175, 80, 0.1)', 
                            borderRadius: '8px',
                            border: '1px solid rgba(76, 175, 80, 0.2)'
                          }}>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                              <strong>{drivers.length}</strong> driver{drivers.length !== 1 ? 's' : ''} • <strong>{passengers.length}</strong> passenger{passengers.length !== 1 ? 's' : ''}
                              {drivers.length > 0 && passengers.length > 0 && (
                                <span> • Passengers automatically distributed among drivers</span>
                              )}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })()}
                  </Box>
                )}
              </Box>
            </Box>
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

              <div className="modal-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={handleBack}
                  disabled={isSubmitting}
                >
                  Back
                </button>
                <button 
                  className="btn btn-primary done-button"
                  onClick={() => {
                    console.log('RideInvitationModal - Done button clicked, rideDetails:', rideDetails);
                    console.log('RideInvitationModal - Location in rideDetails:', rideDetails.location);
                    submitResponse('accepted', rideDetails);
                  }}
                  disabled={isSubmitting || !rideDetails.pickupLocation}
                >
                  {isSubmitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i>
                      Done
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="modal-message success">
            <i className="fas fa-check-circle"></i>
            {successMessage}
          </div>
        )}

        {error && (
          <div className="modal-message error">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default RideInvitationModal; 