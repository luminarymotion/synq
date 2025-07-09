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
import { getCurrentLocation, MAPQUEST_SERVICE, calculateDistance } from '../services/locationService';
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
  Notifications as NotificationsIcon
} from '@mui/icons-material';


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
    preset: 'realtime',
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

  // Add destination suggestions state
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isProcessingDestination, setIsProcessingDestination] = useState(false);
  const [suggestionTimeout, setSuggestionTimeout] = useState(null);
  const [suggestionCache, setSuggestionCache] = useState(new Map());
  const [lastSearchQuery, setLastSearchQuery] = useState('');

  // Debug log for destinationSuggestions changes
  useEffect(() => {
    console.log('destinationSuggestions changed:', destinationSuggestions);
  }, [destinationSuggestions]);

  // Debug effect to track destination state
  useEffect(() => {
    console.log('Destination state changed:', {
      destination,
      hasDestination: !!destination,
      coords: destination ? { lat: destination.lat, lng: destination.lng } : null,
      address: destination?.address
    });
  }, [destination]);

  // Debug effect to track destinationSuggestions changes
  useEffect(() => {
    console.log('destinationSuggestions state changed:', {
      count: destinationSuggestions.length,
      suggestions: destinationSuggestions,
      isLoading: isLoadingSuggestions
    });
  }, [destinationSuggestions, isLoadingSuggestions]);

  // Add notification function - moved to top to avoid initialization error
  const showLocalNotification = (message, type = 'success') => {
    const id = `${Date.now()}-${notificationIdCounter.current++}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Add function to fetch destination suggestions based on user location
  const fetchDestinationSuggestions = async (query) => {
    console.log('fetchDestinationSuggestions called with:', query);
    
    if (!query || query.length < 2) {
      console.log('Query too short, clearing suggestions');
      setDestinationSuggestions([]);
      return;
    }

    // Clear previous timeout
    if (suggestionTimeout) {
      clearTimeout(suggestionTimeout);
    }

    // Set a new timeout to debounce the search
    const timeoutId = setTimeout(async () => {
      console.log('Starting destination search for:', query);
      setIsLoadingSuggestions(true);
      
      try {
        let suggestions = [];
        
        // Use the new searchDestinations function for Google Maps-like experience
        if (userLocation) {
          console.log('Searching destinations with context for:', query);
          
          try {
            // Use the new searchDestinations function
            const searchResults = await MAPQUEST_SERVICE.searchDestinations(query, {
              userLocation: userLocation,
              limit: 8
            });
            
            if (searchResults && searchResults.length > 0) {
              // Filter out error messages and process real results
              const realResults = searchResults.filter(result => !result.isError);
              
              if (realResults.length > 0) {
                suggestions = realResults.map(result => ({
                  display_name: result.display_name,
                  lat: result.lat,
                  lon: result.lon,
                  distance: result.distance || 0,
                  isNearby: result.distance ? result.distance < 100 : true,
                  isRealBusiness: true,
                  quality: result.quality,
                  confidence: result.confidence,
                  type: result.type,
                  address: result.address,
                  phone: result.phone,
                  website: result.website
                }));
                
                console.log('Found destination search results:', suggestions);
              } else {
                console.log('No real results found, providing fallback suggestions');
              }
            }
          } catch (error) {
            console.warn('Destination search failed:', error);
          }
        }
        
        // If no search results, show empty list instead of fallback suggestions
        if (suggestions.length === 0) {
          console.log('No search results from API');
          setDestinationSuggestions([]);
        } else {
          console.log('Final suggestions:', suggestions);
          setDestinationSuggestions(suggestions);
        }
        
      } catch (error) {
        console.error('Error fetching destination suggestions:', error);
        setDestinationSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300); // Reduced debounce time for more responsive feel

    setSuggestionTimeout(timeoutId);
  };

