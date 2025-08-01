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
// Location service imports
import { searchDestinations, getDirections } from '../services/locationService';
import '../styles/RouteOptimizer.css';
import locationTrackingService, { useLocation as useLocationTracking } from '../services/locationTrackingService';
import { toast } from 'react-hot-toast';

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
  Popper,
  InputAdornment
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
  Edit as EditIcon,
  DirectionsCar as DirectionsCarIcon,
  AccessTime as AccessTimeIcon,
  Straighten as StraightenIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

// COMMENTED OUT: Simplified location service - replacing with Search Box component
// import { MAPBOX_SERVICE, searchDestinations, getCoordsFromAddress, calculateDistance, getCurrentLocation } from '../services/locationService';

// Search Box component imports
import { SearchBox } from '@mapbox/search-js-react';
import mapboxgl from 'mapbox-gl';

// Haversine formula to calculate distance between two points
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
};

const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 2000, // Increased from 1000ms to 2000ms (2 seconds between calls)
  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }
};

// Enhanced category mapping for better relevance and coverage
const CATEGORY_MAP = {
  // Food & Drink
  'restaurants': 'restaurant',
  'restaurant': 'restaurant',
  'food': 'food_and_drink',
  'food and drink': 'food_and_drink',
  'dining': 'restaurant',
  'eat': 'restaurant',
  'coffee shops': 'coffee',
  'coffee shop': 'coffee',
  'coffee': 'coffee',
  'cafe': 'coffee',
  'cafes': 'coffee',
  'starbucks': 'coffee',
  'fast food': 'fast_food',
  'fast food restaurants': 'fast_food',
  'mcdonalds': 'fast_food',
  'burger king': 'fast_food',
  'wendys': 'fast_food',
  'taco bell': 'fast_food',
  'tacobell': 'fast_food',
  'subway': 'fast_food',
  'kfc': 'fast_food',
  'kentucky fried chicken': 'fast_food',
  'chipotle': 'fast_food',
  'pizza': 'pizza',
  'pizza places': 'pizza',
  'dominos': 'pizza',
  'pizza hut': 'pizza',
  'bars': 'bar',
  'bar': 'bar',
  'pub': 'bar',
  'pubs': 'bar',
  'brewery': 'bar',
  'breweries': 'bar',
  
  // Transportation - Enhanced with more variations
  'gas stations': 'gas_station',
  'gas station': 'gas_station',
  'gas': 'gas_station',
  'fuel': 'gas_station',
  'petrol': 'gas_station',
  'exxon': 'gas_station',
  'shell': 'gas_station',
  'chevron': 'gas_station',
  'mobil': 'gas_station',
  'bp': 'gas_station',
  'charging stations': 'charging_station',
  'charging station': 'charging_station',
  'ev charging': 'charging_station',
  'electric vehicle charging': 'charging_station',
  'tesla supercharger': 'charging_station',
  'supercharger': 'charging_station',
  
  // Shopping - Enhanced with brand names
  'grocery stores': 'grocery_store',
  'grocery store': 'grocery_store',
  'supermarket': 'grocery_store',
  'supermarkets': 'grocery_store',
  'kroger': 'grocery_store',
  'safeway': 'grocery_store',
  'albertsons': 'grocery_store',
  'walmart': 'department_store',
  'target': 'department_store',
  'costco': 'department_store',
  'department stores': 'department_store',
  'department store': 'department_store',
  'pharmacies': 'pharmacy',
  'pharmacy': 'pharmacy',
  'drugstore': 'pharmacy',
  'drugstores': 'pharmacy',
  'cvs': 'pharmacy',
  'walgreens': 'pharmacy',
  'rite aid': 'pharmacy',
  
  // Services
  'banks': 'bank',
  'bank': 'bank',
  'chase': 'bank',
  'bank of america': 'bank',
  'wells fargo': 'bank',
  'atm': 'atm',
  'atms': 'atm',
  'post offices': 'post_office',
  'post office': 'post_office',
  'hospitals': 'hospital',
  'hospital': 'hospital',
  'urgent care': 'urgent_care',
  'urgent care centers': 'urgent_care',
  'clinic': 'hospital',
  'medical center': 'hospital',
  
  // Entertainment
  'movie theaters': 'movie_theater',
  'movie theater': 'movie_theater',
  'cinema': 'movie_theater',
  'cinemas': 'movie_theater',
  'amc': 'movie_theater',
  'regal': 'movie_theater',
  'gyms': 'gym',
  'gym': 'gym',
  'fitness centers': 'gym',
  'fitness center': 'gym',
  'planet fitness': 'gym',
  'la fitness': 'gym',
  '24 hour fitness': 'gym',
  
  // Education
  'schools': 'school',
  'school': 'school',
  'elementary school': 'school',
  'high school': 'school',
  'universities': 'university',
  'university': 'university',
  'colleges': 'university',
  'college': 'university',
  
  // Accommodation
  'hotels': 'hotel',
  'hotel': 'hotel',
  'motels': 'motel',
  'motel': 'motel',
  'marriott': 'hotel',
  'hilton': 'hotel',
  'hyatt': 'hotel',
  
  // General
  'stores': 'store',
  'shop': 'store',
  'shops': 'store',
  'retail': 'store',
  'convenience store': 'store',
  '7-eleven': 'store',
  'circle k': 'store'
};

// Brand names that should trigger brand-specific search
const BRAND_NAMES = [
  // Fast Food Brands
  'taco bell', 'tacobell', 'mcdonalds', 'mcdonald', 'burger king', 'wendys', 'wendy',
  'subway', 'kfc', 'kentucky fried chicken', 'chipotle', 'dominos', 'domino', 'pizza hut',
  'starbucks', 'dunkin', 'dunkin donuts', 'popeyes', 'chick fil a', 'chick-fil-a',
  
  // Retail Brands
  'walmart', 'target', 'costco', 'kroger', 'safeway', 'albertsons', 'cvs', 'walgreens',
  'rite aid', '7-eleven', 'seven eleven', 'circle k',
  
  // Gas Station Brands
  'exxon', 'shell', 'chevron', 'mobil', 'bp', 'texaco', 'valero', 'speedway',
  
  // Bank Brands
  'chase', 'bank of america', 'wells fargo', 'citibank', 'us bank',
  
  // Hotel Brands
  'marriott', 'hilton', 'hyatt', 'holiday inn', 'best western',
  
  // Other Common Brands
  'amc', 'regal', 'planet fitness', 'la fitness', '24 hour fitness'
];

// Brand to category mapping for better search results
const BRAND_TO_CATEGORY = {
  // Fast Food Brands -> fast_food category
  'taco bell': 'fast_food',
  'tacobell': 'fast_food',
  'mcdonalds': 'fast_food',
  'mcdonald': 'fast_food',
  'burger king': 'fast_food',
  'wendys': 'fast_food',
  'wendy': 'fast_food',
  'subway': 'fast_food',
  'kfc': 'fast_food',
  'kentucky fried chicken': 'fast_food',
  'chipotle': 'fast_food',
  'dominos': 'fast_food',
  'domino': 'fast_food',
  'pizza hut': 'fast_food',
  'starbucks': 'coffee',
  'dunkin': 'coffee',
  'dunkin donuts': 'coffee',
  'popeyes': 'fast_food',
  'chick fil a': 'fast_food',
  'chick-fil-a': 'fast_food',
  
  // Retail Brands -> appropriate categories
  'walmart': 'department_store',
  'target': 'department_store',
  'costco': 'department_store',
  'kroger': 'grocery_store',
  'safeway': 'grocery_store',
  'albertsons': 'grocery_store',
  'cvs': 'pharmacy',
  'walgreens': 'pharmacy',
  'rite aid': 'pharmacy',
  '7-eleven': 'store',
  'seven eleven': 'store',
  'circle k': 'store',
  
  // Gas Station Brands -> gas_station category
  'exxon': 'gas_station',
  'shell': 'gas_station',
  'chevron': 'gas_station',
  'mobil': 'gas_station',
  'bp': 'gas_station',
  'texaco': 'gas_station',
  'valero': 'gas_station',
  'speedway': 'gas_station',
  
  // Bank Brands -> bank category
  'chase': 'bank',
  'bank of america': 'bank',
  'wells fargo': 'bank',
  'citibank': 'bank',
  'us bank': 'bank',
  
  // Hotel Brands -> hotel category
  'marriott': 'hotel',
  'hilton': 'hotel',
  'hyatt': 'hotel',
  'holiday inn': 'hotel',
  'best western': 'hotel',
  
  // Other Common Brands -> appropriate categories
  'amc': 'movie_theater',
  'regal': 'movie_theater',
  'planet fitness': 'gym',
  'la fitness': 'gym',
  '24 hour fitness': 'gym'
};

