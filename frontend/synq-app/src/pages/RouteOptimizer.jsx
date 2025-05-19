// RouteOptimizer.jsx - Handles the route optimization functionality
import '../App.css';
import { useState } from 'react';
import UserForm from '../components/UserForm';
import MapView from '../components/MapView';
import UserTable from '../components/UserTable';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { createRide } from '../services/firebaseOperations';

function RouteOptimizer() {
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ 
    name: '', 
    address: '', 
    destination: '', 
    role: 'passenger',
    userLocation: '' 
  });
  const [destination, setDestination] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isStartingRide, setIsStartingRide] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdRideId, setCreatedRideId] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const geocodeAddress = async (address) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=us&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.length > 0) {
      const display_name = data[0].display_name;
      const nameParts = display_name.split(',');
      const establishmentName = nameParts.length > 1 ? nameParts[0].trim() : display_name;
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: establishmentName };
    }
    return null;
  };

  const addUser = async (e) => {
    e.preventDefault();
    const { name, address, role } = form;
    if (!name || !address) return;

    const coords = await geocodeAddress(address);
    if (coords) {
      const color = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
      // Generate a temporary ID for the passenger
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setUsers((prevUsers) => [...prevUsers, { 
        name, 
        address: coords.address, 
        lat: coords.lat, 
        lng: coords.lng, 
        color,
        role,
        tempId // Add temporary ID for tracking
      }]);
      setForm({ 
        name: '', 
        address: '', 
        destination: form.destination, 
        role: 'passenger',
        userLocation: form.userLocation 
      });
    } else {
      alert('Address not found!');
    }
  };

  const handleDelete = (index) => {
    const newUsers = users.filter((user, i) => i !== index);
    setUsers(newUsers);
  };

  const handleDestinationChange = (coords) => {
    setDestination(coords);
  };

  const handleUserLocationChange = async (address) => {
    const coords = await geocodeAddress(address);
    if (coords) {
      setUserLocation(coords);
    } else {
      alert('Location not found!');
    }
  };

  const handleStartRide = async () => {
    if (!userLocation || !destination || users.length === 0) {
      alert('Please add at least one passenger and set both start and destination locations');
      return;
    }

    try {
      setIsStartingRide(true);
      console.log('Starting ride creation process...');
      
      // Get full addresses for all locations
      console.log('Fetching addresses...');
      const [driverAddress, destinationAddress] = await Promise.all([
        // Get full address for driver location
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}&addressdetails=1`)
          .then(res => res.json())
          .then(data => data.display_name)
          .catch((error) => {
            console.error('Error getting driver address:', error);
            return 'Location not found';
          }),
        
        // Get full address for destination
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${destination.lat}&lon=${destination.lng}&addressdetails=1`)
          .then(res => res.json())
          .then(data => data.display_name)
          .catch((error) => {
            console.error('Error getting destination address:', error);
            return 'Destination not found';
          })
      ]);

      console.log('Driver address:', driverAddress);
      console.log('Destination address:', destinationAddress);

      // Get full addresses for all passengers
      console.log('Fetching passenger addresses...');
      const passengerAddresses = await Promise.all(
        users.map(async (user) => {
          try {
            const fullAddress = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${user.lat}&lon=${user.lng}&addressdetails=1`
            )
              .then(res => res.json())
              .then(data => data.display_name)
              .catch(() => 'Location not found');
            
            console.log(`Passenger ${user.name} address:`, fullAddress);
            return {
              ...user,
              fullAddress
            };
          } catch (error) {
            console.error(`Error getting address for passenger ${user.name}:`, error);
            return {
              ...user,
              fullAddress: 'Location not found'
            };
          }
        })
      );

      // Create a new ride document in Firestore with full addresses
      console.log('Preparing ride data...');
      const rideData = {
        driver: {
          uid: user.uid,
          name: user.displayName || 'Driver',
          location: userLocation,
          address: driverAddress
        },
        passengers: passengerAddresses.map(passenger => ({
          name: passenger.name,
          location: { lat: passenger.lat, lng: passenger.lng },
          address: passenger.fullAddress,
          status: 'pending',
          tempId: passenger.tempId
        })),
        destination: {
          location: destination,
          address: destinationAddress
        },
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        routeDetails: null
      };

      console.log('Creating ride with data:', rideData);
      const result = await createRide(rideData);
      console.log('Ride creation result:', result);

      if (result.success) {
        setCreatedRideId(result.rideId);
        setShowSuccessModal(true);
      } else {
        throw new Error(result.error?.message || 'Failed to create ride');
      }
    } catch (error) {
      console.error('Error starting ride:', error);
      alert(`Failed to start ride: ${error.message || 'Please try again.'}`);
    } finally {
      setIsStartingRide(false);
    }
  };

  return (
    <div className="container mt-4" style={{ 
      minHeight: 'calc(100vh - 200px)', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ width: '100%', maxWidth: '800px' }}>
        <UserForm 
          form={form} 
          onChange={handleChange} 
          onSubmit={addUser} 
          onDestinationChange={handleDestinationChange}
          onUserLocationChange={handleUserLocationChange}
        />
        <UserTable users={users} onDelete={handleDelete} />
        <MapView 
          users={users} 
          destination={destination}
          userLocation={userLocation}
          onSetDestinationFromMap={(coords) => setDestination(coords)}
        />
        
        <div className="start-ride-container">
          <button
            className="start-ride-button"
            onClick={handleStartRide}
            disabled={isStartingRide || !userLocation || !destination || users.length === 0}
          >
            {isStartingRide ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Starting Ride...
              </>
            ) : (
              <>
                <i className="bi bi-car-front me-2"></i>
                Start Ride
              </>
            )}
          </button>
          {(!userLocation || !destination || users.length === 0) && (
            <div className="start-ride-requirements">
              {!userLocation && <span>• Set your starting location</span>}
              {!destination && <span>• Set your destination</span>}
              {users.length === 0 && <span>• Add at least one passenger</span>}
            </div>
          )}
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="modal-backdrop" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050
          }}>
            <div className="modal-content" style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              zIndex: 1051,
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
              <div className="modal-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h5 className="modal-title" style={{ margin: 0 }}>Ride Created Successfully!</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/dashboard');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0.5rem'
                  }}
                >×</button>
              </div>
              <div className="modal-body" style={{ marginBottom: '20px' }}>
                <div className="text-center mb-4">
                  <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '3rem', color: '#28a745' }}></i>
                </div>
                <p className="text-center mb-3">Your ride has been created successfully!</p>
                <div className="alert alert-info" style={{
                  backgroundColor: '#e3f2fd',
                  border: '1px solid #90caf9',
                  borderRadius: '4px',
                  padding: '15px',
                  marginBottom: '15px'
                }}>
                  <strong>Ride ID:</strong> {createdRideId}
                </div>
                <p className="text-muted small text-center">
                  You can use this ID to reference your ride. It will also be visible in your rides list.
                </p>
              </div>
              <div className="modal-footer" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/dashboard');
                  }}
                  style={{
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#1976D2'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#2196F3'}
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .start-ride-container {
            margin-top: 2rem;
            text-align: center;
            padding: 1rem;
            background: linear-gradient(135deg, rgba(33, 150, 243, 0.1), rgba(0, 188, 212, 0.1));
            border-radius: 16px;
            border: 1px solid rgba(33, 150, 243, 0.2);
          }

          .start-ride-button {
            background: linear-gradient(45deg, #2196F3, #00BCD4);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 30px;
            font-weight: 700;
            font-size: 1.3em;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(33, 150, 243, 0.3);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 200px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            position: relative;
            overflow: hidden;
            width: 100%;
            max-width: 400px;
          }

          .start-ride-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(
              120deg,
              transparent,
              rgba(255, 255, 255, 0.2),
              transparent
            );
            transition: 0.5s;
          }

          .start-ride-button:hover:not(:disabled) {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(33, 150, 243, 0.4);
            background: linear-gradient(45deg, #1976D2, #0097A7);
          }

          .start-ride-button:hover:not(:disabled)::before {
            left: 100%;
          }

          .start-ride-button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }

          .start-ride-button:active:not(:disabled) {
            transform: translateY(1px);
            box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
          }

          .start-ride-requirements {
            margin-top: 1rem;
            color: #666;
            font-size: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            align-items: center;
          }

          .start-ride-requirements span {
            background: rgba(255, 255, 255, 0.8);
            padding: 0.25rem 1rem;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }

          @media (max-width: 768px) {
            .start-ride-button {
              width: 100%;
              padding: 14px 28px;
              font-size: 1.2em;
              max-width: none;
            }

            .container {
              padding: 1rem;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default RouteOptimizer;
