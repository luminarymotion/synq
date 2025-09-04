// RouteOptimizer.jsx - Handles both ride creation and joining functionality
import '../App.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import UserForm from '../components/UserForm';
import MapView from '../components/MapView';
import UserTable from '../components/UserTable';
import UserSearch from '../components/UserSearch';
import RideDetailsVerificationModal from '../components/RideDetailsVerificationModal';
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
import { searchDestinations, getDirections, ROUTING_PROFILES, getCurrentLocation } from '../services/locationService';
import '../styles/RouteOptimizer.css';
import '../styles/RideDetailsVerificationModal.css';
import locationTrackingService from '../services/locationTrackingService';
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
  InputAdornment,
  CircularProgress
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
  Clear as ClearIcon,
  Share as ShareIcon
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

  // Simple location tracking using getCurrentLocation
  const [isTracking, setIsTracking] = useState(false);
  const [locationStatus, setLocationStatus] = useState('stopped');
  
  // Function to get current location once
  const getCurrentLocationOnce = async () => {
    try {
      setIsTracking(true);
      setLocationStatus('active');
      setLocationError(null);
      setHasLocationError(false);
      
      const locationData = await getCurrentLocation();
      console.log('Location received in RouteOptimizer:', locationData);
      
      if (locationData && locationData.lat && locationData.lng) {
        const { lat, lng, accuracy } = locationData;
        
        // Validate coordinates
        if (typeof lat === 'number' && typeof lng === 'number' && 
            !isNaN(lat) && !isNaN(lng) &&
            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          
          setHasValidLocation(true);
          setLocationError(null);
          setHasLocationError(false);
          
          // Update user location state
          const newLocation = { lat, lng, accuracy };
          setUserLocation(newLocation);
          
          // Update form state with coordinates (address will be fetched separately if needed)
          setForm(prev => ({
            ...prev,
            userLocation: `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
            startingLocation: `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`
          }));
          
          setLocationStatusMessage(`Location obtained (accuracy: ${Math.round(accuracy)}m)`);
        } else {
          throw new Error('Invalid coordinates received');
        }
      } else {
        throw new Error('No location data received');
      }
    } catch (error) {
      console.error('Location error:', error);
      setHasLocationError(true);
      setLocationError(error.message);
      setLocationStatusMessage('Location failed. Please enter manually.');
    } finally {
      setIsTracking(false);
      setLocationStatus('stopped');
    }
  };

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
  const [avoidTolls, setAvoidTolls] = useState(false); // New state for tolls preference
  const [carSeatsAvailable, setCarSeatsAvailable] = useState(4); // New state for car seats
  const [showSeatsDropdown, setShowSeatsDropdown] = useState(false); // State for seats dropdown
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

  // Ride verification modal state
  const [showRideVerificationModal, setShowRideVerificationModal] = useState(false);
  const [rideDataForVerification, setRideDataForVerification] = useState(null);

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
  
  // Search component state variables - simplified to match mobile
  const [searchBoxValue, setSearchBoxValue] = useState('');
  const [categorySearchResults, setCategorySearchResults] = useState([]);
  const [isCategorySearching, setIsCategorySearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
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

  // Close seats dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSeatsDropdown && !event.target.closest('[data-seats-dropdown]')) {
        setShowSeatsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSeatsDropdown]);

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
        const directions = await getDirections(startLocation, endLocation, {
          profile: ROUTING_PROFILES.DRIVING_TRAFFIC,
          alternatives: false,
          annotations: ['distance', 'duration'],
          avoidTolls: creatorRole === 'driver' ? avoidTolls : false
        });
        
        // getDirections now returns an array of routes, take the first one
        const firstRoute = directions[0];
        
        const route = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: firstRoute.geometry,
            properties: {
              name: 'Route Preview',
              summary: {
                distance: firstRoute.distance * 1609.34, // Convert miles to meters
                duration: firstRoute.duration * 60, // Convert minutes to seconds
                waypoints: waypoints
              }
            }
          }],
          totalDistance: firstRoute.distance * 1609.34,
          totalDuration: firstRoute.duration * 60
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
          await getCurrentLocationOnce();
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
      // No cleanup needed for simple location tracking
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

  // Click outside handler to close search results dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside the search container or dropdown
      const searchContainer = document.querySelector('.search-container');
      const searchDropdown = document.querySelector('.search-results-dropdown');
      
      if (searchContainer && !searchContainer.contains(event.target) && 
          searchDropdown && !searchDropdown.contains(event.target)) {
        console.log('🔍 Click outside detected, hiding search results');
        setShowSearchResults(false);
      }
    };

    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debug effect to monitor dropdown state
  useEffect(() => {
    console.log('🔍 [DEBUG] Dropdown state changed:', {
      isDropdownOpen,
      suggestionsCount: destinationSuggestions.length,
      isLoadingSuggestions,
      hasSuggestions: destinationSuggestions.length > 0,
      categorySearchResultsCount: categorySearchResults.length,
      showSearchResults,
      searchBoxValue
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

  // Debug effect for search results
  useEffect(() => {
    console.log('🔍 [DEBUG] Search results state changed:', {
      categorySearchResultsCount: categorySearchResults.length,
      showSearchResults,
      searchBoxValue,
      isCategorySearching
    });
  }, [categorySearchResults.length, showSearchResults, searchBoxValue, isCategorySearching]);

  // Update userLocation when location changes - removed as we now use getCurrentLocationOnce
  
  // Auto-start location tracking when user is driver (optional - don't block app if it fails)
  useEffect(() => {
    if (user && creatorRole === 'driver' && !isTracking) {
      console.log('🚗 Auto-starting location tracking for driver');
      getCurrentLocationOnce().catch(error => {
        console.warn('⚠️ Location tracking failed to start, but app will continue:', error.message);
        // Don't block the app if location tracking fails
      });
    }
  }, [user, creatorRole, isTracking]);

  // Update status message based on actual tracking state
  useEffect(() => {
    if (isTracking && userLocation) {
      const accuracy = userLocation.accuracy ? Math.round(userLocation.accuracy) : 'unknown';
      setLocationStatusMessage(`Location tracking active (accuracy: ${accuracy}m)`);
    } else if (isTracking && !userLocation) {
      setLocationStatusMessage('Location tracking active - acquiring position...');
    } else if (!isTracking && userLocation) {
      setLocationStatusMessage('Location available (tracking stopped)');
    } else if (!isTracking && !userLocation) {
      setLocationStatusMessage('Location tracking stopped');
    }
  }, [isTracking, userLocation]);


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
          setIsTracking(false);
          setLocationStatus('stopped');
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

  // Handle destination selection
  const handleDestinationSelect = async (selectedOption) => {
    console.log('🎯 handleDestinationSelect called with:', selectedOption);
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
        
        // Zoom map to the selected location (mobile-like behavior)
        if (mapRef.current && coords.lat && coords.lng) {
          console.log('🗺️ Zooming to selected destination:', coords);
          mapRef.current.flyTo({
            center: [coords.lng, coords.lat],
            zoom: 16,
            duration: 1500
          });
        }
        
        // Set destination
        await handleDestinationChange(coords);
        setForm(prev => ({ ...prev, destination: coords.address }));
        
        // Clear suggestions after a short delay to prevent map zoom issues
        setTimeout(() => {
          setDestinationSuggestions([]);
          setCategorySearchResults([]); // Clear category search results
          setShowSearchResults(false); // Hide the dropdown
          setSearchBoxValue(''); // Clear the search input
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
  


  // Simple search function that matches mobile view implementation
  const performSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      console.log('🔍 Query too short or empty, clearing results');
      setCategorySearchResults([]);
      setIsCategorySearching(false);
      return [];
    }
    
    const trimmedQuery = query.trim().toLowerCase();
    console.log(`🔍 Desktop search for: "${trimmedQuery}"`);
    console.log(`🔍 Current userLocation:`, userLocation);
    console.log(`🔍 userLocation type:`, typeof userLocation);
    console.log(`🔍 userLocation keys:`, userLocation ? Object.keys(userLocation) : 'null');
    
    // Set loading state
    setIsCategorySearching(true);
    setCategorySearchResults([]); // Clear previous results
    
    // Use the same simple approach as MobileRideCreator
    try {
      const results = await searchDestinations(trimmedQuery, {
        limit: 8, // Same limit as mobile
        userLocation: userLocation,
        enableFallback: true
      });
      
      console.log(`🔍 Desktop search results: ${results.length} found`);
      console.log(`🔍 Search results:`, results);
      
      // Update state with results (no filtering - same as mobile)
      console.log('🔍 Setting search results:', results);
      setCategorySearchResults(results);
      const shouldShowResults = results.length > 0;
      console.log('🔍 Setting showSearchResults to:', shouldShowResults);
      setShowSearchResults(shouldShowResults);
      console.log('🔍 showSearchResults set to:', shouldShowResults);
      
      if (results.length > 0) {
        showLocalNotification(`Found ${results.length} locations for "${trimmedQuery}"`, 'success');
        
        console.log(`🔍 Desktop search successful for "${trimmedQuery}":`, {
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
      
      return results;
    } catch (error) {
      console.error('🔍 Desktop search failed:', error);
      showLocalNotification('Search failed', 'error');
      setCategorySearchResults([]);
      setShowSearchResults(false);
      return [];
    } finally {
      setIsCategorySearching(false);
    }
  };

  // Enhanced destination input change handler - matches mobile implementation
  const handleDestinationInputChange = (event) => {
    const query = event.target.value;
    console.log('🔍 Search input changed:', query);
    console.log('🔍 Current showSearchResults:', showSearchResults);
    console.log('🔍 Current categorySearchResults length:', categorySearchResults.length);
    setSearchBoxValue(query);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If query is empty, clear results
    if (!query || query.length === 0) {
      console.log('🔍 Query empty, clearing results');
      setCategorySearchResults([]);
      setShowSearchResults(false);
      setIsCategorySearching(false);
      return;
    }
    
    // Don't search for very short queries
    if (query.length < 3) {
      console.log('🔍 Query too short, not searching');
      return;
    }
    
    // Trigger search after delay
    searchTimeoutRef.current = setTimeout(() => {
      console.log('🔍 Debounced search triggered for:', query);
      performSearch(query);
    }, 300); // Reduced delay for better responsiveness
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

    // Show ride verification modal instead of directly creating the ride
    const rideData = {
      title: `Ride to ${destination.address || 'Destination'}`,
      startTime: new Date().toISOString().slice(0, 16), // Current date/time
      destination: destination.address || `Location (${destination.lat.toFixed(6)}, ${destination.lng.toFixed(6)})`,
      description: `Ride with ${users.length} participant${users.length !== 1 ? 's' : ''}`,
        carSeatsAvailable: carSeatsAvailable,
        avoidTolls: creatorRole === 'driver' ? avoidTolls : false, // Include tolls preference
      specialNotes: '',
      users: users,
      creatorRole: creatorRole
    };

    setRideDataForVerification(rideData);
    setShowRideVerificationModal(true);
  };

  // Handle ride verification modal actions
  const handleConfirmRide = async (finalRideData) => {
    console.log('Confirming ride with data:', finalRideData);
    
    // Close the modal
    setShowRideVerificationModal(false);
    
    // Extract the original ride data
    const originalRideData = rideDataForVerification;
    
    // Use the creator role from the verification modal (this is the updated value)
    const updatedCreatorRole = finalRideData.creatorRole || originalRideData.creatorRole || 'driver';
    
    console.log('🔍 Creator role analysis:', {
      originalCreatorRole: originalRideData.creatorRole,
      finalCreatorRole: finalRideData.creatorRole,
      updatedCreatorRole,
      finalRideDataKeys: Object.keys(finalRideData)
    });
    
    // Modified driver check to include creator if they are a driver
    const driver = users.find(u => u.role === 'driver') || 
                  (updatedCreatorRole === 'driver' ? {
                    id: user.uid,
                    name: user.displayName || 'You',
                    role: 'driver',
                    isCreator: true,
                    userLocationCoords: userLocation
                  } : null);

    // Only require a driver if creator is not a driver (creator as passenger means no initial driver)
    if (!driver && updatedCreatorRole === 'driver') {
      console.log('Group creation blocked: No driver assigned', {
        updatedCreatorRole,
        usersWithRoles: users.map(u => ({ name: u.name, role: u.role }))
      });
      showLocalNotification('Please assign a driver for the ride', 'error');
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
        // Include title and description from the verification modal
        title: finalRideData.title || `Ride to ${destinationAddress || 'Destination'}`,
        description: finalRideData.description || `Ride with ${users.length} participant${users.length !== 1 ? 's' : ''}`,
        groupName: finalRideData.title || `Ride to ${destinationAddress || 'Destination'}`,
        name: finalRideData.title || `Ride to ${destinationAddress || 'Destination'}`,
        startTime: finalRideData.startTime || new Date().toISOString(),
        carSeatsAvailable: finalRideData.carSeatsAvailable || carSeatsAvailable,
        avoidTolls: finalRideData.avoidTolls || (updatedCreatorRole === 'driver' ? avoidTolls : false), // Include tolls preference
        specialNotes: finalRideData.specialNotes || '',
        // Only include driver if creator is a driver
        ...(updatedCreatorRole === 'driver' ? {
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
            joinedAt: new Date().toISOString(),
            avoidTolls: updatedCreatorRole === 'driver' ? avoidTolls : false // Include driver's tolls preference
          }
        } : {}),
        passengers: [
          // Include creator if they are a passenger
          ...(updatedCreatorRole === 'passenger' ? [{
            name: user.displayName || 'You',
            location: userLocation ? {
              lat: userLocation.lat,
              lng: userLocation.lng
            } : null,
            address: userLocation ? 'Current Location' : 'Location pending',
            status: 'confirmed',
            isCreator: true,
            uid: user.uid,
            invitationStatus: 'accepted',
            joinedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          }] : []),
          // Include other passengers
          ...users
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
            }))
        ],
        destination: {
          location: {
            lat: destination.lat,
            lng: destination.lng
          },
          address: destinationAddress || 'Destination not found'
        },
        creatorRole: updatedCreatorRole, // Save the updated creator role
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
      console.error('Error in handleConfirmRide:', {
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

  const handleEditRide = () => {
    console.log('Going back to edit mode');
    setShowRideVerificationModal(false);
    // The user stays on the current page to continue editing
  };

  const handleShareRide = async () => {
    if (!createdRideId) {
      showLocalNotification('No ride to share', 'error');
      return;
    }

    // Create the deep link for the live ride
    const deepLink = `${window.location.origin}/rides/${createdRideId}`;
    
    // Create share data
    const shareData = {
      title: 'Join my ride!',
      text: 'I created a ride and would like you to join. Click the link to view the live ride.',
      url: deepLink
    };

    try {
      // Check if Web Share API is supported
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        showLocalNotification('Ride shared successfully!', 'success');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(deepLink);
        showLocalNotification('Ride link copied to clipboard!', 'success');
      }
    } catch (error) {
      console.error('Error sharing ride:', error);
      
      // Final fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(deepLink);
        showLocalNotification('Ride link copied to clipboard!', 'success');
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
        showLocalNotification('Failed to share ride link', 'error');
      }
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

        // Get current location once
        console.log('About to get current location...');
        await getCurrentLocationOnce();
        console.log('Location obtained successfully');
        
        console.log('Location tracking completed successfully');
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
        
        // Reset tracking state
        setIsTracking(false);
        setLocationStatus('stopped');
        
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
        
        // Set manual location directly
        const newLocation = { lat, lng, accuracy: 0 };
        setUserLocation(newLocation);
        
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
        role: userData.role || 'passenger', // Default to passenger, invitee will choose their role
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
          {/* Destination Search Bar - Top of Map */}
          <Box sx={{ 
            position: 'absolute', 
            top: 20, 
            left: '50%', 
            transform: 'translateX(-50%)',
            zIndex: 1000,
            width: '90%',
            maxWidth: 500
          }}>
            <Paper sx={{ 
              p: 2, 
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: 3,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                <Avatar sx={{ 
                  width: 32, 
                  height: 32, 
                  background: destination ? '#4caf50' : '#b08968',
                  mr: 1.5
                }}>
                  {destination ? <LocationIcon fontSize="small" sx={{ color: '#fff' }} /> : <RouteIcon fontSize="small" sx={{ color: '#fff' }} />}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                    {destination ? 'Destination Set' : 'Set Destination'}
                  </Typography>
                  <Typography variant="caption" color="#7c5e48">
                    {destination ? destination.address : 'Where are you heading?'}
                  </Typography>
                </Box>
                {destination && (
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
              
              {!destination ? (
                <Box sx={{ position: 'relative' }} className="search-container">
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search for destination..."
                    value={searchBoxValue}
                    onChange={handleDestinationInputChange}
                    onFocus={() => {
                      console.log('🔍 Search input focused, current results:', categorySearchResults.length);
                      if (categorySearchResults.length > 0) {
                        setShowSearchResults(true);
                        console.log('🔍 Showing search results on focus');
                      }
                    }}
                    sx={{ 
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
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
                        <IconButton
                          size="small"
                          onClick={() => {
                            console.log('🔍 Clearing search input');
                            setSearchBoxValue('');
                            setCategorySearchResults([]);
                            setShowSearchResults(false);
                          }}
                          sx={{ color: '#b08968' }}
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      )
                    }}
                  />
                  
                  {/* Search Results Dropdown */}
                  {(showSearchResults && categorySearchResults.length > 0) && (
                    <Box 
                      className="search-results-dropdown"
                      sx={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        mt: 1,
                        background: 'rgba(255, 255, 255, 0.98)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: 2,
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        zIndex: 9999,
                        maxHeight: '300px',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Loading State */}
                      {isCategorySearching && (
                        <Box sx={{ 
                          p: 2, 
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1.5
                        }}>
                          <CircularProgress size={16} sx={{ color: 'primary.main' }} />
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '13px' }}>
                            Searching...
                          </Typography>
                        </Box>
                      )}
                      
                      {/* Results List */}
                      <Box sx={{ maxHeight: '250px', overflow: 'auto' }}>
                        {categorySearchResults.map((result, index) => (
                          <Box
                            key={`${result.name}-${result.lat}-${result.lng}-${index}`}
                            sx={{
                              p: 1.5,
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(0,0,0,0.05)',
                              transition: 'background-color 0.2s ease',
                              '&:hover': {
                                backgroundColor: 'rgba(0,0,0,0.05)'
                              },
                              '&:last-child': {
                                borderBottom: 'none'
                              }
                            }}
                                    onClick={() => {
          console.log('🎯 Dropdown item clicked:', result);
          // Handle both lng and lon properties for longitude
          const hasValidCoordinates = result.lat && (result.lng || result.lon);
          if (hasValidCoordinates) {
            console.log('🎯 Calling handleDestinationSelect with valid coordinates');
            // Normalize the result object to use lng consistently
            const normalizedResult = {
              ...result,
              lng: result.lng || result.lon
            };
            handleDestinationSelect(normalizedResult);
            setShowSearchResults(false);
          } else {
            console.log('❌ Result missing coordinates:', { 
              lat: result.lat, 
              lng: result.lng, 
              lon: result.lon 
            });
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
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LocationIcon fontSize="small" />}
                    onClick={() => {
                      if (mapRef.current) {
                        console.log('Focus on destination');
                      }
                    }}
                    sx={{ 
                      color: '#4caf50', 
                      borderColor: '#c8e6c9', 
                      borderRadius: 2,
                      flex: 1,
                      '&:hover': {
                        background: '#f1f8e9'
                      }
                    }}
                  >
                    View on Map
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<MapIcon fontSize="small" />}
                    onClick={handleSetDestinationFromMap}
                    sx={{ 
                      color: '#b08968', 
                      borderColor: '#b08968',
                      borderRadius: 2,
                      '&:hover': {
                        borderColor: '#a47551',
                        background: '#f9f6ef'
                      }
                    }}
                  >
                    Change
                  </Button>
                </Box>
              )}
            </Paper>
          </Box>
          
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
        PaperProps={{
          sx: {
            margin: { xs: 2, sm: 'auto' },
            maxWidth: { xs: 'calc(100% - 32px)', sm: '600px' },
            width: { xs: '100%', sm: 'auto' },
            maxHeight: { xs: 'calc(100% - 32px)', sm: '90vh' }
          }
        }}
      >
        <DialogTitle sx={{ 
          background: '#f9f6ef', 
          color: '#4e342e', 
          textAlign: 'center',
          padding: { xs: 2, sm: 3 }
        }}>
          Ride Created Successfully!
        </DialogTitle>
        <DialogContent sx={{ 
          background: '#fff', 
          textAlign: 'center', 
          py: { xs: 2, sm: 3 },
          px: { xs: 2, sm: 3 }
        }}>
          <Avatar sx={{ 
            width: { xs: 60, sm: 80 }, 
            height: { xs: 60, sm: 80 }, 
            mx: 'auto', 
            mb: 2, 
            background: '#4caf50' 
          }}>
            <CheckIcon sx={{ fontSize: { xs: 30, sm: 40 } }} />
          </Avatar>
          <Typography variant="h6" color="#4e342e" mb={1} sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
            Your ride has been created!
          </Typography>
          <Typography variant="body2" color="#7c5e48" mb={2} sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
            Once participants provide their locations, you can optimize and start the ride.
          </Typography>
          <Paper sx={{ 
            p: { xs: 1.5, sm: 2 }, 
            background: '#f9f6ef', 
            display: 'inline-block',
            maxWidth: '100%',
            overflow: 'hidden'
          }}>
            <Typography variant="caption" color="#b08968" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              Ride ID:
            </Typography>
            <Typography 
              variant="body2" 
              fontWeight={600} 
              color="#4e342e" 
              sx={{ 
                fontSize: { xs: '0.875rem', sm: '1rem' },
                wordBreak: 'break-all'
              }}
            >
              {createdRideId}
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ 
          background: '#f9f6ef', 
          justifyContent: 'center', 
          pb: { xs: 2, sm: 3 },
          px: { xs: 2, sm: 3 },
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' }
        }}>
          <Button 
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={handleShareRide}
            sx={{ 
              borderColor: '#a47551', 
              color: '#a47551', 
              borderRadius: 2, 
              px: { xs: 3, sm: 4 },
              py: { xs: 1, sm: 1.5 },
              fontSize: { xs: '0.875rem', sm: '1rem' },
              minWidth: { xs: '120px', sm: 'auto' },
              '&:hover': {
                borderColor: '#8b6b47',
                backgroundColor: 'rgba(164, 117, 81, 0.04)'
              }
            }}
            fullWidth={false}
          >
            Share Ride
          </Button>
          <Button 
            variant="contained"
            onClick={() => {
              setShowSuccessModal(false);
              navigate('/dashboard');
            }}
            sx={{ 
              background: '#a47551', 
              color: '#fff', 
              borderRadius: 2, 
              px: { xs: 3, sm: 4 },
              py: { xs: 1, sm: 1.5 },
              fontSize: { xs: '0.875rem', sm: '1rem' },
              minWidth: { xs: '120px', sm: 'auto' },
              '&:hover': {
                backgroundColor: '#8b6b47'
              }
            }}
            fullWidth={false}
          >
            Go to Dashboard
          </Button>
        </DialogActions>
      </Dialog>

      {/* Ride Details Verification Modal */}
      <RideDetailsVerificationModal
        isOpen={showRideVerificationModal}
        onClose={() => setShowRideVerificationModal(false)}
        rideData={rideDataForVerification}
        onConfirm={handleConfirmRide}
        onEdit={handleEditRide}
      />

      {/* Sleek Compact Route Preview Modal */}
      {showRoutePreview && routePreviewData && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            left: isSidebarOpen ? 'calc(50% + 200px)' : '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            background: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 32px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            width: '420px',
            maxWidth: 'calc(100vw - 48px)',
            overflow: 'visible',
            animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '@keyframes slideUp': {
              '0%': {
                opacity: 0,
                transform: 'translateX(-50%) translateY(20px) scale(0.95)',
              },
              '100%': {
                opacity: 1,
                transform: 'translateX(-50%) translateY(0) scale(1)',
              }
            }
          }}
        >
          {/* Modern Header */}
          <Box
            sx={{
              background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              color: 'white',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              '&::after': {
                content: '""',
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(10px)'
              }}>
              <DirectionsCarIcon sx={{ fontSize: 16, color: 'white' }} />
              </Box>
              <Box>
                <Typography variant="body1" fontWeight={600} sx={{ fontSize: '0.9rem', lineHeight: 1.2 }}>
                {routePreviewData.destination}
              </Typography>
                <Typography variant="caption" sx={{ 
                  opacity: 0.9, 
                  fontSize: '0.7rem',
                  fontWeight: 400
                }}>
                  Route Summary
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={() => {
                setShowRoutePreview(false);
                setRoutePreviewData(null);
                setDestination(null);
                setCalculatedRoute(null);
                setRouteDetails(null);
                setDestinationSuggestions([]);
                setForm(prev => ({ ...prev, destination: '' }));
                console.log('Route preview modal closed - destination and route cleared');
              }}
              size="small"
              sx={{ 
                color: 'white', 
                background: 'rgba(255,255,255,0.15)',
                padding: '6px',
                borderRadius: '6px',
                '&:hover': { 
                  background: 'rgba(255,255,255,0.25)',
                  transform: 'scale(1.05)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>

          {/* Content Area */}
          <Box sx={{ 
            padding: '12px',
            background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
            overflow: 'visible'
          }}>
            {/* All Options in One Row */}
            <Box sx={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 1,
              overflow: 'visible'
            }}>
              {/* Seats Card */}
              <Box 
                data-seats-dropdown
                sx={{ 
                  padding: '8px 6px',
                  background: showSeatsDropdown ? 'rgba(34, 197, 94, 0.05)' : 'white',
                  borderRadius: '10px',
                  boxShadow: showSeatsDropdown ? '0 4px 16px rgba(34, 197, 94, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.06)',
                  border: showSeatsDropdown ? '2px solid #22C55E' : '1px solid rgba(0, 0, 0, 0.08)',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'visible',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #22C55E'
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, #22C55E, #16A34A)'
                  }
                }}
                onClick={() => {
                  console.log('Seats card clicked, current showSeatsDropdown:', showSeatsDropdown);
                  setShowSeatsDropdown(!showSeatsDropdown);
                  setTimeout(() => {
                    console.log('showSeatsDropdown after state update:', !showSeatsDropdown);
                  }, 0);
                }}
              >
                <Box sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              display: 'flex',
              alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 4px'
                }}>
                  <PersonIcon sx={{ fontSize: 12, color: 'white' }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ 
                  color: '#1f2937',
                  fontSize: '1rem',
                  lineHeight: 1.2,
                  mb: 0.25,
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  {carSeatsAvailable}
                </Typography>
                <Typography variant="caption" sx={{ 
                  color: '#6b7280',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  display: 'block',
                  lineHeight: 1.2,
                  minHeight: '14px',
                  textAlign: 'center',
                  width: '100%'
                }}>
                  seats
                </Typography>
                
                {/* Dropdown indicator */}
                <Box sx={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '4px solid #22C55E',
                  opacity: 0.6
                }} />
                
                {/* Seats Dropdown */}
                {showSeatsDropdown && (
                  <Box sx={{
                    position: 'absolute',
                    top: '-100px', // Position slightly above the seats box
                    left: 0, // Align with the left edge of the seats box
                    background: 'white',
              borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    zIndex: 3000,
                    width: '100%', // Same width as the seats box
                    maxHeight: '180px', // Increased height to show more entries
                    overflowY: 'auto',
                    minHeight: '180px', // Increased minimum height
                    marginTop: '4px' // Small gap between box and dropdown
                  }}>
                    {console.log('Rendering seats dropdown with options:', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])}
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((seat) => (
                      <Box
                        key={seat}
                        onClick={() => {
                          setCarSeatsAvailable(seat);
                          setShowSeatsDropdown(false);
                        }}
                  sx={{ 
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: seat < 9 ? '1px solid rgba(0, 0, 0, 0.05)' : 'none',
                          '&:hover': {
                            background: 'rgba(34, 197, 94, 0.1)'
                          },
                          '&:last-child': {
                            borderBottom: 'none'
                          }
                        }}
                      >
                        <Typography sx={{
                          fontSize: '0.875rem',
                          fontWeight: seat === carSeatsAvailable ? 600 : 400,
                          color: seat === carSeatsAvailable ? '#22C55E' : '#374151',
                          textAlign: 'center'
                        }}>
                          {seat}
                </Typography>
              </Box>
                    ))}
                  </Box>
                )}
            </Box>

              {/* Tolls Card */}
            <Box sx={{ 
                padding: '8px 6px',
                background: avoidTolls ? 'rgba(255, 193, 7, 0.1)' : 'white',
                borderRadius: '10px',
                boxShadow: avoidTolls ? '0 4px 16px rgba(255, 193, 7, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.06)',
                border: avoidTolls ? '2px solid #FFC107' : '1px solid rgba(0, 0, 0, 0.08)',
              textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: avoidTolls ? 'linear-gradient(90deg, #FFC107, #FF8F00)' : 'linear-gradient(90deg, #d1d5db, #9ca3af)'
                }
              }}
              onClick={() => setAvoidTolls(!avoidTolls)}
              >
                <Box sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '6px',
                  background: avoidTolls ? 'linear-gradient(135deg, #FFC107 0%, #FF8F00 100%)' : 'linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 4px',
                  transition: 'all 0.2s ease'
                }}>
                  <DirectionsCarIcon sx={{ 
                    fontSize: 12, 
                    color: 'white',
                    filter: avoidTolls ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' : 'none',
                    transition: 'all 0.2s ease'
                  }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ 
                  color: avoidTolls ? '#1f2937' : '#9ca3af',
                  fontSize: '1rem',
                  lineHeight: 1.2,
                  mb: 0.25,
                  transition: 'all 0.2s ease',
                  minHeight: '1.2rem'
                }}>
                  {avoidTolls ? 'ON' : 'OFF'}
                </Typography>
                <Typography variant="caption" sx={{ 
                  color: avoidTolls ? '#FF8F00' : '#6b7280',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  display: 'block',
                  lineHeight: 1.2,
                  minHeight: '14px',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  width: '100%'
                }}>
                  avoid tolls
                </Typography>
                
                {/* Toggle indicator */}
                <Box sx={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: avoidTolls ? '#FFC107' : '#d1d5db',
                  opacity: 0.6
                }} />
              </Box>

              {/* Distance Card */}
              <Box sx={{ 
                padding: '8px 6px',
                background: 'white',
                borderRadius: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, #22C55E, #16A34A)'
                }
              }}>
                <Box sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 4px'
                }}>
                  <StraightenIcon sx={{ fontSize: 12, color: 'white' }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ 
                  color: '#1f2937',
                  fontSize: '1rem',
                  lineHeight: 1.2,
                  mb: 0.25
                }}>
                {routePreviewData.distance}
              </Typography>
                <Typography variant="caption" sx={{ 
                  color: '#6b7280',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  display: 'block',
                  lineHeight: 1.2,
                  minHeight: '14px',
                  textAlign: 'center',
                  width: '100%'
                }}>
                miles
              </Typography>
            </Box>

              {/* Time Card */}
            <Box sx={{ 
                padding: '8px 6px',
                background: 'white',
                borderRadius: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
              textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, #22C55E, #16A34A)'
                }
              }}>
                <Box sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 4px'
                }}>
                  <AccessTimeIcon sx={{ fontSize: 12, color: 'white' }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ 
                  color: '#1f2937',
                  fontSize: '1rem',
                  lineHeight: 1.2,
                  mb: 0.25
                }}>
                {routePreviewData.duration}
              </Typography>
                <Typography variant="caption" sx={{ 
                  color: '#6b7280',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  display: 'block',
                  lineHeight: 1.2,
                  minHeight: '14px',
                  textAlign: 'center',
                  width: '100%'
                }}>
                min
              </Typography>
            </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default RouteOptimizer;