// Function to detect if query is a brand name
const detectBrand = (query) => {
  if (!query) return null;
  
  const cleanQuery = query.toLowerCase().trim();
  
  // Check for exact brand matches
  if (BRAND_NAMES.includes(cleanQuery)) {
    console.log(`🏪 Brand detected: "${cleanQuery}"`);
    return cleanQuery;
  }
  
  // Check for partial brand matches
  for (const brand of BRAND_NAMES) {
    if (cleanQuery.includes(brand) || brand.includes(cleanQuery)) {
      console.log(`🏪 Brand detected (partial match): "${cleanQuery}" -> "${brand}"`);
      return brand;
    }
  }
  
  console.log(`🏪 No brand detected for: "${cleanQuery}"`);
  return null;
};

// Function to detect category from user query
const detectCategory = (query) => {
  if (!query) return null;
  
  // Clean the query - remove location modifiers
  const cleanQuery = query.toLowerCase()
    .replace(/\s+in\s+(my area|the area|near me|nearby|dallas|plano|richardson|frisco|mckinney|allen|garland|mesquite|irving|arlington|fort worth|fort worth|dallas fort worth|dfw)?/gi, '')
    .replace(/\s+near\s+me/gi, '')
    .replace(/\s+close\s+by/gi, '')
    .replace(/\s+around\s+here/gi, '')
    .replace(/\s+in\s+the\s+area/gi, '')
    .trim();
  
  console.log(`📍 Category detection - Original: "${query}" -> Cleaned: "${cleanQuery}"`);
  
  // Check for exact matches first
  if (CATEGORY_MAP[cleanQuery]) {
    console.log(`📍 Exact category match: ${cleanQuery} -> ${CATEGORY_MAP[cleanQuery]}`);
    return CATEGORY_MAP[cleanQuery];
  }
  
  // Check for partial matches with priority scoring
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [pattern, category] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    
    // Exact word match gets highest score
    if (cleanQuery === pattern) {
      score = 100;
    }
    // Starts with pattern gets high score
    else if (cleanQuery.startsWith(pattern)) {
      score = 80;
    }
    // Ends with pattern gets high score
    else if (cleanQuery.endsWith(pattern)) {
      score = 70;
    }
    // Contains pattern gets medium score
    else if (cleanQuery.includes(pattern)) {
      score = 50;
    }
    // Pattern contains query gets low score
    else if (pattern.includes(cleanQuery)) {
      score = 30;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }
  
  if (bestMatch && bestScore >= 30) {
    console.log(`📍 Category detected: "${cleanQuery}" -> ${bestMatch} (score: ${bestScore})`);
    return bestMatch;
  }
  
  console.log(`📍 No category detected for: "${cleanQuery}"`);
  return null;
};

// Search functions now use the centralized locationService

// Category search now uses the centralized locationService

