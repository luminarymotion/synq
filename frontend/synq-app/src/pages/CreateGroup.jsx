import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { createRide } from '../services/firebaseOperations';
import MapView from '../components/MapView';
import '../styles/CreateGroup.css';
import { MAPQUEST_SERVICE } from '../services/locationService';

function CreateGroup() {
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdRideId, setCreatedRideId] = useState(null);
  const [error, setError] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    destination: '',
    destinationCoords: null,
    userLocation: '',
    userLocationCoords: null,
    passengers: [],
    ridePreferences: {
      music: true,
      conversation: true,
      carType: 'any',
      maxPassengers: 4
    }
  });

  // Step content components
  const StepIndicator = () => (
    <div className="step-indicator">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className={`step ${currentStep >= step ? 'active' : ''}`}>
          <div className="step-number">{step}</div>
          <div className="step-label">
            {step === 1 && 'Destination'}
            {step === 2 && 'Your Location'}
            {step === 3 && 'Passengers'}
            {step === 4 && 'Preferences'}
          </div>
          {step < 4 && <div className="step-connector" />}
        </div>
      ))}
    </div>
  );

  const DestinationStep = () => {
    const [isGeocoding, setIsGeocoding] = useState(false);

    const handleDestinationSubmit = async (address) => {
      setIsGeocoding(true);
      try {
        const coords = await geocodeAddress(address);
        if (coords) {
          setFormData(prev => ({ 
            ...prev, 
            destinationCoords: coords,
            destination: coords.address 
          }));

          // If we have user location, calculate route immediately
          if (formData.userLocationCoords) {
            const route = await calculateRoute(formData.userLocationCoords, coords);
            if (route) {
              // Update the map with the new route
              const mapView = document.querySelector('.map-preview');
              if (mapView) {
                const mapComponent = mapView.querySelector('.map-container');
                if (mapComponent && mapComponent.__reactFiber$) {
                  const mapInstance = mapComponent.__reactFiber$.stateNode;
                  if (mapInstance && mapInstance.updateRoute) {
                    mapInstance.updateRoute(route);
                  }
                }
              }
            }
          }
        } else {
          alert('Destination not found. Please try again.');
        }
      } catch (error) {
        console.error('Error geocoding destination:', error);
        alert('Error finding destination. Please try again.');
      } finally {
        setIsGeocoding(false);
      }
    };

    return (
      <div className="step-content">
        <h2>Where are you headed?</h2>
        <p className="step-description">Enter your destination to start planning the ride</p>
        
        <div className="form-group">
          <div className="search-container">
            <i className="fas fa-map-marker-alt search-icon"></i>
            <input
              type="text"
              className="form-control"
              placeholder="Enter destination address..."
              value={formData.destination}
              onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
              onKeyPress={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  await handleDestinationSubmit(e.target.value);
                }
              }}
            />
            {isGeocoding && (
              <div className="geocoding-spinner">
                <i className="fas fa-spinner fa-spin"></i>
              </div>
            )}
          </div>
        </div>

        <div className="map-preview">
          <MapView
            destination={formData.destinationCoords}
            userLocation={formData.userLocationCoords}
            passengers={formData.passengers}
            onRouteUpdate={(route) => {
              console.log('Route updated:', route);
            }}
          />
        </div>

        <div className="step-actions">
          <button
            className="btn-next"
            onClick={() => setCurrentStep(2)}
            disabled={!formData.destinationCoords}
          >
            Next Step
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    );
  };

  const LocationStep = () => (
    <div className="step-content">
      <h2>Where are you starting from?</h2>
      <p className="step-description">Set your pickup location</p>
      
      <div className="form-group">
        <div className="search-container">
          <i className="fas fa-location-arrow search-icon"></i>
          <input
            type="text"
            className="form-control"
            placeholder="Enter your location..."
            value={formData.userLocation}
            onChange={(e) => setFormData(prev => ({ ...prev, userLocation: e.target.value }))}
            onKeyPress={async (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const coords = await geocodeAddress(e.target.value);
                if (coords) {
                  setFormData(prev => ({ 
                    ...prev, 
                    userLocationCoords: coords,
                    userLocation: coords.address 
                  }));
                } else {
                  alert('Location not found. Please try again.');
                }
              }
            }}
          />
        </div>
      </div>

      <div className="map-preview">
        <MapView
          destination={formData.destinationCoords}
          userLocation={formData.userLocationCoords}
          passengers={formData.passengers}
        />
      </div>

      <div className="step-actions">
        <button
          className="btn-back"
          onClick={() => setCurrentStep(1)}
        >
          <i className="fas fa-arrow-left"></i>
          Back
        </button>
        <button
          className="btn-next"
          onClick={() => setCurrentStep(3)}
          disabled={!formData.userLocationCoords}
        >
          Next Step
          <i className="fas fa-arrow-right"></i>
        </button>
      </div>
    </div>
  );

  const PassengersStep = () => {
    const [newPassenger, setNewPassenger] = useState({ name: '', address: '' });

    const addPassenger = async (e) => {
      e.preventDefault();
      if (!newPassenger.name || !newPassenger.address) return;

      const coords = await geocodeAddress(newPassenger.address);
      if (coords) {
        const color = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        setFormData(prev => ({
          ...prev,
          passengers: [...prev.passengers, {
            name: newPassenger.name,
            address: coords.address,
            lat: coords.lat,
            lng: coords.lng,
            color,
            tempId
          }]
        }));
        setNewPassenger({ name: '', address: '' });
      } else {
        alert('Address not found!');
      }
    };

    const removePassenger = (tempId) => {
      setFormData(prev => ({
        ...prev,
        passengers: prev.passengers.filter(p => p.tempId !== tempId)
      }));
    };

    return (
      <div className="step-content">
        <h2>Add Passengers</h2>
        <p className="step-description">Add the people joining your ride</p>

        <div className="passenger-form">
          <form onSubmit={addPassenger}>
            <div className="form-row">
              <div className="form-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Passenger name"
                  value={newPassenger.name}
                  onChange={(e) => setNewPassenger(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Pickup address"
                  value={newPassenger.address}
                  onChange={(e) => setNewPassenger(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <button type="submit" className="btn-add">
                <i className="fas fa-plus"></i>
                Add
              </button>
            </div>
          </form>
        </div>

        <div className="passengers-list">
          {formData.passengers.map((passenger) => (
            <div key={passenger.tempId} className="passenger-card">
              <div className="passenger-info">
                <div className="passenger-avatar" style={{ backgroundColor: passenger.color }}>
                  {passenger.name.charAt(0).toUpperCase()}
                </div>
                <div className="passenger-details">
                  <h4>{passenger.name}</h4>
                  <p>{passenger.address}</p>
                </div>
              </div>
              <button
                className="btn-remove"
                onClick={() => removePassenger(passenger.tempId)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          ))}
        </div>

        <div className="map-preview">
          <MapView
            destination={formData.destinationCoords}
            userLocation={formData.userLocationCoords}
            passengers={formData.passengers}
          />
        </div>

        <div className="step-actions">
          <button
            className="btn-back"
            onClick={() => setCurrentStep(2)}
          >
            <i className="fas fa-arrow-left"></i>
            Back
          </button>
          <button
            className="btn-next"
            onClick={() => setCurrentStep(4)}
          >
            Next Step
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    );
  };

  const PreferencesStep = () => (
    <div className="step-content">
      <h2>Ride Preferences</h2>
      <p className="step-description">Customize your ride experience</p>

      <div className="preferences-grid">
        <div className="preference-card">
          <div className="preference-header">
            <i className="fas fa-music"></i>
            <h3>Music</h3>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={formData.ridePreferences.music}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                ridePreferences: { ...prev.ridePreferences, music: e.target.checked }
              }))}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="preference-card">
          <div className="preference-header">
            <i className="fas fa-comments"></i>
            <h3>Conversation</h3>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={formData.ridePreferences.conversation}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                ridePreferences: { ...prev.ridePreferences, conversation: e.target.checked }
              }))}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="preference-card">
          <div className="preference-header">
            <i className="fas fa-car"></i>
            <h3>Car Type</h3>
          </div>
          <select
            className="form-control"
            value={formData.ridePreferences.carType}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              ridePreferences: { ...prev.ridePreferences, carType: e.target.value }
            }))}
          >
            <option value="any">Any</option>
            <option value="sedan">Sedan</option>
            <option value="suv">SUV</option>
            <option value="luxury">Luxury</option>
          </select>
        </div>

        <div className="preference-card">
          <div className="preference-header">
            <i className="fas fa-users"></i>
            <h3>Max Passengers</h3>
          </div>
          <input
            type="number"
            className="form-control"
            min="1"
            max="7"
            value={formData.ridePreferences.maxPassengers}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              ridePreferences: { ...prev.ridePreferences, maxPassengers: parseInt(e.target.value) }
            }))}
          />
        </div>
      </div>

      <div className="step-actions">
        <button
          className="btn-back"
          onClick={() => setCurrentStep(3)}
        >
          <i className="fas fa-arrow-left"></i>
          Back
        </button>
        <button
          className="btn-create"
          onClick={handleCreateRide}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner"></span>
              Creating Ride...
            </>
          ) : (
            <>
              <i className="fas fa-check"></i>
              Create Ride
            </>
          )}
        </button>
      </div>
    </div>
  );

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

  const handleCreateRide = async () => {
    if (!formData.destinationCoords || !formData.userLocationCoords || formData.passengers.length === 0) {
      alert('Please complete all required fields');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Get full addresses using MapQuest
      const [driverAddress, destinationAddress] = await Promise.all([
        MAPQUEST_SERVICE.getAddressFromCoords(formData.userLocationCoords.lat, formData.userLocationCoords.lng),
        MAPQUEST_SERVICE.getAddressFromCoords(formData.destinationCoords.lat, formData.destinationCoords.lng)
      ]);

      // Get passenger addresses
      const passengerAddresses = await Promise.all(
        formData.passengers.map(async (passenger) => {
          if (!passenger.userLocationCoords) return null;
          try {
            return await MAPQUEST_SERVICE.getAddressFromCoords(
              passenger.userLocationCoords.lat,
              passenger.userLocationCoords.lng
            );
          } catch (error) {
            console.error('Error getting passenger address:', error);
            return 'Location not found';
          }
        })
      );

      const rideData = {
        driver: {
          uid: user.uid,
          name: user.displayName || 'Driver',
          location: formData.userLocationCoords,
          address: driverAddress
        },
        passengers: passengerAddresses.map(address => ({
          name: formData.passengers[passengerAddresses.indexOf(address)].name,
          location: formData.passengers[passengerAddresses.indexOf(address)].userLocationCoords,
          address: address,
          status: 'pending',
          tempId: formData.passengers[passengerAddresses.indexOf(address)].tempId
        })),
        destination: {
          location: formData.destinationCoords,
          address: destinationAddress
        },
        preferences: formData.ridePreferences,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        routeDetails: null
      };

      const result = await createRide(rideData);
      
      if (result.success) {
        setCreatedRideId(result.rideId);
        setShowSuccessModal(true);
      } else {
        throw new Error(result.error?.message || 'Failed to create ride');
      }
    } catch (error) {
      console.error('Error creating ride:', error);
      setError('Failed to create ride group. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-group-container">
      <div className="create-group-content">
        <div className="create-group-header">
          <h1>Create New Ride</h1>
          <p className="subtitle">Plan your group ride in a few simple steps</p>
        </div>

        <StepIndicator />

        <div className="step-container">
          {currentStep === 1 && <DestinationStep />}
          {currentStep === 2 && <LocationStep />}
          {currentStep === 3 && <PassengersStep />}
          {currentStep === 4 && <PreferencesStep />}
        </div>

        {showSuccessModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Ride Created Successfully!</h5>
                <button 
                  type="button" 
                  className="modal-close" 
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/dashboard');
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              
              <div className="modal-body">
                <div className="success-icon">
                  <i className="fas fa-check-circle"></i>
                </div>
                <p className="success-message">Your ride has been created successfully!</p>
                <div className="ride-id-container">
                  <span className="ride-id-label">Ride ID:</span>
                  <span className="ride-id">{createdRideId}</span>
                </div>
                <p className="ride-id-note">
                  You can use this ID to reference your ride. It will also be visible in your rides list.
                </p>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="modal-button"
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/dashboard');
                  }}
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateGroup; 