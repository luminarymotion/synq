import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import MapView from '../components/MapView';
import UserSearch from '../components/UserSearch';
import UserTable from '../components/UserTable';
import UserForm from '../components/UserForm';
import { useLocation as useLocationTracking } from '../services/locationTrackingService';
import { getCoordsFromAddress, getDirections, searchDestinations } from '../services/locationService';
import { toast } from 'react-hot-toast';
import SimpleLoading from '../components/SimpleLoading';

import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  IconButton,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';

import {
  LocationOn as LocationIcon,
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Group as GroupIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon
} from '@mui/icons-material';

import '../styles/MobileRideCreator.css';
import '../App.css';



function MobileRideCreator() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserAuth();
  

  
  // Form data
  const [destination, setDestination] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [rideName, setRideName] = useState('');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const [showDestinationSearch, setShowDestinationSearch] = useState(false);
  
  // Route calculation state
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeDetails, setRouteDetails] = useState(null);
  
  // Processing state (same as desktop)
  const [isProcessingDestination, setIsProcessingDestination] = useState(false);
  
  // Local search function that uses the centralized locationService
  const performSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return [];
    }
    
    const trimmedQuery = query.trim().toLowerCase();
    console.log(`🔍 Mobile search for: "${trimmedQuery}"`);
    console.log(`🔍 Current trackingLocation:`, trackingLocation);
    console.log(`🔍 Current userLocation state:`, userLocation);
    console.log(`🔍 trackingLocation type:`, typeof trackingLocation);
    console.log(`🔍 trackingLocation keys:`, trackingLocation ? Object.keys(trackingLocation) : 'null');
    
    // Set loading state
    setIsSearching(true);
    
    // Use the centralized locationService with current tracking location
    try {
      const results = await searchDestinations(trimmedQuery, {
        limit: 8,
        userLocation: trackingLocation, // Use current tracking location instead of stale state
        enableFallback: true
      });
      
      console.log(`🔍 Mobile search results: ${results.length} found`);
      console.log(`🔍 Search results:`, results);
      
      // Update state with results
      setSearchResults(results);
      setShowSearchResults(results.length > 0);
      
      return results;
    } catch (error) {
      console.error('🔍 Mobile search failed:', error);
      setSearchResults([]);
      setShowSearchResults(false);
      return [];
    } finally {
      setIsSearching(false);
    }
  };
  
  // Route calculation tracking
  const [lastCalculatedDestination, setLastCalculatedDestination] = useState(null);
  
  // Ride creation flow state
  const [currentStep, setCurrentStep] = useState('destination'); // 'destination' | 'participants' | 'create'
  
  // Draggable panel state
  const [panelHeight, setPanelHeight] = useState(200); // Default height
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartHeight, setDragStartHeight] = useState(0);
  
  // Route calculation function - defined early to avoid hook order issues
  const calculateAndDisplayRoute = useCallback(async (startLocation, endLocation) => {
    // Enhanced validation to prevent infinite loops
    if (!startLocation || !endLocation) {
      console.warn('Cannot calculate route: missing start or end location');
      return;
    }
    
    // Validate coordinates are numbers and not NaN (handle both lat/lng and latitude/longitude formats)
    const startLat = startLocation.lat || startLocation.latitude;
    const startLng = startLocation.lng || startLocation.longitude;
    const endLat = endLocation.lat || endLocation.latitude;
    const endLng = endLocation.lng || endLocation.longitude;
    
    const hasValidStartCoords = typeof startLat === 'number' && 
      typeof startLng === 'number' && 
      !isNaN(startLat) && 
      !isNaN(startLng);
    
    const hasValidEndCoords = typeof endLat === 'number' && 
      typeof endLng === 'number' && 
      !isNaN(endLat) && 
      !isNaN(endLng);
    
    if (!hasValidStartCoords || !hasValidEndCoords) {
      console.warn('Cannot calculate route: invalid coordinates', {
        startLocation,
        endLocation,
        hasValidStartCoords,
        hasValidEndCoords
      });
      return;
    }

    setIsCalculatingRoute(true);

    try {
      console.log('🚗 Starting route calculation for mobile view:', {
        startLocation,
        endLocation,
        startLat: startLat,
        startLng: startLng,
        endLat: endLat,
        endLng: endLng
      });

      // Normalize coordinates for getDirections call
      const normalizedStartLocation = {
        lat: startLat,
        lng: startLng
      };
      
      const normalizedEndLocation = {
        lat: endLat,
        lng: endLng
      };
      
      console.log('📍 Normalized coordinates for route calculation:', {
        start: normalizedStartLocation,
        end: normalizedEndLocation,
        originalStart: startLocation,
        originalEnd: endLocation
      });
      
      // Get realistic driving directions from Mapbox
      const directions = await getDirections(normalizedStartLocation, normalizedEndLocation);
      
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
            }
          }
        }],
        totalDistance: directions.distance * 1609.34,
        totalDuration: directions.duration * 60
      };
      
      console.log('✅ Route calculation completed for mobile view:', {
        distance: directions.distance,
        duration: directions.duration
      });

      setCalculatedRoute(route);
      
      // Update route details for display
      if (route && route.features && route.features.length > 0) {
        const feature = route.features[0];
        const summary = feature.properties?.summary || {};
        
        setRouteDetails({
          distance: summary.distance || route.totalDistance,
          duration: summary.duration || route.totalDuration,
        });

        // Show success notification with route info
        const distanceInMiles = ((summary.distance || route.totalDistance) / 1609.34).toFixed(1);
        const durationInMinutes = Math.round((summary.duration || route.totalDuration) / 60);
        
        // Only show toast if we have valid numbers
        if (!isNaN(distanceInMiles) && !isNaN(durationInMinutes)) {
          toast.success(`Route calculated! ${distanceInMiles} mi, ${durationInMinutes} min`);
        }
      }
      
      return route;
    } catch (error) {
      console.error('❌ Error calculating route:', error);
      
      // Fallback to simple straight-line route
      const fallbackDistance = calculateDistance(startLat, startLng, endLat, endLng);
      const fallbackDistanceMeters = fallbackDistance * 1609.34;
      const fallbackDurationSeconds = fallbackDistance * 60 * 2; // Rough estimate: 2 minutes per mile
      
      const route = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [startLng, startLat],
              [endLng, endLat]
            ]
          },
          properties: {
            name: 'Route Preview (Fallback)',
            summary: {
              distance: fallbackDistanceMeters,
              duration: fallbackDurationSeconds,
            }
          }
        }],
        totalDistance: fallbackDistanceMeters,
        totalDuration: fallbackDurationSeconds
      };
      
      console.log('⚠️ Using fallback route calculation');
      setCalculatedRoute(route);
      
      if (route && route.features && route.features.length > 0) {
        const feature = route.features[0];
        const summary = feature.properties?.summary || {};
        
        setRouteDetails({
          distance: summary.distance || route.totalDistance,
          duration: summary.duration || route.totalDuration,
        });

        const distanceInMiles = ((summary.distance || route.totalDistance) / 1609.34).toFixed(1);
        const durationInMinutes = Math.round((summary.duration || route.totalDuration) / 60);
        
        // Only show toast if we have valid numbers
        if (!isNaN(distanceInMiles) && !isNaN(durationInMinutes)) {
          toast.info(`Route calculated (fallback)! ${distanceInMiles} mi, ${durationInMinutes} min`);
        }
      }
      
      return route;
    } finally {
      setIsCalculatingRoute(false);
    }
  }, []);

  // Handle destination change (same logic as desktop)
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
      toast.error('Invalid destination location. Please try selecting the location again.');
      setIsProcessingDestination(false);
      return;
    }

    try {
      // Use the address from coords if provided (from suggestion selection)
      // Otherwise, get the address from coordinates via reverse geocoding
      let address = coords.address;
      
      if (!address) {
        console.log('No address provided in coords, performing reverse geocoding...');
        // Note: getCoordsFromAddress expects an address string, not coordinates
        // For now, just use the coordinates as the address
        address = `${lat}, ${lng}`;
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
        name: coords.name || address // Include name for route preview
      };
      
      // Update destination state
      setDestination(destinationData);
      setSearchQuery(destinationData.name);

      console.log('Destination set successfully:', destinationData);
      
      // Show success feedback
      toast.success(`Destination set: ${address}`);
      
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
      toast.error('Failed to set destination. Please try again in a few seconds.');
    } finally {
      // Clear processing state
      setIsProcessingDestination(false);
    }
  };

  // Location tracking - start automatically
  const { location: trackingLocation, isTracking, startTracking, stopTracking } = useLocationTracking({
    preset: 'ultra_fast',
    updateFirebase: false,
    onLocationUpdate: (locationData) => {
      console.log('Location update received in MobileRideCreator:', locationData);
      
      if (locationData && locationData.latitude && locationData.longitude) {
        const { latitude: lat, longitude: lng, accuracy, address } = locationData;
        
        // Validate coordinates
        if (typeof lat === 'number' && typeof lng === 'number' && 
            !isNaN(lat) && !isNaN(lng) &&
            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          
          setUserLocation({ lat, lng });
          setLocationError(null);
          setHasLocationError(false);
          
          // Update status message
          setLocationStatusMessage(`Location tracking active (accuracy: ${Math.round(accuracy)}m)`);
          
          // Auto-update destination if we have a valid location and destination
          if (destination && destination.lat && destination.lng) {
            handleDestinationChange(destination);
          }
        } else {
          console.warn('Invalid coordinates received:', { lat, lng });
        }
      }
    },
    onError: (error) => {
      console.error('Location tracking error in MobileRideCreator:', error);
      setLocationError(error.message);
      setHasLocationError(true);
      setLocationStatusMessage('Location tracking failed');
    }
  });

  // Auto-start location tracking when component mounts
  useEffect(() => {
    let isInitialized = false;
    
    const initializeLocationTracking = async () => {
      if (isInitialized) return;
      isInitialized = true;
      
      try {
        console.log('📍 Auto-starting location tracking for ride creation...');
        await startTracking();
      } catch (error) {
        console.warn('📍 Could not auto-start location tracking:', error.message);
        isInitialized = false; // Reset flag on error
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      initializeLocationTracking();
    }, 100);

    // Cleanup: stop tracking when component unmounts
    return () => {
      clearTimeout(timer);
      console.log('📍 Stopping location tracking for ride creation...');
      stopTracking();
    };
  }, []); // Remove dependencies to prevent re-initialization

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const searchContainer = event.target.closest('.search-container');
      if (!searchContainer) {
        setShowSearchResults(false);
        // Keep search results visible for map interaction
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debug state changes
  useEffect(() => {
    console.log('🔍 State changed - showSearchResults:', showSearchResults, 'searchResults.length:', searchResults.length);
  }, [showSearchResults, searchResults]);

  // Update user location when tracking starts
  useEffect(() => {
    if (trackingLocation && isTracking) {
      // Only log in development and reduce frequency
      if (import.meta.env.DEV && Math.random() < 0.1) { // Log only 10% of updates
        console.log('📍 Location updated for ride creation:', trackingLocation);
        console.log('📍 Location object structure:', {
          type: typeof trackingLocation,
          keys: Object.keys(trackingLocation),
          hasLat: 'lat' in trackingLocation,
          hasLng: 'lng' in trackingLocation,
          lat: trackingLocation.lat,
          lng: trackingLocation.lng
        });
      }
      setUserLocation(trackingLocation);
    }
  }, [trackingLocation, isTracking]);

  // Recalculate route when user location changes and destination is set
  useEffect(() => {
    // Don't calculate route if location tracking is still in progress
    if (isTracking) {
      console.log('📍 Location tracking in progress, skipping route calculation');
      return;
    }
    
    // Validate that both locations have valid coordinates (handle both lat/lng and latitude/longitude formats)
    const userLat = userLocation?.lat || userLocation?.latitude;
    const userLng = userLocation?.lng || userLocation?.longitude;
    
    const hasValidUserLocation = userLocation && 
      typeof userLat === 'number' && 
      typeof userLng === 'number' && 
      !isNaN(userLat) && 
      !isNaN(userLng);
    
    const hasValidDestination = destination && 
      typeof destination.lat === 'number' && 
      typeof destination.lng === 'number' && 
      !isNaN(destination.lat) && 
      !isNaN(destination.lng);
    
    // Check if we've already calculated a route for this destination
    const destinationKey = destination ? `${destination.lat},${destination.lng}` : null;
    const hasCalculatedForDestination = lastCalculatedDestination === destinationKey;
    
    if (hasValidUserLocation && hasValidDestination && !isCalculatingRoute && !hasCalculatedForDestination) {
      console.log('📍 User location updated, recalculating route');
      console.log('📍 Route calculation params:', {
        userLocation: { lat: userLat, lng: userLng },
        destination: { lat: destination.lat, lng: destination.lng }
      });
      calculateAndDisplayRoute(userLocation, destination);
      setLastCalculatedDestination(destinationKey);
    }
  }, [userLocation, destination, isCalculatingRoute, isTracking, lastCalculatedDestination]); // Added lastCalculatedDestination to dependencies

  // Fallback: Set a default location if tracking fails after 5 seconds
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!userLocation && !isTracking) {
        console.log('📍 Setting fallback location for map rendering');
        setUserLocation({
          lat: 32.7767, // Dallas default
          lng: -96.7970,
          address: 'Dallas, TX'
        });
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [userLocation, isTracking]);



  // DEPRECATED: These functions are no longer used - search logic centralized in locationService.js
  /*
  // Category detection function
  // Check if a POI name matches the search query (exact or fuzzy)
  const isExactOrFuzzyMatch = (poiName, searchQuery) => {
    if (!poiName || !searchQuery) return false;
    
    const cleanPoiName = poiName.toLowerCase().trim();
    const cleanSearchQuery = searchQuery.toLowerCase().trim();
    
    // Exact match
    if (cleanPoiName === cleanSearchQuery) {
      return { isMatch: true, matchType: 'exact' };
    }
    
    // Contains match (POI name contains search query) - only for multi-word queries
    if (cleanSearchQuery.split(/\s+/).length > 1 && cleanPoiName.includes(cleanSearchQuery)) {
      return { isMatch: true, matchType: 'contains' };
    }
    
    // Search query contains POI name (for partial matches) - only for multi-word POIs
    if (cleanPoiName.split(/\s+/).length > 1 && cleanSearchQuery.includes(cleanPoiName)) {
      return { isMatch: true, matchType: 'partial' };
    }
    
    // Strict fuzzy match - require multiple words to match
    const poiWords = cleanPoiName.split(/\s+/);
    const searchWords = cleanSearchQuery.split(/\s+/);
    
    // For venue searches, require at least 2 words to match
    const isVenueSearch = cleanSearchQuery.includes('center') || 
                         cleanSearchQuery.includes('stadium') || 
                         cleanSearchQuery.includes('arena') || 
                         cleanSearchQuery.includes('venue');
    
    if (isVenueSearch) {
      // For venues, require at least 2 words to match
      let matchCount = 0;
      for (const searchWord of searchWords) {
        if (searchWord.length > 2 && poiWords.some(poiWord => poiWord === searchWord)) {
          matchCount++;
        }
      }
      if (matchCount >= 2) {
        return { isMatch: true, matchType: 'fuzzy' };
      }
    } else {
      // For other searches, allow single word matches
      for (const searchWord of searchWords) {
        if (searchWord.length > 2 && poiWords.some(poiWord => poiWord.includes(searchWord))) {
          return { isMatch: true, matchType: 'fuzzy' };
        }
      }
    }
    
    return { isMatch: false, matchType: 'none' };
  };

  // Brand names that should trigger brand-specific search (same as desktop)
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
    'amc', 'regal', 'planet fitness', 'la fitness', '24 hour fitness',
    
    // Venue and Entertainment Brands
    'american airlines center', 'aac', 'dallas mavericks', 'dallas stars',
    'at&t stadium', 'cowboys stadium', 'globe life field', 'globe life park',
    'toyota music factory', 'dos equis pavilion'
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
    '24 hour fitness': 'gym',
    'lifetime fitness': 'gym',
    
    // Venue and Entertainment Brands -> stadium/arena category
    'american airlines center': 'stadium',
    'aac': 'stadium',
    'dallas mavericks': 'stadium',
    'dallas stars': 'stadium',
    'at&t stadium': 'stadium',
    'cowboys stadium': 'stadium',
    'globe life field': 'stadium',
    'globe life park': 'stadium',
    'toyota music factory': 'concert_hall',
    'dos equis pavilion': 'concert_hall'
  };

  // Function to detect if query is a brand name (same as desktop)
  const detectBrand = (query) => {
    if (!query) return null;
    
    const cleanQuery = query.toLowerCase().trim();
    console.log(`🏪 Brand detection - checking: "${cleanQuery}"`);
    console.log(`🏪 Brand detection - BRAND_NAMES includes check:`, BRAND_NAMES.includes(cleanQuery));
    
    // Check for exact brand matches
    if (BRAND_NAMES.includes(cleanQuery)) {
      console.log(`🏪 Brand detected (exact): "${cleanQuery}"`);
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
    console.log(`🏪 Available brands:`, BRAND_NAMES.slice(0, 10), '...'); // Show first 10 brands
    return null;
  };

  const detectCategory = (query) => {
    const cleanQuery = query.toLowerCase().trim();
    
    // Known brand names that should NOT be treated as categories
    const knownBrands = [
      'cvs', 'walgreens', 'rite aid', 'walmart', 'target', 'mcdonalds', 'wendys', 'wendy\'s',
      'burger king', 'subway', 'starbucks', 'dunkin', 'dunkin donuts', 'chick fil a',
      'taco bell', 'kfc', 'pizza hut', 'dominos', 'domino\'s', 'chipotle', 'panera',
      'home depot', 'lowes', 'best buy', 'costco', 'sams club', 'kroger', 'heb',
      'shell', 'exxon', 'chevron', 'bp', 'mobil', '7-eleven', 'circle k'
    ];
    
    // Check if this is a known brand name first
    if (knownBrands.includes(cleanQuery)) {
      console.log(`🔍 Detected as known brand: ${cleanQuery}`);
      return null; // Return null to trigger branded search
    }
    
    // Map generic search terms to Mapbox category IDs (not brand names)
    const categoryMap = {
      'gas station': 'gas_station',
      'gas': 'gas_station',
      'fuel': 'gas_station',
      'restaurant': 'restaurant',
      'food': 'restaurant',
      'eat': 'restaurant',
      'dining': 'restaurant',
      'coffee': 'coffee_shop',
      'coffee shop': 'coffee_shop',
      'pharmacy': 'pharmacy',
      'drugstore': 'pharmacy',
      'grocery': 'grocery_store',
      'grocery store': 'grocery_store',
      'supermarket': 'grocery_store',
      'bank': 'bank',
      'atm': 'atm',
      'hotel': 'hotel',
      'lodging': 'hotel',
      'hospital': 'hospital',
      'clinic': 'hospital',
      'doctor': 'hospital',
      'medical': 'hospital',
      'parking': 'parking',
      'parking lot': 'parking',
      'shopping': 'shopping_center',
      'mall': 'shopping_center',
      'store': 'shopping_center',
      'airport': 'airport',
      'airports': 'airport'
    };
    
    // Check for exact matches first (avoid partial matches that could interfere with brand detection)
    for (const [term, category] of Object.entries(categoryMap)) {
      if (cleanQuery === term) {
        console.log(`🔍 Detected category (exact): ${category} for query: ${cleanQuery}`);
        return category;
      }
    }
    
    // Only check for partial matches if the query is a single word (to avoid false positives)
    const queryWords = cleanQuery.split(' ').filter(word => word.length > 0);
    if (queryWords.length === 1) {
      for (const [term, category] of Object.entries(categoryMap)) {
        if (term.includes(cleanQuery) || cleanQuery.includes(term)) {
          console.log(`🔍 Detected category (partial): ${category} for query: ${cleanQuery}`);
          return category;
        }
      }
    } else {
      console.log(`🔍 Skipping partial category matches for multi-word query: "${cleanQuery}"`);
    }
    
    console.log(`🔍 No category detected for: ${cleanQuery} - will use branded search`);
    return null;
  };

  // Search functions now use the centralized locationService
  
  // Local search function that uses the centralized locationService
  // const performSearch = async (query) => {
  //   if (!query || query.trim().length < 2) {
  //     setSearchResults([]);
  //     setShowSearchResults(false);
  //     return [];
  //   }
    
  //   const trimmedQuery = query.trim().toLowerCase();
  //   console.log(`🔍 Mobile search for: "${trimmedQuery}"`);
  //   console.log(`🔍 Current userLocation:`, userLocation);
  //   console.log(`🔍 userLocation type:`, typeof userLocation);
  //   console.log(`🔍 userLocation keys:`, userLocation ? Object.keys(userLocation) : 'null');
    
  //   // Set loading state
  //   setIsSearching(true);
    
  //   // Use the centralized locationService
  //   try {
  //     const results = await searchDestinations(trimmedQuery, {
  //       limit: 8,
  //       userLocation: userLocation,
  //       enableFallback: true
  //     });
      
  //     console.log(`🔍 Mobile search results: ${results.length} found`);
  //     console.log(`🔍 Search results:`, results);
      
  //     // Update state with results
  //     setSearchResults(results);
  //     setShowSearchResults(results.length > 0);
      
  //     return results;
  //   } catch (error) {
  //     console.error('🔍 Mobile search failed:', error);
  //     setSearchResults([]);
  //     setShowSearchResults(false);
  //     return [];
  //   } finally {
  //     setIsSearching(false);
  //   }
  // };

  // Calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Hardcoded major venues database for venues not in Mapbox
  const MAJOR_VENUES = {
    'american airlines center': {
      name: 'American Airlines Center',
      display_name: 'American Airlines Center',
      address: '2500 Victory Ave, Dallas, TX 75219',
      lat: 32.7905,
      lng: -96.8103,
      type: 'stadium',
      category: 'entertainment',
      prominence: 'major'
    },
    'dfw airport': {
      name: 'Dallas/Fort Worth International Airport',
      display_name: 'DFW Airport',
      address: '2400 Aviation Dr, DFW Airport, TX 75261',
      lat: 32.8968,
      lng: -97.0380,
      type: 'airport',
      category: 'transportation',
      prominence: 'major'
    },
    'dallas love field': {
      name: 'Dallas Love Field',
      display_name: 'Dallas Love Field Airport',
      address: '8008 Herb Kelleher Way, Dallas, TX 75235',
      lat: 32.8471,
      lng: -96.8518,
      type: 'airport',
      category: 'transportation',
      prominence: 'major'
    },
    'aac': {
      name: 'American Airlines Center',
      display_name: 'American Airlines Center (AAC)',
      address: '2500 Victory Ave, Dallas, TX 75219',
      lat: 32.7905,
      lng: -96.8103,
      type: 'stadium',
      category: 'entertainment',
      prominence: 'major'
    }
  };

  // Check hardcoded major venues database
  const checkHardcodedVenues = (query) => {
    const cleanQuery = query.toLowerCase().trim();
    const results = [];
    
    // Check for exact matches
    if (MAJOR_VENUES[cleanQuery]) {
      const venue = MAJOR_VENUES[cleanQuery];
      const distance = calculateDistance(
        userLocation?.latitude || 0,
        userLocation?.longitude || 0,
        venue.lat,
        venue.lng
      );
      
      results.push({
        ...venue,
        distance: distance,
        isExactMatch: true,
        matchType: 'exact',
        score: 2000, // Maximum score for hardcoded venues
        source: 'hardcoded-database',
        strategy: 'Hardcoded Major Venue',
        strategyIndex: 0 // Highest priority
      });
    }
    
    // Check for partial matches (e.g., "american airlines" matches "american airlines center")
    Object.entries(MAJOR_VENUES).forEach(([key, venue]) => {
      if (key.includes(cleanQuery) || cleanQuery.includes(key)) {
        const distance = calculateDistance(
          userLocation?.latitude || 0,
          userLocation?.longitude || 0,
          venue.lat,
          venue.lng
        );
        
        // Avoid duplicates
        if (!results.some(r => r.name === venue.name)) {
          results.push({
            ...venue,
            distance: distance,
            isExactMatch: false,
            matchType: 'fuzzy',
            score: 1500, // High score for partial matches
            source: 'hardcoded-database',
            strategy: 'Hardcoded Major Venue',
            strategyIndex: 0
          });
        }
      }
    });
    
    return results;
  };

  // Smart result scoring based on Perplexity's recommendations
  const calculateResultScore = (feature, matchInfo, distance, expandedRadius = false) => {
    let score = 0;
    
    // Base score from Mapbox relevance
    score += (feature.relevance || 0) * 100;
    
    // Boost exact/brand matches (Perplexity's #1 recommendation)
    if (matchInfo.isMatch) {
      if (matchInfo.matchType === 'exact') {
        score += 1000; // Massive boost for exact matches
      } else if (matchInfo.matchType === 'fuzzy') {
        score += 500; // High boost for fuzzy matches
      }
    }
    
    // Distance scoring (Perplexity's #2 recommendation)
    if (expandedRadius) {
      // For brand/landmark searches, reduce proximity weight
      if (distance < 5) score += 50;
      else if (distance < 25) score += 25;
      else if (distance < 50) score += 10;
      // Don't penalize distant results for brands
    } else {
      // For generic searches, use strict proximity
      if (distance < 5) score += 100;
      else if (distance < 15) score += 50;
      else if (distance < 25) score += 25;
      else score -= 50; // Penalize distant results
    }
    
    // Boost prominent venues (Perplexity's #3 recommendation)
    const venueName = (feature.text || '').toLowerCase();
    const prominentVenues = [
      'airport', 'stadium', 'center', 'arena', 'convention', 'mall', 'hospital',
      'university', 'college', 'museum', 'theater', 'hotel', 'restaurant'
    ];
    
    if (prominentVenues.some(venue => venueName.includes(venue))) {
      score += 200;
    }
    
    return score;
  };
  */

  // Destination handlers (same logic as desktop)
  const handleDestinationSelect = async (selectedOption) => {
    if (!selectedOption) return;
    
    console.log('🎯 Destination selected:', selectedOption);
    console.log('🎯 Selected option coordinates:', {
      lat: selectedOption.lat,
      lng: selectedOption.lng,
      lon: selectedOption.lon,
      name: selectedOption.name,
      display_name: selectedOption.display_name,
      address: selectedOption.address
    });
    
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
        // Add destination name to coords for the route preview
        coords.name = selectedOption.name || selectedOption.display_name || 'Selected Destination';
        
        console.log('🎯 Processed coordinates:', coords);
        
        // Set destination using the same logic as desktop
        await handleDestinationChange(coords);
        
        // Reset route calculation tracking for new destination
        setLastCalculatedDestination(null);
        
        // Clear suggestions after a short delay to prevent map zoom issues (same as desktop)
        setTimeout(() => {
          setSearchResults([]);
          setShowSearchResults(false);
        }, 100);
        
        // Automatically calculate route if user has location (same as desktop)
        if (userLocation) {
          console.log('🚗 Auto-calculating route for mobile view');
          console.log('📍 User location for route:', userLocation);
          console.log('🎯 Destination for route:', coords);
          await calculateAndDisplayRoute(userLocation, coords);
        } else {
          console.log('⚠️ No user location available for route calculation');
        }
      } else {
        console.warn('⚠️ Could not get coordinates for selected destination');
        setDestination(selectedOption);
        setSearchQuery(selectedOption.name || selectedOption.display_name);
        setShowSearchResults(false);
        setSearchResults([]);
      }

    } catch (error) {
      console.error('❌ Error setting destination:', error);
      setDestination(selectedOption);
      setSearchQuery(selectedOption.name || selectedOption.display_name);
      setShowSearchResults(false);
      setSearchResults([]);
      toast.error('Failed to set destination');
    }
  };







  // Location handlers (kept for potential manual override)
  const handleStartLocationTracking = async () => {
    try {
      await startTracking();
      toast.success('Location tracking started');
    } catch (error) {
      toast.error('Failed to start location tracking');
    }
  };

  const handleManualLocation = () => {
    // Could open a location picker modal
    toast.info('Manual location picker coming soon');
  };

  // Participant handlers
  const handleAddParticipant = (friend) => {
    // Check if friend is already added
    const isAlreadyAdded = participants.some(p => p.id === friend.id);
    if (isAlreadyAdded) {
      toast.error(`${friend.profile?.displayName || friend.displayName} is already in the ride`);
      return;
    }

    // Create participant data from friend
    const participantData = {
      id: friend.id,
      uid: friend.id,
      displayName: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
      photoURL: friend.profile?.photoURL || friend.photoURL || '',
      email: friend.profile?.email || friend.email || '',
      role: 'passenger',
      isCreator: false
    };

    setParticipants(prev => [...prev, participantData]);
    setShowFriendSearch(false);
    toast.success(`${participantData.displayName} added to the ride`);
  };

  const handleRemoveParticipant = (participantId) => {
    setParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const handleRoleChange = (participantId, newRole) => {
    setParticipants(prev => prev.map(p => 
      p.id === participantId ? { ...p, role: newRole } : p
    ));
  };

  // Draggable panel handlers
  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStartY(e.touches ? e.touches[0].clientY : e.clientY);
    setDragStartHeight(panelHeight);
    e.preventDefault();
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = dragStartY - currentY; // Positive when dragging up (reducing height)
    const newHeight = Math.max(100, Math.min(400, dragStartHeight + deltaY));
    
    setPanelHeight(newHeight);
    e.preventDefault();
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Global drag event listeners
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMove = (e) => handleDragMove(e);
      const handleGlobalEnd = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleGlobalMove);
      document.addEventListener('mouseup', handleGlobalEnd);
      document.addEventListener('touchmove', handleGlobalMove, { passive: false });
      document.addEventListener('touchend', handleGlobalEnd, { passive: true });
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMove);
        document.removeEventListener('mouseup', handleGlobalEnd);
        document.removeEventListener('touchmove', handleGlobalMove);
        document.removeEventListener('touchend', handleGlobalEnd);
      };
    }
  }, [isDragging, dragStartY, dragStartHeight, panelHeight]);

  // Debug effect to log location changes
  useEffect(() => {
    if (userLocation) {
      console.log('📍 User location updated:', {
        lat: userLocation.lat || userLocation.latitude,
        lng: userLocation.lng || userLocation.longitude,
        address: userLocation.address
      });
    }
  }, [userLocation]);

  // Debug effect to log destination changes
  useEffect(() => {
    if (destination) {
      console.log('🎯 Destination state updated:', {
        lat: destination.lat,
        lng: destination.lng,
        address: destination.address,
        name: destination.name
      });
    }
  }, [destination]);



  const handleCreateRide = async () => {
    if (!destination || !userLocation || participants.length === 0) {
      toast.error('Please complete all steps before creating the ride');
      return;
    }

    setIsLoading(true);
    try {
      // Validate and clean participant data
      const validPassengers = participants.map(p => {
        // Ensure all required fields are present and valid
        const passenger = {
          uid: p.uid || p.id,
          displayName: p.displayName || p.name || 'Unknown User',
          photoURL: p.photoURL || '',
          role: p.role || 'passenger'
        };

        // Handle location data - set to null if undefined/invalid
        if (p.location && typeof p.location === 'object' && 
            (p.location.lat || p.location.latitude) && 
            (p.location.lng || p.location.longitude)) {
          passenger.location = {
            lat: p.location.lat || p.location.latitude,
            lng: p.location.lng || p.location.longitude
          };
        } else {
          passenger.location = null; // Set to null instead of undefined
        }

        return passenger;
      });

      console.log('🚗 Creating ride with validated data:', {
        destination,
        driver: {
          uid: user.uid,
          displayName: user.displayName || user.email,
          location: userLocation
        },
        passengers: validPassengers
      });

      const rideData = {
        name: rideName || `Ride to ${destination.address || destination.name}`,
        destination: {
          location: {
            lat: destination.lat,
            lng: destination.lng
          },
          address: destination.address || destination.name
        },
        driver: {
          uid: user.uid,
          displayName: user.displayName || user.email,
          location: userLocation,
          photoURL: user.photoURL || ''
        },
        passengers: validPassengers,
        createdAt: serverTimestamp(),
        status: 'created'
      };

      const result = await createRide(rideData);
      if (result.success) {
        toast.success('Ride created successfully!');
        navigate(`/ride/${result.rideId}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error creating ride:', error);
      toast.error('Failed to create ride');
    } finally {
      setIsLoading(false);
    }
  };



  if (isLoading) {
    return <SimpleLoading message="Creating your ride..." />;
  }

  return (
    <Box sx={{ 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f5f5f5'
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        background: 'white',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        gap: 2
      }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Create Ride
        </Typography>
        {isTracking && (
          <Chip
            icon={<LocationIcon />}
            label="Live"
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
        )}
      </Box>

      {/* Map View - Full Height */}
      <Box sx={{ 
        position: 'absolute',
        top: '64px', // Height of the header
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
        height: 'calc(100vh - 64px)', // Ensure full height minus header
        width: '100%',
        // Mobile-specific fixes
        '& .mapboxgl-canvas': {
          width: '100% !important',
          height: '100% !important'
        },
        '& .mapboxgl-map': {
          width: '100% !important',
          height: '100% !important'
        }
      }}>
        <MapView
          users={[
            ...(userLocation ? [{
              uid: user?.uid || 'current-user',
              displayName: 'You',
              role: 'driver',
              lat: userLocation.lat || userLocation.latitude,
              lng: userLocation.lng || userLocation.longitude,
              location: {
                lat: userLocation.lat || userLocation.latitude,
                lng: userLocation.lng || userLocation.longitude
              },
              photoURL: user?.photoURL,
              invitationStatus: 'accepted', // Add this to ensure the user shows on the map
              isCreator: true // Add this to ensure the user shows on the map
            }] : []),
            ...participants
          ]}
          userLocation={userLocation}
          destination={destination}
          calculatedRoute={calculatedRoute}
          hideRouteInfo={true}
          autoFit={userLocation ? true : false}
          destinationSuggestions={searchResults}
          onSuggestionSelect={handleDestinationSelect}
          onMapClick={(event) => {
            // Prevent auto-fit when clicking on map if there are POI markers visible
            // This allows marker clicks to work properly
            if (searchResults.length > 0) {
              console.log('🗺️ Map clicked with POI markers visible - preventing auto-fit');
              return; // Do nothing, let marker clicks handle the interaction
            }
          }}
        />
      </Box>



      {/* Route Calculation Loading Indicator */}
      {isCalculatingRoute && (
        <Box
          sx={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          <CircularProgress size={16} color="inherit" />
          Calculating route...
        </Box>
      )}

      {/* Destination Processing Loading Indicator */}
      {isProcessingDestination && (
        <Box
          sx={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          <CircularProgress size={16} color="inherit" />
          Setting destination...
        </Box>
      )}

      {/* Refined Map Search Bar */}
      <Box
        className="map-search-bar"
        sx={{
          position: 'absolute',
          top: '70px', // Closer to header
          left: '12px',
          right: '12px',
          zIndex: 1000,
          pointerEvents: 'auto'
        }}
      >
        {/* Clean Search Container */}
        <Box sx={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          position: 'relative'
        }}>
          {/* Search Input */}
          <Box sx={{ p: 0.5, position: 'relative' }}>

            
            <Box sx={{ position: 'relative' }} className="search-container">
              <TextField
                fullWidth
                placeholder="Where are you going?"
                variant="outlined"
                size="small"
                value={searchQuery}
                onChange={(e) => {
                  const query = e.target.value;
                  setSearchQuery(query);
                  console.log('Search input:', query);
                  
                  // Clear previous timeout
                  if (window.searchTimeout) {
                    clearTimeout(window.searchTimeout);
                  }
                  
                  // Trigger search after 500ms delay (increased from 300ms)
                  if (query.trim().length >= 3) {
                    window.searchTimeout = setTimeout(() => {
                      console.log('🔍 Debounced search triggered for:', query);
                      performSearch(query);
                    }, 500);
                  } else {
                    setSearchResults([]);
                    setShowSearchResults(false);
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) {
                    setShowSearchResults(true);
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '16px',
                    backgroundColor: 'transparent',
                    '& fieldset': {
                      border: 'none'
                    },
                    '&:hover fieldset': {
                      border: 'none'
                    },
                    '&.Mui-focused fieldset': {
                      border: 'none'
                    }
                  },
                  '& .MuiInputBase-input': {
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontWeight: 500
                  }
                }}
              />
              
              {/* Search Results Dropdown */}
              {(showSearchResults && searchResults.length > 0) && (
                <Box sx={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  mt: 0.5,
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  borderRadius: '16px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  zIndex: 9999,
                  maxHeight: '240px',
                  overflow: 'hidden',
                  animation: 'slideDown 0.2s ease-out'
                }}>
                  {console.log('🔍 Rendering dropdown with', searchResults.length, 'results')}
                  
                  {/* Loading State */}
                  {isSearching && (
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
                  <Box sx={{ maxHeight: '200px', overflow: 'auto' }}>
                    {/* Search Type Indicator */}
                    <Box sx={{ 
                      p: 1, 
                      background: 'rgba(0,0,0,0.02)', 
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                      fontSize: '11px',
                      color: 'text.secondary',
                      fontWeight: 500
                    }}>
                      {searchResults.some(r => r.type === 'branded_search') ? 
                        'Brand Search Results' : 
                        'Category Search Results'
                      } ({searchResults.length})
                    </Box>
                    
                    {searchResults.map((result, index) => (
                      <Box
                        key={index}
                        onClick={() => handleDestinationSelect(result)}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          borderBottom: index < searchResults.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            background: 'rgba(0,0,0,0.03)',
                            transform: 'translateX(2px)'
                          },
                          '&:active': {
                            background: 'rgba(0,0,0,0.06)',
                            transform: 'translateX(1px)'
                          },
                          '&:last-child': {
                            borderBottom: 'none'
                          }
                        }}
                      >
                        {/* Location Name with Brand Indicator */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                          <Typography 
                            variant="subtitle1" 
                            fontWeight={600} 
                            sx={{ 
                              color: 'text.primary',
                              fontSize: '14px',
                              lineHeight: 1.2,
                              flex: 1,
                              // Highlight exact matches
                              color: result.isExactMatch ? '#d32f2f' : 'text.primary',
                              fontWeight: result.isExactMatch ? 700 : 600
                            }}
                          >
                            {result.name}
                          </Typography>
                          
                          {/* Exact Match Indicator */}
                          {result.isExactMatch && (
                            <Box sx={{
                              px: 1,
                              py: 0.25,
                              borderRadius: '6px',
                              background: 'rgba(211, 47, 47, 0.15)',
                              color: '#d32f2f',
                              fontSize: '10px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              border: '1px solid rgba(211, 47, 47, 0.3)'
                            }}>
                              {result.matchType === 'exact' ? 'EXACT' : 'MATCH'}
                            </Box>
                          )}
                          
                          {/* Brand Search Indicator */}
                          {result.type === 'branded_search' && !result.isExactMatch && (
                            <Box sx={{
                              px: 1,
                              py: 0.25,
                              borderRadius: '6px',
                              background: 'rgba(211, 47, 47, 0.1)',
                              color: '#d32f2f',
                              fontSize: '10px',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              Brand
                            </Box>
                          )}
                        </Box>
                        
                        {/* Address */}
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          sx={{ 
                            mb: 0.5,
                            fontSize: '12px',
                            lineHeight: 1.3,
                            opacity: 0.8
                          }}
                        >
                          {result.address}
                        </Typography>
                        
                        {/* Distance Badge */}
                        {result.distance && (
                          <Box sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.25,
                            px: 1,
                            py: 0.25,
                            borderRadius: '8px',
                            background: 'rgba(25, 118, 210, 0.08)',
                            color: 'primary.main',
                            fontSize: '11px',
                            fontWeight: 500
                          }}>
                            <Box sx={{
                              width: 3,
                              height: 3,
                              borderRadius: '50%',
                              background: 'currentColor'
                            }} />
                            {result.distance.toFixed(1)} mi
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                  
                  {/* No Results State */}
                  {!isSearching && searchResults.length === 0 && (
                    <Box sx={{ 
                      p: 2, 
                      textAlign: 'center',
                      color: 'text.secondary'
                    }}>
                      <Typography variant="body2" sx={{ fontSize: '13px' }}>
                        No locations found nearby
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}


            </Box>
          </Box>
        </Box>
      </Box>

      {/* Enhanced Bottom Panel - Route Details & Participants */}
      {routeDetails && calculatedRoute && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '20px',
            left: '12px',
            right: '12px',
            height: `${panelHeight}px`,
            zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(16px)',
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            transition: isDragging ? 'none' : 'height 0.2s ease-out'
          }}
        >
          {/* Drag Handle */}
          <Box
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            sx={{
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'ns-resize',
              userSelect: 'none',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)'
              }
            }}
          >
            <Box
              sx={{
                width: '32px',
                height: '4px',
                borderRadius: '2px',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                transition: 'background-color 0.2s',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.5)'
                }
              }}
            />
          </Box>
          
          {/* Panel Content */}
          <Box sx={{ 
            flex: 1, 
            overflow: 'auto',
            padding: '12px',
            paddingTop: '8px'
          }}>
          {/* Step Indicator */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            mb: 1,
            gap: 0.5
          }}>
            <Box sx={{ 
              display: 'flex', 
              gap: 0.5
            }}>
              <Box sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: currentStep === 'destination' ? '#1976d2' : '#e0e0e0'
              }} />
              <Box sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: currentStep === 'participants' ? '#1976d2' : '#e0e0e0'
              }} />
              <Box sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: currentStep === 'create' ? '#1976d2' : '#e0e0e0'
              }} />
            </Box>
            <Typography variant="caption" sx={{ 
              color: '#666', 
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {currentStep === 'destination' ? 'Route' : 
               currentStep === 'participants' ? 'Friends' : 'Create'}
            </Typography>
          </Box>
          {currentStep === 'destination' && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#333' }}>
                  Route to {destination?.name || 'Destination'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  {((routeDetails.distance / 1609.34)).toFixed(1)} mi • {Math.round(routeDetails.duration / 60)} min
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip 
                  label="Route Ready" 
                  size="small" 
                  color="success" 
                  icon={<CheckIcon />}
                  sx={{ fontSize: '11px' }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCurrentStep('participants')}
                  sx={{ 
                    fontSize: '12px',
                    px: 2,
                    py: 0.5,
                    minWidth: 'auto'
                  }}
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}

          {currentStep === 'participants' && (
            <Box>
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#333' }}>
                  Select Friends ({participants.length})
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setCurrentStep('destination')}
                  sx={{ 
                    fontSize: '11px',
                    px: 1.5,
                    py: 0.25,
                    minWidth: 'auto'
                  }}
                >
                  Back
                </Button>
              </Box>

              {/* Route Summary */}
              <Box sx={{ mb: 2, p: 1, background: 'rgba(25, 118, 210, 0.05)', borderRadius: '8px' }}>
                <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
                  Route: {((routeDetails.distance / 1609.34)).toFixed(1)} mi • {Math.round(routeDetails.duration / 60)} min
                </Typography>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  To: {destination?.name || 'Destination'}
                </Typography>
              </Box>

              {/* Participants List */}
              <Box sx={{ maxHeight: '120px', overflowY: 'auto', mb: 2 }}>
                {participants.length === 0 ? (
                  <Typography variant="caption" sx={{ color: '#666', fontStyle: 'italic' }}>
                    No participants added yet
                  </Typography>
                ) : (
                  participants.map((participant) => (
                    <Box key={participant.uid} sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      p: 0.5,
                      mb: 0.5,
                      background: 'rgba(0, 0, 0, 0.02)',
                      borderRadius: '6px'
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar 
                          src={participant.photoURL} 
                          sx={{ width: 24, height: 24, fontSize: '12px' }}
                        >
                          {participant.displayName?.charAt(0)}
                        </Avatar>
                        <Typography variant="caption" sx={{ fontWeight: 500 }}>
                          {participant.displayName}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Chip 
                          label={participant.role} 
                          size="small" 
                          variant="outlined"
                          sx={{ fontSize: '10px', height: '20px' }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveParticipant(participant.uid)}
                          sx={{ width: 20, height: 20 }}
                        >
                          <CloseIcon sx={{ fontSize: '12px' }} />
                        </IconButton>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShowFriendSearch(true)}
                  sx={{ 
                    fontSize: '12px',
                    flex: 1
                  }}
                >
                  Select Friends
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCurrentStep('create')}
                  disabled={participants.length === 0}
                  sx={{ 
                    fontSize: '12px',
                    flex: 1
                  }}
                >
                  Create Ride
                </Button>
              </Box>
            </Box>
          )}

          {currentStep === 'create' && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#333', mb: 1 }}>
                Ready to Create Ride
              </Typography>
              <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 2 }}>
                {participants.length + 1} participants • {((routeDetails.distance / 1609.34)).toFixed(1)} mi
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setCurrentStep('participants')}
                  disabled={isLoading}
                  sx={{ fontSize: '12px', flex: 1 }}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleCreateRide}
                  disabled={isLoading}
                  startIcon={isLoading ? <CircularProgress size={16} /> : null}
                  sx={{ fontSize: '12px', flex: 1 }}
                >
                  {isLoading ? 'Creating...' : 'Create Ride'}
                </Button>
              </Box>
            </Box>
          )}
          </Box>
        </Box>
      )}

      {/* Enhanced Friend Search Dialog */}
      <Dialog 
        open={showFriendSearch} 
        onClose={() => setShowFriendSearch(false)}
        maxWidth="sm"
        fullWidth
        disableRestoreFocus
        keepMounted={false}
        TransitionProps={{
          timeout: 300
        }}
        PaperProps={{
          sx: {
            borderRadius: '12px',
            maxHeight: '85vh',
            height: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            mx: 2, // Add horizontal margin on mobile
            my: 2   // Add vertical margin on mobile
          }
        }}
      >
        <DialogTitle sx={{ 
          pb: 1,
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Select Friends for Ride
          </Typography>
          <IconButton 
            onClick={() => setShowFriendSearch(false)}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ 
          p: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <UserSearch 
            onlyShowFriends={true}
            onSelectFriend={handleAddParticipant}
          />
        </DialogContent>
        
        <DialogActions sx={{ 
          p: 2,
          borderTop: '1px solid rgba(0, 0, 0, 0.08)',
          gap: 1
        }}>
          <Button 
            variant="outlined" 
            onClick={() => setShowFriendSearch(false)}
            sx={{ borderRadius: '8px' }}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={() => setShowFriendSearch(false)}
            sx={{ borderRadius: '8px' }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default MobileRideCreator; 