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
import '../styles/RouteOptimizer.css';
import locationTrackingService, { useLocation as useLocationTracking } from '../services/locationTrackingService';
import { toast } from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FaMapMarkerAlt, FaUserPlus, FaRoute, FaTimes, FaChevronLeft, FaChevronRight, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { showNotification } from '../utils/notifications';
import SimpleLoading from '../components/SimpleLoading';
import { 
  Box, 
  Container, 
  Typography, 
  Card, 
  CardContent, 
  Button, 
  Stack, 
  Divider, 
  Avatar, 
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  Paper,
  Grid,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Autocomplete,
  Popper
} from '@mui/material';
import {
  Add as AddIcon,
  LocationOn as LocationIcon,
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Group as GroupIcon,
  CheckCircle as CheckIcon,
  Close as CloseIcon,
  Menu as MenuIcon,
  Map as MapIcon,
  Route as RouteIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  Edit as EditIcon
} from '@mui/icons-material';

// Import the real Mapbox service
import { MAPBOX_SERVICE, calculateDistance, getCurrentLocation } from '../services/locationService';

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
  const lastSearchQueryRef = useRef(null); // Track last search query to prevent unnecessary cache clearing

  // Add a new state to track if we have a valid location
  const [hasValidLocation, setHasValidLocation] = useState(false);

  // Add missing state variables - moved up to fix initialization order
  const [hasLocationError, setHasLocationError] = useState(false);

  // Move useLocationTracking hook here after all state declarations
  const {
    location: trackingLocation,
    isTracking,
    status: locationStatus,
    error: locationServiceError,
    startTracking,
    stopTracking,
    setManualLocation
  } = useLocationTracking({
    preset: 'office', // Use office preset for better compatibility with restricted networks
    updateFirebase: true,
    onLocationUpdate: async (locationData) => {
      console.log('Location update received in RouteOptimizer:', locationData);
      
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
        
        // Update status message
          setLocationStatusMessage(`Location tracking active (accuracy: ${Math.round(accuracy)}m)`);
      }
      
      // Update user location state
      const newLocation = { lat, lng, address, accuracy };
      setUserLocation(newLocation);
      
      // Update form state
        setForm(prev => ({
          ...prev,
          userLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
          startingLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`
        }));
      
      // Update status message
      setLocationStatusMessage(`Location tracking active (accuracy: ${Math.round(accuracy)}m)`);
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
          // Show "stopped" message
          setLocationStatusMessage('Location tracking stopped');
          setUserLocation(null);
          setHasValidLocation(false); // Reset valid location state
          break;
        case 'error':
          // Set error status and reset tracking state
          setLocationStatusMessage('Location tracking failed. Please enter your location manually');
          setHasLocationError(true); // Set error flag
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

  // Add a counter for unique notification IDs
  const notificationIdCounter = useRef(0);

  // Destination search state
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchTimeoutRef = useRef(null);
  
  // Get user location from location tracking service
  const { location: trackedLocation, isTracking: isLocationTracking } = useLocationTracking();





  // Add notification function - moved to top to avoid initialization error
  const showLocalNotification = (message, type = 'success') => {
    const id = `${Date.now()}-${notificationIdCounter.current++}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Simplified destination search
  const searchDestinationsLocal = async (query) => {
    console.log('🔍 [ROUTE_OPTIMIZER] searchDestinationsLocal called with:', query);
    
    if (!query || query.length < 2) {
      console.log('🔍 [ROUTE_OPTIMIZER] Query too short, clearing suggestions');
      setDestinationSuggestions([]);
      setIsDropdownOpen(false);
      return;
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      console.log('🔍 [ROUTE_OPTIMIZER] Starting search for:', query);
      setIsLoadingSuggestions(true);
      setIsDropdownOpen(true);

      try {
        const searchOptions = {
          limit: 8,
          maxDistance: 50 // 50 mile radius
        };
        
        // Add user location if available
        if (userLocation) {
          searchOptions.userLocation = userLocation;
          console.log('🔍 [ROUTE_OPTIMIZER] Searching with user location:', userLocation);
          console.log('🔍 [ROUTE_OPTIMIZER] User location type:', typeof userLocation);
          console.log('🔍 [ROUTE_OPTIMIZER] User location has lat/lng:', userLocation.lat && userLocation.lng);
        } else {
          console.log('🔍 [ROUTE_OPTIMIZER] No user location available');
        }

        console.log('🔍 [ROUTE_OPTIMIZER] Calling MAPBOX_SERVICE.searchDestinations with:', searchOptions);
        
        // Test if MAPBOX_SERVICE is available
        if (!MAPBOX_SERVICE) {
          console.error('🔍 [ROUTE_OPTIMIZER] MAPBOX_SERVICE is not available');
          throw new Error('Mapbox service not available');
        }
        
        if (!MAPBOX_SERVICE.searchDestinations) {
          console.error('🔍 [ROUTE_OPTIMIZER] MAPBOX_SERVICE.searchDestinations is not available');
          throw new Error('Mapbox search function not available');
        }
        
        console.log('🔍 [ROUTE_OPTIMIZER] MAPBOX_SERVICE.searchDestinations type:', typeof MAPBOX_SERVICE.searchDestinations);
        console.log('🔍 [ROUTE_OPTIMIZER] MAPBOX_SERVICE.searchDestinations:', MAPBOX_SERVICE.searchDestinations);
        
        const results = await MAPBOX_SERVICE.searchDestinations(query, searchOptions);
        console.log('🔍 [ROUTE_OPTIMIZER] Search results:', results);
        
        if (results && results.length > 0) {
          // Debug: Log each result's distance
          results.forEach((result, index) => {
            console.log(`🔍 [ROUTE_OPTIMIZER] Result ${index}:`, {
              display_name: result.display_name,
              distance: result.distance,
              isError: result.isError,
              type: result.type,
              lat: result.lat,
              lon: result.lon
            });
          });
          
          // Filter out error messages and distant results
          const validResults = results.filter(result => {
            if (result.isError) {
              console.log(`🔍 [ROUTE_OPTIMIZER] Filtering out error result:`, result.display_name);
              return false;
            }
            
            // If we have user location and distance, filter by distance
            if (userLocation && result.distance !== undefined) {
              const isValid = result.distance <= 50; // Only show results within 50 miles
              if (!isValid) {
                console.log(`🔍 [ROUTE_OPTIMIZER] Filtering out distant result: ${result.display_name} (${result.distance} miles)`);
              }
              return isValid;
            }
            
            // If no user location or no distance info, include all valid results
            return true;
          });
          
          console.log('🔍 [ROUTE_OPTIMIZER] Valid results:', validResults);
          setDestinationSuggestions(validResults);
          setIsDropdownOpen(true);
        } else {
          console.log('🔍 [ROUTE_OPTIMIZER] No results found');
          setDestinationSuggestions([]);
          setIsDropdownOpen(false);
        }
      } catch (error) {
        console.error('🔍 [ROUTE_OPTIMIZER] Search failed:', error);
        setDestinationSuggestions([]);
        setIsDropdownOpen(false);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300); // 300ms debounce
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
      console.log('=== ROUTE CALCULATION START ===');
      console.log('Calling calculateOptimizedRoute with waypoints:', waypoints);
      console.log('Waypoint details:', waypoints.map(wp => ({
        type: wp.type,
        name: wp.name,
        location: wp.location,
        lat: wp.lat,
        lng: wp.lng
      })));
      
      // Route optimization temporarily disabled - Mapbox integration pending
      console.log('Route optimization temporarily disabled - Mapbox integration pending');
      const route = null;
      
      console.log('=== ROUTE CALCULATION COMPLETED ===');
      console.log('Route result:', {
        routeType: route?.type,
        hasRoutes: !!route?.routes,
        routesCount: route?.routes?.length || 0,
        totalDistance: route?.totalDistance,
        totalDuration: route?.totalDuration,
        firstRoute: route?.routes?.[0] ? {
          type: route.routes[0].type,
          waypointsCount: route.routes[0].waypoints?.length || 0,
          totalDistance: route.routes[0].totalDistance,
          totalDuration: route.routes[0].totalDuration
        } : null
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

  // Simplified route calculation - now handled in handleDestinationSelect
  // Removed automatic useEffect to prevent confusion and duplicate calculations

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

  // Initialize component
  useEffect(() => {
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
        
        // Check if Mapbox API key is configured
        const apiKey = import.meta.env.VITE_MAPBOX_API_KEY;
        console.log('Mapbox API key:', apiKey ? 'Present' : 'Missing');
        
        if (!apiKey || apiKey === 'undefined' || !apiKey.startsWith('pk.')) {
          showLocalNotification(
            'Mapbox API key not configured. Location suggestions will be limited. Please check your .env file.',
            'warning'
          );
        } else {
          console.log('Mapbox API key configured successfully');
        }
        

        
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

  // Clean up search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Update userLocation when trackedLocation changes
  useEffect(() => {
    if (trackedLocation && trackedLocation.lat && trackedLocation.lng) {
      console.log('📍 Location tracking service provided location:', trackedLocation);
      setUserLocation(trackedLocation);
      setIsTracking(isLocationTracking);
    }
  }, [trackedLocation, isLocationTracking]);
  
  // Auto-start location tracking when user is driver
  useEffect(() => {
    if (user && creatorRole === 'driver' && !isTracking) {
      console.log('🚗 Auto-starting location tracking for driver');
      locationTrackingService.startTracking(user?.uid, { preset: 'office' });
    }
  }, [user, creatorRole, isTracking]);





  // Show loading state
  if (isLoading) {
    return (
      <SimpleLoading 
        message="Loading route optimizer..."
        size="large"
      />
    );
  }

  // Debug panel for geolocation issues - temporarily removed to fix hooks issue
  // const DebugPanel = () => {
  //   // ... component code removed
  // };

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
      return await MAPBOX_SERVICE.getAddressFromCoords(lat, lng);
    } catch (error) {
      console.error('Error getting address from coordinates:', error);
      return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }
  };

  const geocodeAddress = async (address) => {
    if (!address) return null;
    try {
      const result = await MAPBOX_SERVICE.getCoordsFromAddress(address);
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

      // Only require destination for the creator/driver, not for friends being added
      if (userData.isCreator && !userData.destination && !destination) {
        throw new Error('Please set a destination for the ride before adding participants');
      }

      // Use the destination from userData if provided, otherwise use the global destination
      const destinationToUse = userData.destination || destination;

      // If this is the creator being added as a driver, use their current location
      if (userData.isCreator && userData.role === 'driver' && userLocation) {
        console.log('Adding creator as driver with current location:', userLocation);
        userData.userLocationCoords = userLocation;
      }

      // If destinationToUse is a string, geocode it
      let destinationCoords = null;
      if (destinationToUse) {
      if (typeof destinationToUse === 'string') {
        destinationCoords = await geocodeAddress(destinationToUse);
        if (!destinationCoords) {
          throw new Error('Could not find the destination address');
        }
      } else {
        // If it's already an object with coordinates, use it directly
        destinationCoords = destinationToUse;
        }
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
        destination: destinationCoords?.address || destinationCoords || null,
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
      if (users.length === 0 && destinationCoords) {
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
    
    // Set processing state to show feedback
    setIsProcessingDestination(true);
    
    // Ensure coordinates are numbers
    let lat = coords.lat;
    let lng = coords.lng;
    
    // Convert string coordinates to numbers if needed
    if (typeof lat === 'string') lat = parseFloat(lat);
    if (typeof lng === 'string') lng = parseFloat(lng);
    
    // Validate coordinates
    if (!coords || typeof lat !== 'number' || typeof lng !== 'number' ||
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error('Invalid coordinates received:', coords);
      showLocalNotification('Invalid destination location. Please try selecting the location again.', 'error');
      setIsProcessingDestination(false);
      return;
    }

    try {
      // Get the address for the coordinates
      const address = await getAddressFromCoords(lat, lng);
      
      console.log('Destination coordinates and address:', {
        coords: { lat, lng },
        address
      });

      // Store both coordinates and address
      const destinationData = {
        lat: lat,
        lng: lng,
        address: address
      };
      
      // Update both the destination state and form state
      setDestination(destinationData);
      setForm(prev => ({
        ...prev,
        destination: address
      }));
      
      console.log('Destination set successfully:', destinationData);
      
      // Show success feedback
      showLocalNotification(`Destination set: ${address}`, 'success');
      
      // Calculate route immediately when destination is set (for preview)
      if (userLocation) {
        console.log('Calculating route preview for destination selection');
        try {
          await calculateAndDisplayRoute(userLocation, destinationData);
        } catch (error) {
          console.warn('Route preview calculation failed:', error.message);
          // Don't show error to user for preview calculations
        }
      }
    } catch (error) {
      console.error('Error setting destination:', error);
      showLocalNotification('Failed to set destination. Please try again in a few seconds.', 'error');
    } finally {
      // Clear processing state
      setIsProcessingDestination(false);
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

  // Debug function to test specific searches
  const testSpecificSearch = async (query) => {
    console.log('=== TESTING SPECIFIC SEARCH ===');
    console.log('Query:', query);
    console.log('User Location:', userLocation);
    
    try {
              const results = await MAPBOX_SERVICE.searchDestinations(query, {
        userLocation: userLocation,
        limit: 5
      });
      
      console.log('Search results:', results);
      
      if (results && results.length > 0) {
        const realResults = results.filter(result => !result.isError);
        console.log('Real results:', realResults);
        
        if (realResults.length > 0) {
          const bestResult = realResults[0];
          console.log('Best result:', {
            display_name: bestResult.display_name,
            lat: bestResult.lat,
            lon: bestResult.lon,
            distance: bestResult.distance,
            quality: bestResult.quality,
            type: bestResult.type
          });
        }
      }
    } catch (error) {
      console.error('Test failed:', error);
    }
  };

  // Add a function to clear route calculation cache
  const clearRouteCalculationCache = () => {
    lastRouteCalculationRef.current = null;
    console.log('🧹 Route calculation cache cleared');
  };
  
  // Test Mapbox integration
  const testMapboxIntegration = async () => {
    console.log('🧪 Testing Mapbox integration...');
    
    try {
      // Test geocoding
      console.log('🧪 Testing geocoding...');
      const geocodeResult = await MAPBOX_SERVICE.getCoordsFromAddress('Starbucks, Plano, TX');
      console.log('🧪 Geocoding result:', geocodeResult);
      
      // Test search
      console.log('🧪 Testing search...');
      const searchResult = await MAPBOX_SERVICE.searchDestinations('walmart', {
        limit: 3,
        userLocation: userLocation
      });
      console.log('🧪 Search result:', searchResult);
      
      // Test reverse geocoding
      if (userLocation) {
        console.log('🧪 Testing reverse geocoding...');
        const reverseResult = await MAPBOX_SERVICE.getAddressFromCoords(userLocation.lat, userLocation.lng);
        console.log('🧪 Reverse geocoding result:', reverseResult);
      }
      
    } catch (error) {
      console.error('🧪 Mapbox integration test failed:', error);
    }
  };

  // Test functions commented out - Mapbox integration pending
  /*
  const testSearchAPIv2 = async () => {
    console.log('🧪 Testing Search API v2 directly...');
    
    if (!userLocation) {
      console.log('❌ No user location available for test');
      return;
    }
    
    console.log('🧪 User location for test:', userLocation);
    
    // Test different parameter combinations
    const testCases = [
      {
        name: 'Original parameters',
        params: {
          maxMatches: '5',
          shapePoints: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          hostedData: 'mqap.ntpois',
          search: 'starbucks'
        }
      },
      {
        name: 'Alternative parameters (center instead of shapePoints)',
        params: {
          maxMatches: '5',
          center: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          hostedData: 'mqap.ntpois',
          search: 'starbucks'
        }
      },
      {
        name: 'Without hostedData',
        params: {
          maxMatches: '5',
          center: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          search: 'starbucks'
        }
      },
      {
        name: 'Basic search without location',
        params: {
          maxMatches: '5',
          search: 'starbucks'
        }
      }
    ];
    
    for (const testCase of testCases) {
      try {
        console.log(`🧪 Testing: ${testCase.name}`);
        
        const searchUrl = new URL('https://www.mapquestapi.com/search/v2/search');
        searchUrl.searchParams.append('key', import.meta.env.VITE_MAPQUEST_API_KEY || 'rbGFNBHwHoNH00Ev02kfYtTCw2PZHcNU');
        
        // Add all parameters for this test case
        Object.entries(testCase.params).forEach(([key, value]) => {
          searchUrl.searchParams.append(key, value);
        });
        
        console.log(`🧪 ${testCase.name} URL:`, searchUrl.toString().replace(searchUrl.searchParams.get('key'), '***'));
        
        const response = await fetch(searchUrl.toString());
        console.log(`🧪 ${testCase.name} response status:`, response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`🧪 ${testCase.name} error:`, errorText);
          continue;
        }
        
        const data = await response.json();
        console.log(`🧪 ${testCase.name} response:`, data);
        
        if (data.searchResults && data.searchResults.length > 0) {
          console.log(`🧪 ${testCase.name} found ${data.searchResults.length} results`);
          console.log(`🧪 ${testCase.name} first result:`, data.searchResults[0]);
        } else {
          console.log(`🧪 ${testCase.name} returned no results`);
        }
      } catch (error) {
        console.error(`🧪 ${testCase.name} failed:`, error);
      }
      
      // Wait a bit between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };
  
  // Test different business types to see what's available
  const testBusinessTypes = async () => {
    console.log('🧪 Testing different business types...');
    
    if (!userLocation) {
      console.log('❌ No user location available for test');
      return;
    }
    
    const businessTypes = ['starbucks', 'mcdonalds', 'walmart', 'target', 'kroger', 'restaurant', 'gas', 'bank'];
    
    for (const businessType of businessTypes) {
      try {
        console.log(`🧪 Testing business type: ${businessType}`);
        
        const searchUrl = new URL('https://www.mapquestapi.com/search/v2/search');
        searchUrl.searchParams.append('key', import.meta.env.VITE_MAPQUEST_API_KEY || 'rbGFNBHwHoNH00Ev02kfYtTCw2PZHcNU');
        searchUrl.searchParams.append('maxMatches', '3');
        searchUrl.searchParams.append('shapePoints', `${userLocation.lat},${userLocation.lng}`);
        searchUrl.searchParams.append('radius', '80');
        searchUrl.searchParams.append('units', 'k');
        searchUrl.searchParams.append('hostedData', 'mqap.ntpois');
        searchUrl.searchParams.append('search', businessType);
        
        console.log(`🧪 ${businessType} URL:`, searchUrl.toString().replace(searchUrl.searchParams.get('key'), '***'));
        
        const response = await fetch(searchUrl.toString());
        
        if (!response.ok) {
          console.log(`🧪 ${businessType} failed with status:`, response.status);
          continue;
        }
        
        const data = await response.json();
        
        if (data.searchResults && data.searchResults.length > 0) {
          console.log(`🧪 ${businessType} found ${data.searchResults.length} results:`);
          data.searchResults.forEach((result, index) => {
            console.log(`  ${index + 1}. ${result.name} (${result.distance}km away)`);
          });
        } else {
          console.log(`🧪 ${businessType} returned no results`);
        }
      } catch (error) {
        console.error(`🧪 ${businessType} failed:`, error);
      }
      
      // Wait a bit between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  // Test the actual search function used in the app
  const testAppSearch = async (query = 'starbucks') => {
    console.log('🧪 Testing app search function with query:', query);
    
    if (!userLocation) {
      console.log('❌ No user location available for test');
      return;
    }
    
    try {
      const searchOptions = {
        limit: 5,
        maxDistance: 50,
        userLocation: userLocation
      };
      
              console.log('🧪 Calling MAPBOX_SERVICE.searchDestinations with:', searchOptions);
        const results = await MAPBOX_SERVICE.searchDestinations(query, searchOptions);
      
      console.log('🧪 App search results:', results);
      
      if (results && results.length > 0) {
        console.log('🧪 Found', results.length, 'results:');
        results.forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.display_name} (${result.distance}km away)`);
        });
      } else {
        console.log('🧪 No results found');
      }
    } catch (error) {
      console.error('🧪 App search failed:', error);
    }
  };

  // Test API parameters systematically
  const testAPIParameters = async () => {
    console.log('🧪 Testing API parameters systematically...');
    
    if (!userLocation) {
      console.log('❌ No user location available for test');
      return;
    }
    
    const testCases = [
      {
        name: 'Basic shapePoints with search',
        params: {
          maxMatches: '3',
          shapePoints: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          hostedData: 'mqap.ntpois',
          search: 'starbucks'
        }
      },
      {
        name: 'Basic center with search',
        params: {
          maxMatches: '3',
          center: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          hostedData: 'mqap.ntpois',
          search: 'starbucks'
        }
      },
      {
        name: 'shapePoints with q parameter',
        params: {
          maxMatches: '3',
          shapePoints: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          hostedData: 'mqap.ntpois',
          q: 'starbucks'
        }
      },
      {
        name: 'center with q parameter',
        params: {
          maxMatches: '3',
          center: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          hostedData: 'mqap.ntpois',
          q: 'starbucks'
        }
      },
      {
        name: 'Without hostedData',
        params: {
          maxMatches: '3',
          center: `${userLocation.lat},${userLocation.lng}`,
          radius: '80',
          units: 'k',
          search: 'starbucks'
        }
      }
    ];
    
    for (const testCase of testCases) {
      try {
        console.log(`🧪 Testing: ${testCase.name}`);
        
        const searchUrl = new URL('https://www.mapquestapi.com/search/v2/search');
        searchUrl.searchParams.append('key', import.meta.env.VITE_MAPQUEST_API_KEY || 'rbGFNBHwHoNH00Ev02kfYtTCw2PZHcNU');
        
        // Add all parameters for this test case
        Object.entries(testCase.params).forEach(([key, value]) => {
          searchUrl.searchParams.append(key, value);
        });
        
        console.log(`🧪 ${testCase.name} URL:`, searchUrl.toString().replace(searchUrl.searchParams.get('key'), '***'));
        
        const response = await fetch(searchUrl.toString());
        console.log(`🧪 ${testCase.name} response status:`, response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`🧪 ${testCase.name} HTTP error:`, errorText);
          continue;
        }
        
        const data = await response.json();
        console.log(`🧪 ${testCase.name} response keys:`, Object.keys(data));
        
        if (data.searchResults && data.searchResults.length > 0) {
          console.log(`🧪 ${testCase.name} found ${data.searchResults.length} results`);
          console.log(`🧪 ${testCase.name} first result:`, data.searchResults[0]);
        } else if (data.results && data.results.length > 0) {
          console.log(`🧪 ${testCase.name} found ${data.results.length} results (alternative structure)`);
          console.log(`🧪 ${testCase.name} first result:`, data.results[0]);
        } else {
          console.log(`🧪 ${testCase.name} returned no results`);
          if (data.info) {
            console.log(`🧪 ${testCase.name} info:`, data.info);
          }
        }
      } catch (error) {
        console.error(`🧪 ${testCase.name} failed:`, error);
      }
      
      // Wait a bit between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  // Add debug functions to global scope for testing
  if (typeof window !== 'undefined') {
    window.testGeolocation = testGeolocation;
    window.testSpecificSearch = testSpecificSearch;
    window.clearRouteCache = clearRouteCalculationCache;
    window.testMapbox = testMapboxIntegration;
    window.userLocation = userLocation;
    window.trackedLocation = trackedLocation;
  }
  */

  // Handle destination selection
  const handleDestinationSelect = async (selectedOption) => {
    if (!selectedOption) return;
    
    try {
      let coords;
      
      if (selectedOption.lat && selectedOption.lon) {
        // Use the provided coordinates
        coords = {
          lat: parseFloat(selectedOption.lat),
          lng: parseFloat(selectedOption.lon),
          address: selectedOption.display_name
        };
      } else {
        // Try to geocode the display name
        const geocodeResult = await MAPBOX_SERVICE.getCoordsFromAddress(selectedOption.display_name);
        if (geocodeResult) {
          coords = {
            lat: geocodeResult.lat,
            lng: geocodeResult.lng,
            address: geocodeResult.address
          };
        }
      }
      
      if (coords) {
        // Set destination
        await handleDestinationChange(coords);
        setForm(prev => ({ ...prev, destination: coords.address }));
        
        // Clear suggestions and close dropdown
        setDestinationSuggestions([]);
        setIsDropdownOpen(false);
        
        // Automatically calculate route if user is driver and has location
        if (creatorRole === 'driver' && userLocation) {
          console.log('🚗 Auto-calculating route for driver');
          await calculateAndDisplayRoute(userLocation, coords);
        }
      } else {
        console.warn('⚠️ Could not get coordinates for selected destination');
        setForm(prev => ({ ...prev, destination: selectedOption.display_name }));
      }
      
    } catch (error) {
      console.error('❌ Error setting destination:', error);
      setForm(prev => ({ ...prev, destination: selectedOption.display_name }));
    }
  };

  return (
    <Box 
      className="route-optimizer-page"
      sx={{ 
        height: 'calc(100vh - 80px)', 
        display: 'flex', 
        position: 'fixed', 
        top: '80px', 
        left: 0, 
        right: 0, 
        bottom: 0,
        // Override global CSS padding
        '&.route-optimizer-page': {
          paddingTop: 0
        },
        // Ensure no background color shows through
        background: 'transparent'
      }}
    >
      {/* DebugPanel removed to fix hooks issue */}
      {/* Sidebar */}
      <Paper 
        elevation={0}
        sx={{ 
          width: isSidebarOpen ? 420 : 0, 
          background: '#fff',
          borderRight: '1px solid #e0c9b3',
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1000
        }}
      >
        <Box sx={{ 
          height: '100vh', 
          overflow: 'auto', 
          background: '#f9f6f2',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2
        }}>
          {/* Header */}
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
            <Box>
              <Typography variant="h5" fontWeight={700} color="#4e342e" mb={0.25}>
                {mode === 'create' ? 'Create a Ride' : 'Join a Ride'}
              </Typography>
              <Typography variant="caption" color="#7c5e48" sx={{ fontStyle: 'italic' }}>
                Plan your journey with friends
              </Typography>
            </Box>
            <IconButton 
              onClick={() => setIsSidebarOpen(false)}
              size="small"
              sx={{ 
                color: '#b08968',
                background: '#fff',
                boxShadow: '0 2px 8px rgba(176, 137, 104, 0.15)',
                '&:hover': {
                  background: '#f9f6ef',
                  transform: 'scale(1.05)'
                }
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Location Tracking Section */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3'
          }}>
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" mb={1.5}>
                <Avatar sx={{ 
                  width: 32, 
                  height: 32, 
                  background: '#b08968',
                  mr: 1.5
                }}>
                  <LocationIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                    Your Location
                  </Typography>
                  <Typography variant="caption" color="#7c5e48">
                    {isTracking ? 'Tracking active' : 'Location not set'}
                  </Typography>
                </Box>
              </Box>

              {userLocation ? (
                <Box>
                  <Chip 
                    label={userLocation.address || `Location (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`}
                    color="primary" 
                    variant="outlined"
                    size="small"
                    sx={{ 
                      mb: 1.5, 
                      background: '#fff', 
                      borderColor: '#4caf50', 
                      color: '#4caf50',
                      fontWeight: 500
                    }}
                    icon={<CheckIcon fontSize="small" />}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={() => {
                        stopTracking();
                        setUserLocation(null);
                      }}
                      sx={{ 
                        color: '#f44336', 
                        borderColor: '#ffcdd2',
                        borderRadius: 1.5,
                        px: 1.5,
                        py: 0.5
                      }}
                    >
                      Clear
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="#7c5e48" mb={1.5}>
                    Set your location to start planning your ride
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    name="userLocation"
                    placeholder="Enter your location or click on map"
                    value={form.userLocation || ''}
                    onChange={handleChange}
                    onBlur={async (e) => {
                      if (e.target.value.trim()) {
                        await handleUserLocationChange(e.target.value);
                      }
                    }}
                    sx={{ 
                      mb: 1.5,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 1.5,
                        background: '#fff',
                        '& fieldset': {
                          borderColor: '#e0c9b3'
                        },
                        '&:hover fieldset': {
                          borderColor: '#b08968'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#b08968'
                        }
                      }
                    }}
                  />
                  <Button 
                    variant="contained"
                    size="small"
                    startIcon={<LocationIcon fontSize="small" />}
                    onClick={handleStartTracking}
                    disabled={isLocationLoading}
                    fullWidth
                    sx={{ 
                      background: '#b08968', 
                      color: '#fff', 
                      borderRadius: 1.5,
                      py: 0.75,
                      '&:hover': {
                        background: '#a47551'
                      }
                    }}
                  >
                    {isLocationLoading ? 'Starting...' : 'Auto Detect'}
                  </Button>
                  
                  {/* Manual Location Option - Show when tracking fails or for office networks */}
                  {(hasLocationError || locationStatusMessage?.includes('blocked') || locationStatusMessage?.includes('failed')) && (
                    <Box mt={1.5}>
                      <Typography variant="caption" color="#7c5e48" display="block" mb={1}>
                        Or set location manually:
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button 
                          variant="outlined"
                          size="small"
                          startIcon={<MapIcon fontSize="small" />}
                          onClick={handleSetManualLocationFromMap}
                          sx={{ 
                            flex: 1,
                            color: '#b08968', 
                            borderColor: '#b08968',
                            borderRadius: 1.5,
                            py: 0.5,
                            '&:hover': {
                              borderColor: '#a47551',
                              background: '#f9f6ef'
                            }
                          }}
                        >
                          Click on Map
                        </Button>
                        <Button 
                          variant="outlined"
                          size="small"
                          startIcon={<EditIcon fontSize="small" />}
                          onClick={() => {
                            // Focus on the location input field
                            const input = document.querySelector('input[name="userLocation"]');
                            if (input) {
                              input.focus();
                              input.select();
                            }
                          }}
                          sx={{ 
                            flex: 1,
                            color: '#b08968', 
                            borderColor: '#b08968',
                            borderRadius: 1.5,
                            py: 0.5,
                            '&:hover': {
                              borderColor: '#a47551',
                              background: '#f9f6ef'
                            }
                          }}
                        >
                          Type Address
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}

              {locationStatusMessage && (
                <Alert 
                  severity={hasLocationError ? 'error' : 'info'} 
                  size="small"
                  sx={{ 
                    mt: 1.5,
                    background: hasLocationError ? '#ffebee' : '#e3f2fd',
                    color: hasLocationError ? '#c62828' : '#1565c0',
                    borderRadius: 1.5,
                    py: 0.5
                  }}
                >
                  <Typography variant="caption">
                    {locationStatusMessage}
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Destination Section */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3'
          }}>
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" mb={1.5}>
                <Avatar sx={{ 
                  width: 32, 
                  height: 32, 
                  background: '#b08968',
                  mr: 1.5
                }}>
                  <RouteIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                    Destination
                  </Typography>
                  <Typography variant="caption" color="#7c5e48">
                    Where are you heading?
                  </Typography>
                </Box>
              </Box>
              
              {destination ? (
                <Box>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                    <Box display="flex" alignItems="center">
                      <Avatar sx={{ 
                        width: 32, 
                        height: 32, 
                        background: isProcessingDestination ? '#ff9800' : '#4caf50',
                        mr: 1.5
                      }}>
                        {isProcessingDestination ? (
                          <SimpleLoading size="small" sx={{ color: '#fff' }} />
                        ) : (
                        <LocationIcon fontSize="small" sx={{ color: '#fff' }} />
                        )}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                          {isProcessingDestination ? 'Setting Destination...' : 'Destination Set'}
                        </Typography>
                        <Typography variant="caption" color="#7c5e48">
                          {isProcessingDestination ? 'Please wait while we set your destination' : 'Click to change location'}
                        </Typography>
                      </Box>
                    </Box>
                    {!isProcessingDestination && (
                    <IconButton 
                      size="small"
                      onClick={() => {
                        setDestination(null);
                        setForm(prev => ({ ...prev, destination: '' }));
                      }}
                      sx={{ 
                        color: '#b08968',
                        '&:hover': {
                          background: '#ffebee',
                          color: '#f44336'
                        }
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                    )}
                  </Box>
                  
                  <Paper sx={{ 
                    p: 1.5, 
                    background: '#f1f8e9', 
                    border: '1px solid #c8e6c9',
                    borderRadius: 2,
                    mb: 1.5
                  }}>
                    <Typography variant="body2" color="#2e7d32" fontWeight={500} sx={{ mb: 0.5 }}>
                      📍 {destination.address}
                    </Typography>
                    <Typography variant="caption" color="#388e3c">
                      Lat: {destination.lat.toFixed(6)}, Lng: {destination.lng.toFixed(6)}
                    </Typography>
                  </Paper>
                  
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LocationIcon fontSize="small" />}
                    onClick={() => {
                      // Focus on destination on map
                      if (mapRef.current) {
                        // This would need to be implemented in MapView
                        console.log('Focus on destination');
                      }
                    }}
                    sx={{ 
                      color: '#4caf50', 
                      borderColor: '#c8e6c9', 
                      borderRadius: 1.5,
                      width: '100%',
                      '&:hover': {
                        background: '#f1f8e9'
                      }
                    }}
                  >
                    View on Map
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="#7c5e48" mb={1.5}>
                    Set your destination to start planning
                  </Typography>
                  
                  {/* Test buttons removed - Mapbox integration pending */}
                  
                  <Autocomplete
                    freeSolo
                    options={destinationSuggestions}
                    getOptionLabel={(option) => {
                      if (typeof option === 'string') return option;
                      return option.display_name || '';
                    }}
                    loading={isLoadingSuggestions}
                    open={isDropdownOpen}
                    onOpen={() => setIsDropdownOpen(true)}
                    onClose={() => setIsDropdownOpen(false)}
                    onInputChange={(event, newInputValue, reason) => {
                      console.log('🔤 onInputChange called:', { newInputValue, reason });
                      setForm(prev => ({ ...prev, destination: newInputValue }));
                      
                      if (reason === 'input') {
                        // User is typing - search for suggestions
                        console.log('🔤 User typing, calling local searchDestinations');
                        // Call our local searchDestinations function that includes user location
                        searchDestinationsLocal(newInputValue);
                      } else if (reason === 'clear') {
                        // User cleared the input - clear everything
                        console.log('🔤 User cleared input');
                        setDestinationSuggestions([]);
                        setDestination(null);
                        setCalculatedRoute(null);
                        setRouteDetails(null);
                        setIsDropdownOpen(false);
                        
                        // Clear search timeout
                        if (searchTimeoutRef.current) {
                          clearTimeout(searchTimeoutRef.current);
                        }
                      }
                    }}
                    onChange={(event, newValue) => {
                      handleDestinationSelect(newValue);
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Enter destination (e.g., American Airlines Center, DFW Airport)"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {isLoadingSuggestions && <SimpleLoading size="small" />}
                              {destinationSuggestions.length > 0 && !isLoadingSuggestions && (
                                <Box sx={{ color: '#b08968', fontSize: '0.75rem', mr: 1 }}>
                                  {destinationSuggestions.length} found
                                </Box>
                              )}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                        sx={{ 
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 1.5,
                            background: '#fff',
                            '& fieldset': {
                              borderColor: destinationSuggestions.length > 0 ? '#b08968' : '#e0c9b3'
                            },
                            '&:hover fieldset': {
                              borderColor: '#b08968'
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#b08968'
                            }
                          }
                        }}
                      />
                    )}
                    renderOption={(props, option) => (
                      <Box component="li" {...props} sx={{ py: 1 }}>
                            <Box>
                          <Typography variant="body2" color="#4e342e" fontWeight={500}>
                            📍 {option.display_name}
                              </Typography>
                            {option.distance && option.distance > 0 && (
                            <Typography variant="caption" color="#b08968">
                                {option.distance < 1 ? `${(option.distance * 1000).toFixed(0)}m` : `${option.distance.toFixed(1)}km`} away
                            </Typography>
                            )}
                          </Box>
                        </Box>
                    )}
                    PopperComponent={(props) => (
                      <Popper
                        {...props}
                        placement="bottom-start"
                        sx={{
                          '& .MuiAutocomplete-paper': {
                            background: '#fff',
                            border: '1px solid #e0c9b3',
                            borderRadius: 2,
                            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.15)',
                            mt: 0.5,
                            zIndex: 9999
                          }
                        }}
                      />
                    )}
                    sx={{
                      '& .MuiAutocomplete-inputRoot': {
                        padding: '8px 12px'
                      }
                    }}
                  />
                  
                  {/* Route Status Display */}
                  {destination && userLocation && creatorRole === 'driver' && (
                    <Box mt={1.5}>
                      {isCalculatingRoute ? (
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          color: '#b08968',
                          fontSize: '0.875rem'
                        }}>
                          <SimpleLoading size="small" />
                          <span style={{ marginLeft: '8px' }}>Calculating route...</span>
                        </Box>
                      ) : calculatedRoute ? (
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          color: '#4caf50',
                          fontSize: '0.875rem'
                        }}>
                          <span>✅ Route calculated</span>
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => {
                              console.log('🧹 Clearing route');
                              setCalculatedRoute(null);
                              setRouteDetails(null);
                            }}
                            sx={{ 
                              color: '#b08968', 
                              fontSize: '0.75rem',
                              '&:hover': {
                                background: '#f9f6ef'
                              }
                            }}
                          >
                            Clear Route
                          </Button>
                        </Box>
                      ) : null}
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Participants Section */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3',
            flex: 0.8,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 200
          }}>
            <CardContent sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Box display="flex" alignItems="center">
                  <Avatar sx={{ 
                    width: 32, 
                    height: 32, 
                    background: '#b08968',
                    mr: 1.5
                  }}>
                    <GroupIcon fontSize="small" />
                  </Avatar>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                      Participants
                    </Typography>
                    <Typography variant="caption" color="#7c5e48">
                      {users.length} {users.length === 1 ? 'person' : 'people'} in your ride
                    </Typography>
                  </Box>
                </Box>
                <Button 
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={() => setShowFriendModal(true)}
                  sx={{ 
                    color: '#b08968', 
                    borderColor: '#e0c9b3', 
                    borderRadius: 1.5,
                    px: 1.5,
                    py: 0.5,
                    '&:hover': {
                      background: '#f9f6ef'
                    }
                  }}
                >
                  Add Friends
                </Button>
              </Box>

              {users.length === 0 ? (
                <Box textAlign="center" py={2.5} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Avatar sx={{ 
                    width: 48, 
                    height: 48, 
                    mb: 1.5, 
                    background: '#e0c9b3',
                    mx: 'auto'
                  }}>
                    <GroupIcon sx={{ color: '#7c5e48', fontSize: 24 }} />
                  </Avatar>
                  <Typography color="#7c5e48" mb={0.5} fontWeight={500} variant="body2">
                    No participants yet
                  </Typography>
                  <Typography variant="caption" color="#b08968" sx={{ fontStyle: 'italic' }}>
                    Add friends to start your adventure
                  </Typography>
                </Box>
              ) : (
                <List sx={{ p: 0, flex: 1, overflow: 'auto' }}>
                  {users.map((user, index) => (
                    <ListItem 
                      key={user.tempId || user.id} 
                      sx={{ 
                        background: '#fff', 
                        borderRadius: 2, 
                        mb: 1,
                        border: '1px solid #e0c9b3',
                        boxShadow: '0 2px 8px rgba(176, 137, 104, 0.08)',
                        '&:hover': {
                          boxShadow: '0 4px 12px rgba(176, 137, 104, 0.15)',
                          transform: 'translateY(-1px)'
                        },
                        transition: 'all 0.2s ease',
                        py: 1,
                        px: 1.5
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar 
                          src={user.photoURL} 
                          sx={{ 
                            background: '#b08968',
                            width: 36,
                            height: 36
                          }}
                        >
                          {user.name?.charAt(0) || 'U'}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography fontWeight={600} color="#4e342e" variant="body2">
                            {user.name || 'Unknown User'}
                          </Typography>
                        }
                        secondary={
                          <FormControl size="small" sx={{ minWidth: 100, mt: 0.5 }}>
                            <Select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.tempId, e.target.value)}
                              sx={{ 
                                background: '#fff',
                                borderRadius: 1.5,
                                height: 32,
                                '& .MuiOutlinedInput-notchedOutline': {
                                  borderColor: '#e0c9b3'
                                },
                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                  borderColor: '#b08968'
                                }
                              }}
                            >
                              <MenuItem value="driver">
                                <CarIcon sx={{ mr: 1, fontSize: 14 }} />
                                Driver
                              </MenuItem>
                              <MenuItem value="passenger">
                                <PersonIcon sx={{ mr: 1, fontSize: 14 }} />
                                Passenger
                              </MenuItem>
                            </Select>
                          </FormControl>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          size="small"
                          onClick={() => handleDelete(user.tempId || user.id)}
                          sx={{ 
                            color: '#b08968',
                            '&:hover': {
                              background: '#ffebee',
                              color: '#f44336'
                            }
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          {/* Create Group Button */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3',
            mt: 1
          }}>
            <CardContent sx={{ p: 2 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={isCreatingGroup ? <SimpleLoading size="small" /> : <CheckIcon />}
                onClick={handleCreateGroup}
                disabled={
                  isCreatingGroup ||
                  !destination ||
                  users.length === 0 ||
                  (!users.some(u => u.role === 'driver') && creatorRole !== 'driver') ||
                  groupCreated
                }
                sx={{ 
                  background: groupCreated ? '#4caf50' : '#a47551', 
                  color: '#fff', 
                  borderRadius: 2, 
                  py: 1.5,
                  fontWeight: 600,
                  fontSize: '1rem',
                  boxShadow: '0 4px 12px rgba(164, 117, 81, 0.3)',
                  '&:hover': {
                    background: groupCreated ? '#45a049' : '#8b6b4a',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(164, 117, 81, 0.4)'
                  },
                  '&:disabled': {
                    background: '#e0c9b3',
                    color: '#b08968',
                    transform: 'none',
                    boxShadow: 'none'
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                {isCreatingGroup ? 'Creating Ride...' : groupCreated ? 'Ride Created!' : 'Create Ride'}
              </Button>

              {!groupCreated && (
                <Stack spacing={0.75} mt={1.5}>
                  {!destination && (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      p: 1,
                      background: '#fff8e1',
                      borderRadius: 1.5,
                      border: '1px solid #ffcc02',
                      opacity: 0.8
                    }}>
                      <Typography variant="caption" sx={{ color: '#f57c00', fontWeight: 500 }}>
                        📍
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#e65100', fontSize: '0.75rem' }}>
                        Set a destination to continue
                      </Typography>
                    </Box>
                  )}
                  {users.length === 0 && (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      p: 1,
                      background: '#fff8e1',
                      borderRadius: 1.5,
                      border: '1px solid #ffcc02',
                      opacity: 0.8
                    }}>
                      <Typography variant="caption" sx={{ color: '#f57c00', fontWeight: 500 }}>
                        👥
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#e65100', fontSize: '0.75rem' }}>
                        Add at least one participant
                      </Typography>
                    </Box>
                  )}
                  {creatorRole === 'passenger' && !users.some(user => user.role === 'driver') && (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      p: 1,
                      background: '#fff8e1',
                      borderRadius: 1.5,
                      border: '1px solid #ffcc02',
                      opacity: 0.8
                    }}>
                      <Typography variant="caption" sx={{ color: '#f57c00', fontWeight: 500 }}>
                        🚗
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#e65100', fontSize: '0.75rem' }}>
                        Assign a driver for the ride
                      </Typography>
                    </Box>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Box>
      </Paper>

      {/* Map Container */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
          <Fab
            color="primary"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            sx={{ 
              background: '#fff',
              color: '#b08968',
              boxShadow: 2,
              '&:hover': {
                background: '#f9f6ef'
              }
            }}
          >
            <MenuIcon />
          </Fab>
        </Box>

        <Box sx={{ height: '100vh', width: '100%' }}>
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
        </Box>
      </Box>

      {/* Friend Selection Modal */}
      <Dialog 
        open={showFriendModal} 
        onClose={() => setShowFriendModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ background: '#f9f6ef', color: '#4e342e' }}>
          Add Friends to Ride
        </DialogTitle>
        <DialogContent sx={{ background: '#fff' }}>
          <UserSearch 
            onlyShowFriends={true}
            onSelectFriend={(friend) => {
              console.log('Friend selected from UserSearch:', friend);
              console.log('Current users state before adding:', users);
              
              const friendData = {
                id: friend.id,
                name: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
                displayName: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
                role: 'passenger',
                isCreator: false,
                photoURL: friend.profile?.photoURL || friend.photoURL || '',
                email: friend.profile?.email || friend.email || ''
              };
              
              console.log('Friend data to add:', friendData);
              
              const isAlreadyAdded = users.some(user => user.id === friend.id);
              if (isAlreadyAdded) {
                showLocalNotification(`${friendData.displayName} is already in the ride`, 'warning');
                return;
              }
              
              addUser(friendData);
              setShowFriendModal(false);
              showLocalNotification(`${friendData.displayName} added to the ride`, 'success');
            }} 
          />
        </DialogContent>
        <DialogActions sx={{ background: '#f9f6ef' }}>
          <Button 
            onClick={() => setShowFriendModal(false)}
            sx={{ color: '#b08968' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Modal */}
      <Dialog 
        open={showSuccessModal} 
        onClose={() => {
          setShowSuccessModal(false);
          navigate('/dashboard');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ background: '#f9f6ef', color: '#4e342e', textAlign: 'center' }}>
          Ride Created Successfully!
        </DialogTitle>
        <DialogContent sx={{ background: '#fff', textAlign: 'center', py: 3 }}>
          <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, background: '#4caf50' }}>
            <CheckIcon sx={{ fontSize: 40 }} />
          </Avatar>
          <Typography variant="h6" color="#4e342e" mb={1}>
            Your ride has been created!
          </Typography>
          <Typography variant="body2" color="#7c5e48" mb={2}>
            Once participants provide their locations, you can optimize and start the ride.
          </Typography>
          <Paper sx={{ p: 2, background: '#f9f6ef', display: 'inline-block' }}>
            <Typography variant="caption" color="#b08968">Ride ID:</Typography>
            <Typography variant="body2" fontWeight={600} color="#4e342e">{createdRideId}</Typography>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ background: '#f9f6ef', justifyContent: 'center', pb: 3 }}>
          <Button 
            variant="contained"
            onClick={() => {
              setShowSuccessModal(false);
              navigate('/dashboard');
            }}
            sx={{ background: '#a47551', color: '#fff', borderRadius: 2, px: 4 }}
          >
            Go to Dashboard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default RouteOptimizer;
