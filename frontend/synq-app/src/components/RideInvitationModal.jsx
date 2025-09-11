import React, { useState, useEffect, useRef } from 'react';
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
  const [errors, setErrors] = useState({});
  
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
  // Helper function to get ride start status message
  const getRideStartStatusMessage = () => {
    if (!ride) return null;
    
    // Check if ride has started (immediate start)
    if (ride.startImmediately) {
      return {
        type: 'warning',
        message: '🚗 This ride has started immediately! Please respond quickly so the driver knows when to pick you up.',
        icon: 'directions_car'
      };
    }
    
    // Check if ride has a scheduled start time
    if (ride.startTime) {
      const startTime = new Date(ride.startTime);
      const now = new Date();
      const timeDiff = startTime - now;
      const minutesUntilStart = Math.floor(timeDiff / (1000 * 60));
      
      if (minutesUntilStart <= 0) {
        // Ride should have started by now
        return {
          type: 'warning',
          message: `⏰ This ride was scheduled to start at ${startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}. Please respond quickly!`,
          icon: 'schedule'
        };
      } else if (minutesUntilStart <= 30) {
        // Ride starting soon
        return {
          type: 'info',
          message: `⏰ This ride starts in ${minutesUntilStart} minutes at ${startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}. Please respond soon to help with planning.`,
          icon: 'schedule'
        };
      } else {
        // Ride scheduled for later
        return {
          type: 'info',
          message: `📅 This ride is scheduled to start at ${startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} on ${startTime.toLocaleDateString()}.`,
          icon: 'event'
        };
      }
    }
    
    // No start time specified
    return {
      type: 'info',
      message: '📋 Please respond to this ride invitation to help with planning.',
      icon: 'info'
    };
  };

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
  useEffect(() => {
    const searchAddresses = async (query) => {
      if (!query || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

      setIsSearching(true);
      try {
        const results = await searchDestinations(query);
        setSuggestions(results || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error searching addresses:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    };

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchAddresses(rideDetails.pickupLocation);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [rideDetails.pickupLocation]);

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
    console.log('🔵 RSVP button clicked:', response);
    console.log('🔵 Current state:', {
      isOpen,
      showDetailsModal,
      selectedResponse,
      isSubmitting
    });
    
    if (response === 'accepted') {
      console.log('🔵 Setting showDetailsModal to true');
      setShowDetailsModal(true);
      setSelectedResponse(response);
      console.log('🔵 State after setting showDetailsModal:', {
        showDetailsModal: true,
        selectedResponse: response
      });
    } else {
      console.log('🔵 Submitting immediate response for:', response);
      // For decline/maybe, submit immediately
      await submitResponse(response);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!rideDetails.pickupLocation.trim()) {
      newErrors.pickupLocation = 'Pickup location is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitResponse = async (response, details = null) => {
    // Validate form before submitting
    if (!validateForm()) {
      return;
    }
    
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
    setRideDetails(prev => {
      const newDetails = {
        ...prev,
        [field]: value
      };
      
      return newDetails;
    });
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleBack = () => {
    setShowDetailsModal(false);
    setSelectedResponse(null);
  };

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

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        className: 'ride-invitation-modal'
      }}
    >
      {console.log('🔵 Dialog rendering with props:', { isOpen, showDetailsModal })}
      <DialogContent className="modal-content">
        {/* RSVP Section */}
        {!showDetailsModal && (
          <Box className="rsvp-section">
            {console.log('🟡 Rendering RSVP section')}
            {/* Header */}
            <Box className="modal-header">
              <Typography variant="h6" className="modal-title">
                Ride Invitation
              </Typography>
              <IconButton onClick={handleClose} className="close-button">
                <CloseIcon />
              </IconButton>
            </Box>

            {/* Ride Info */}
            <Box className="modal-body">
              <Box className="ride-info">
                <Typography variant="h6" sx={{ color: '#4e342e', fontWeight: 600, mb: 2 }}>
                  {ride.title || 'Ride Invitation'}
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ color: '#666', mb: 0.5 }}>
                    From: {inviter?.displayName || 'Unknown'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#666' }}>
                    To: {ride.destination?.address || 'Unknown destination'}
                  </Typography>
                </Box>

                {ride.description && (
                  <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>
                    {ride.description}
                  </Typography>
                )}

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
                  onClick={() => handleRSVP('accepted')}
                  disabled={isSubmitting}
                    startIcon={<CheckIcon />}
                    sx={{
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: '#45a049'
                      },
                      py: 1.5,
                      fontSize: '1rem',
                      fontWeight: 600
                    }}
                  >
                  Accept
                  </Button>
                  
                  <Button
                    variant="outlined"
                  onClick={() => handleRSVP('maybe')}
                  disabled={isSubmitting}
                    sx={{
                      borderColor: '#FF9800',
                      color: '#FF9800',
                      '&:hover': {
                        borderColor: '#F57C00',
                        backgroundColor: 'rgba(255, 152, 0, 0.1)'
                      },
                      py: 1.5,
                      fontSize: '1rem',
                      fontWeight: 600
                    }}
                  >
                  Maybe
                  </Button>
                  
                  <Button
                    variant="outlined"
                  onClick={() => handleRSVP('declined')}
                  disabled={isSubmitting}
                    sx={{
                      borderColor: '#f44336',
                      color: '#f44336',
                      '&:hover': {
                        borderColor: '#d32f2f',
                        backgroundColor: 'rgba(244, 67, 54, 0.1)'
                      },
                      py: 1.5,
                      fontSize: '1rem',
                      fontWeight: 600
                    }}
                  >
                  Decline
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {/* Ride Details Section */}
        {showDetailsModal && (
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
                      onChange={(e) => handlePickupLocationChange(e.target.value)}
                    error={!!errors.pickupLocation}
                    helperText={errors.pickupLocation}
                      placeholder="Enter your pickup address"
                    className="form-field"
                    size="small"
                    InputProps={{
                      startAdornment: <LocationIcon sx={{ color: '#666', mr: 1 }} />
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
                  
                  {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                    <Box
                      ref={suggestionsRef}
                      sx={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        backgroundColor: 'white',
                        border: '1px solid #e0c9b3',
                        borderRadius: 1,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        maxHeight: 200,
                        overflow: 'auto'
                      }}
                    >
                      {suggestions.map((suggestion, index) => (
                        <Box
                              key={`${suggestion.name}-${suggestion.lat}-${suggestion.lng}-${index}`}
                              onClick={() => handleSuggestionSelect(suggestion)}
                          sx={{
                            p: 1.5,
                            cursor: 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                            '&:hover': {
                              backgroundColor: '#f5f5f5'
                            },
                            '&:last-child': {
                              borderBottom: 'none'
                            }
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 500, color: '#4e342e' }}>
                            {suggestion.name || suggestion.address || suggestion.display_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#666' }}>
                            {suggestion.address && suggestion.address !== suggestion.name ? suggestion.address : ''}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>

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

                {/* Role Selection */}
                <FormControl fullWidth size="small" className="form-field" sx={{ mb: 3 }}>
                  <InputLabel id="role-label" sx={{ color: '#4e342e', fontWeight: 600 }}>Role</InputLabel>
                  <Select
                    labelId="role-label"
                    value={rideDetails.role}
                    label="Role"
                    onChange={(e) => handleDetailsChange('role', e.target.value)}
                    sx={{ 
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0c9b3' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#b08968' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a47551' }
                    }}
                  >
                    <MenuItem value="passenger">
                      <Box display="flex" alignItems="center">
                        <PassengerIcon fontSize="small" />
                        <Typography variant="body2" sx={{ ml: 1 }}>Passenger</Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="driver">
                      <Box display="flex" alignItems="center">
                        <DriverIcon fontSize="small" />
                        <Typography variant="body2" sx={{ ml: 1 }}>Driver</Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

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
                    type="time"
                    value={rideDetails.readyTime}
                    onChange={(e) => handleDetailsChange('readyTime', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  className="form-field"
                  size="small"
                  InputProps={{
                    startAdornment: <TimeIcon sx={{ color: '#666', mr: 1 }} />
                  }}
                  sx={{ 
                    mb: 3,
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

                {/* Notes */}
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  multiline
                  rows={3}
                    value={rideDetails.notes}
                    onChange={(e) => handleDetailsChange('notes', e.target.value)}
                    placeholder="Any special instructions or accessibility needs..."
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

            {/* Actions */}
            <Box className="modal-actions">
              <Button
                variant="outlined"
                  onClick={handleBack}
                  disabled={isSubmitting}
                sx={{
                  borderColor: '#4e342e',
                  color: '#4e342e',
                  '&:hover': {
                    borderColor: '#a47551',
                    backgroundColor: 'rgba(164, 117, 81, 0.1)'
                  }
                }}
                >
                  Back
              </Button>
              
              <Button
                variant="contained"
                  onClick={() => {
                    console.log('RideInvitationModal - Done button clicked, rideDetails:', rideDetails);
                    console.log('RideInvitationModal - Location in rideDetails:', rideDetails.location);
                    submitResponse('accepted', rideDetails);
                  }}
                  disabled={isSubmitting || !rideDetails.pickupLocation}
                startIcon={isSubmitting ? <CircularProgress size={16} /> : <CheckIcon />}
                sx={{
                  backgroundColor: '#4e342e',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#a47551'
                  },
                  '&:disabled': {
                    backgroundColor: '#ccc'
                  }
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Done'}
              </Button>
            </Box>
          </Box>
        )}

        {/* Success/Error Messages */}
        {successMessage && (
          <Alert severity="success" sx={{ position: 'absolute', top: 16, left: 16, right: 16 }}>
            {successMessage}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ position: 'absolute', top: 16, left: 16, right: 16 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RideInvitationModal; 