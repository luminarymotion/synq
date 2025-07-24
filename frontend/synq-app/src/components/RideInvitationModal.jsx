import React, { useState, useEffect, useRef } from 'react';
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
    readyTime: '',
    locationSharing: true,
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [error, setError] = useState(null);
  
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
      locationData: rideDetails.location
    });
    
    try {
      // Use the onRSVPSubmit prop if provided, otherwise fall back to firebaseOperations
      if (onRSVPSubmit) {
        const rsvpData = {
          status: response,
          ...details,
          location: details?.location || rideDetails.location // Ensure location is included
        };
        
        console.log('RideInvitationModal - Calling onRSVPSubmit with:', rsvpData);
        await onRSVPSubmit(rsvpData);
        setSuccessMessage('Response submitted successfully!');
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
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

  if (!isOpen) return null;

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

            <div className="rsvp-actions">
              <h4>{isStatusChange ? 'Change your response:' : 'Will you join this ride?'}</h4>
              <div className="rsvp-buttons">
                <button 
                  className="rsvp-btn accept"
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

                <div className="form-group">
                  <label htmlFor="readyTime">Ready Time</label>
                  <input
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
                    rows="3"
                  />
                </div>
              </div>

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