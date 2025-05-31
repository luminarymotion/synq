// RouteOptimizer.jsx - Handles the route optimization functionality
import '../App.css';
import { useState, useEffect, useRef } from 'react';
import UserForm from '../components/UserForm';
import MapView from '../components/MapView';
import UserTable from '../components/UserTable';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { createRide, updateRideInvitation, deleteRideInvitation } from '../services/firebaseOperations';
import { calculateRoute } from '../components/routeService';
import '../styles/RouteOptimizer.css';
import { getCurrentLocation, MAPQUEST_SERVICE } from '../services/locationService';
import locationTrackingService, { useLocation } from '../services/locationTrackingService';


const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 1000,
  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }
};

function RouteOptimizer() {
  console.log('RouteOptimizer component initializing...');
  const navigate = useNavigate();
  const { user, error: authError } = useUserAuth();
  const mapRef = useRef(null);
  const locationWatchIdRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const destinationTimeoutRef = useRef(null);

  // Add a new state to track if we have a valid location
  const [hasValidLocation, setHasValidLocation] = useState(false);

  const {
    location,
    isTracking: isTrackingLocation,
    status: locationStatus,
    error: locationServiceError,
    startTracking,
    stopTracking
  } = useLocation({
    preset: 'realtime',
    updateFirebase: true,
    onLocationUpdate: (locationData) => {
      console.log('Location update received in RouteOptimizer:', locationData);
      const { latitude: lat, longitude: lng, accuracy, address } = locationData;
      
      // If we have valid coordinates, clear any errors and update state
      if (lat && lng) {
        setHasValidLocation(true);
        setLocationError(null);
      }
      
      // Update user location state
      const newLocation = { lat, lng, address, accuracy };
      setUserLocation(newLocation);
      
      // Update form state if needed
      if (creatorRole === 'driver') {
        setForm(prev => ({
          ...prev,
          userLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`
        }));
      }
      
      setLocationStatusMessage(`Location tracking active (accuracy: ${Math.round(accuracy)}m)`);
      
      // If we have a destination, recalculate route
      if (destination && mapRef.current) {
        const waypoints = [
          { location: newLocation, type: 'start' },
          { location: destination, type: 'destination' }
        ];
        
        calculateRoute(waypoints)
          .then(route => {
            if (route && mapRef.current) {
              mapRef.current.updateRoute(route);
            }
          })
          .catch(error => {
            console.error('Error recalculating route:', error);
          });
      }
    },
    onError: (errorMessage) => {
      console.error('Location tracking error:', errorMessage);
      // Only set error if we don't have a valid location
      if (!hasValidLocation) {
        setLocationError(errorMessage);
      }
      setLocationStatusMessage('Location tracking failed');
    },
    onStatusChange: (status) => {
      console.log('Location status changed:', status);
      switch (status) {
        case 'active':
          // Clear any existing errors when tracking becomes active
          setLocationError(null);
          setLocationStatusMessage('Location tracking active');
          break;
        case 'inactive':
          setLocationStatusMessage('Location tracking stopped');
          setUserLocation(null);
          setHasValidLocation(false); // Reset valid location state
          break;
        case 'error':
          // Only set error status if we don't have a valid location
          if (!hasValidLocation) {
            setLocationStatusMessage('Location tracking failed');
          }
          break;
        case 'offline':
          setLocationStatusMessage('Location tracking paused - offline');
          break;
        case 'syncing':
          setLocationStatusMessage('Syncing location data...');
          break;
      }
    }
  });

  // Group all useState hooks together at the top
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [form, setForm] = useState({ 
    name: '', 
    address: '', 
    destination: '', 
    role: 'passenger',
    userLocation: '',
    isCreator: true
  });
  const [destination, setDestination] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isStartingRide, setIsStartingRide] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdRideId, setCreatedRideId] = useState(null);
  const [creatorRole, setCreatorRole] = useState('driver');
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupCreated, setGroupCreated] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [invitationStatus, setInvitationStatus] = useState({
    isSending: false,
    sentCount: 0,
    totalCount: 0,
    errors: []
  });

  // Add hasDriver check
  const hasDriver = users.some(user => user.role === 'driver');

  // Move all useEffect hooks together
  useEffect(() => {
    console.log('RouteOptimizer useEffect running...');
    if (authError) {
      console.error('Auth error in RouteOptimizer:', authError);
      setError(authError);
      setIsLoading(false);
      return;
    }

    if (!user) {
      console.log('No user found, redirecting to login...');
      navigate('/login');
      return;
    }

    // Initialize component
    const initialize = async () => {
      try {
        console.log('Initializing RouteOptimizer for user:', user.uid);
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing RouteOptimizer:', err);
        setError(err);
        setIsLoading(false);
      }
    };

    initialize();
  }, [user, authError, navigate]);

  // Clean up notification timeouts
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  // Clean up location tracking
  useEffect(() => {
    return () => {
      locationTrackingService.stopTracking();
    };
  }, []);

  // Clean up the timeout on unmount
  useEffect(() => {
    return () => {
      if (destinationTimeoutRef.current) {
        clearTimeout(destinationTimeoutRef.current);
      }
    };
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div className="route-optimizer-loading">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="route-optimizer-error">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Error</h4>
          <p>{error.message}</p>
          <button 
            className="btn btn-outline-danger mt-2"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'creatorRole') {
      const newRole = value;
      setCreatorRole(newRole);
      
      // If changing from driver to passenger, stop location tracking
      if (creatorRole === 'driver' && newRole === 'passenger') {
        locationTrackingService.stopTracking();
        setIsTrackingLocation(false);
        setUserLocation(null);
      }
    } else if (name === 'destination') {
      // For destination input, just update the form state
      // Don't trigger geocoding until a suggestion is selected
      setForm(prev => ({
        ...prev,
        destination: value
      }));
      return; // Don't proceed with any other changes
    }
    
    // For all other fields, update form state normally
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getAddressFromCoords = async (lat, lng) => {
    try {
      return await MAPQUEST_SERVICE.getAddressFromCoords(lat, lng);
    } catch (error) {
      console.error('Error getting address from coordinates:', error);
      return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }
  };

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

  const addUser = async (userData) => {
    try {
      console.log('Adding user with data:', {
        userData,
        creatorRole,
        isCreator: userData.isCreator,
        currentDestination: destination
      });

      // Validate required fields with more descriptive error messages
      if (!userData.destination && !destination) {
        throw new Error('Please set a destination for the ride before adding participants');
      }

      // Use the destination from userData if provided, otherwise use the global destination
      const destinationToUse = userData.destination || destination;
      if (!destinationToUse) {
        throw new Error('Destination is required');
      }

      // If this is the creator being added as a driver, use their current location
      if (userData.isCreator && userData.role === 'driver' && userLocation) {
        console.log('Adding creator as driver with current location:', userLocation);
        userData.userLocationCoords = userLocation;
      }

      // If destinationToUse is a string, geocode it
      let destinationCoords;
      if (typeof destinationToUse === 'string') {
        destinationCoords = await geocodeAddress(destinationToUse);
      if (!destinationCoords) {
        throw new Error('Could not find the destination address');
        }
      } else {
        // If it's already an object with coordinates, use it directly
        destinationCoords = destinationToUse;
      }

      // If user is a passenger, geocode their location too
      let userLocationCoords = null;
      if (userData.isCreator && userData.role === 'passenger') {
        userLocationCoords = await geocodeAddress(userData.userLocation);
        if (!userLocationCoords) {
          throw new Error('Could not find the pickup location address');
        }
      }

      // If creator is driver, use their current location
      if (userData.isCreator && userData.role === 'driver' && userLocation) {
        userLocationCoords = userLocation;
      } else if (userData.isCreator && userData.role === 'passenger' && !userData.userLocation) {
        throw new Error('Pickup location is required for passengers');
      }

      // Generate a random color for the user
      const color = `#${Math.floor(Math.random()*16777215).toString(16)}`;

      // Create the new user entry with location
      const newUser = {
        id: userData.id || `temp-${Date.now()}`,
        name: userData.name,
        role: userData.role || 'passenger',
        destination: destinationCoords.address || destinationCoords,
        destinationCoords,
        color,
        photoURL: userData.photoURL,
        email: userData.email,
        isCreator: userData.isCreator,
        invitationStatus: userData.invitationStatus || 'pending',
        ...(userLocationCoords && {
          userLocation: userData.userLocation || 'Current Location',
          userLocationCoords
        })
      };

      // Update users state
      setUsers(prevUsers => [...prevUsers, newUser]);

      // If this is the first user (creator), update the destination in state
      if (users.length === 0) {
        setDestination(destinationCoords);
      }

      // If this is a friend being added, log it
      if (userData.id) {
        console.log('Friend added:', userData);
      }

    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
    }
  };

  const handleDelete = async (userId) => {
    try {
      const userIndex = users.findIndex(u => (u.id || u.tempId) === userId);
      if (userIndex !== -1) {
        const removedUser = users[userIndex];
        
        // If this is a real user (not a temporary ID) and we have a ride ID,
        // delete their invitation from Firebase
        if (removedUser.id && createdRideId) {
          try {
            // Delete the invitation from Firebase
            await deleteRideInvitation({
              rideId: createdRideId,
              inviteeId: removedUser.id
            });
            console.log('Invitation deleted for user:', removedUser.id);
          } catch (error) {
            console.error('Error deleting invitation:', error);
            // Continue with local state update even if Firebase update fails
          }
        }

        // Update local state
        const newUsers = [...users];
        newUsers.splice(userIndex, 1);
    setUsers(newUsers);
        
        showNotification(`${removedUser.name} removed from the group`);
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      showNotification('Failed to remove participant', 'error');
    }
  };

  const handleDestinationChange = async (coords) => {
    console.log('handleDestinationChange called with:', coords);
    
    // Validate coordinates
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      console.error('Invalid coordinates received:', coords);
      showNotification('Invalid destination location. Please try selecting the location again.', 'error');
      return;
    }

    try {
      // Get the address for the coordinates
      const address = await getAddressFromCoords(coords.lat, coords.lng);
      
      console.log('Destination coordinates and address:', {
        coords,
        address
      });

      // Store both coordinates and address
      const destinationData = {
        lat: coords.lat,
        lng: coords.lng,
        address: address
      };
      
      // Update both the destination state and form state
      setDestination(destinationData);
      setForm(prev => ({
        ...prev,
        destination: address
      }));
      
      // If we have user location, calculate route immediately
      if (userLocation) {
        try {
          console.log('Calculating route with current location:', {
            start: userLocation,
            end: destinationData
          });
          
          // Create waypoints array with proper format
          const waypoints = [
            { location: userLocation, type: 'start' },
            { location: destinationData, type: 'destination' }
          ];
          
          const route = await calculateRoute(waypoints);
          if (route) {
            // Update the map with the new route
            const mapView = document.querySelector('.map-container');
            if (mapView && mapView.updateRoute) {
              mapView.updateRoute(route);
            }
          }
        } catch (error) {
          console.error('Error calculating initial route:', error);
          showNotification('Failed to calculate route. Please try again.', 'error');
        }
      }
    } catch (error) {
      console.error('Error setting destination:', error);
      showNotification('Failed to set destination. Please try again in a few seconds.', 'error');
    }
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

  // Add notification function
  const showNotification = (message, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Handle resend invitation
  const handleResendInvitation = (userId, status) => {
    if (status === 'success') {
      showNotification('Invitation resent successfully');
    } else {
      showNotification('Failed to resend invitation', 'error');
    }
  };

  // Update handleInvitationResponse to show notifications
  const handleInvitationResponse = async (userId, status) => {
    try {
      if (!createdRideId) {
        console.error('No ride ID available for invitation response');
        return;
      }

      const result = await updateRideInvitation({
        rideId: createdRideId,
        inviteeId: userId,
        status
      });

      if (result.success) {
        // Update the user's status in the local state
        setUsers(prevUsers => 
          prevUsers.map(user => 
            (user.id || user.tempId) === userId
              ? { ...user, invitationStatus: status }
              : user
          )
        );

        // Show notification based on status
        const user = users.find(u => (u.id || u.tempId) === userId);
        if (user) {
          const statusMessages = {
            accepted: `${user.name} accepted the invitation`,
            declined: `${user.name} declined the invitation`,
            maybe: `${user.name} is considering the invitation`
          };
          showNotification(statusMessages[status]);
        }
      } else {
        showNotification('Failed to update invitation status', 'error');
      }
    } catch (error) {
      console.error('Error updating invitation:', error);
      showNotification('An error occurred while updating the invitation status', 'error');
    }
  };

  const handleCreateGroup = async () => {
    console.log('handleCreateGroup called with state:', {
      destination,
      users,
      creatorRole,
      hasDriver: users.some(user => user.role === 'driver'),
      isCreatingGroup,
      invitationStatus,
      groupCreated,
      currentUser: user?.uid
    });

    // Validate destination coordinates
    if (!destination || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') {
      console.error('Invalid destination coordinates:', destination);
      showNotification('Please set a valid destination location on the map', 'error');
      return;
    }

    // Log the full users array to see what we're working with
    console.log('Current users array:', users.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      isCreator: u.isCreator,
      tempId: u.tempId,
      location: u.userLocationCoords
    })));

    if (!destination || users.length === 0) {
      console.log('Group creation blocked: Missing requirements', {
        hasDestination: !!destination,
        userCount: users.length
      });
      showNotification('Please add at least one participant and set the destination location', 'error');
      return;
    }

    // Modified driver check to include creator if they are a driver
    const driver = users.find(u => u.role === 'driver') || 
                  (creatorRole === 'driver' ? {
                    id: user.uid,
                    name: user.displayName || 'You',
                    role: 'driver',
                    isCreator: true,
                    userLocationCoords: userLocation
                  } : null);

    console.log('Driver check details:', {
      driverFound: !!driver,
      creatorRole,
      driverDetails: driver ? {
        id: driver.id,
        name: driver.name,
        isCreator: driver.isCreator,
        role: driver.role,
        hasLocation: !!driver.userLocationCoords
      } : null,
      userLocation: userLocation
    });

    if (!driver) {
      console.log('Group creation blocked: No driver assigned', {
        creatorRole,
        usersWithRoles: users.map(u => ({ name: u.name, role: u.role }))
      });
      showNotification('Please assign a driver for the ride', 'error');
      return;
    }

    // Validate driver location
    if (!driver.userLocationCoords || !driver.userLocationCoords.lat || !driver.userLocationCoords.lng) {
      console.error('Invalid driver location:', driver.userLocationCoords);
      showNotification('Driver location is required. Please start location tracking.', 'error');
      return;
    }

    try {
      console.log('Starting group creation process...');
      setIsCreatingGroup(true);
      setInvitationStatus({
        isSending: false,
        sentCount: 0,
        totalCount: 0,
        errors: []
      });
      
      // Get full addresses for all locations
      console.log('Fetching addresses for locations:', {
        driverLocation: driver.userLocationCoords,
        destination: destination
      });

      const [driverAddress, destinationAddress] = await Promise.all([
        getAddressFromCoords(driver.userLocationCoords.lat, driver.userLocationCoords.lng),
        getAddressFromCoords(destination.lat, destination.lng)
      ]);

      // Clean and validate the data before creating the group
      const cleanGroupData = {
        driver: {
          uid: driver.isCreator ? user.uid : driver.id,
          name: driver.name || 'Unknown Driver',
          location: {
            lat: driver.userLocationCoords.lat,
            lng: driver.userLocationCoords.lng
          },
          address: driverAddress || 'Location not found',
          isCreator: driver.isCreator || false,
          status: 'confirmed',
          joinedAt: new Date().toISOString()
        },
        passengers: users
          .filter(u => u.role === 'passenger')
          .map(passenger => ({
            name: passenger.name || 'Unknown Passenger',
            location: passenger.userLocationCoords ? {
              lat: passenger.userLocationCoords.lat,
              lng: passenger.userLocationCoords.lng
            } : null,
            address: passenger.userLocation || 'Location pending',
          status: 'pending',
            tempId: passenger.tempId || null,
            isCreator: passenger.isCreator || false,
            uid: passenger.id || null,
            invitationStatus: 'pending',
            invitedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        })),
        destination: {
          location: {
            lat: destination.lat,
            lng: destination.lng
          },
          address: destinationAddress || 'Destination not found'
        },
        status: 'forming',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.uid,
        metadata: {
          isOptimized: false,
          optimizationAttempts: 0,
          lastOptimizationAttempt: null,
          optimizationStatus: 'pending',
          optimizationError: null,
          groupStatus: 'forming',
          invitationStatus: {
            total: users.length,
            pending: users.filter(u => !u.invitationStatus || u.invitationStatus === 'pending').length,
            accepted: users.filter(u => u.invitationStatus === 'accepted').length,
            declined: users.filter(u => u.invitationStatus === 'declined').length,
            maybe: users.filter(u => u.invitationStatus === 'maybe').length,
            lastUpdated: new Date().toISOString()
          }
        }
      };

      // Log the cleaned data
      console.log('Attempting to create group with cleaned data:', {
        groupData: cleanGroupData,
        currentUser: user.uid,
        timestamp: new Date().toISOString()
      });

      const result = await createRide(cleanGroupData);
      console.log('createRide result:', result);
      
      if (result.success) {
        console.log('Group created successfully:', {
          rideId: result.rideId,
          timestamp: new Date().toISOString()
        });
        
        setCreatedRideId(result.rideId);
        
        // Get pending participants (excluding the creator if they're a passenger)
        const pendingParticipants = users.filter(u => 
          u.role === 'passenger' && 
          u.id && 
          !u.isCreator
        );

        console.log('Processing pending participants:', {
          count: pendingParticipants.length,
          participants: pendingParticipants.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role
          }))
        });

        if (pendingParticipants.length > 0) {
          setInvitationStatus(prev => ({
            ...prev,
            isSending: true,
            totalCount: pendingParticipants.length
          }));

          // Send invitations one by one to handle errors properly
          for (const participant of pendingParticipants) {
            try {
              console.log('Starting invitation process for participant:', {
                participantId: participant.id,
                participantName: participant.name,
                rideId: result.rideId,
                currentUser: user.uid,
                timestamp: new Date().toISOString()
              });

              // Verify participant data
              if (!participant.id) {
                throw new Error('Participant has no user ID');
              }

              // Verify ride data
              if (!result.rideId) {
                throw new Error('No ride ID available');
              }

              // Verify current user
              if (!user.uid) {
                throw new Error('No current user ID available');
              }

              console.log('Calling sendRideInvitation with:', {
                rideId: result.rideId,
                inviterId: user.uid,
                inviteeId: participant.id,
                inviterName: user.displayName,
                inviterPhotoURL: user.photoURL
              });

              const invitationResult = await sendRideInvitation(
                result.rideId,
                user.uid,
                participant.id
              );

              console.log('Invitation creation result:', {
                success: invitationResult.success,
                invitationId: invitationResult.invitationId,
                error: invitationResult.error,
                timestamp: new Date().toISOString()
              });

              if (invitationResult.success) {
                setInvitationStatus(prev => ({
                  ...prev,
                  sentCount: prev.sentCount + 1
                }));
                showNotification(`Invitation sent to ${participant.name}`);
              } else {
                throw new Error(invitationResult.error?.message || 'Failed to send invitation');
              }
            } catch (error) {
              console.error('Error in invitation process:', {
                error: error.message,
                stack: error.stack,
                participant: {
                  id: participant.id,
                  name: participant.name
                },
                rideId: result.rideId,
                currentUser: user.uid,
                timestamp: new Date().toISOString()
              });
              
              setInvitationStatus(prev => ({
                ...prev,
                errors: [...prev.errors, { 
                  participant: participant.name, 
                  error: error.message,
                  details: error.stack
                }]
              }));
              showNotification(`Failed to send invitation to ${participant.name}`, 'error');
            }
          }
        }

        setGroupCreated(true);
        setShowSuccessModal(true);
        
        // Show summary of invitation status
        const { sentCount, totalCount, errors } = invitationStatus;
        console.log('Group creation completed:', {
          sentCount,
          totalCount,
          errorCount: errors.length,
          timestamp: new Date().toISOString()
        });

        if (errors.length > 0) {
          showNotification(`${sentCount}/${totalCount} invitations sent. ${errors.length} failed.`, 'warning');
      } else {
          showNotification(`Successfully sent ${sentCount} invitations`, 'success');
        }
      } else {
        console.error('Group creation failed:', {
          error: result.error,
          timestamp: new Date().toISOString()
        });
        throw new Error(result.error?.message || 'Failed to create group');
      }
    } catch (error) {
      console.error('Error in handleCreateGroup:', {
        error,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      showNotification(`Failed to create group: ${error.message || 'Please try again.'}`, 'error');
    } finally {
      console.log('Cleaning up group creation state');
      setIsCreatingGroup(false);
      setInvitationStatus(prev => ({ ...prev, isSending: false }));
    }
  };

  // Add click handler for sidebar toggle
  const handleSidebarClick = (e) => {
    // Only toggle if clicking the sidebar itself, not its children
    if (e.target === e.currentTarget) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  const handleStartTracking = async () => {
    if (creatorRole === 'driver') {
      try {
        console.log('Starting location tracking process...', {
          userId: user?.uid,
          creatorRole,
          currentStatus: locationStatus
        });

        setIsLocationLoading(true);
        setLocationError(null);
        setHasValidLocation(false); // Reset valid location state
        setLocationStatusMessage('Initializing location services...');

        // Clear any existing location data
        setUserLocation(null);
        
        if (!user?.uid) {
          throw new Error('User ID is required to start location tracking');
        }

        // Start tracking with user ID
        const success = await startTracking(user.uid);
        
        if (!success) {
          throw new Error('Location tracking service failed to start');
        }

        console.log('Location tracking started successfully');
      } catch (error) {
        console.error('Location service error:', {
          error: error.message,
          code: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          user: user?.uid,
          status: locationStatus
        });
        
        let errorMessage = 'Failed to start location tracking. ';
        if (error.message.includes('permission denied')) {
          errorMessage += 'Please enable location access in your browser settings.';
        } else if (error.message.includes('not supported')) {
          errorMessage += 'Your browser does not support location services.';
        } else if (error.message.includes('timeout')) {
          errorMessage += 'Location request timed out. Please check your internet connection and try again.';
        } else if (error.message.includes('position unavailable')) {
          errorMessage += 'Location information is unavailable. Please check your device\'s location services.';
        } else {
          errorMessage += error.message;
        }
        
        // Only set error if we don't have a valid location
        if (!hasValidLocation) {
          setLocationError(errorMessage);
        }
        setLocationStatusMessage('Location tracking failed');
      } finally {
        setIsLocationLoading(false);
      }
    }
  };

  return (
    <div className="route-optimizer-container">
      {/* Notifications */}
      <div className="notifications-container">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`notification ${notification.type}`}
          >
            {notification.message}
          </div>
        ))}
      </div>

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
              <div className="location-status-container">
                {locationError && !hasValidLocation && (
                  <div className="alert alert-warning" role="alert">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    {locationError}
                  </div>
                )}
                {locationStatusMessage && !locationError && (
                  <div className="alert alert-info" role="alert">
                    <i className="bi bi-info-circle me-2"></i>
                    {locationStatusMessage}
                  </div>
                )}
                {creatorRole === 'driver' && !isTrackingLocation && (
                  <button
                    className={`btn btn-primary ${isLocationLoading ? 'loading' : ''}`}
                    onClick={handleStartTracking}
                    disabled={isLocationLoading || locationStatus === 'syncing'}
                  >
                    {isLocationLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Starting Location Tracking...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-location-arrow me-2"></i>
                        Start Location Tracking
                      </>
                    )}
                  </button>
                )}
              </div>

              <UserForm 
                form={form} 
                onChange={handleChange} 
                onSubmit={addUser} 
                onDestinationChange={handleDestinationChange}
                onUserLocationChange={handleUserLocationChange}
                creatorRole={creatorRole}
                existingParticipants={users}
                isTrackingLocation={isTrackingLocation}
                rideId={createdRideId}
                groupCreated={groupCreated}
              />
              
              {/* Enhanced UserTable */}
              <div className="user-table-container">
                <h5>Participants</h5>
                <UserTable 
                  users={users}
                  onDelete={handleDelete}
                  onRoleChange={handleRoleChange}
                  onInvitationResponse={handleInvitationResponse}
                  rideId={createdRideId}
                  onResendInvitation={handleResendInvitation}
                />
              </div>
              
              <div className="create-group-section">
                <button
                  className={`create-group-button ${groupCreated ? 'created' : ''}`}
                  onClick={handleCreateGroup}
                  disabled={
                    isCreatingGroup ||
                    invitationStatus.isSending ||
                    !destination ||
                    users.length === 0 ||
                    (!users.some(u => u.role === 'driver') && creatorRole !== 'driver') ||
                    groupCreated
                  }
                >
                  {isCreatingGroup ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Creating Group...</span>
                    </>
                  ) : invitationStatus.isSending ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Sending Invitations ({invitationStatus.sentCount}/{invitationStatus.totalCount})</span>
                    </>
                  ) : groupCreated ? (
                    <>
                      <i className="fas fa-check-circle"></i>
                      <span>Group Created</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-users"></i>
                      <span>Create Group</span>
                    </>
                  )}
                </button>
                
                {/* Requirements message */}
                {!groupCreated && (
                  <div className="requirements-message">
                    {!destination && (
                      <div className="requirement">
                        <i className="fas fa-map-marker-alt"></i>
                        <span>Set a destination</span>
                  </div>
                )}
                    {users.length === 0 && (
                      <div className="requirement">
                        <i className="fas fa-user-plus"></i>
                        <span>Add at least one participant</span>
              </div>
                    )}
                    {creatorRole === 'passenger' && !users.some(user => user.role === 'driver') && (
                      <div className="requirement">
                        <i className="fas fa-car"></i>
                        <span>Assign a driver</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Map Container */}
          <div className="route-optimizer-map-wrapper">
            <div className="route-optimizer-map-container">
              <MapView 
                ref={mapRef}
                users={users} 
                destination={destination}
                userLocation={userLocation}
                onSetDestinationFromMap={(coords) => handleDestinationChange(coords)}
                onRouteUpdate={(route) => {
                  console.log('Route updated:', route);
                }}
              />
            </div>
          </div>
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Group Created Successfully!</h5>
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
                <p className="success-message">Your group has been created successfully!</p>
                <p className="group-info">
                  Invitations have been sent to all participants. Once they join and provide their locations, 
                  you can optimize and start the ride.
                </p>
                <div className="ride-id-container">
                  <span className="ride-id-label">Group ID:</span>
                  <span className="ride-id">{createdRideId}</span>
                </div>
                <p className="ride-id-note">
                  You can use this ID to reference your group. It will also be visible in your groups list.
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

// Update the styles
const styles = `
  .route-optimizer-sidebar {
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border-right: 1px solid #eef2f7;
    transition: all 0.3s ease;
  }

  .sidebar-content {
    padding: 1.5rem;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-top: 0;
  }

  .sidebar-handle {
    position: absolute;
    right: -16px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    background: #ffffff;
    border-radius: 50%;
    padding: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .sidebar-toggle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #eef2f7;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    color: #2196F3;
  }

  .sidebar-toggle:hover {
    background: #2196F3;
    border-color: #2196F3;
    transform: scale(1.05);
    box-shadow: 0 4px 8px rgba(33, 150, 243, 0.2);
  }

  .sidebar-toggle:hover i {
    color: #ffffff;
  }

  .sidebar-toggle i {
    font-size: 1rem;
    transition: all 0.2s ease;
  }

  .sidebar-toggle:active {
    transform: scale(0.95);
  }

  .create-group-section {
    background: #f8fafc;
    border-radius: 12px;
    padding: 1.25rem;
    margin-top: auto;
    border: 1px solid #eef2f7;
  }

  .create-group-button {
    width: 100%;
    padding: 0.875rem 1.25rem;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.9375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    transition: all 0.2s ease;
    min-height: 48px;
    box-shadow: 0 2px 4px rgba(33, 150, 243, 0.1);
  }

  .create-group-button:not(:disabled):hover {
    background: #1976D2;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(33, 150, 243, 0.15);
  }

  .create-group-button:disabled {
    background: #90CAF9;
    cursor: not-allowed;
    opacity: 0.8;
    transform: none;
    box-shadow: none;
  }

  .create-group-button.created {
    background: #4CAF50;
    box-shadow: 0 2px 4px rgba(76, 175, 80, 0.1);
  }

  .create-group-button.created:hover {
    background: #43A047;
    box-shadow: 0 4px 6px rgba(76, 175, 80, 0.15);
  }

  .create-group-button i {
    font-size: 1.1rem;
    min-width: 20px;
    text-align: center;
  }

  .requirements-message {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #eef2f7;
  }

  .requirement {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    background: #f8fafc;
    border-radius: 6px;
    color: #64748b;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .requirement:hover {
    background: #f1f5f9;
    color: #475569;
  }

  .requirement i {
    color: #2196F3;
    font-size: 1rem;
    width: 20px;
    text-align: center;
  }

  .user-table-container {
    background: #ffffff;
    border-radius: 12px;
    padding: 1.25rem;
    border: 1px solid #eef2f7;
  }

  .user-table-container h5 {
    color: #1e293b;
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #eef2f7;
  }

  .alert {
    border-radius: 8px;
    padding: 0.875rem 1rem;
    font-size: 0.875rem;
    border: none;
    margin: 0 1.5rem 1rem 1.5rem;
  }

  .alert-info {
    background: #e3f2fd;
    color: #0d47a1;
  }

  .alert-warning {
    background: #fff3e0;
    color: #e65100;
  }

  .alert i {
    font-size: 1rem;
    margin-right: 0.5rem;
  }

  .form-info {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #eef2f7;
  }

  .form-info .alert {
    margin-bottom: 0;
    background: transparent;
    padding: 0.75rem;
  }

  .form-info .alert i {
    color: #2196F3;
  }

  @media (max-width: 768px) {
    .sidebar-content {
      padding: 1rem;
    }

    .create-group-section {
      padding: 1rem;
    }

    .requirements-message {
      padding: 0.5rem;
    }

    .requirement {
      padding: 0.5rem 0.75rem;
    }
  }

  .route-optimizer-header {
    background: #ffffff;
    padding: 1.5rem;
    border-bottom: 1px solid #eef2f7;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .route-optimizer-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #1e293b;
    font-weight: 600;
  }

  .location-status-container {
    margin-top: 0;
    position: sticky;
    top: 0;
    z-index: 99;
    background: #ffffff;
    padding: 1rem 0;
    border-bottom: 1px solid #eef2f7;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .location-status-container .btn {
    width: auto;
    min-width: 200px;
    margin: 0 1.5rem;
  }
`;

// Add notification styles
const notificationStyles = `
  ${styles}

  .notifications-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .notification {
    padding: 12px 24px;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .notification.success {
    background-color: #28a745;
  }

  .notification.error {
    background-color: #dc3545;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = notificationStyles;
document.head.appendChild(styleSheet);

// Add styles for error container
const errorStyles = `
  .error-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    width: 90%;
    max-width: 500px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

  .error-container .alert {
    margin: 0;
  }

  .error-container .alert-heading {
    margin-bottom: 10px;
  }

  .error-container .btn {
    margin-top: 15px;
  }
`;

// Add the styles to the document
const styleSheetError = document.createElement("style");
styleSheetError.innerText = errorStyles;
document.head.appendChild(styleSheetError);

// Add styles for loading and error states
const loadingErrorStyles = `
  .route-optimizer-loading {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.9);
    z-index: 9999;
  }

  .route-optimizer-error {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    width: 90%;
    max-width: 500px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

  .route-optimizer-error .alert {
    margin: 0;
  }

  .route-optimizer-error .alert-heading {
    margin-bottom: 10px;
  }

  .route-optimizer-error .btn {
    margin-top: 15px;
  }
`;

// Add the styles to the document
const styleSheetLoadingError = document.createElement("style");
styleSheetLoadingError.innerText = loadingErrorStyles;
document.head.appendChild(styleSheetLoadingError);

export default RouteOptimizer;
