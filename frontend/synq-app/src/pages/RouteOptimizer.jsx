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
      setUsers((prevUsers) => [...prevUsers, { 
        name, 
        address: coords.address, 
        lat: coords.lat, 
        lng: coords.lng, 
        color,
        role 
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
      
      // Get full addresses for all locations
      const [driverAddress, destinationAddress] = await Promise.all([
        // Get full address for driver location
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}&addressdetails=1`)
          .then(res => res.json())
          .then(data => data.display_name)
          .catch(() => 'Location not found'),
        
        // Get full address for destination
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${destination.lat}&lon=${destination.lng}&addressdetails=1`)
          .then(res => res.json())
          .then(data => data.display_name)
          .catch(() => 'Destination not found')
      ]);

      // Get full addresses for all passengers
      const passengerAddresses = await Promise.all(
        users.map(async (user) => {
          const fullAddress = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${user.lat}&lon=${user.lng}&addressdetails=1`
          )
            .then(res => res.json())
            .then(data => data.display_name)
            .catch(() => 'Location not found');
          
          return {
            ...user,
            fullAddress
          };
        })
      );

      // Create a new ride document in Firestore with full addresses
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
          status: 'pending' // pending, picked-up, completed
        })),
        destination: {
          location: destination,
          address: destinationAddress
        },
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        routeDetails: null, // Will be updated with actual route details
        groupId: null // Will be updated when we implement group functionality
      };

      console.log('Creating ride with data:', rideData);
      const rideRef = await addDoc(collection(db, 'rides'), rideData);
      console.log('Ride started with ID:', rideRef.id);
      
      // Navigate to dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Error starting ride:', error);
      alert('Failed to start ride. Please try again.');
    } finally {
      setIsStartingRide(false);
    }
  };

  return (
    <div className="container my-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Synq Route Optimizer</h1>
      </div>
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
          }
        }
      `}</style>
    </div>
  );
}

export default RouteOptimizer;