function RouteOptimizer({ mode = 'create' }) {
  // console.log('RouteOptimizer component initializing...', { mode }); // Commented out to reduce excessive logging
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
          setHasLocationError(false);
          setLocationStatusMessage('Location tracking active');
          break;
        case 'manual':
          // Handle manual mode for office networks
          setLocationError(null);
          setLocationStatusMessage('Location tracking in manual mode - set your location manually');
          break;
        case 'stopped':
          // Show "stopped" message
          setLocationStatusMessage('Location tracking stopped');
          setUserLocation(null);
          setHasValidLocation(false); // Reset valid location state
          setHasLocationError(false);
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
        default:
          console.log('Unknown location status:', status);
          setLocationStatusMessage(`Location status: ${status}`);
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
  const [showRoutePreview, setShowRoutePreview] = useState(false);
  const [routePreviewData, setRoutePreviewData] = useState(null);
  
  // Add missing state variables
  const [mapClickMode, setMapClickMode] = useState(null);

  // Add a counter for unique notification IDs
  const notificationIdCounter = useRef(0);

  // Destination search state (keeping for compatibility with existing code)
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isProcessingDestination, setIsProcessingDestination] = useState(false);
  const searchTimeoutRef = useRef(null);
  
  // Search Box component state variables
  const [searchBoxValue, setSearchBoxValue] = useState('');
  const [isSearchBoxLoading, setIsSearchBoxLoading] = useState(false);
  const [categorySearchResults, setCategorySearchResults] = useState([]);
  const [isCategorySearching, setIsCategorySearching] = useState(false);
  const [searchBoxSuggestions, setSearchBoxSuggestions] = useState([]);
  const [hybridResults, setHybridResults] = useState([]);
  
  // Remove duplicate hook usage - we already have the location tracking hook above

  // Add notification function - moved to top to avoid initialization error
  const showLocalNotification = (message, type = 'success') => {
    const id = `${Date.now()}-${notificationIdCounter.current++}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Simplified destination search - REMOVED (using handleDestinationInputChange instead)
  // const searchDestinationsLocal = async (query) => {

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
      
      // Get realistic driving directions from Mapbox
      console.log('Calculating realistic route preview from user location to destination');
      
      try {
        const directions = await getDirections(startLocation, endLocation);
        
        const route = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: directions.geometry,
            properties: {
              name: 'Route Preview',
              summary: {
                distance: directions.distance * 1609.34, // Convert miles to meters
                duration: directions.duration * 60, // Convert minutes to seconds
                waypoints: waypoints
              }
            }
          }],
          totalDistance: directions.distance * 1609.34,
          totalDuration: directions.duration * 60
        };
        
        console.log('=== ROUTE CALCULATION COMPLETED ===');
        console.log('Route result:', {
          routeType: route?.type,
          hasFeatures: !!route?.features,
          featuresCount: route?.features?.length || 0,
          totalDistance: route?.totalDistance,
          totalDuration: route?.totalDuration,
          firstFeature: route?.features?.[0] ? {
            type: route.features[0].type,
            geometryType: route.features[0].geometry?.type,
            coordinatesCount: route.features[0].geometry?.coordinates?.length || 0
          } : null
        });

        setCalculatedRoute(route);
        
        // Update route details for display
        if (route && route.features && route.features.length > 0) {
          const feature = route.features[0];
          const summary = feature.properties?.summary || {};
          
          setRouteDetails({
            distance: summary.distance || route.totalDistance,
            duration: summary.duration || route.totalDuration,
            waypoints: summary.waypoints
          });

                  // Show route preview modal
        const distanceInMiles = ((summary.distance || route.totalDistance) / 1609.34).toFixed(1);
        const durationInMinutes = Math.round((summary.duration || route.totalDuration) / 60);
        
        setRoutePreviewData({
          distance: distanceInMiles,
          duration: durationInMinutes,
          destination: endLocation.name || 'Selected Destination'
        });
        setShowRoutePreview(true);
        }
        
        return route;
      } catch (error) {
        console.error('Error getting directions, falling back to simple route:', error);
        
        // Fallback to simple straight-line route
        const route = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [startLocation.lng, startLocation.lat],
                [endLocation.lng, endLocation.lat]
              ]
            },
            properties: {
              name: 'Route Preview (Fallback)',
              summary: {
                distance: calculateDistanceInternal(startLocation, endLocation) * 1609.34, // Convert miles to meters
                duration: calculateDistanceInternal(startLocation, endLocation) * 60 * 2, // Rough estimate: 2 minutes per mile
                waypoints: waypoints
              }
            }
          }],
          totalDistance: calculateDistanceInternal(startLocation, endLocation) * 1609.34,
          totalDuration: calculateDistanceInternal(startLocation, endLocation) * 60 * 2
        };
        
        console.log('=== FALLBACK ROUTE CALCULATION COMPLETED ===');
        console.log('Fallback route result:', {
          routeType: route?.type,
          hasFeatures: !!route?.features,
          featuresCount: route?.features?.length || 0
        });

        setCalculatedRoute(route);
        
        // Update route details for display
        if (route && route.features && route.features.length > 0) {
          const feature = route.features[0];
          const summary = feature.properties?.summary || {};
          
          setRouteDetails({
            distance: summary.distance || route.totalDistance,
            duration: summary.duration || route.totalDuration,
            waypoints: summary.waypoints
          });

          // Show route preview modal
          const distanceInMiles = ((summary.distance || route.totalDistance) / 1609.34).toFixed(1);
          const durationInMinutes = Math.round((summary.duration || route.totalDuration) / 60);
          
          setRoutePreviewData({
            distance: distanceInMiles,
            duration: durationInMinutes,
            destination: endLocation.name || 'Selected Destination'
          });
          setShowRoutePreview(true);
        }
        
        return route;
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
        
        // Auto-start location tracking for laptop view
        try {
          console.log('📍 Auto-starting location tracking for RouteOptimizer...');
          await startTracking();
        } catch (error) {
          console.warn('📍 Could not auto-start location tracking:', error.message);
          // Don't show error notification - let user continue without location
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

  // Auto-hide route preview modal when no route is active
  useEffect(() => {
    if (!calculatedRoute && showRoutePreview) {
      setShowRoutePreview(false);
      setRoutePreviewData(null);
    }
  }, [calculatedRoute, showRoutePreview]);

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

  // Debug effect to monitor dropdown state
  useEffect(() => {
    console.log('🔍 [DEBUG] Dropdown state changed:', {
      isDropdownOpen,
      suggestionsCount: destinationSuggestions.length,
      isLoadingSuggestions,
      hasSuggestions: destinationSuggestions.length > 0
    });
    
    // Check for duplicate names or keys
    if (destinationSuggestions.length > 0) {
      const names = destinationSuggestions.map(s => s.name || s.display_name);
      const uniqueNames = [...new Set(names)];
      console.log('🔍 Name analysis:', {
        total: names.length,
        unique: uniqueNames.length,
        duplicates: names.length - uniqueNames.length
      });
      
      if (names.length !== uniqueNames.length) {
        console.warn('🔍 Duplicate names found:', names.filter((name, index) => names.indexOf(name) !== index));
      }
      
      // Log all suggestions for debugging
      console.log('🔍 All suggestions:', destinationSuggestions.map((s, i) => ({
        index: i,
        name: s.name || s.display_name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        distance: s.distance
      })));
    }
  }, [isDropdownOpen, destinationSuggestions.length, isLoadingSuggestions]);

  // Update userLocation when location changes
  useEffect(() => {
    if (location && location.latitude && location.longitude) {
      console.log('📍 Location tracking service provided location:', location);
      setUserLocation({ lat: location.latitude, lng: location.longitude });
    }
  }, [location]);
  
  // Auto-start location tracking when user is driver (optional - don't block app if it fails)
  useEffect(() => {
    if (user && creatorRole === 'driver' && !isTracking) {
      console.log('🚗 Auto-starting location tracking for driver');
      startTracking(user?.uid).catch(error => {
        console.warn('⚠️ Location tracking failed to start, but app will continue:', error.message);
        // Don't block the app if location tracking fails
      });
    }
  }, [user, creatorRole, isTracking, startTracking]);

  // Update status message based on actual tracking state
  useEffect(() => {
    if (isTracking && location) {
      const accuracy = location.accuracy ? Math.round(location.accuracy) : 'unknown';
      setLocationStatusMessage(`Location tracking active (accuracy: ${accuracy}m)`);
    } else if (isTracking && !location) {
      setLocationStatusMessage('Location tracking active - acquiring position...');
    } else if (!isTracking && location) {
      setLocationStatusMessage('Location available (tracking stopped)');
    } else if (!isTracking && !location) {
      setLocationStatusMessage('Location tracking stopped');
    }
  }, [isTracking, location]);

  // Test function to debug search issues
  const testSearchAndMarkers = async () => {
    console.log('🧪 ===== TESTING SEARCH AND MARKERS =====');
    console.log('🧪 Current user location:', userLocation);
    console.log('🧪 Current destination suggestions:', destinationSuggestions);
    
    try {
      // Test search
      const testResults = await MAPBOX_SERVICE.searchDestinations('food', {
        limit: 5,
        maxDistance: 50,
        userLocation: userLocation
      });
      
      console.log('🧪 Test search results:', testResults);
      console.log('🧪 Results with coordinates:', testResults.filter(r => r.lat && r.lon).length);
      
      // Set test suggestions
      setDestinationSuggestions(testResults);
      
      console.log('🧪 Test suggestions set, check map for markers');
    } catch (error) {
      console.error('🧪 Test search failed:', error);
    }
  };

  // Debug function to check current state
  const debugCurrentState = () => {
    console.log('🔍 ===== DEBUG CURRENT STATE =====');
    console.log('🔍 destinationSuggestions:', destinationSuggestions);
    console.log('🔍 destinationSuggestions.length:', destinationSuggestions.length);
    console.log('🔍 isLoadingSuggestions:', isLoadingSuggestions);
    console.log('🔍 isDropdownOpen:', isDropdownOpen);
    console.log('🔍 userLocation:', userLocation);
    console.log('🔍 Sample suggestion:', destinationSuggestions[0]);
    
    if (destinationSuggestions.length > 0) {
      console.log('🔍 All suggestions with coordinates:');
      destinationSuggestions.forEach((suggestion, index) => {
        console.log(`  ${index}:`, {
          name: suggestion.display_name || suggestion.name,
          lat: suggestion.lat,
          lon: suggestion.lon,
          hasCoords: !!(suggestion.lat && suggestion.lon),
          distance: suggestion.distance
        });
      });
    }
  };

  // Add test button to global scope for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testSearchAndMarkers = testSearchAndMarkers;
      window.debugCurrentState = debugCurrentState;
      window.testCategorySearch = async (query = 'gas station') => {
        console.log(`🧪 Testing enhanced category search for: "${query}"`);
        const category = detectCategory(query);
        console.log(`🧪 Detected category: ${category}`);
        
        if (category) {
          const results = await searchDestinations(category, {
            limit: 15,
            userLocation: userLocation,
            enableFallback: true
          });
          console.log(`🧪 Category search results:`, results);
          
          // Test hybrid results creation
          if (results.length > 0 && searchBoxSuggestions.length > 0) {
            const hybrid = createHybridResults(results, searchBoxSuggestions);
            console.log(`🧪 Hybrid results:`, hybrid);
          }
          
          return results;
        } else {
          console.log(`🧪 No category detected for: "${query}"`);
          return [];
        }
      };
      
      window.testCategoryMapping = (query) => {
        console.log(`🧪 Testing category mapping for: "${query}"`);
        const category = detectCategory(query);
        console.log(`🧪 Result: ${category}`);
        return category;
      };
      
      // Comprehensive test for gas station vs coffee shop issue
      window.debugGasStationIssue = async () => {
        console.log('🔍 ===== DEBUGGING GAS STATION vs COFFEE SHOP ISSUE =====');
        
        if (!userLocation) {
          console.log('❌ No user location available');
          return;
        }
        
        const testQueries = [
          'gas station',
          'gas',
          'gas station near me',
          'coffee shop',
          'coffee shop near',
          'coffee'
        ];
        
        for (const query of testQueries) {
          console.log(`\n🔍 Testing: "${query}"`);
          
          // Test 1: Category detection
          const category = detectCategory(query);
          console.log(`  Category detected: ${category}`);
          
          if (category) {
            // Test 2: Raw API call
            try {
              const results = await searchDestinations(category, {
                limit: 20,
                userLocation: userLocation,
                enableFallback: true
              });
              console.log(`  Raw API results: ${results.length}`);
              
              // Test 3: Distance analysis
              const nearby = results.filter(r => r.distance && r.distance <= 10);
              const far = results.filter(r => r.distance && r.distance > 10);
              const noDistance = results.filter(r => !r.distance);
              
              console.log(`  Distance breakdown:`);
              console.log(`    Nearby (≤10mi): ${nearby.length}`);
              console.log(`    Far (>10mi): ${far.length}`);
              console.log(`    No distance: ${noDistance.length}`);
              
              if (nearby.length > 0) {
                console.log(`  Nearby examples:`);
                nearby.slice(0, 3).forEach((r, i) => {
                  console.log(`    ${i+1}. ${r.name} (${r.distance?.toFixed(1)} mi) - ${r.address}`);
                });
              }
              
              if (far.length > 0) {
                console.log(`  Far examples:`);
                far.slice(0, 2).forEach((r, i) => {
                  console.log(`    ${i+1}. ${r.name} (${r.distance?.toFixed(1)} mi) - ${r.address}`);
                });
              }
              
            } catch (error) {
              console.error(`  API call failed:`, error);
            }
          }
        }
        
        console.log('\n🔍 ===== END DEBUGGING =====');
      };
      
      // Test the full searchCategoryPOI function
      window.testFullCategorySearch = async (query = 'gas station') => {
        console.log(`🔍 Testing full category search for: "${query}"`);
        
        if (!userLocation) {
          console.log('❌ No user location available');
          return;
        }
        
        const category = detectCategory(query);
        console.log(`🔍 Detected category: ${category}`);
        
        if (category) {
          try {
            const results = await searchDestinations(category, {
              limit: 20,
              userLocation: userLocation,
              enableFallback: true
            });
            console.log(`🔍 Full category search results:`, results);
            return results;
          } catch (error) {
            console.error(`🔍 Full category search failed:`, error);
            return [];
          }
        } else {
          console.log(`🔍 No category detected for: "${query}"`);
          return [];
        }
      };
      
      // Test Search Box override issue
      window.testSearchBoxOverride = async () => {
        console.log('🔍 ===== TESTING SEARCH BOX OVERRIDE ISSUE =====');
        
        if (!userLocation) {
          console.log('❌ No user location available');
          return;
        }
        
        console.log('🔍 Step 1: Test category search directly');
        const categoryResults = await window.testFullCategorySearch('gas station');
        
        console.log('\n🔍 Step 2: Simulate Search Box suggestions (distant results)');
        const mockSearchBoxSuggestions = [
          {
            name: 'Conoco Gas Station',
            address: '1610 Utica Avenue, Brooklyn, New York',
            distance: 2188, // Very far
            lat: 40.6189,
            lng: -73.9235
          },
          {
            name: 'Costco Gas Station', 
            address: '4849 NE 138th Ave, Portland, Oregon',
            distance: 2594, // Very far
            lat: 45.5152,
            lng: -122.6784
          }
        ];
        
        console.log('🔍 Mock Search Box suggestions:', mockSearchBoxSuggestions);
        
        console.log('\n🔍 Step 3: Test if category results take priority');
        if (categoryResults.length > 0) {
          console.log('✅ Category results should take priority over Search Box suggestions');
          console.log('✅ You should see Kroger Fuel Center, Exxon, RaceTrac (nearby)');
          console.log('❌ NOT Conoco Brooklyn, Costco Portland (distant)');
        }
        
        console.log('\n🔍 ===== END TEST =====');
      };
      
      // Test raw API response without filtering
      window.testRawCategoryAPI = async (category = 'gas_station') => {
        console.log(`🔍 Testing raw category API for: ${category}`);
        
        if (!userLocation) {
          console.log('❌ No user location available');
          return;
        }
        
        try {
          const proximityLng = userLocation.lng;
          const proximityLat = userLocation.lat;
          
          const params = new URLSearchParams({
            proximity: `${proximityLng},${proximityLat}`,
            limit: '20',
            country: 'US',
            language: 'en',
            access_token: import.meta.env.VITE_MAPBOX_API_KEY,
          });
          
          const url = `https://api.mapbox.com/search/searchbox/v1/category/${category}?${params}`;
          console.log(`🔍 API URL:`, url.replace(import.meta.env.VITE_MAPBOX_API_KEY, '***'));
          
          const response = await fetch(url);
          const data = await response.json();
          
          console.log(`🔍 Raw API response:`, data);
          console.log(`🔍 Features count:`, data.features?.length || 0);
          
          if (data.features && data.features.length > 0) {
            console.log(`🔍 First 3 features:`);
            data.features.slice(0, 3).forEach((feature, i) => {
              console.log(`  ${i+1}. Name: ${feature.properties?.name || 'Unknown'}`);
              console.log(`     Address: ${feature.place_name || 'No address'}`);
              console.log(`     Coordinates: ${feature.geometry?.coordinates?.join(', ') || 'No coords'}`);
              console.log(`     Type: ${feature.feature_type || 'Unknown'}`);
              console.log(`     Category: ${feature.poi_category || 'Unknown'}`);
            });
            
            // Test distance calculation
            console.log(`🔍 Distance calculation test:`);
            data.features.slice(0, 3).forEach((feature, i) => {
              const lat = feature.geometry?.coordinates?.[1];
              const lng = feature.geometry?.coordinates?.[0];
              
              if (lat && lng) {
                const R = 3959; // Earth's radius in miles
                const dLat = (lat - userLocation.lat) * Math.PI / 180;
                const dLng = (lng - userLocation.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                          Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distance = R * c;
                
                console.log(`  ${i+1}. ${feature.properties?.name}: ${distance.toFixed(2)} miles`);
              }
            });
          }
          
        } catch (error) {
          console.error(`🔍 Raw API test failed:`, error);
        }
      };
      console.log('🧪 Test functions available:');
      console.log('  - window.testSearchAndMarkers()');
      console.log('  - window.debugCurrentState()');
      console.log('  - window.testCategorySearch("gas stations")');
      console.log('  - window.debugGasStationIssue()');
      console.log('  - window.testRawCategoryAPI("gas_station")');
      console.log('  - window.testRawCategoryAPI("coffee")');
      console.log('  - window.testFullCategorySearch("gas station")');
      console.log('  - window.testSearchBoxOverride()');
    }
  }, [userLocation, destinationSuggestions]);

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

  // Add a simple test function to manually set suggestions
  const testSetSuggestions = () => {
    console.log('🧪 Manually setting test suggestions...');
    const testSuggestions = [
      {
        display_name: 'Test Walmart',
        name: 'Walmart',
        lat: 33.1087872,
        lon: -96.7606272,
        distance: 2.5,
        address: '123 Test St, Plano, TX'
      },
      {
        display_name: 'Test Target',
        name: 'Target',
        lat: 33.1100000,
        lon: -96.7650000,
        distance: 3.1,
        address: '456 Test Ave, Plano, TX'
      }
    ];
    
    console.log('🧪 Setting test suggestions:', testSuggestions);
    setDestinationSuggestions(testSuggestions);
    console.log('🧪 Test suggestions set, check map for red markers');
  };

  // Add test function to global scope
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testSetSuggestions = testSetSuggestions;
      window.setDefaultLocation = () => {
        console.log('🧪 Setting default test location...');
        const defaultLocation = {
          lat: 33.1087872,
          lng: -96.7606272,
          address: 'Plano, TX, USA'
        };
        setManualLocation(defaultLocation.lat, defaultLocation.lng, defaultLocation.address);
        setUserLocation(defaultLocation);
        setHasValidLocation(true);
        setHasLocationError(false);
        setLocationError(null);
        setLocationStatusMessage('Default test location set');
        showLocalNotification('Default test location set successfully', 'success');
      };
      window.testWalmartSearchRaw = async () => {
        console.log('🧪 [RAW DIAGNOSTIC] Testing raw Walmart search without grouping...');
        try {
          // Test 1: Direct API call to see raw response
          console.log('🧪 [RAW DIAGNOSTIC] Test 1: Direct API call...');
          const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?access_token=${MAPBOX_CONFIG.apiKey}&session_token=${MAPBOX_SERVICE.generateSessionToken()}&q=walmart&limit=25&language=en&types=poi%2Caddress&country=us&proximity=${userLocation.lng}%2C${userLocation.lat}`);
          
          const data = await response.json();
          console.log('🧪 [RAW DIAGNOSTIC] Raw API response:', data);
          console.log('🧪 [RAW DIAGNOSTIC] Total suggestions from API:', data.suggestions?.length || 0);
          
          // Test 6: Compare grouped vs ungrouped results
          console.log('🧪 [RAW DIAGNOSTIC] Test 6: Comparing grouped vs ungrouped results...');
          const groupedResults = await MAPBOX_SERVICE.searchDestinations('walmart', {
            limit: 25,
            userLocation,
            enableAdaptiveRadius: true,
            bypassGrouping: false
          });
          
          const ungroupedResults = await MAPBOX_SERVICE.searchDestinations('walmart', {
            limit: 25,
            userLocation,
            enableAdaptiveRadius: true,
            bypassGrouping: true
          });
          
          console.log('🧪 [RAW DIAGNOSTIC] Grouped results count:', groupedResults.length);
          console.log('🧪 [RAW DIAGNOSTIC] Ungrouped results count:', ungroupedResults.length);
          console.log('🧪 [RAW DIAGNOSTIC] Grouping reduction:', groupedResults.length - ungroupedResults.length, 'results');
          
          // Set ungrouped results for display
          setDestinationSuggestions(ungroupedResults);
          showLocalNotification(`Found ${ungroupedResults.length} individual Walmart services (vs ${groupedResults.length} grouped)`, 'success');
          
          // Test 2: Process each result to see coordinate extraction
          console.log('🧪 [RAW DIAGNOSTIC] Test 2: Coordinate extraction analysis...');
          const processedResults = [];
          for (const suggestion of data.suggestions || []) {
            const result = {
              name: suggestion.name,
              address: suggestion.full_address,
              mapboxId: suggestion.mapbox_id,
              coordinates: suggestion.coordinates,
              distance: suggestion.distance,
              relevance: suggestion.relevance
            };
            
            // Try to extract coordinates
            try {
              const coords = await MAPBOX_SERVICE.CoordinateUtils.extractCoordinates(suggestion, 'raw_diagnostic');
              result.extractedCoords = coords;
              result.hasValidCoords = !!(coords.lat && coords.lon);
            } catch (error) {
              result.extractionError = error.message;
              result.hasValidCoords = false;
            }
            
            processedResults.push(result);
          }
          
          console.log('🧪 [RAW DIAGNOSTIC] Processed results:', processedResults);
          console.log('🧪 [RAW DIAGNOSTIC] Results with valid coordinates:', processedResults.filter(r => r.hasValidCoords).length);
          console.log('🧪 [RAW DIAGNOSTIC] Results without coordinates:', processedResults.filter(r => !r.hasValidCoords).length);
          
          // Test 3: Use searchByText function
          console.log('🧪 [RAW DIAGNOSTIC] Test 3: Using searchByText function...');
          const searchByTextResults = await MAPBOX_SERVICE.searchByText('walmart', userLocation, 25);
          console.log('🧪 [RAW DIAGNOSTIC] searchByText results:', searchByTextResults.map(r => ({
            name: r.name,
            address: r.address,
            lat: r.lat,
            lon: r.lon,
            distance: r.distance
          })));
          
          // Test 4: Use full searchDestinations function
          console.log('🧪 [RAW DIAGNOSTIC] Test 4: Using full searchDestinations function...');
          const fullResults = await MAPBOX_SERVICE.searchDestinations('walmart', {
            limit: 25,
            userLocation,
            enableAdaptiveRadius: true
          });
          console.log('🧪 [RAW DIAGNOSTIC] Full searchDestinations results:', fullResults);
          
          // Test 5: Use searchDestinations with bypass grouping
          console.log('🧪 [RAW DIAGNOSTIC] Test 5: Using searchDestinations with bypass grouping...');
          const bypassResults = await MAPBOX_SERVICE.searchDestinations('walmart', {
            limit: 25,
            userLocation,
            enableAdaptiveRadius: true,
            bypassGrouping: true
          });
          console.log('🧪 [RAW DIAGNOSTIC] Bypass grouping results:', bypassResults);
          
          // Set raw results without grouping for display
          setDestinationSuggestions(searchByTextResults);
          showLocalNotification(`Found ${searchByTextResults.length} raw Walmart locations`, 'success');
          
          return { processedResults, searchByTextResults, fullResults };
        } catch (error) {
          console.error('🧪 [RAW DIAGNOSTIC] Error:', error);
          showLocalNotification('Raw search failed', 'error');
          return null;
        }
      };
      
      // Toggle between grouped and ungrouped Walmart results
      window.toggleWalmartGrouping = async () => {
        console.log('🧪 [TOGGLE] Switching Walmart grouping mode...');
        try {
          const currentSuggestions = destinationSuggestions;
          
          // Better detection of current mode - check if we have grouped services or if results look grouped
          const hasGroupedServices = currentSuggestions.some(s => s.groupedServices && s.groupedServices.count > 0);
          const hasMultipleServicesAtSameLocation = currentSuggestions.some(s => 
            s.name && s.name.includes('Walmart') && 
            currentSuggestions.filter(other => 
              other.lat === s.lat && other.lon === s.lon && other !== s
            ).length > 0
          );
          
          const isCurrentlyGrouped = hasGroupedServices || !hasMultipleServicesAtSameLocation;
          const newMode = !isCurrentlyGrouped;
          
          console.log('🧪 [TOGGLE] Current suggestions count:', currentSuggestions.length);
          console.log('🧪 [TOGGLE] Has grouped services:', hasGroupedServices);
          console.log('🧪 [TOGGLE] Has multiple services at same location:', hasMultipleServicesAtSameLocation);
          console.log('🧪 [TOGGLE] Current mode:', isCurrentlyGrouped ? 'grouped' : 'ungrouped');
          console.log('🧪 [TOGGLE] Switching to:', newMode ? 'grouped' : 'ungrouped');
          
          const results = await MAPBOX_SERVICE.searchDestinations('walmart', {
            limit: 25,
            userLocation,
            enableAdaptiveRadius: true,
            bypassGrouping: !newMode // Invert the logic - bypassGrouping: false = grouped, bypassGrouping: true = ungrouped
          });
          
          setDestinationSuggestions(results);
          showLocalNotification(`Switched to ${newMode ? 'grouped' : 'ungrouped'} view: ${results.length} results`, 'success');
          
        } catch (error) {
          console.error('🧪 [TOGGLE] Error:', error);
          showLocalNotification('Toggle failed', 'error');
        }
      };
      
      // Comprehensive search validation test
      window.testComprehensiveSearch = async (query = 'walmart') => {
        console.log('🧪 [COMPREHENSIVE] Starting comprehensive search validation...');
        try {
          await MAPBOX_SERVICE.testComprehensiveSearch(query, userLocation);
        } catch (error) {
          console.error('🧪 [COMPREHENSIVE] Error:', error);
        }
      };
      
      // Show current Walmart results analysis
      window.analyzeWalmartResults = () => {
        console.log('🔍 [ANALYSIS] Current Walmart results analysis:');
        console.log('🔍 [ANALYSIS] Total suggestions:', destinationSuggestions.length);
        
        if (destinationSuggestions.length === 0) {
          console.log('🔍 [ANALYSIS] No suggestions to analyze');
          return;
        }
        
        // Group by location
        const locationGroups = new Map();
        destinationSuggestions.forEach(suggestion => {
          if (suggestion.lat && suggestion.lon) {
            const key = `${suggestion.lat.toFixed(4)}_${suggestion.lon.toFixed(4)}`;
            if (!locationGroups.has(key)) {
              locationGroups.set(key, {
                location: { lat: suggestion.lat, lon: suggestion.lon },
                address: suggestion.address,
                services: []
              });
            }
            locationGroups.get(key).services.push(suggestion.name);
          }
        });
        
        console.log('🔍 [ANALYSIS] Unique locations:', locationGroups.size);
        locationGroups.forEach((group, key) => {
          console.log(`🔍 [ANALYSIS] Location ${key}:`);
          console.log(`  Address: ${group.address}`);
          console.log(`  Services (${group.services.length}): ${group.services.join(', ')}`);
        });
        
        // Check for grouped services
        const hasGroupedServices = destinationSuggestions.some(s => s.groupedServices && s.groupedServices.count > 0);
        console.log('🔍 [ANALYSIS] Has grouped services:', hasGroupedServices);
        
        if (hasGroupedServices) {
          destinationSuggestions.forEach(s => {
            if (s.groupedServices) {
              console.log(`🔍 [ANALYSIS] Grouped services for "${s.name}":`, s.groupedServices);
            }
          });
        }
      };
              console.log('🧪 Test functions available: window.testSetSuggestions(), window.setDefaultLocation(), window.testWalmartSearchRaw(), window.toggleWalmartGrouping(), window.analyzeWalmartResults(), and window.testComprehensiveSearch()');
    }
  }, [userLocation]);

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
          stopTracking();
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

  // Test search with different strategies
  const testSearchStrategies = async () => {
    console.log('🧪 Testing Mapbox Search Box API...');
    const query = 'kroger';
    const userLocation = { lat: 33.1087872, lng: -96.7606272 };
    
    try {
      // Test 1: Full Search Box API search
      console.log('🧪 Test 1: Full Search Box API search');
      const searchResults = await MAPBOX_SERVICE.searchDestinations(query, {
        limit: 10,
        maxDistance: 100,
        userLocation
      });
      console.log('🧪 Search Box API results:', searchResults);
      
      // Test 2: Direct Search Box API calls
      console.log('🧪 Test 2: Direct Search Box API calls');
      
      // Test suggest endpoint
      const suggestUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?access_token=${MAPBOX_CONFIG.apiKey}&q=${encodeURIComponent(query)}&limit=10&country=US&types=poi&proximity=${userLocation.lng},${userLocation.lat}`;
      console.log('🧪 Suggest URL:', suggestUrl.replace(MAPBOX_CONFIG.apiKey, '***'));
      
      const suggestResponse = await fetch(suggestUrl);
      const suggestData = await suggestResponse.json();
      console.log('🧪 Suggest results:', suggestData);
      
      // Test forward endpoint
      const forwardUrl = `https://api.mapbox.com/search/searchbox/v1/forward?access_token=${MAPBOX_CONFIG.apiKey}&q=${encodeURIComponent(query)}&limit=10&country=US&types=poi&proximity=${userLocation.lng},${userLocation.lat}`;
      console.log('🧪 Forward URL:', forwardUrl.replace(MAPBOX_CONFIG.apiKey, '***'));
      
      const forwardResponse = await fetch(forwardUrl);
      const forwardData = await forwardResponse.json();
      console.log('🧪 Forward results:', forwardData);
      
      // Test 3: Test retrieve endpoint if we have suggestions
      if (suggestData.suggestions && suggestData.suggestions.length > 0) {
        console.log('🧪 Test 3: Testing retrieve endpoint');
        const firstSuggestion = suggestData.suggestions[0];
        const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve?access_token=${MAPBOX_CONFIG.apiKey}&id=${firstSuggestion.id}`;
        console.log('🧪 Retrieve URL:', retrieveUrl.replace(MAPBOX_CONFIG.apiKey, '***'));
        
        const retrieveResponse = await fetch(retrieveUrl);
        const retrieveData = await retrieveResponse.json();
        console.log('🧪 Retrieve results:', retrieveData);
      }
      
      // Test 4: Compare with Geocoding API
      console.log('🧪 Test 4: Compare with Geocoding API');
      const geocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_CONFIG.apiKey}&types=poi&limit=10&country=US&proximity=${userLocation.lng},${userLocation.lat}&autocomplete=true`;
      console.log('🧪 Geocoding URL:', geocodingUrl.replace(MAPBOX_CONFIG.apiKey, '***'));
      
      const geocodingResponse = await fetch(geocodingUrl);
      const geocodingData = await geocodingResponse.json();
      console.log('🧪 Geocoding results:', geocodingData.features?.length || 0, 'features');
      
      showLocalNotification('Search Box API test completed', 'success');
    } catch (error) {
      console.error('🧪 Search test failed:', error);
      showLocalNotification('Search strategy test failed', 'error');
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
    window.testSearchStrategies = testSearchStrategies;
    window.userLocation = userLocation;
    window.trackedLocation = location;
  }
  */

  // Handle destination selection
  const handleDestinationSelect = async (selectedOption) => {
    if (!selectedOption) return;
    
    try {
      let coords;
      
      if (selectedOption.lat && selectedOption.lng) {
        // Use the provided coordinates (new format uses lng instead of lon)
        coords = {
          lat: parseFloat(selectedOption.lat),
          lng: parseFloat(selectedOption.lng),
          address: selectedOption.address || selectedOption.name
        };
      } else if (selectedOption.lat && selectedOption.lon) {
        // Handle old format for backward compatibility
        coords = {
          lat: parseFloat(selectedOption.lat),
          lng: parseFloat(selectedOption.lon),
          address: selectedOption.address || selectedOption.name
        };
      } else {
        // Try to geocode the name/address
        const geocodeResult = await getCoordsFromAddress(selectedOption.name || selectedOption.display_name);
        if (geocodeResult) {
          coords = {
            lat: geocodeResult.lat,
            lng: geocodeResult.lng,
            address: geocodeResult.address
          };
        }
      }
      
      if (coords) {
        // Add destination name to coords for the route preview modal
        coords.name = selectedOption.name || selectedOption.display_name || 'Selected Destination';
        
        // Set destination
        await handleDestinationChange(coords);
        setForm(prev => ({ ...prev, destination: coords.address }));
        
        // Clear suggestions after a short delay to prevent map zoom issues
        setTimeout(() => {
          setDestinationSuggestions([]);
          setCategorySearchResults([]); // Clear category search results
          setSearchBoxSuggestions([]); // Clear search box suggestions
          setHybridResults([]); // Clear hybrid results
        }, 100);
        
        // Automatically calculate route if user is driver and has location
        if (creatorRole === 'driver' && userLocation) {
          console.log('🚗 Auto-calculating route for driver');
          await calculateAndDisplayRoute(userLocation, coords);
        }
      } else {
        console.warn('⚠️ Could not get coordinates for selected destination');
        setForm(prev => ({ ...prev, destination: selectedOption.name || selectedOption.display_name }));
      }

    } catch (error) {
      console.error('❌ Error setting destination:', error);
      setForm(prev => ({ ...prev, destination: selectedOption.name || selectedOption.display_name }));
    }
  };

  // COMMENTED OUT: Current search logic - replacing with Search Box component
  /*
  const handleDestinationInputChange = (event) => {
    const query = event.target.value.trim();
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If query is empty, clear suggestions immediately
    if (!query || query.length === 0) {
      setDestinationSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }
    
    // Don't search for very short queries
    if (query.length < 2) {
      return;
    }
    
    // Set loading state
    setIsLoadingSuggestions(true);
    
    // Set a new timeout to debounce the search (reduced from 300ms to 150ms)
    searchTimeoutRef.current = setTimeout(async () => {
      // Double-check that query is still valid
      if (!query || query.length < 2) {
        setIsLoadingSuggestions(false);
        return;
      }
      
      try {
        // Simple search with the new architecture
        const results = await searchDestinations(query, {
          limit: 8,
          userLocation: userLocation || null,
          enableFallback: true
        });
        
        if (results && results.length > 0) {
          setDestinationSuggestions(results);
          showLocalNotification(`Found ${results.length} locations`, 'success');
            } else {
          setDestinationSuggestions([]);
          showLocalNotification('No locations found. Try a different search term.', 'info');
        }
      } catch (error) {
        console.error('Search failed:', error);
        setDestinationSuggestions([]);
        
        let errorMessage = 'Search temporarily unavailable. Please try again.';
        
        if (error.message.includes('API key')) {
          errorMessage = 'Search service not configured. Please check your settings.';
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        }
        
        showLocalNotification(errorMessage, 'error');
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 150); // Reduced debounce for better responsiveness
  };
  */
  
  // Function to create hybrid results from category and Search Box suggestions
  const createHybridResults = (categoryResults, searchBoxResults) => {
    if (!categoryResults.length && !searchBoxResults.length) {
      return [];
    }
    
    const hybrid = [];
    
    // Add top category results first (up to 5)
    if (categoryResults.length > 0) {
      hybrid.push(...categoryResults.slice(0, 5).map(result => ({
        ...result,
        source: 'category',
        priority: 1
      })));
    }
    
    // Add top Search Box results (up to 3) if we have space
    if (searchBoxResults.length > 0 && hybrid.length < 8) {
      const remainingSlots = 8 - hybrid.length;
      const searchBoxSlice = searchBoxResults.slice(0, remainingSlots);
      
      hybrid.push(...searchBoxSlice.map(result => ({
        ...result,
        source: 'searchbox',
        priority: 2
      })));
    }
    
    // Sort by priority first, then by distance
    hybrid.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.distance === null && b.distance === null) return 0;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
    
    return hybrid;
  };

  // Enhanced search function that prioritizes category search over Search Box
  const handleEnhancedSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      setCategorySearchResults([]);
      setSearchBoxSuggestions([]);
      setHybridResults([]);
      setIsCategorySearching(false);
      return;
    }

    const trimmedQuery = query.trim().toLowerCase();
    console.log(`🔍 RouteOptimizer search for: "${trimmedQuery}"`);
    console.log(`🔍 Current userLocation:`, userLocation);
    console.log(`🔍 userLocation type:`, typeof userLocation);
    console.log(`🔍 userLocation keys:`, userLocation ? Object.keys(userLocation) : 'null');

    // Set loading state
      setIsCategorySearching(true);
      setCategorySearchResults([]); // Clear previous results
      setSearchBoxSuggestions([]); // Clear Search Box suggestions to prevent conflicts
      setHybridResults([]); // Clear hybrid results
      
    // Use the same simple approach as MobileRideCreator
    try {
      const results = await searchDestinations(trimmedQuery, {
        limit: 8, // Same limit as mobile
        userLocation: userLocation,
        enableFallback: true
      });
      
      console.log(`🔍 RouteOptimizer search results: ${results.length} found`);
      console.log(`🔍 Search results:`, results);
      
      // Update state with results (no filtering - same as mobile)
        setCategorySearchResults(results);
        
        if (results.length > 0) {
          showLocalNotification(`Found ${results.length} locations for "${trimmedQuery}"`, 'success');
          
        console.log(`🔍 RouteOptimizer search successful for "${trimmedQuery}":`, {
            totalResults: results.length,
            firstResult: results[0] ? {
              name: results[0].name,
              distance: results[0].distance?.toFixed(1) + ' mi',
              address: results[0].address
            } : null,
            allResults: results.map(r => ({
              name: r.name,
              distance: r.distance?.toFixed(1) + ' mi',
              address: r.address
            }))
          });
        } else {
          showLocalNotification(`No locations found for "${trimmedQuery}"`, 'info');
        }
      } catch (error) {
      console.error('🔍 RouteOptimizer search failed:', error);
      showLocalNotification('Search failed', 'error');
        setCategorySearchResults([]);
      } finally {
        setIsCategorySearching(false);
    }
  };

  // Enhanced destination input change handler
  const handleDestinationInputChange = (event) => {
    const query = event.target.value.trim();
    setSearchBoxValue(query);
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If query is empty, clear results
    if (!query || query.length === 0) {
      setCategorySearchResults([]);
      setIsCategorySearching(false);
      return;
    }
    
    // Don't search for very short queries
    if (query.length < 2) {
      return;
    }
    
    // Debounce the search (same as mobile - 500ms)
    searchTimeoutRef.current = setTimeout(() => {
      handleEnhancedSearch(query);
    }, 500);
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
      // Use the address from coords if provided (from suggestion selection)
      // Otherwise, get the address from coordinates via reverse geocoding
      let address = coords.address;
      
      if (!address) {
        console.log('No address provided in coords, performing reverse geocoding...');
        address = await getAddressFromCoords(lat, lng);
      } else {
        console.log('Using provided address from suggestion:', address);
      }
      
      console.log('Destination coordinates and address:', {
        coords: { lat, lng },
        address
      });

      // Store both coordinates and address
      const destinationData = {
        lat: lat,
        lng: lng,
        address: address,
        name: coords.name || address // Include name for route preview modal
      };
      
      // Update both the destination state and form state
      setDestination(destinationData);
      setForm(prev => ({
        ...prev,
        destination: address
      }));

      // Hide route preview modal when destination changes (it will be shown again when route is calculated)
      setShowRoutePreview(false);
      
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

    // Validate driver location - but don't block if not available
    if (!driver.userLocationCoords || !driver.userLocationCoords.lat || !driver.userLocationCoords.lng) {
      console.warn('Driver location not available, proceeding with manual location entry');
      showLocalNotification('Location not available. You can set your location manually on the map.', 'info');
      // Don't return - let the user continue and set location manually
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

      // Handle missing driver location gracefully
      let driverAddress = 'Location pending';
      if (driver.userLocationCoords && driver.userLocationCoords.lat && driver.userLocationCoords.lng) {
        try {
          driverAddress = await getAddressFromCoords(driver.userLocationCoords.lat, driver.userLocationCoords.lng);
        } catch (error) {
          console.warn('Failed to get driver address:', error);
          driverAddress = 'Location pending';
        }
      }

      const destinationAddress = await getAddressFromCoords(destination.lat, destination.lng);

      // Clean and validate the data before creating the group
      const cleanGroupData = {
        driver: {
          uid: driver.isCreator ? user.uid : driver.id,
          name: driver.name || 'Unknown Driver',
          location: driver.userLocationCoords && driver.userLocationCoords.lat && driver.userLocationCoords.lng ? {
            lat: driver.userLocationCoords.lat,
            lng: driver.userLocationCoords.lng
          } : null,
          address: driverAddress || 'Location pending',
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

  const handleSidebarClick = (e) => {
    // Only toggle if clicking the sidebar itself, not its children
    if (e.target === e.currentTarget) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

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
        stopTracking();
        
        // Show a helpful notification to the user
        showLocalNotification('Location tracking failed. You can still use the app by setting your location manually.', 'warning');
        
        console.log('Set locationStatusMessage to:', errorMessage);
      } finally {
        setIsLocationLoading(false);
      }
    }
  };

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
        return;
      }

      // ... rest of the existing create ride logic ...
    }
  };

  const handleSetDestinationFromMap = () => {
    setMapClickMode('destination');
    showLocalNotification('Click on the map to set the destination location', 'info');
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
                        setShowRoutePreview(false);
                        setRoutePreviewData(null);
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
                  
                  {/* Destination setting options */}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<MapIcon fontSize="small" />}
                    onClick={handleSetDestinationFromMap}
                    sx={{ 
                      width: '100%',
                      color: '#b08968', 
                      borderColor: '#b08968',
                      borderRadius: 1.5,
                      py: 0.5,
                      mb: 1.5,
                      '&:hover': {
                        borderColor: '#a47551',
                        background: '#f9f6ef'
                      }
                    }}
                  >
                    Click on Map to Set Destination
                  </Button>
                  
                  {/* Custom Search Input with Category Detection */}
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search destination, place, or POI (try: gas stations, coffee, restaurants)"
                    value={searchBoxValue}
                    onChange={(event) => {
                      const query = event.target.value;
                      setSearchBoxValue(query);
                      
                      // Trigger enhanced search for category detection
                      if (query.trim().length >= 2) {
                        handleEnhancedSearch(query);
                      } else {
                        setCategorySearchResults([]);
                        setSearchBoxSuggestions([]);
                        setHybridResults([]);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        // Handle Enter key - could trigger a search or select first result
                        console.log('📍 Enter pressed, current search value:', searchBoxValue);
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
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: '#b08968' }} />
                        </InputAdornment>
                      ),
                      endAdornment: searchBoxValue && (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSearchBoxValue('');
                              setCategorySearchResults([]);
                              setSearchBoxSuggestions([]);
                              setHybridResults([]);
                            }}
                            sx={{ color: '#b08968' }}
                          >
                            <ClearIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  
                  {/* Category Search Results Display */}
                  {categorySearchResults.length > 0 && (
                    <Box mt={1.5} mb={1.5}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        mb: 1,
                        p: 1,
                        backgroundColor: '#f9f6ef',
                        borderRadius: 1,
                        border: '1px solid #b08968'
                      }}>
                        <Typography variant="subtitle2" color="#4e342e" sx={{ fontWeight: 600 }}>
                          🎯 Category Search Results ({categorySearchResults.length})
                        </Typography>
                        <Typography variant="caption" color="#b08968" sx={{ ml: 1 }}>
                          • Click to select destination
                        </Typography>
                      </Box>
                      <Box sx={{ maxHeight: '250px', overflowY: 'auto' }}>
                        {categorySearchResults.map((result, index) => (
                          <Box
                            key={`${result.name}-${result.lat}-${result.lng}-${index}`}
                            sx={{
                              p: 1.5,
                              mb: 0.5,
                              border: '1px solid #e0c9b3',
                              borderRadius: 1,
                              cursor: 'pointer',
                              backgroundColor: '#fff',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                backgroundColor: '#f9f6ef',
                                borderColor: '#b08968',
                                transform: 'translateY(-1px)',
                                boxShadow: '0 2px 8px rgba(176, 137, 104, 0.15)'
                              }
                            }}
                            onClick={() => {
                              if (result.lat && result.lng) {
                                // Use the same handler as map markers for consistency
                                handleDestinationSelect(result);
                                showLocalNotification('Destination set from category search!', 'success');
                              }
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" color="#4e342e" fontWeight={500} sx={{ mb: 0.5 }}>
                                  {result.name || result.display_name}
                                </Typography>
                                <Typography variant="caption" color="#b08968" sx={{ display: 'block' }}>
                                  {result.address || result.fullAddress}
                                </Typography>
                                {result.brand && result.brand.length > 0 && (
                                  <Typography variant="caption" color="#4caf50" sx={{ display: 'block', mt: 0.5 }}>
                                    Brand: {result.brand.join(', ')}
                                  </Typography>
                                )}
                              </Box>
                              {result.distance && (
                                <Typography variant="caption" color="#b08968" sx={{ 
                                  fontWeight: 600,
                                  backgroundColor: '#f0f0f0',
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 0.5,
                                  ml: 1
                                }}>
                                  {result.distance.toFixed(1)} mi
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                  
                  {/* Hybrid Results Display */}
                  {hybridResults.length > 0 && (
                    <Box mt={1.5} mb={1.5}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        mb: 1,
                        p: 1,
                        backgroundColor: '#e8f5e8',
                        borderRadius: 1,
                        border: '1px solid #4caf50'
                      }}>
                        <Typography variant="subtitle2" color="#2e7d32" sx={{ fontWeight: 600 }}>
                          🔄 Hybrid Results ({hybridResults.length})
                        </Typography>
                        <Typography variant="caption" color="#4caf50" sx={{ ml: 1 }}>
                          • Category + Search Box suggestions
                        </Typography>
                      </Box>
                      <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {hybridResults.map((result, index) => (
                          <Box
                            key={`hybrid-${result.name}-${result.lat}-${result.lng}-${index}`}
                            sx={{
                              p: 1.5,
                              mb: 0.5,
                              border: `1px solid ${result.source === 'category' ? '#b08968' : '#4caf50'}`,
                              borderRadius: 1,
                              cursor: 'pointer',
                              backgroundColor: result.source === 'category' ? '#f9f6ef' : '#f1f8e9',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                backgroundColor: result.source === 'category' ? '#f0e6d9' : '#e8f5e8',
                                borderColor: result.source === 'category' ? '#a47551' : '#388e3c',
                                transform: 'translateY(-1px)',
                                boxShadow: `0 2px 8px rgba(${result.source === 'category' ? '176, 137, 104' : '76, 175, 80'}, 0.15)`
                              }
                            }}
                            onClick={() => {
                              if (result.lat && result.lng) {
                                // Use the same handler as map markers for consistency
                                handleDestinationSelect(result);
                                showLocalNotification(`Destination set from ${result.source} search!`, 'success');
                              }
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Box sx={{ flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                  <Typography variant="body2" color="#2e7d32" fontWeight={500}>
                                    {result.name || result.display_name}
                                  </Typography>
                                  <Typography variant="caption" sx={{ 
                                    ml: 1, 
                                    px: 0.5, 
                                    py: 0.25, 
                                    borderRadius: 0.5,
                                    backgroundColor: result.source === 'category' ? '#b08968' : '#4caf50',
                                    color: '#fff',
                                    fontSize: '0.7rem'
                                  }}>
                                    {result.source}
                                  </Typography>
                                </Box>
                                <Typography variant="caption" color="#666" sx={{ display: 'block' }}>
                                  {result.address || result.fullAddress}
                                </Typography>
                                {result.brand && result.brand.length > 0 && (
                                  <Typography variant="caption" color="#4caf50" sx={{ display: 'block', mt: 0.5 }}>
                                    Brand: {result.brand.join(', ')}
                                  </Typography>
                                )}
                              </Box>
                              {result.distance && (
                                <Typography variant="caption" color="#666" sx={{ 
                                  fontWeight: 600,
                                  backgroundColor: '#f0f0f0',
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 0.5,
                                  ml: 1
                                }}>
                                  {result.distance.toFixed(1)} mi
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                  
                  {/* Category Search Loading */}
                  {isCategorySearching && (
                    <Box mt={1.5} sx={{ display: 'flex', alignItems: 'center', color: '#b08968' }}>
                      <SimpleLoading size="small" />
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Searching category...
                      </Typography>
                    </Box>
                  )}
                  
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
                              setShowRoutePreview(false);
                              setRoutePreviewData(null);
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
                  
                  {/* Debug Button */}
                  <Box mt={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={testSearchAndMarkers}
                      sx={{ 
                        color: '#b08968', 
                        borderColor: '#e0c9b3',
                        fontSize: '0.75rem',
                        '&:hover': {
                          background: '#f9f6ef'
                        }
                      }}
                    >
                      🧪 Test Search & Markers
                    </Button>
                  </Box>
                  
                  {/* Additional Debug Button */}
                  <Box mt={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={testSetSuggestions}
                      sx={{ 
                        color: '#b08968', 
                        borderColor: '#e0c9b3',
                        fontSize: '0.75rem',
                        '&:hover': {
                          background: '#f9f6ef'
                        }
                      }}
                    >
                      🧪 Test Set Suggestions
                    </Button>
                  </Box>
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
                      />
                      <Box sx={{ mt: 0.5 }}>
                        <FormControl size="small" sx={{ minWidth: 100 }}>
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
                      </Box>
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
      <Box sx={{ 
        flex: 1, 
        position: 'relative',
        width: isSidebarOpen ? 'calc(100% - 420px)' : '100%',
        transition: 'width 0.3s ease'
      }}>
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

        <Box sx={{ height: '100vh', width: '100%', position: 'relative' }}>
          <MapView 
            ref={mapRef}
            users={users} 
            destination={destination}
            userLocation={userLocation}
            calculatedRoute={calculatedRoute}
            destinationSuggestions={categorySearchResults.length > 0 ? categorySearchResults : destinationSuggestions}
            onSetDestinationFromMap={(coords) => handleDestinationChange(coords)}
            onSuggestionSelect={handleDestinationSelect}
            onRouteUpdate={(route) => {
              console.log('Route updated:', route);
              setCalculatedRoute(route);
            }}
            onMapClick={handleMapClick}
            mapClickMode={mapClickMode}
          />
          
          {/* Map Click Mode Indicator */}
          {mapClickMode && (
            <>
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(176, 137, 104, 0.9)',
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 500,
                  zIndex: 1000,
                  pointerEvents: 'none',
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.7 },
                    '100%': { opacity: 1 }
                  }
                }}
              >
                {mapClickMode === 'destination' ? 'Click to set destination' : 'Click to set location'}
              </Box>
              
              {/* Cancel Button */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 80,
                  right: 16,
                  zIndex: 1000
                }}
              >
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setMapClickMode(null)}
                  sx={{
                    background: '#f44336',
                    color: '#fff',
                    '&:hover': {
                      background: '#d32f2f'
                    }
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </>
          )}
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

      {/* Sleek Compact Route Preview Modal */}
      {showRoutePreview && routePreviewData && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 20,
            left: isSidebarOpen ? 'calc(50% + 200px)' : '50%', // Center over map area
            transform: 'translateX(-50%)',
            zIndex: 2000,
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(20px)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            width: '420px',
            maxWidth: 'calc(100vw - 40px)',
            overflow: 'hidden',
            animation: 'slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            '@keyframes slideUp': {
              '0%': {
                opacity: 0,
                transform: 'translateX(-50%) translateY(12px)',
              },
              '100%': {
                opacity: 1,
                transform: 'translateX(-50%) translateY(0)',
              }
            }
          }}
        >
          {/* Ultra Compact Header */}
          <Box
            sx={{
              background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(69, 160, 73, 0.9))',
              backdropFilter: 'blur(10px)',
              color: 'white',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.15)'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <DirectionsCarIcon sx={{ fontSize: 16, color: 'white' }} />
              <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.9rem' }}>
                {routePreviewData.destination}
              </Typography>
            </Box>
            <IconButton
              onClick={() => {
                // Clear the route preview modal
                setShowRoutePreview(false);
                setRoutePreviewData(null);
                
                // Clear the destination and route data
                setDestination(null);
                setCalculatedRoute(null);
                setRouteDetails(null);
                
                // Clear any destination suggestions
                setDestinationSuggestions([]);
                
                // Clear the destination input field
                setForm(prev => ({
                  ...prev,
                  destination: ''
                }));
                
                console.log('Route preview modal closed - destination and route cleared');
              }}
              size="small"
              sx={{ 
                color: 'white', 
                background: 'rgba(255,255,255,0.1)',
                padding: '4px',
                '&:hover': { 
                  background: 'rgba(255,255,255,0.2)',
                  transform: 'scale(1.05)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>

          {/* Ultra Compact Horizontal Layout */}
          <Box sx={{ 
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 2.5
          }}>
            {/* Seats Available Placeholder */}
            <Box sx={{ 
              flex: 1,
              minHeight: '48px',
              display: 'flex',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'rgba(255, 193, 7, 0.08)',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 193, 7, 0.3)'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon sx={{ fontSize: 14, color: 'rgba(255, 193, 7, 0.7)' }} />
                <Typography 
                  variant="caption" 
                  color="rgba(255, 193, 7, 0.7)" 
                  sx={{ 
                    fontSize: '0.65rem',
                    lineHeight: 1.3,
                    fontStyle: 'italic'
                  }}
                >
                  Seats: 4 available
                </Typography>
              </Box>
            </Box>

            {/* Distance Display */}
            <Box sx={{ 
              textAlign: 'center',
              minWidth: '70px',
              padding: '6px 10px',
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '8px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              border: '1px solid rgba(76, 175, 80, 0.08)'
            }}>
              <Typography variant="h6" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.1rem' }}>
                {routePreviewData.distance}
              </Typography>
              <Typography variant="caption" color="#7f8c8d" fontWeight={500} sx={{ fontSize: '0.65rem' }}>
                miles
              </Typography>
            </Box>

            {/* Time Display */}
            <Box sx={{ 
              textAlign: 'center',
              minWidth: '70px',
              padding: '6px 10px',
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '8px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              border: '1px solid rgba(76, 175, 80, 0.08)'
            }}>
              <Typography variant="h6" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.1rem' }}>
                {routePreviewData.duration}
              </Typography>
              <Typography variant="caption" color="#7f8c8d" fontWeight={500} sx={{ fontSize: '0.65rem' }}>
                min
              </Typography>
            </Box>


          </Box>
        </Box>
      )}
    </Box>
  );
}

export default RouteOptimizer;

