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
import '../styles/RouteOptimizer.css';

function RouteOptimizer() {
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [users, setUsers] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [form, setForm] = useState({ 
    name: '', 
    address: '', 
    destination: '', 
    role: 'passenger',
    userLocation: '',
    isCreator: true // Add this to track if this is the creator's entry
  });
  const [destination, setDestination] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isStartingRide, setIsStartingRide] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdRideId, setCreatedRideId] = useState(null);
  const [creatorRole, setCreatorRole] = useState('driver'); // Add this to track creator's role

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'creatorRole') {
      setCreatorRole(value);
      // If creator is driver, update their entry in users list
      if (value === 'driver' && userLocation) {
        setUsers(prevUsers => {
          const creatorEntry = prevUsers.find(u => u.isCreator);
          if (creatorEntry) {
            return prevUsers.map(u => 
              u.isCreator ? { ...u, role: 'driver' } : u
            );
          }
          return prevUsers;
        });
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
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

  const addUser = async (userData) => {
    try {
      // Validate required fields
      if (!userData.destination) {
        throw new Error('Destination is required');
      }

      if (userData.isCreator && userData.role === 'passenger' && !userData.userLocation) {
        throw new Error('Pickup location is required for passengers');
      }

      // Geocode the destination
      const destinationCoords = await geocodeAddress(userData.destination);
      if (!destinationCoords) {
        throw new Error('Could not find the destination address');
      }

      // If user is a passenger, geocode their location too
      let userLocationCoords = null;
      if (userData.isCreator && userData.role === 'passenger') {
        userLocationCoords = await geocodeAddress(userData.userLocation);
        if (!userLocationCoords) {
          throw new Error('Could not find the pickup location address');
        }
      }

      // Generate a random color for the user
      const color = `#${Math.floor(Math.random()*16777215).toString(16)}`;

      // Create the new user entry
      const newUser = {
        id: userData.id || `temp-${Date.now()}`, // Use friend's ID if available
        name: userData.name,
        role: userData.role || 'passenger',
        destination: userData.destination,
        destinationCoords,
        color,
        photoURL: userData.photoURL, // Include friend's photo if available
        email: userData.email, // Include friend's email if available
        ...(userLocationCoords && {
          userLocation: userData.userLocation,
          userLocationCoords
        })
      };

      // Update users state
      setUsers(prevUsers => [...prevUsers, newUser]);

      // If this is the first user (creator), update the destination in state
      if (users.length === 0) {
        setDestination(userData.destination);
      }

      // If this is a friend being added, you might want to send them a notification here
      if (userData.id) {
        // TODO: Implement notification sending
        console.log('Friend added:', userData);
      }

    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
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

  // Add this function to handle role changes
  const handleRoleChange = (tempId, newRole) => {
    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.tempId === tempId 
          ? { ...user, role: newRole }
          : user
      )
    );
  };

  const handleStartRide = async () => {
    if (!destination || users.length === 0) {
      alert('Please add at least one passenger and set the destination location');
      return;
    }

    // Find the driver (either creator or assigned driver)
    const driver = users.find(u => u.role === 'driver');
    if (!driver) {
      alert('Please assign a driver for the ride');
      return;
    }

    try {
      setIsStartingRide(true);
      console.log('Starting ride creation process...');
      
      // Get full addresses for all locations
      console.log('Fetching addresses...');
      const [driverAddress, destinationAddress] = await Promise.all([
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${driver.lat}&lon=${driver.lng}&addressdetails=1`)
          .then(res => res.json())
          .then(data => data.display_name)
          .catch((error) => {
            console.error('Error getting driver address:', error);
            return 'Location not found';
          }),
        
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${destination.lat}&lon=${destination.lng}&addressdetails=1`)
          .then(res => res.json())
          .then(data => data.display_name)
          .catch((error) => {
            console.error('Error getting destination address:', error);
            return 'Destination not found';
          })
      ]);

      // Get full addresses for all passengers
      console.log('Fetching passenger addresses...');
      const passengerAddresses = await Promise.all(
        users.filter(u => u.role === 'passenger').map(async (user) => {
          try {
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
          } catch (error) {
            console.error(`Error getting address for passenger ${user.name}:`, error);
            return {
              ...user,
              fullAddress: 'Location not found'
            };
          }
        })
      );

      // Create ride data with the selected driver
      const rideData = {
        driver: {
          uid: driver.isCreator ? user.uid : null, // Only set uid if creator is driver
          name: driver.name,
          location: { lat: driver.lat, lng: driver.lng },
          address: driverAddress,
          isCreator: driver.isCreator
        },
        passengers: passengerAddresses.map(passenger => ({
          name: passenger.name,
          location: { lat: passenger.lat, lng: passenger.lng },
          address: passenger.fullAddress,
          status: 'pending',
          tempId: passenger.tempId,
          isCreator: passenger.isCreator
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

  // Add click handler for sidebar toggle
  const handleSidebarClick = (e) => {
    // Only toggle if clicking the sidebar itself, not its children
    if (e.target === e.currentTarget) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  return (
    <div className="route-optimizer-container">
      <div className="route-optimizer-content">
        <div className="route-optimizer-header">
          <h1>Create New Ride</h1>
        </div>

        <div className="route-optimizer-main">
          {/* Sliding Sidebar */}
          <div 
            className={`route-optimizer-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}
            onClick={handleSidebarClick}
          >
            <div className="sidebar-handle">
              <button 
                className="sidebar-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSidebarOpen(!isSidebarOpen);
                }}
                aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                <i className={`fas fa-${isSidebarOpen ? 'chevron-left' : 'chevron-right'}`}></i>
              </button>
            </div>
            <div className="sidebar-content" onClick={(e) => e.stopPropagation()}>
              <UserForm 
                form={form} 
                onChange={handleChange} 
                onSubmit={addUser} 
                onDestinationChange={handleDestinationChange}
                onUserLocationChange={handleUserLocationChange}
                creatorRole={creatorRole}
                existingParticipants={users}
              />
              
              {/* Enhanced UserTable */}
              <div className="user-table-container">
                <h5>Participants</h5>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.tempId}>
                          <td>
                            <div className="d-flex align-items-center">
                              <i className={`fas fa-${user.role === 'driver' ? 'car' : 'user'} me-2`} 
                                 style={{ color: user.role === 'driver' ? '#2196F3' : '#6c757d' }}></i>
                              {user.name}
                              {user.isCreator && <span className="badge bg-info ms-2">You</span>}
                            </div>
                          </td>
                          <td>{user.address}</td>
                          <td>
                            <span className={`badge bg-${user.status === 'active' ? 'success' : 'secondary'}`}>
                              {user.status || 'Pending'}
                            </span>
                          </td>
                          <td>
                            {!user.isCreator && (
                              <div className="btn-group">
                                <button
                                  className="btn btn-sm btn-outline-primary me-1"
                                  onClick={() => handleRoleChange(user.tempId, user.role === 'driver' ? 'passenger' : 'driver')}
                                  title={`Change to ${user.role === 'driver' ? 'passenger' : 'driver'}`}
                                >
                                  <i className={`fas fa-${user.role === 'driver' ? 'user' : 'car'}`}></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleDelete(users.findIndex(u => u.tempId === user.tempId))}
                                  title="Remove participant"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="start-ride-container">
                <button
                  className={`start-ride-button ${(!destination || users.length === 0 || !users.some(u => u.role === 'driver')) ? 'disabled' : ''}`}
                  onClick={handleStartRide}
                  disabled={isStartingRide || !destination || users.length === 0 || !users.some(u => u.role === 'driver')}
                >
                  {isStartingRide ? (
                    <>
                      <span className="spinner"></span>
                      Starting Ride...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-car"></i>
                      Start Ride
                    </>
                  )}
                </button>
                
                {(!destination || users.length === 0 || !users.some(u => u.role === 'driver')) && (
                  <div className="start-ride-requirements">
                    {!destination && <span><i className="fas fa-flag-checkered"></i> Set destination</span>}
                    {users.length === 0 && <span><i className="fas fa-users"></i> Add at least one passenger</span>}
                    {!users.some(u => u.role === 'driver') && <span><i className="fas fa-user"></i> Assign a driver</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Map Container */}
          <div className="route-optimizer-map-wrapper">
            <div className="route-optimizer-map-container">
              <MapView 
                users={users} 
                destination={destination}
                userLocation={userLocation}
                onSetDestinationFromMap={(coords) => setDestination(coords)}
              />
            </div>
          </div>
        </div>

        {/* Success Modal */}
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

export default RouteOptimizer;
