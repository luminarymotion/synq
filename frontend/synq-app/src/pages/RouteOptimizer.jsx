// RouteOptimizer.jsx - Handles both ride creation and joining functionality
import '../App.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import UserForm from '../components/UserForm';
import MapView from '../components/MapView';
import UserTable from '../components/UserTable';
import UserSearch from '../components/UserSearch';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { 
  createRide, 
  updateRide, 
  getFriendsList, 
  sendFriendRequest, 
  checkFriendshipStatus,
  sendRideInvitation,
  deleteRideInvitation
} from '../services/firebaseOperations';
import { calculateOptimizedRoute, getMockRoute, testMapQuestAPI, testVRPAlgorithm } from '../services/routeOptimizerService';
import '../styles/RouteOptimizer.css';
import { getCurrentLocation, MAPQUEST_SERVICE } from '../services/locationService';
import locationTrackingService, { useLocation as useLocationTracking } from '../services/locationTrackingService';
import { toast } from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FaMapMarkerAlt, FaUserPlus, FaRoute, FaTimes, FaChevronLeft, FaChevronRight, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { showNotification } from '../utils/notifications';
import SimpleLoading from '../components/SimpleLoading';


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

function RouteOptimizer({ mode = 'create' }) {
  console.log('RouteOptimizer component initializing...', { mode });
  const navigate = useNavigate();
  const location = useLocation();
  const { user, error: authError } = useUserAuth();
  const mapRef = useRef(null);
  const locationWatchIdRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const destinationTimeoutRef = useRef(null);
  const lastRouteCalculationRef = useRef(null); // Track last route calculation to prevent duplicates

  // Add a new state to track if we have a valid location
  const [hasValidLocation, setHasValidLocation] = useState(false);

  const {
    location: trackingLocation,
    isTracking,
    status: locationStatus,
    error: locationServiceError,
    startTracking,
    stopTracking,
    setManualLocation
  } = useLocationTracking({
    preset: 'realtime',
    updateFirebase: true,
    onLocationUpdate: async (locationData) => {
      console.log('Location update received in RouteOptimizer:', locationData);
      console.log('Current hasLocationError state:', hasLocationError);
      
      // Check if locationData is valid
      if (!locationData || !locationData.latitude || !locationData.longitude) {
        console.warn('Invalid location data received:', locationData);
        return;
      }
      
      const { latitude: lat, longitude: lng, accuracy, address } = locationData;
      
      // Validate coordinates before updating state
      if (typeof lat !== 'number' || typeof lng !== 'number' || 
          isNaN(lat) || isNaN(lng) ||
          lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn('Invalid coordinates received from location service:', { lat, lng });
        return; // Don't update state with invalid coordinates
      }
      
      // If we have valid coordinates, clear any errors and update state
      if (lat && lng) {
        setHasValidLocation(true);
        setLocationError(null);
        setHasLocationError(false); // Clear error flag when we get valid location
        console.log('Cleared hasLocationError flag due to valid location');
        
        // Hide error message if we have a valid location
        if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
          setLocationStatusMessage(`Location tracking active (accuracy: ${Math.round(accuracy)}m)`);
          console.log('Cleared error message due to valid location');
        }
      }
      
      // Update user location state
      const newLocation = { lat, lng, address, accuracy };
      setUserLocation(newLocation);
      
      // Update form state if needed
      if (creatorRole === 'driver') {
        setForm(prev => ({
          ...prev,
          userLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
          startingLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`
        }));
      }
      
      // Only update status message if there's no error
      if (!hasLocationError) {
        console.log('Updating status message to active (no error)');
      setLocationStatusMessage(`Location tracking active (accuracy: ${Math.round(accuracy)}m)`);
      } else {
        console.log('NOT updating status message due to error flag');
      }
    },
    onError: (errorMessage) => {
      // Only log and handle actual errors, not null (which clears errors)
      if (errorMessage !== null) {
        console.error('Location tracking error:', errorMessage);
        setHasLocationError(true); // Set error flag
        
        // Update error message to be more user-friendly
        let userFriendlyError = errorMessage;
        const errorMsg = errorMessage?.toString() || 'Unknown error';
        
        if (errorMsg.includes('blocked') || errorMsg.includes('timeout') || errorMsg.includes('network')) {
          userFriendlyError = 'Location tracking failed. Please enter your location manually';
        }
        
        setLocationError(userFriendlyError);
        setLocationStatusMessage(userFriendlyError);
        
        // Force stop tracking to reset the button state
        stopTracking(true);
      } else {
        // Clear error state when errorMessage is null
        setLocationError(null);
        setHasLocationError(false); // Clear error flag
      }
    },
    onStatusChange: (status) => {
      console.log('Location status changed:', status);
      switch (status) {
        case 'active':
          // Clear any existing errors when tracking becomes active
          setLocationError(null);
          setLocationStatusMessage('Location tracking active');
          break;
        case 'manual':
          // Handle manual mode for office networks
          setLocationError(null);
          setLocationStatusMessage('Location tracking in manual mode - set your location manually');
          break;
        case 'inactive':
          // Only show "stopped" message if there's no error
          if (!hasLocationError) {
          setLocationStatusMessage('Location tracking stopped');
          setUserLocation(null);
          setHasValidLocation(false); // Reset valid location state
          }
          break;
        case 'error':
          // Set error status and reset tracking state
          setLocationStatusMessage('Location tracking failed. Please enter your location manually');
          setHasLocationError(true); // Set error flag
          // Force stop tracking to reset the button state
          stopTracking(true);
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
    startingLocation: '',
    isCreator: mode === 'create'
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

  // Add back friends-related state
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState(null);

  // Add new state for active tab and friend modal
  const [activeTab, setActiveTab] = useState('form'); // 'form' or 'route'
  const [showFriendModal, setShowFriendModal] = useState(false);
  
  // Add route state
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeDetails, setRouteDetails] = useState(null);
  
  // Add missing state variables
  const [mapClickMode, setMapClickMode] = useState(null);
  const [hasLocationError, setHasLocationError] = useState(false);

  // Add a counter for unique notification IDs
  const notificationIdCounter = useRef(0);

  // Add notification function - moved to top to avoid initialization error
  const showLocalNotification = (message, type = 'success') => {
    const id = `${Date.now()}-${notificationIdCounter.current++}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Define calculateAndDisplayRoute function before it's used in useEffect
  const calculateAndDisplayRoute = useCallback(async (startLocation, endLocation) => {
    if (!startLocation || !endLocation) {
      console.warn('Cannot calculate route: missing start or end location');
      return;
    }

    setIsCalculatingRoute(true);
    setError(null);

    try {
      console.log('Starting route calculation:', {
        startLocation,
        endLocation,
        creatorRole,
        userCount: users.length
      });

      // Build waypoints array including all passengers
      const waypoints = [
        {
          location: startLocation,
          type: 'origin',
          name: 'Driver Location'
        }
      ];

      // Add passenger pickup points if any
      const passengers = users.filter(u => u.role === 'passenger' && u.userLocationCoords);
      passengers.forEach((passenger, index) => {
        waypoints.push({
          location: passenger.userLocationCoords,
          type: 'pickup',
          name: passenger.name || `Passenger ${index + 1}`
        });
      });

      // Add destination
      waypoints.push({
          location: endLocation,
          type: 'destination',
          name: 'Destination'
      });

      console.log('Calculating optimized route with waypoints:', {
        totalWaypoints: waypoints.length,
        waypoints: waypoints.map(w => ({ type: w.type, name: w.name }))
      });

      // Test VRP algorithm with real data
      const route = await calculateOptimizedRoute(waypoints, {
        maxPassengers: passengers.length,
        timeWindows: null, // Can be enhanced later
        maxDistance: 100 // km
      });
      
      console.log('VRP optimization completed:', {
        originalWaypoints: waypoints.length,
        optimizedRoute: route?.properties?.summary?.waypoints?.length || 0,
        distance: route?.properties?.summary?.distance,
        duration: route?.properties?.summary?.duration,
        provider: route?.properties?.metadata?.provider
      });

      setCalculatedRoute(route);
      
      // Update route details for display
      if (route && route.properties && route.properties.summary) {
        const summary = route.properties.summary;
        setRouteDetails({
          distance: summary.distance,
          duration: summary.duration,
          waypoints: summary.waypoints
        });

        // Show success notification with route details
        const distanceMi = (summary.distance / 1609.34).toFixed(1);
        const durationMin = Math.round(summary.duration / 60);
        showLocalNotification(`Route optimized: ${distanceMi}mi, ${durationMin}min`, 'success');
      }

    } catch (error) {
      console.error('Error calculating route:', error);
      setError(`Failed to calculate route: ${error.message}`);
      setCalculatedRoute(null);
      setRouteDetails(null);
      
      // Show user-friendly error
      showLocalNotification('Route calculation failed. Using fallback route.', 'error');
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [creatorRole, users, showLocalNotification]);

  // Add effect to automatically calculate route when both location and destination are available
  useEffect(() => {
    const calculateRouteForDriver = async () => {
      // Only calculate route if user is driver and has both location and destination
      if (creatorRole === 'driver' && userLocation && destination && !isCalculatingRoute) {
        // Create a unique key for this route calculation
        const routeKey = `${userLocation.lat},${userLocation.lng}-${destination.lat},${destination.lng}`;
        
        // Check if we've already calculated this exact route recently
        if (lastRouteCalculationRef.current === routeKey) {
          console.log('Route already calculated recently, skipping...');
          return;
        }
        
        console.log('Auto-calculating route for driver:', {
          userLocation,
          destination,
          creatorRole
        });
        
        // Add rate limiting to prevent API flooding
        await rateLimiter.wait();
        
        try {
        await calculateAndDisplayRoute(userLocation, destination);
          // Mark this route as calculated
          lastRouteCalculationRef.current = routeKey;
        } catch (error) {
          console.warn('Route calculation failed, will retry later:', error.message);
          // Don't set error state for automatic route calculations to avoid UI disruption
        }
      }
    };

    // Add debounce to prevent rapid successive calls
    const timeoutId = setTimeout(calculateRouteForDriver, 500);
    
    return () => clearTimeout(timeoutId);
  }, [userLocation, destination, creatorRole, isCalculatingRoute]); // Removed calculateAndDisplayRoute from dependencies

  // Add back friends-related useEffect
  useEffect(() => {
    const loadFriends = async () => {
      if (!user) return;
      
      setIsLoadingFriends(true);
      setFriendError(null);
      
      try {
        const result = await getFriendsList(user.uid);
        if (result.success) {
          setFriends(result.friends);
        } else {
          setFriendError('Failed to load friends list');
        }
      } catch (error) {
        console.error('Error loading friends:', error);
        setFriendError('Error loading friends list');
      } finally {
        setIsLoadingFriends(false);
      }
    };

    loadFriends();
  }, [user]);

  // Add back handleAddFriend function
  const handleAddFriend = async (friendId) => {
    if (!user) return;

    try {
      // Check if already friends
      const statusResult = await checkFriendshipStatus(user.uid, friendId);
      if (statusResult.success && statusResult.areFriends) {
        showLocalNotification('Already friends with this user');
        return;
      }

      // Send friend request
      const result = await sendFriendRequest(user.uid, friendId, "Let's be friends!");
      if (result.success) {
        showLocalNotification('Friend request sent successfully');
      } else {
        showLocalNotification('Failed to send friend request', 'error');
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      showLocalNotification('Error sending friend request', 'error');
    }
  };

  // Add hasDriver check
  const hasDriver = users.some(user => user.role === 'driver');

  // Remove friends-related useEffect
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
  }, [user, authError]); // Removed navigate from dependencies

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
      <SimpleLoading 
        message="Loading route optimizer..."
        size="large"
      />
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
    
    if (name === 'role') {
      // Update both form state and creator role if this is the creator
      setForm(prev => ({
        ...prev,
        role: value
      }));
      
      // If this is the creator's form, update creatorRole
      if (form.isCreator) {
        setCreatorRole(value);
        
        // If changing from driver to passenger, stop location tracking
        if (creatorRole === 'driver' && value === 'passenger') {
          locationTrackingService.stopTracking();
          setIsTracking(false);
          setUserLocation(null);
        }
      }
    } else if (name === 'destination') {
      // For destination input, just update the form state
      setForm(prev => ({
        ...prev,
        destination: value
      }));
    } else {
      // For all other fields, update form state normally
      setForm(prev => ({
        ...prev,
        [name]: value
      }));
    }
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
        name: userData.name || userData.profile?.displayName || userData.displayName || 'Unknown User',
        displayName: userData.profile?.displayName || userData.displayName || userData.name || 'Unknown User',
        role: userData.role || 'passenger',
        destination: destinationCoords.address || destinationCoords,
        destinationCoords,
        color,
        photoURL: userData.profile?.photoURL || userData.photoURL || '',
        email: userData.profile?.email || userData.email || '',
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
        // Note: Invitations will be sent when the group is created, not when users are added
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
        
        showLocalNotification(`${removedUser.name} removed from the group`);
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      showLocalNotification('Failed to remove participant', 'error');
    }
  };

  const handleDestinationChange = async (coords) => {
    console.log('handleDestinationChange called with:', coords);
    
    // Validate coordinates
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number' ||
        isNaN(coords.lat) || isNaN(coords.lng) ||
        coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) {
      console.error('Invalid coordinates received:', coords);
      showLocalNotification('Invalid destination location. Please try selecting the location again.', 'error');
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
      
      // Remove direct route calculation - let the useEffect handle it
      // if (userLocation) {
      //   await calculateAndDisplayRoute(userLocation, destinationData);
      // }
    } catch (error) {
      console.error('Error setting destination:', error);
      showLocalNotification('Failed to set destination. Please try again in a few seconds.', 'error');
    }
  };

  const handleUserLocationChange = async (locationData) => {
    // Handle both string addresses and coordinate objects
    if (typeof locationData === 'string') {
      // String address - geocode it
      const coords = await geocodeAddress(locationData);
    if (coords) {
      setUserLocation(coords);
        setHasValidLocation(true);
        setHasLocationError(false); // Clear error flag
        setLocationError(null);
        
        // Clear error message if we had one
        if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
          setLocationStatusMessage('Location set manually');
          console.log('✅ Manual location setting successful:', { address: locationData, coordinates: coords });
        }
        
        // Update form state based on role
        if (creatorRole === 'driver') {
          setForm(prev => ({
            ...prev,
            startingLocation: locationData
          }));
    } else {
          setForm(prev => ({
            ...prev,
            userLocation: locationData
          }));
        }
      } else {
        console.log('❌ Manual location setting failed: Could not geocode address:', locationData);
      alert('Location not found!');
      }
    } else if (locationData && typeof locationData === 'object' && locationData.lat && locationData.lng) {
      // Coordinate object - use directly
      setUserLocation(locationData);
      setHasValidLocation(true);
      setHasLocationError(false); // Clear error flag
      setLocationError(null);
      
      // Clear error message if we had one
      if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
        setLocationStatusMessage('Location set manually');
        console.log('✅ Manual location setting successful:', { coordinates: locationData });
      }
      
      // Update form state based on role
      if (creatorRole === 'driver') {
        setForm(prev => ({
          ...prev,
          startingLocation: locationData.address || `Location (${locationData.lat.toFixed(6)}, ${locationData.lng.toFixed(6)})`
        }));
      } else {
        setForm(prev => ({
          ...prev,
          userLocation: locationData.address || `Location (${locationData.lat.toFixed(6)}, ${locationData.lng.toFixed(6)})`
        }));
      }
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
      showLocalNotification('Please set a valid destination location on the map', 'error');
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
      showLocalNotification('Please add at least one participant and set the destination location', 'error');
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
      showLocalNotification('Please assign a driver for the ride', 'error');
      return;
    }

    // Validate driver location
    if (!driver.userLocationCoords || !driver.userLocationCoords.lat || !driver.userLocationCoords.lng) {
      console.error('Invalid driver location:', driver.userLocationCoords);
      showLocalNotification('Driver location is required. Please start location tracking.', 'error');
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

              // Get current user's profile data to ensure we have display name
              const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
              const currentUserData = currentUserDoc.exists() ? currentUserDoc.data() : {};
              const currentUserDisplayName = currentUserData.profile?.displayName || currentUserData.displayName || user.displayName || 'Unknown User';

              console.log('Calling sendRideInvitation with:', {
                rideId: result.rideId,
                inviterId: user.uid,
                inviteeId: participant.id,
                inviterName: currentUserDisplayName,
                inviterPhotoURL: currentUserData.profile?.photoURL || currentUserData.photoURL || ''
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
                showLocalNotification(`Invitation sent to ${participant.name}`);
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
              showLocalNotification(`Failed to send invitation to ${participant.name}`, 'error');
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
          showLocalNotification(`${sentCount}/${totalCount} invitations sent. ${errors.length} failed.`, 'warning');
      } else {
          showLocalNotification(`Successfully sent ${sentCount} invitations`, 'success');
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
      showLocalNotification(`Failed to create group: ${error.message || 'Please try again.'}`, 'error');
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

  // Add a helper function to diagnose geolocation issues
  const diagnoseGeolocation = () => {
    const diagnostics = {
      supported: 'geolocation' in navigator,
      protocol: location.protocol,
      hostname: location.hostname,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      // Add more detailed diagnostics
      locationObject: {
        href: location.href,
        origin: location.origin,
        pathname: location.pathname,
        search: location.search
      },
      navigatorObject: {
        geolocation: !!navigator.geolocation,
        permissions: !!navigator.permissions,
        userAgent: navigator.userAgent.substring(0, 100) + '...'
      }
    };
    
    console.log('Geolocation diagnostics:', diagnostics);
    
    if (!diagnostics.supported) {
      console.error('Geolocation not supported in this browser');
      return 'Geolocation is not supported in this browser';
    }
    
    console.log('Geolocation is supported, checking security requirements...');
    
    // Check if we're on a secure connection or localhost
    // Be more lenient for development environments
    const isSecure = diagnostics.protocol === 'https:' || 
                    diagnostics.hostname === 'localhost' || 
                    diagnostics.hostname === '127.0.0.1' ||
                    diagnostics.hostname === '0.0.0.0' ||
                    (diagnostics.hostname && diagnostics.hostname.includes('.web.app')) || // Firebase hosting
                    (diagnostics.hostname && diagnostics.hostname.includes('.firebaseapp.com')) || // Firebase hosting
                    // Allow development servers (common ports)
                    (diagnostics.hostname && diagnostics.hostname.includes(':5173')) || // Vite dev server
                    (diagnostics.hostname && diagnostics.hostname.includes(':3000')) || // React dev server
                    (diagnostics.hostname && diagnostics.hostname.includes(':8080')) || // Common dev port
                    // Allow if protocol/hostname are undefined (development environment)
                    (!diagnostics.protocol && !diagnostics.hostname) ||
                    // Allow file:// protocol for local development
                    diagnostics.protocol === 'file:';
    
    console.log('Security check result:', {
      protocol: diagnostics.protocol,
      hostname: diagnostics.hostname,
      isSecure,
      isDevelopment: process.env.NODE_ENV === 'development'
    });
    
    if (!isSecure) {
      console.warn('Geolocation security check failed:', {
        protocol: diagnostics.protocol,
        hostname: diagnostics.hostname,
        isSecure
      });
      // Don't block geolocation in development - just warn
      if (process.env.NODE_ENV === 'development' || !diagnostics.protocol) {
        console.log('Allowing geolocation in development environment despite security check');
        return null; // Allow it to proceed
      }
      return 'Geolocation requires HTTPS (except on localhost)';
    }
    
    console.log('Geolocation diagnostics passed - no issues detected');
    return null; // No issues detected
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

        // Run diagnostics first
        const diagnosticError = diagnoseGeolocation();
        if (diagnosticError) {
          throw new Error(diagnosticError);
        }

        // Start tracking with user ID
        console.log('About to call startTracking...');
        const success = await startTracking(user.uid);
        console.log('startTracking returned:', success);
        
        if (!success) {
          throw new Error('Location tracking service failed to start');
        }

        console.log('Location tracking started successfully');
        
        // Don't throw an error if startTracking returns true
        // The location tracking is working as evidenced by the logs
        // The error handling should be done by the location service callbacks
      } catch (error) {
        console.error('Location service error:', {
          error: error.message,
          code: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          user: user?.uid,
          status: locationStatus
        });
        
        console.log('Setting hasLocationError to true');
        setHasLocationError(true);
        
        let errorMessage = 'Failed to start location tracking. ';
        const errorMsg = error.message || error.toString() || 'Unknown error';
        
        if (errorMsg.includes('permission denied')) {
          errorMessage += 'Please enable location access in your browser settings.';
        } else if (errorMsg.includes('not supported')) {
          errorMessage += 'Your browser does not support location services.';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('network') || errorMsg.includes('blocked')) {
          errorMessage = 'Location tracking failed. Please enter your location manually';
        } else if (errorMsg.includes('position unavailable')) {
          errorMessage += 'Location information is unavailable. Please check your device\'s location services.';
        } else {
          errorMessage += errorMsg;
        }
        
        // Reset tracking state when there's an error
        setHasLocationError(true);
        setLocationError(errorMessage);
        setLocationStatusMessage(errorMessage);
        
        // Force stop tracking to reset the button state
        stopTracking(true);
        
        console.log('Set locationStatusMessage to:', errorMessage);
      } finally {
        setIsLocationLoading(false);
      }
    }
  };

  // Update the handleCreateRide function to handle both modes
  const handleCreateRide = async () => {
    if (mode === 'join') {
      // Handle joining existing ride
      // ... existing join ride logic ...
    } else {
      // Handle creating new ride
      if (!destination || users.length === 0) {
        console.log('Group creation blocked: Missing requirements', {
          hasDestination: !!destination,
          userCount: users.length
        });
        showLocalNotification('Please add at least one participant and set the destination location', 'error');
        return;0
      }

      // ... rest of the existing create ride logic ...
    }
  };

  const handleSetDestinationFromMap = () => {
    setMapClickMode('destination');
    showLocalNotification('Click on the map to set the destination location');
  };

  const handleSetManualLocationFromMap = () => {
    setMapClickMode('manual-location');
    showLocalNotification('Click on the map to set your location manually');
  };

  const handleMapClick = async (event) => {
    if (!mapClickMode) return;

    const { lat, lng } = event.latlng;
    
    if (mapClickMode === 'destination') {
      await handleDestinationChange({ lat, lng });
      setMapClickMode(null);
      showLocalNotification('Destination set from map');
    } else if (mapClickMode === 'manual-location') {
      try {
        // Get address for the clicked location
        const address = await getAddressFromCoords(lat, lng);
        
        // Set manual location using the location tracking service
        setManualLocation(lat, lng, address);
        
        // Clear error state
        setHasValidLocation(true);
        setHasLocationError(false);
        setLocationError(null);
        
        // Clear error message if we had one
        if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
          setLocationStatusMessage('Location set from map');
          console.log('✅ Map location setting successful:', { coordinates: { lat, lng }, address });
        }
        
        // Update form state
        setForm(prev => ({
          ...prev,
          userLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
          startingLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`
        }));
        
        setMapClickMode(null);
        showLocalNotification('Location set manually from map');
      } catch (error) {
        console.error('Error setting manual location:', error);
        showLocalNotification('Failed to set location from map', 'error');
      }
    }
  };

  // Add a test function for debugging geolocation
  const testGeolocation = () => {
    console.log('=== Testing Geolocation ===');
    
    // Test 1: Check if geolocation is supported
    console.log('1. Geolocation supported:', 'geolocation' in navigator);
    
    // Test 2: Run diagnostics
    const diagnosticError = diagnoseGeolocation();
    console.log('2. Diagnostics result:', diagnosticError || 'PASSED');
    
    // Test 3: Try to get current position
    if ('geolocation' in navigator) {
      console.log('3. Testing getCurrentPosition...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('✅ Geolocation SUCCESS:', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString()
          });
        },
        (error) => {
          console.error('❌ Geolocation FAILED:', {
            code: error.code,
            message: error.message
          });
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    } else {
      console.error('❌ Geolocation not supported');
    }
  };

  // Make the test function available globally for debugging
  if (typeof window !== 'undefined') {
    window.testGeolocation = testGeolocation;
  }

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
            {/* Tab Navigation */}
            <div className="sidebar-tabs">
              <button 
                className={`tab-button ${activeTab === 'form' ? 'active' : ''}`}
                onClick={() => setActiveTab('form')}
              >
                <i className="fas fa-user-plus"></i>
                Add Participants
              </button>
              <button 
                className={`tab-button ${activeTab === 'route' ? 'active' : ''}`}
                onClick={() => setActiveTab('route')}
              >
                <i className="fas fa-route"></i>
                Route Info
              </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'form' ? (
                <>
                  <UserForm 
                    form={form} 
                    onChange={handleChange} 
                    onSubmit={addUser} 
                    onDestinationChange={handleDestinationChange}
                    onUserLocationChange={handleUserLocationChange}
                    creatorRole={form.role}
                    existingParticipants={users}
                    isTrackingLocation={isTracking}
                    rideId={createdRideId}
                    groupCreated={groupCreated}
                    hideNameInput={true}
                    onSetDestinationFromMap={handleSetDestinationFromMap}
                    onLocationTrackingToggle={isTracking ? stopTracking : handleStartTracking}
                    isLocationLoading={isLocationLoading}
                    onSetManualLocationFromMap={handleSetManualLocationFromMap}
                    locationStatusMessage={locationStatusMessage}
                  />
                  
                  {/* Enhanced UserTable */}
                  <div className="user-table-container">
                    <div className="user-table-header">
                      <h5 className="participants-title">Participants</h5>
                    </div>
                    <div className="user-table-content">
                      <UserTable 
                        users={users}
                        onDelete={handleDelete}
                        onRoleChange={handleRoleChange}
                        rideId={createdRideId}
                      />
                    </div>
                    <div className="user-table-footer">
                      <button 
                        className="btn btn-outline-primary add-friends-btn"
                        onClick={() => setShowFriendModal(true)}
                      >
                        <i className="fas fa-user-plus"></i>
                        Add Friends
                      </button>
                    </div>
                  </div>

                  <div className="create-group-section">
                    <button
                      className={`create-group-button ${groupCreated ? 'created' : ''}`}
                      onClick={handleCreateGroup}
                      disabled={
                        isCreatingGroup ||
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
                </>
              ) : (
                <div className="route-info-tab">
                  <h5>Route Information</h5>
                  
                  {calculatedRoute ? (
                    <div className="route-details">
                      <div className="route-summary">
                        <div className="route-stat">
                          <i className="fas fa-route"></i>
                          <div>
                            <span className="stat-label">Total Distance</span>
                            <span className="stat-value">
                              {calculatedRoute.properties?.summary?.distance 
                                ? `${(calculatedRoute.properties.summary.distance / 1609.34).toFixed(1)} mi`
                                : 'Calculating...'
                              }
                            </span>
                          </div>
                        </div>
                        
                        <div className="route-stat">
                          <i className="fas fa-clock"></i>
                          <div>
                            <span className="stat-label">Estimated Time</span>
                            <span className="stat-value">
                              {calculatedRoute.properties?.summary?.duration 
                                ? `${Math.round(calculatedRoute.properties.summary.duration / 60)} min`
                                : 'Calculating...'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {calculatedRoute.properties?.summary?.waypoints && (
                        <div className="waypoints-info">
                          <h6>Route Waypoints</h6>
                          <div className="waypoints-list">
                            {calculatedRoute.properties.summary.waypoints.map((waypoint, index) => (
                              <div key={index} className="waypoint-item">
                                <span className="waypoint-number">{index + 1}</span>
                                <span className="waypoint-name">{waypoint.name || `Stop ${index + 1}`}</span>
                              </div>
                            ))}
                          </div>
                </div>
              )}
            </div>
                  ) : (
                    <div className="no-route-info">
                      <i className="fas fa-route text-muted"></i>
                      <p className="text-muted">Route information will be displayed here after calculating the route.</p>
                      {destination && (
                        <button 
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => calculateAndDisplayRoute(userLocation, destination)}
                          disabled={isCalculatingRoute}
                        >
                          {isCalculatingRoute ? (
                            <>
                              <i className="fas fa-spinner fa-spin"></i>
                              Calculating...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-calculator"></i>
                              Calculate Route
                            </>
                          )}
                        </button>
                      )}
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
              calculatedRoute={calculatedRoute}
              onSetDestinationFromMap={(coords) => handleDestinationChange(coords)}
              onRouteUpdate={(route) => {
                console.log('Route updated:', route);
                setCalculatedRoute(route);
              }}
              onMapClick={handleMapClick}
            />
          </div>
        </div>
      </div>

      {/* Friend Selection Modal */}
      {showFriendModal && (
        <div className="modal-backdrop">
          <div className="friend-selection-modal">
            <div className="modal-header">
              <h2>Add Friends to Ride</h2>
              <button className="close-button" onClick={() => setShowFriendModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <UserSearch 
              onSelectFriend={(friend) => {
                console.log('Friend selected from UserSearch:', friend);
                
                // Add the friend to the ride as a passenger
                const friendData = {
                  id: friend.id,
                  name: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
                  displayName: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
                  role: 'passenger',
                  isCreator: false,
                  photoURL: friend.profile?.photoURL || friend.photoURL || '',
                  email: friend.profile?.email || friend.email || ''
                };
                
                console.log('Friend data being passed to addUser:', friendData);
                
                // Check if friend is already in the ride
                const isAlreadyAdded = users.some(user => user.id === friend.id);
                if (isAlreadyAdded) {
                  showLocalNotification(`${friendData.displayName} is already in the ride`, 'warning');
                  return;
                }
                
                // Add friend to the ride
                addUser(friendData);
                setShowFriendModal(false);
                showLocalNotification(`${friendData.displayName} added to the ride`, 'success');
              }} 
            />
          </div>
        </div>
      )}

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
                Your group is now ready. Once participants provide their locations, 
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
  );
}

export default RouteOptimizer;
