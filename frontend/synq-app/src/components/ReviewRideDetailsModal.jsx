import React, { useState } from 'react';
import '../styles/ReviewRideDetailsModal.css';

function ReviewRideDetailsModal({ 
  isOpen, 
  onClose, 
  rideDetails, 
  onCreateRide,
  onBackToEdit 
}) {
  const [formData, setFormData] = useState({
    startTime: rideDetails?.startTime || '',
    destination: rideDetails?.destination || '',
    description: rideDetails?.description || '',
    carSeats: rideDetails?.carSeats || 0,
    shareInvites: rideDetails?.shareInvites || false,
    notes: rideDetails?.notes || ''
  });

  if (!isOpen) return null;

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateRide = () => {
    if (onCreateRide) {
      onCreateRide({
        ...rideDetails,
        ...formData
      });
    }
  };

  const handleBackToEdit = () => {
    if (onBackToEdit) {
      onBackToEdit(formData);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="review-ride-modal">
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Review Ride Details</h2>
          <button className="close-button" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {/* Start Time */}
          <div className="form-field">
            <label className="field-label">Start Time</label>
            <div className="input-container">
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => handleInputChange('startTime', e.target.value)}
                className="form-input"
                placeholder="mm/dd/yyyy --:--"
              />
              <i className="fas fa-calendar input-icon"></i>
            </div>
          </div>

          {/* Destination */}
          <div className="form-field">
            <label className="field-label">Destination</label>
            <input
              type="text"
              value={formData.destination}
              onChange={(e) => handleInputChange('destination', e.target.value)}
              className="form-input"
              placeholder="Enter destination"
            />
          </div>

          {/* Description and Car Seats Row */}
          <div className="form-row">
            <div className="form-field flex-grow">
              <label className="field-label">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="form-textarea"
                placeholder="Enter description"
                rows={3}
              />
            </div>
            <div className="form-field car-seats-field">
              <label className="field-label">Car Seats</label>
              <input
                type="number"
                value={formData.carSeats}
                onChange={(e) => handleInputChange('carSeats', parseInt(e.target.value) || 0)}
                className="form-input"
                min="0"
                max="10"
              />
            </div>
          </div>

          {/* Share Invites Toggle */}
          <div className="form-field">
            <div className="toggle-container">
              <label className="field-label">Share invites</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="shareInvites"
                  checked={formData.shareInvites}
                  onChange={(e) => handleInputChange('shareInvites', e.target.checked)}
                  className="toggle-input"
                />
                <label htmlFor="shareInvites" className="toggle-label"></label>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-field">
            <label className="field-label">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              className="form-textarea"
              placeholder="Enter additional notes"
              rows={3}
            />
          </div>

          {/* Participants Notification */}
          <div className="participants-notification">
            <span className="participants-text">0 participants will be notified</span>
          </div>

          {/* Action Buttons */}
          <div className="modal-actions">
            <button 
              className="back-to-edit-button"
              onClick={handleBackToEdit}
            >
              <i className="fas fa-pencil-alt"></i>
              Back to Edit
            </button>
            <button 
              className="create-ride-button"
              onClick={handleCreateRide}
            >
              <i className="fas fa-check"></i>
              Create Ride
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReviewRideDetailsModal; 