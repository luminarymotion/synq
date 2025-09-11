import React, { useState, useEffect, useCallback, useMemo } from 'react';
import RouteInformation from '../components/RouteInformation';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
import { useLocation, LOCATION_PERMISSIONS, LOCATION_CONTEXTS, locationPermissionManager } from '../services/locationTrackingService';
import rideStatusService, { RIDE_STATUS } from '../services/rideStatusService';
<<<<<<< HEAD
// Route optimization temporarily disabled - Mapbox integration pending
=======
import { getMultiWaypointDirections, getMultiWaypointDirectionsWithFallback, ROUTING_PROFILES, getCoordsFromAddress, extractTurnByTurnInstructions } from '../services/locationService';
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
import RideInvitationModal from '../components/RideInvitationModal';
import RouteInformationPanel from '../components/RouteInformationPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import LocationToggle from '../components/LocationToggle';
<<<<<<< HEAD
=======
import TripModal from '../components/TripModal';
import useLocation from '../hooks/useLocation';
import useProximityDetection from '../hooks/useProximityDetection';
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
import '../styles/LiveRideView.css';
import { 
  Box, Typography, Card, Button, Stack, Divider, Avatar, Chip, Alert, TextField, Modal, IconButton
} from '@mui/material';
<<<<<<< HEAD


import {
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Close as CloseIcon,
  Edit as EditIcon
=======
import { 
  Edit as EditIcon, 
  DirectionsCar as CarIcon, 
  Person as PersonIcon, 
  Fullscreen as FullscreenIcon, 
  FullscreenExit as FullscreenExitIcon, 
  Close as CloseIcon
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
} from '@mui/icons-material';

// --- VIBE LOGIC ---
const vibePalettes = [
  { keyword: 'airport', gradient: 'linear-gradient(135deg, #b2c9e6 0%, #e0e7ef 100%)', accent: '#3a5a7a', text: '#233044' },
  { keyword: 'university', gradient: 'linear-gradient(135deg, #b7e0c7 0%, #e0f7ef 100%)', accent: '#2e6e4c', text: '#1b3a2f' },
  { keyword: 'park', gradient: 'linear-gradient(135deg, #d0e6b2 0%, #f0f7e0 100%)', accent: '#6e8e2e', text: '#2f3a1b' },
  { keyword: 'beach', gradient: 'linear-gradient(135deg, #ffe7b2 0%, #b2e6e0 100%)', accent: '#e6b25a', text: '#3a2f1b' },
  { keyword: 'mall', gradient: 'linear-gradient(135deg, #e6b2e0 0%, #e0e7ef 100%)', accent: '#7a3a5a', text: '#442333' },
  { keyword: 'center', gradient: 'linear-gradient(135deg, #b2e6e0 0%, #e0e7ef 100%)', accent: '#3a7a6e', text: '#233944' },
  { keyword: 'victory', gradient: 'linear-gradient(135deg, #f7d9b7 0%, #e0e7ef 100%)', accent: '#b77a3a', text: '#443823' },
  { keyword: 'lake', gradient: 'linear-gradient(135deg, #b2d6e6 0%, #e0e7ef 100%)', accent: '#3a6e7a', text: '#233944' },
  { keyword: 'plaza', gradient: 'linear-gradient(135deg, #e6e2b2 0%, #e0e7ef 100%)', accent: '#7a6e3a', text: '#444223' },
  { keyword: 'default', gradient: 'linear-gradient(135deg, #f5f3e7 0%, #e0c9b3 100%)', accent: '#b08968', text: '#4e342e' }
];

function getVibePalette(destination) {
  if (!destination) return vibePalettes[vibePalettes.length - 1];
  const address = typeof destination === 'string' ? destination : destination.address || '';
  const lower = address.toLowerCase();
  for (const palette of vibePalettes) {
    if (palette.keyword !== 'default' && lower.includes(palette.keyword)) {
      return palette;
    }
  }
  return vibePalettes[vibePalettes.length - 1];
}

// --- MAIN COMPONENT ---
function LiveRideView() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useUserAuth();
  
  // Core state
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [invitationsWithNames, setInvitationsWithNames] = useState([]);
  
  // UI state
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [userInvitation, setUserInvitation] = useState(null);
  const [isSubmittingRSVP, setIsSubmittingRSVP] = useState(false);
  const [isManuallyOpened, setIsManuallyOpened] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
<<<<<<< HEAD
=======
  const [successMessage, setSuccessMessage] = useState(null);
  const [hasLeftRide, setHasLeftRide] = useState(false);
  
  // Drive mode state
  const [isDriveMode, setIsDriveMode] = useState(false);
  const [navigationInstructions, setNavigationInstructions] = useState([]);
  const [currentInstruction, setCurrentInstruction] = useState(null);
  const [nextTurn, setNextTurn] = useState(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [routeProgress, setRouteProgress] = useState(0);
  
  // Ride summary modal state
  const [showRideSummaryModal, setShowRideSummaryModal] = useState(true);
  
  // Trip modal state
  const [showTripModal, setShowTripModal] = useState(false);
  const [tollsEnabled, setTollsEnabled] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState(3);
  
  // Turn-by-turn navigation state
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isNavigationActive, setIsNavigationActive] = useState(false);
  
  // Compass/heading state for drive mode
  const [userHeading, setUserHeading] = useState(0);
  const [isCompassEnabled, setIsCompassEnabled] = useState(false);
  
  // Tab management
  const [activeTab, setActiveTab] = useState('ride-info');
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
  
  // Description editing
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingDescriptionValue, setEditingDescriptionValue] = useState('');
  const [description, setDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  
  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [title, setTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  
  // Location tracking
  const [locationError, setLocationError] = useState(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState(null);
  
  // Route calculation state
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);
  
  // Route information and passenger management for full screen mode
  const [currentRouteStep, setCurrentRouteStep] = useState(0);
  const [passengerStatus, setPassengerStatus] = useState({});
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationTrackingInitialized, setLocationTrackingInitialized] = useState(false);
  
  // Ride expiration management
  const [isRideExpired, setIsRideExpired] = useState(false);
  const [rideExpirationTime, setRideExpirationTime] = useState(null);
  const RIDE_EXPIRATION_HOURS = 24; // Configurable expiration time

  // State to store resolved display names
  const [displayNames, setDisplayNames] = useState({});

  // Optimistic UI state for location consent (immediate UI updates)
  const [optimisticConsent, setOptimisticConsent] = useState(null);

  // Location tracking with consent checking
  const {
    location,
    isTracking,
    startTracking,
    stopTracking
  } = useLocation({
<<<<<<< HEAD
    preset: 'ultra_fast',
    updateFirebase: true, // Always enable Firebase updates, we'll handle expiration in the callback
    onLocationUpdate: async (locationData) => {
      if (!ride || ride.driver?.uid !== user.uid || isRideExpired) return;
=======
    preset: 'balanced', // Changed from 'ultra_fast' to 'balanced' for better PWA reliability
    userId: user?.uid,
    updateFirebase: true, // Will be controlled by consent logic later
    enabled: true, // Will be controlled by consent logic later
    timeout: 15000, // Increased timeout to 15 seconds for PWA context
    maximumAge: 30000, // Allow cached location for 30 seconds
    onError: (error) => {
      // Only log non-timeout errors to reduce spam
      if (error.code !== 3) { // 3 = TIMEOUT
      console.log('📍 Location tracking error:', error);
      if (!error.message?.includes('User not found') && !error.message?.includes('permission denied')) {
        setLocationError(error.message);
        }
      }
    },
    onLocationUpdate: async (locationData) => {
      if (!ride || !user || ride.driver?.uid !== user.uid || isRideExpired || ride.status === 'expired') {
        return;
      }
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

      // Validate location accuracy and freshness
      const isAccurate = locationData.accuracy && locationData.accuracy < 100; // Within 100 meters
      const isRecent = locationData.timestamp && (Date.now() - locationData.timestamp) < 30000; // Within 30 seconds
      
      if (!isAccurate || !isRecent) {
        return;
      }

      try {
        const rideRef = doc(db, 'rides', rideId);
<<<<<<< HEAD
=======
        const rideDoc = await getDoc(rideRef);
        if (!rideDoc.exists()) {
          return;
        }
        const currentRideData = rideDoc.data();
        if (currentRideData.driver?.uid !== user.uid) {
          return;
        }
        // Check if the ride is still active
        if (currentRideData.status === 'cancelled' || currentRideData.status === 'completed' || currentRideData.status === 'expired') {
          return;
        }

>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        await updateDoc(rideRef, {
          'driver.currentLocation': {
            lat: locationData.latitude,
            lng: locationData.longitude,
            accuracy: locationData.accuracy,
            address: locationData.address,
            lastUpdated: serverTimestamp(),
            timestamp: locationData.timestamp || Date.now()
          }
        });
        setLocationError(null);
        
<<<<<<< HEAD
        // Trigger route recalculation if significant movement detected (only for active rides)
        if (calculatedRoute && location && !isRideExpired) {
          const distanceMoved = Math.sqrt(
            Math.pow(locationData.latitude - location.latitude, 2) + 
            Math.pow(locationData.longitude - location.longitude, 2)
          );
          
          if (distanceMoved > 0.001) { // More than ~100 meters
            console.log('📍 Significant movement detected, triggering route update');
            setTimeout(() => calculateRoute(), 2000);
          }
        }
      } catch (error) {
        console.error('Error updating ride with location:', error);
        setLocationError('Failed to update location in ride');
      }
    },
    onError: (errorMessage) => {
      console.error('Location tracking error:', errorMessage);
      if (errorMessage && !errorMessage.includes('permission denied')) {
        setLocationError(errorMessage);
      } else if (errorMessage && errorMessage.includes('permission denied')) {
        setError('Location access is required for this ride. Please enable location services.');
=======
      } catch (error) {
        console.error('Error updating ride with location:', error);
        // Check if it's a permission error
        if (error.code === 'permission-denied' || error.message?.includes('permission')) {
          setLocationError('Location update failed - permission denied');
        } else {
          setLocationError('Failed to update location in ride');
        }
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
      }
    },
    onStatusChange: (status) => {
          // Only log status changes, not every status update
    if (status !== 'active') {
      console.log('Location tracking status:', status);
    }
    
      switch (status) {
        case 'offline':
          setLocationError('Location tracking paused - offline');
          break;
        case 'syncing':
          setLocationError('Syncing location data...');
          break;
        case 'active':
          setLocationError(null);
          break;
        case 'error':
          setLocationError('Location tracking failed');
          break;
      }
    }
  });

<<<<<<< HEAD
  // State to store resolved display names
  const [displayNames, setDisplayNames] = useState({});

  // Route calculation manager with caching and debouncing
  const routeCalculationManager = useCallback(async (force = false) => {
    if (!ride) return;
    
    // Check if ride is expired
    if (isRideExpired) {
      console.log('🚫 Route calculation skipped - ride has expired');
      return;
    }

    const now = Date.now();
    const timeSinceLastCalculation = lastRouteCalculation ? now - lastRouteCalculation : Infinity;
    
    // Prevent too frequent calculations (minimum 30 seconds between calculations)
    if (!force && timeSinceLastCalculation < 30000) {
      console.log('🚫 Route calculation throttled - last calculation was', Math.round(timeSinceLastCalculation / 1000), 'seconds ago');
      return;
    }

    // Check if we have a cached route for the current participant configuration
    const participantConfig = JSON.stringify({
      participants: participants.map(p => ({ uid: p.uid, location: p.location, status: p.invitationStatus })),
      destination: ride.destination?.location,
      timestamp: Math.floor(now / 30000) // 30-second buckets
    });

    if (!force && routeCache.has(participantConfig)) {
      const cachedRoute = routeCache.get(participantConfig);
      console.log('🚗 Using cached route');
      setCalculatedRoute(cachedRoute);
      return;
    }

    // Queue the calculation if one is already in progress
    if (isCalculatingRoute) {
      console.log('🚫 Route calculation queued - one already in progress');
      setRouteCalculationQueue(prev => [...prev, { force, timestamp: now }]);
      return;
    }

    await calculateRoute();
  }, [ride, participants, lastRouteCalculation, isCalculatingRoute, routeCache, isRideExpired]);

  // Ride expiration logic
  const checkRideExpiration = useCallback((rideData) => {
    if (!rideData?.createdAt) return false;
    
    const createdAt = rideData.createdAt.toDate ? rideData.createdAt.toDate() : new Date(rideData.createdAt);
    const expirationTime = new Date(createdAt.getTime() + (RIDE_EXPIRATION_HOURS * 60 * 60 * 1000));
    const now = new Date();
    
    setRideExpirationTime(expirationTime);
    const expired = now > expirationTime;
    setIsRideExpired(expired);
    
    return expired;
  }, [RIDE_EXPIRATION_HOURS]);
=======

  // Function to update expired ride status in Firestore
  const updateExpiredRideStatus = async (rideIdToUpdate) => {
    if (!rideIdToUpdate) return;
    
    try {
      const rideRef = doc(db, 'rides', rideIdToUpdate);
      await updateDoc(rideRef, {
        status: 'expired',
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'expired',
          timestamp: new Date().toISOString(),
          updatedBy: 'system',
          reason: 'Ride automatically expired after 24 hours',
          previousStatus: ride?.status || 'unknown'
        })
      });
      console.log('✅ Ride status updated to expired in Firestore');
    } catch (error) {
      console.error('❌ Error updating expired ride status:', error);
      // Don't show error to user - this is a background operation
    }
  };
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

  // Format time remaining
  const getTimeRemaining = useCallback(() => {
    if (!rideExpirationTime) return null;
    
    const now = new Date();
    const timeLeft = rideExpirationTime.getTime() - now.getTime();
    
    if (timeLeft <= 0) return 'Expired';
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  }, [rideExpirationTime]);

<<<<<<< HEAD
  // Process route calculation queue
  useEffect(() => {
    if (!isCalculatingRoute && routeCalculationQueue.length > 0) {
      const nextCalculation = routeCalculationQueue[0];
      setRouteCalculationQueue(prev => prev.slice(1));
      
      setTimeout(() => {
        routeCalculationManager(nextCalculation.force);
      }, 1000);
    }
  }, [isCalculatingRoute, routeCalculationQueue, routeCalculationManager]);

  // Cache management - clean up old cache entries
  useEffect(() => {
    const cleanupCache = () => {
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes
      
      setRouteCache(prev => {
        const newCache = new Map();
        for (const [key, value] of prev.entries()) {
          try {
            const config = JSON.parse(key);
            const cacheAge = now - (config.timestamp * 30000);
            if (cacheAge < maxAge) {
              newCache.set(key, value);
            }
          } catch (e) {
            // Invalid cache entry, remove it
            console.log('🧹 Cleaning up invalid cache entry');
          }
        }
        return newCache;
      });
    };

    const interval = setInterval(cleanupCache, 60000); // Clean up every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate optimized route based on participants and destination
  const calculateRoute = async () => {
    if (!ride) return;
    
    // Check if ride is expired
    if (isRideExpired) {
      console.log('🚫 Route calculation skipped - ride has expired');
      return;
    }

    // Prevent multiple simultaneous calculations
    if (isCalculatingRoute) {
      console.log('🚫 Route calculation already in progress, skipping...');
      return;
    }

    // Check if we've calculated recently (within last 30 seconds)
    const now = Date.now();

    console.log('🚗 Starting route calculation...');
    setIsCalculatingRoute(true);
    setRouteError(null);
    setLastRouteCalculation(now);

    try {
      // Create waypoints array
      const waypoints = [];
      
      // Get all participants with locations (only accepted ones)
      const allUsersWithLocations = participants.filter(p => 
        p.location && p.location.lat && p.location.lng && 
        p.role !== 'driver' && 
        p.invitationStatus === 'accepted'
      );
      
      // Also include invitees with RSVP locations that might not be in participants yet (only accepted ones)
      const inviteesWithLocations = [];
      if (ride.invitations) {
        Object.entries(ride.invitations).forEach(([inviteeId, invitation]) => {
          // Skip if already in participants or not accepted
          const alreadyInParticipants = participants.some(p => p.uid === inviteeId);
          if (!alreadyInParticipants && 
              invitation.status === 'accepted' && 
              invitation.response && 
              invitation.response.location) {
            const response = invitation.response;
            if (response.location && response.location.lat && response.location.lng) {
              inviteesWithLocations.push({
                uid: inviteeId,
                displayName: invitation.inviteeName || `User ${inviteeId?.slice(-4)}` || 'Unknown User',
                location: response.location,
                pickupLocation: response.pickupLocation,
                readyTime: response.readyTime,
                role: invitation.role || 'passenger',
                invitationStatus: invitation.status,
                type: 'pickup'
              });
            }
          }
        });
      }
      
      // Combine all users with locations
      const allPickupPoints = [...allUsersWithLocations, ...inviteesWithLocations];
      
      // Check if we've calculated recently (within last 30 seconds)
      if (lastRouteCalculation && (now - lastRouteCalculation) < 30000) {
        console.log('🚫 Route calculated recently, checking if new pickup points...');
        
        // Check if we have new pickup points that weren't in the previous calculation
        const currentPickupPoints = allPickupPoints.length;
        const previousPickupPoints = calculatedRoute?.waypointInfo?.length ? calculatedRoute.waypointInfo.length - 1 : 0;
        
        if (currentPickupPoints <= previousPickupPoints) {
          console.log('🚫 No new pickup points, skipping route calculation');
          setIsCalculatingRoute(false);
          return;
        } else {
          console.log('🔄 New pickup points detected, forcing route recalculation');
        }
      }
      
      console.log('🚗 Route calculation participants:', {
        participantsWithLocations: allUsersWithLocations.length,
        inviteesWithLocations: inviteesWithLocations.length,
        totalPickupPoints: allPickupPoints.length,
        participants: allUsersWithLocations.map(p => ({ uid: p.uid, name: p.displayName, status: p.invitationStatus })),
        invitees: inviteesWithLocations.map(p => ({ uid: p.uid, name: p.displayName, status: p.invitationStatus }))
      });
      
      // Add driver's starting location as the first waypoint (origin)
      const driver = participants.find(p => p.role === 'driver' || p.uid === ride.driver?.uid);
      if (driver && driver.location) {
          waypoints.push({
            ...driver,
          lat: driver.location.lat,
          lng: driver.location.lng,
          location: driver.location,
          type: 'origin',
          displayName: driver.displayName || 'Driver'
        });
        console.log('🚗 Added driver origin waypoint:', driver.displayName);
      } else if (location) {
        // Use current user's location as driver origin if driver location not available
        waypoints.push({
          uid: user?.uid,
          lat: location.latitude,
          lng: location.longitude,
          location: { lat: location.latitude, lng: location.longitude },
          type: 'origin',
          displayName: 'Driver (Current Location)',
          role: 'driver'
        });
        console.log('🚗 Added current location as driver origin waypoint');
      }

      // Add all pickup points to waypoints
      allPickupPoints.forEach(pickupPoint => {
        waypoints.push({
          ...pickupPoint,
          lat: pickupPoint.location.lat,
          lng: pickupPoint.location.lng,
          location: pickupPoint.location,
          type: 'pickup',
          displayName: pickupPoint.displayName
        });
        console.log('🚗 Added pickup waypoint:', pickupPoint.displayName, 'at', pickupPoint.location);
      });

      // Add destination
      if (ride.destination && ride.destination.location) {
        // Use the destination name/address if available, otherwise use coordinates
        const destinationName = ride.destination.name || 
                               ride.destination.address || 
                               ride.destination.displayName || 
                               'Destination';
        
        waypoints.push({
          ...ride.destination,
          lat: ride.destination.location.lat,
          lng: ride.destination.location.lng,
          location: {
            ...ride.destination.location,
            // Ensure we have the address in the location object
            address: ride.destination.address || 
                    ride.destination.name || 
                    ride.destination.displayName || 
                    `${ride.destination.location.lat.toFixed(4)}, ${ride.destination.location.lng.toFixed(4)}`
          },
          type: 'destination',
          displayName: destinationName
        });
      }

      console.log('Calculating route with waypoints:', waypoints.length);
      
      // Debug: Check what the route optimizer will receive
      console.log('Route optimizer input analysis:', {
        totalWaypoints: waypoints.length,
        drivers: waypoints.filter(w => w.type === 'driver' || w.role === 'driver').length,
        pickupPoints: waypoints.filter(w => (w.type === 'pickup' || w.type === 'waypoint' || w.type === 'passenger') && w.role !== 'driver').length,
        destinations: waypoints.filter(w => w.type === 'destination' || w.type === 'end').length
      });

      if (waypoints.length >= 2) {
        // Check if we have the expected waypoints for a proper route
        const expectedWaypoints = 1 + allPickupPoints.length + (ride.destination && ride.destination.location ? 1 : 0);
        
        console.log('Route calculation check:', {
          actualWaypoints: waypoints.length,
          expectedWaypoints: expectedWaypoints,
          driver: waypoints.filter(w => w.type === 'origin' || w.type === 'driver').length,
          pickupPoints: allPickupPoints.length,
          destination: ride.destination && ride.destination.location ? 1 : 0
        });
        
        if (waypoints.length < expectedWaypoints) {
          console.log('Waiting for all waypoints to be available before calculating route');
          return;
        }
        
        // Advanced route optimization for multi-stop pickup
        console.log('🚗 Starting advanced route optimization...');
        
        try {
          // Build waypoints array for Mapbox Directions API
          const waypointsForAPI = waypoints.map(waypoint => {
            if (waypoint.type === 'origin' || waypoint.type === 'driver') {
              return `${waypoint.location.lng},${waypoint.location.lat}`;
            } else if (waypoint.type === 'pickup') {
              return `${waypoint.location.lng},${waypoint.location.lat}`;
            } else if (waypoint.type === 'destination') {
              return `${waypoint.location.lng},${waypoint.location.lat}`;
            }
            return null;
          }).filter(Boolean);

          console.log('🗺️ Waypoints for API:', waypointsForAPI);

          if (waypointsForAPI.length < 2) {
            console.log('❌ Not enough waypoints for route calculation');
            return;
          }

          // Use Mapbox Directions API for optimized route
          const directionsUrl = new URL('https://api.mapbox.com/directions/v5/mapbox/driving-traffic/' + waypointsForAPI.join(';'));
          directionsUrl.searchParams.append('access_token', 'pk.eyJ1IjoibHVtaW5hcnkwIiwiYSI6ImNtY3c2M2VjYTA2OWsybXEwYm12emU2MnkifQ.nC7J3ggSse2k9HYdJ1sdYg');
          directionsUrl.searchParams.append('geometries', 'geojson');
          directionsUrl.searchParams.append('overview', 'full');
          directionsUrl.searchParams.append('steps', 'true');
          directionsUrl.searchParams.append('annotations', 'duration,distance');
          directionsUrl.searchParams.append('continue_straight', 'false');

          console.log('🗺️ Requesting optimized route from Mapbox...');
          const response = await fetch(directionsUrl.toString());
          
          if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
          }

          const routeData = await response.json();
          console.log('🗺️ Route optimization result:', routeData);

          if (routeData.routes && routeData.routes.length > 0) {
            const optimizedRoute = routeData.routes[0];
            
            // Calculate total metrics
            const totalDistance = optimizedRoute.distance / 1609.34; // Convert meters to miles
            const totalDuration = optimizedRoute.duration / 60; // Convert seconds to minutes
            
            // Extract waypoint information
            const waypointInfo = optimizedRoute.legs.map((leg, index) => ({
              from: waypoints[index]?.displayName || `Waypoint ${index + 1}`,
              to: waypoints[index + 1]?.displayName || `Waypoint ${index + 2}`,
              distance: leg.distance / 1609.34,
              duration: leg.duration / 60,
              steps: leg.steps
            }));

            const enhancedRouteData = {
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                properties: {
                  routeType: 'optimized',
                  totalDistance,
                  totalDuration,
                  waypointCount: waypoints.length,
                  waypointInfo,
                  optimizationType: 'multi-stop-pickup'
                },
                geometry: optimizedRoute.geometry
              }],
              totalDistance,
              totalDuration,
              waypointInfo,
              optimizationType: 'multi-stop-pickup'
            };

            console.log('🚗 Advanced route optimization completed:', {
              totalDistance: `${totalDistance.toFixed(1)} mi`,
              totalDuration: `${totalDuration.toFixed(1)} min`,
              waypoints: waypoints.length,
              optimizationType: 'multi-stop-pickup'
            });

            // Reset retry count on success
            setRetryCount(0);

            // Cache the successful route
            const participantConfig = JSON.stringify({
              participants: participants.map(p => ({ uid: p.uid, location: p.location, status: p.invitationStatus })),
              destination: ride.destination?.location,
              timestamp: Math.floor(Date.now() / 30000)
            });
            setRouteCache(prev => new Map(prev).set(participantConfig, enhancedRouteData));
            
            setCalculatedRoute(enhancedRouteData);
          } else {
            throw new Error('No routes returned from Mapbox API');
          }
        } catch (error) {
          console.error('❌ Route optimization failed:', error);
          
          // Retry logic for transient errors
          if (retryCount < maxRetries && (
            error.message.includes('network') || 
            error.message.includes('timeout') || 
            error.message.includes('rate limit')
          )) {
            console.log(`🔄 Retrying route calculation (${retryCount + 1}/${maxRetries})...`);
            setRetryCount(prev => prev + 1);
            setTimeout(() => {
              routeCalculationManager(true);
            }, 2000 * (retryCount + 1)); // Exponential backoff
            return;
          }
          
          // Reset retry count on success or permanent failure
          setRetryCount(0);
          
          // Fallback to basic route calculation
          console.log('🔄 Falling back to basic route calculation...');
          
          // Create a simple straight-line route as fallback
          const fallbackRoute = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                routeType: 'fallback',
                totalDistance: 0,
                totalDuration: 0,
                waypointCount: waypoints.length
              },
              geometry: {
                type: 'LineString',
                coordinates: waypoints.map(wp => [wp.location.lng, wp.location.lat])
              }
            }],
            totalDistance: 0,
            totalDuration: 0,
            optimizationType: 'fallback'
          };
          
          setCalculatedRoute(fallbackRoute);
        }
      } else {
        console.log('Not enough waypoints for route calculation:', waypoints.length);
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      setRouteError('Failed to calculate route: ' + error.message);
    } finally {
      setIsCalculatingRoute(false);
    }
  };
=======
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

  // Get display name for UID with caching
  const getDisplayNameForUid = async (uid) => {
    if (!uid) return 'Unknown User';
    // Don't return early for current user - we want to fetch their actual display name from Firestore
    
    // Check if we already have this display name cached
    if (displayNames[uid]) {
      return displayNames[uid];
    }
    
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Check for displayName in different possible locations (prioritize profile.displayName)
        let displayName = null;
        
        if (userData.profile && userData.profile.displayName) {
          displayName = userData.profile.displayName;
        } else if (userData.displayName) {
          displayName = userData.displayName;
        } else if (userData.name) {
          displayName = userData.name;
        } else if (userData.email) {
          displayName = userData.email;
        } else if (userData.userProfile && userData.userProfile.displayName) {
          displayName = userData.userProfile.displayName;
        }
        
        const resolvedName = displayName || `User ${uid.slice(-4)}`;
        
        // Cache the result
        setDisplayNames(prev => ({
          ...prev,
          [uid]: resolvedName
        }));
        
        return resolvedName;
      } else {
        console.log(`No user document found for UID: ${uid}`);
      }
    } catch (error) {
      console.error(`Error fetching user profile for UID: ${uid}`, error);
    }
    return `User ${uid.slice(-4)}`;
  };

<<<<<<< HEAD
  // Subscribe to ride updates
=======
  // Function to geocode pickup location strings to coordinates
  const geocodePickupLocation = async (pickupLocation) => {
    if (!pickupLocation) return null;
    
    // If it's already a coordinate object, return as is
    if (typeof pickupLocation === 'object' && pickupLocation.lat && pickupLocation.lng) {
      return pickupLocation;
    }
    
    // If it's a string address, geocode it
    if (typeof pickupLocation === 'string') {
      try {
        console.log('🔍 Geocoding pickup location:', pickupLocation);
        const coords = await getCoordsFromAddress(pickupLocation);
        if (coords) {
          console.log('✅ Geocoded pickup location:', coords);
          return {
            lat: coords.lat,
            lng: coords.lng,
            address: pickupLocation
          };
        } else {
          console.warn('❌ Failed to geocode pickup location:', pickupLocation);
          return null;
        }
      } catch (error) {
        console.error('❌ Error geocoding pickup location:', error);
        return null;
      }
    }
    
    return null;
  };

  // Effect to set up ride subscription
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
  useEffect(() => {
    if (!rideId || !user) return;

<<<<<<< HEAD
    const rideRef = doc(db, 'rides', rideId);
    const unsubscribe = onSnapshot(rideRef, async (doc) => {
        if (doc.exists()) {
        const rideData = doc.data();
=======
    console.log('🚀 Setting up ride subscription for:', rideId);
    setLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, 'rides', rideId),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const rideData = docSnapshot.data();
          console.log('📄 Ride data received:', rideData);
          
          // Check if user still has access to this ride
          const isDriver = rideData.driver?.uid === user.uid;
          const isPassenger = rideData.passengerUids && rideData.passengerUids.includes(user.uid);
          const hasInvitation = rideData.invitations && rideData.invitations[user.uid];
          const isExpired = checkRideExpiration(rideData);
          
          // Define valid ride statuses that should allow access
          const validRideStatuses = ['active', 'created', 'forming', 'pending', 'ready'];
          const isInactive = rideData.status === 'cancelled' || rideData.status === 'expired' || isExpired;
          const hasValidStatus = validRideStatuses.includes(rideData.status);
          
          console.log('🔍 Ride access validation:', {
            rideId: rideData.id,
            rideStatus: rideData.status,
            isDriver,
            isPassenger,
            hasInvitation,
            isExpired,
            isInactive,
            hasValidStatus,
            userUid: user.uid
          });
          
          // Allow access if:
          // 1. User is a current participant (driver/passenger/invitee), OR
          // 2. Ride has a valid status (even if user isn't currently a participant)
          // Only block access if user has no relationship AND ride is truly inactive
          if (!isDriver && !isPassenger && !hasInvitation && !hasValidStatus) {
            console.log('🚫 User no longer has access to this ride');
            setError('You no longer have access to this ride. You may have been removed or the ride may have been cancelled.');
            setLoading(false);
            return;
          }
          
          // If it's an inactive ride and user has no current relationship, show warning but allow access
          if (isInactive && !isDriver && !isPassenger && !hasInvitation) {
            console.log('⚠️ User accessing inactive ride for historical viewing');
            // Don't block access, just show a warning
          }
          
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        setRide(rideData);
        setDescription(rideData.description || '');
        const rideTitle = rideData.groupName || rideData.name || 'Untitled Ride';
        setTitle(rideTitle);
        console.log('🎯 Setting ride title:', { 
          groupName: rideData.groupName, 
          name: rideData.name, 
          finalTitle: rideTitle 
        });

        // Stop location tracking if ride is cancelled
        if (rideData.status === RIDE_STATUS.CANCELLED && isTracking) {
          console.log('Ride cancelled - stopping location tracking');
          stopTracking();
        }

        // Stop location tracking if user is no longer the driver
        if (rideData.driver?.uid !== user?.uid && isTracking) {
          console.log('User is no longer driver - stopping location tracking');
          stopTracking();
        }

        // Update participants list
        const allParticipants = [];
        
<<<<<<< HEAD
        // Add driver
        if (rideData.driver) {
          allParticipants.push({
            ...rideData.driver,
            role: 'driver',
            invitationStatus: 'accepted',
            isCreator: rideData.creatorId === rideData.driver.uid,
            color: '#2196F3',
            displayName: rideData.driver.displayName || rideData.driver.name || `User ${rideData.driver.uid?.slice(-4)}` || 'Driver'
          });
        }
        
                // Add passengers
        if (rideData.passengers) {
          rideData.passengers.forEach((passenger, index) => {
            const isAlreadyParticipant = allParticipants.some(p => p.uid === passenger.uid);
            if (!isAlreadyParticipant) {
              // Check if this passenger has an invitation and use their actual status
              const invitation = rideData.invitations?.[passenger.uid];
              const invitationStatus = invitation ? invitation.status : 'accepted';
              
              allParticipants.push({
                ...passenger,
                role: 'passenger',
                invitationStatus: invitationStatus,
                isCreator: rideData.creatorId === passenger.uid,
                color: ['#FF5722', '#4CAF50', '#9C27B0', '#FF9800'][index % 4],
                displayName: passenger.displayName || passenger.name || `User ${passenger.uid?.slice(-4)}` || 'Passenger'
              });
=======
        console.log('🔍 Ride data structure:', {
          hasDriver: !!rideData.driver,
          driverUid: rideData.driver?.uid,
          driverName: rideData.driver?.name,
          creatorId: rideData.creatorId,
          currentUserId: user?.uid,
          passengers: 0, // Deprecated field - now using participants
          invitations: Object.keys(rideData.invitations || {}).length
        });
        
        console.log('🔍 COMPREHENSIVE RIDE DATA ANALYSIS:', {
          rideId: rideData.id,
          hasParticipants: !!rideData.participants,
          participantsData: rideData.participants,
          participantsKeys: rideData.participants ? Object.keys(rideData.participants) : [],
          hasInvitations: !!rideData.invitations,
          invitationsData: rideData.invitations,
          invitationsKeys: rideData.invitations ? Object.keys(rideData.invitations) : [],
          hasPassengers: false, // Deprecated field - now using participants
          passengersData: null, // Deprecated field - now using participants
          hasDriver: !!rideData.driver,
          driverData: rideData.driver
        });
        
        // REMOVED: Old driver processing logic
        // Drivers are now handled through the participants field after RSVP
        // This prevents conflicts with the streamlined invitee → participant flow
        
        // Add participants from the participants field (RSVP responses) - PRIORITIZE THIS
        if (rideData.participants) {
          console.log('🔍 Processing participants field:', rideData.participants);
          
          // Process participants with async geocoding
          const participantPromises = Object.entries(rideData.participants).map(async ([participantId, participantData]) => {
            console.log('🔍 Processing participant:', participantId, participantData);
            const isAlreadyParticipant = allParticipants.some(p => p.uid === participantId);
            if (!isAlreadyParticipant) {
              // Get user display name from invitations or use participant data
              const invitation = rideData.invitations?.[participantId];
              const displayName = invitation?.inviteeName || 
                                participantData.displayName || 
                                displayNames[participantId] ||
                                `User ${participantId?.slice(-4)}` || 
                                'Unknown User';
              
              const isCreator = rideData.creatorId === participantId;
              console.log('🔍 Creator detection for participant:', {
                participantId,
                creatorId: rideData.creatorId,
                isCreator,
                participantData
              });
              
              // Create participant object
              const participant = {
                uid: participantId,
                displayName: displayName,
                photoURL: invitation?.inviteePhotoURL || participantData.photoURL,
                email: invitation?.inviteeEmail || participantData.email,
                role: participantData.role || 'passenger',
                invitationStatus: participantData.status || 'accepted',
                isCreator: isCreator,
                color: '#607D8B',
                pickupLocation: participantData.pickupLocation,
                readyTime: participantData.readyTime,
                locationSharing: participantData.locationSharing,
                seatCapacity: participantData.seatCapacity,
                source: 'participants' // Track source
              };

              // console.log('🔍 Driver location assignment debug:', {
              //   participantId,
              //   participantRole: participantData.role,
              //   isOriginalDriver,
              //   driverUid: rideData.driver?.uid,
              //   hasDriverLocation: !!(rideData.driver?.location),
              //   driverLocation: rideData.driver?.location,
              //   driverName: rideData.driver?.name || rideData.driver?.displayName
              // });

              // Handle location assignment based on driver type
              if (participantData.role === 'driver') {
                if (rideData.driver?.uid === participantId) {
                  // This is the original driver (creator) - use driver field location
                  if (rideData.driver?.location) {
                    participant.location = rideData.driver.location;
                    console.log('🚗 Original driver location assigned:', {
                  participantId,
                      location: participant.location,
                      driverName: rideData.driver?.name || rideData.driver?.displayName
                    });
                  } else {
                    console.log('⚠️ Original driver has no location in driver field:', {
                      participantId,
                      driverField: rideData.driver
                    });
                  }
                } else {
                  // This is an additional driver - use invitation response location
                  if (invitation?.response?.location) {
                    participant.location = invitation.response.location;
                    console.log('🚗 Additional driver location assigned:', {
                      participantId,
                      location: participant.location
                    });
                  }
                }
              }

              // If pickup location is missing from participant data, try to get it from invitation response
              // But don't overwrite the location if this is the original driver
              if (!participant.pickupLocation && invitation?.response?.pickupLocation) {
                participant.pickupLocation = invitation.response.pickupLocation;
                
                // Only set location from invitation response if this is NOT the original driver
                if (rideData.driver?.uid !== participantId) {
                participant.location = invitation.response.location;
                }
                
                participant.readyTime = invitation.response.readyTime;
                participant.locationSharing = invitation.response.locationSharing;
                participant.notes = invitation.response.notes;
              }

              // Geocode pickup location if it's a string
              if (participant.pickupLocation && typeof participant.pickupLocation === 'string') {
                // console.log('🔍 Geocoding participant pickup location:', {
                //   participantId,
                //   pickupLocation: participant.pickupLocation
                // });
                const geocodedLocation = await geocodePickupLocation(participant.pickupLocation);
                if (geocodedLocation) {
                  participant.pickupLocation = geocodedLocation;
                  // console.log('✅ Participant pickup location geocoded:', {
                  //   participantId,
                  //   geocodedLocation
                  // });
                }
              }

              // console.log('🔍 Created participant from participants field:', {
              //   uid: participantId,
              //   role: participantData.role || 'passenger',
              //   status: participantData.status || 'accepted',
              //   seatCapacity: participantData.seatCapacity,
              //   pickupLocation: participant.pickupLocation,
              //   hasPickupLocation: !!(participant.pickupLocation && participant.pickupLocation.lat && participant.pickupLocation.lng),
              //   location: participant.location,
              //   hasLocation: !!(participant.location && participant.location.lat && participant.location.lng),
              //   isOriginalDriver: rideData.driver?.uid === participantId,
              //   driverLocation: rideData.driver?.location,
              //   rawData: participantData,
              //   finalParticipant: participant
              // });

              return participant;
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
            }
            return null;
          });

          // Wait for all participant processing to complete
          const processedParticipants = await Promise.all(participantPromises);
          const validParticipants = processedParticipants.filter(p => p !== null);
          allParticipants.push(...validParticipants);
        }
        
        // Add invitations (only accepted and pending ones - exclude declined)
        if (rideData.invitations) {
          console.log('🔍 Processing invitations field:', rideData.invitations);
          Object.entries(rideData.invitations).forEach(([inviteeId, invitation]) => {
            console.log('🔍 Processing invitation:', inviteeId, invitation);
            // Skip declined invitations
            if (invitation.status === 'declined') {
              console.log('🚫 Skipping declined participant:', inviteeId);
              return;
            }
            
            const isAlreadyParticipant = allParticipants.some(p => p.uid === inviteeId);
            if (!isAlreadyParticipant) {
              const participantData = {
                uid: inviteeId,
                displayName: invitation.inviteeName || `User ${inviteeId?.slice(-4)}` || 'Unknown User',
                photoURL: invitation.inviteePhotoURL,
                email: invitation.inviteeEmail,
                role: invitation.response?.role || invitation.role || 'passenger',
                invitationStatus: invitation.status,
                isCreator: rideData.creatorId === inviteeId,
                isPendingInvitation: invitation.status === 'pending',
                color: '#607D8B',
                source: 'invitations' // Track source
              };
              
              console.log('🔍 Created participant from invitation:', {
                uid: inviteeId,
                role: participantData.role,
                responseRole: invitation.response?.role,
                invitationRole: invitation.role,
                status: invitation.status
              });
              
              // Add location data from RSVP response if available (only for accepted/pending)
              if (invitation.response) {
                const response = invitation.response;
                if (response.location && response.location.lat && response.location.lng) {
                  participantData.location = response.location;
                  participantData.pickupLocation = response.pickupLocation;
                  participantData.readyTime = response.readyTime;
                  participantData.locationSharing = response.locationSharing;
                  participantData.notes = response.notes;
                  
                  console.log('Added user with location to participants:', {
                    uid: inviteeId,
                    displayName: participantData.displayName,
                    status: invitation.status,
                    location: response.location
                  });
                }
              }
              
              allParticipants.push(participantData);
            }
          });
        }
        
<<<<<<< HEAD
=======
        console.log('🔍 All participants before setting state:', allParticipants.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          role: p.role,
          invitationStatus: p.invitationStatus,
          status: p.status,
          seatCapacity: p.seatCapacity,
          isCreator: p.isCreator,
          hasInvitationStatus: 'invitationStatus' in p,
          hasStatus: 'status' in p,
          source: p.source
        })));
        
        // Add invitees (those who haven't responded yet) - NEW STREAMLINED LOGIC
        if (rideData.invitations) {
          console.log('🔍 Processing invitations field (pending invitees):', rideData.invitations);
          Object.entries(rideData.invitations).forEach(([inviteeId, invitation]) => {
            // Skip if already processed as a participant (RSVP response)
            const isAlreadyParticipant = allParticipants.some(p => p.uid === inviteeId);
            if (!isAlreadyParticipant && invitation.status === 'pending') {
              console.log('🔍 Processing pending invitee:', inviteeId, invitation);
              
              allParticipants.push({
                uid: inviteeId,
                displayName: invitation.inviteeName || displayNames[inviteeId] || `User ${inviteeId?.slice(-4)}` || 'Unknown User',
                photoURL: invitation.inviteePhotoURL,
                email: invitation.inviteeEmail,
                role: 'invitee', // Special role for unresponded invitations
                invitationStatus: 'pending',
                status: 'pending',
                isCreator: rideData.creatorId === inviteeId,
                color: '#FF9800', // Orange for pending
                source: 'invitations'
              });
            }
          });
        }
        
        // REMOVED: Premature passenger assignment logic
        // Passengers are now only added after RSVP responses in the participants field
        // This prevents conflicts when invitees RSVP as drivers
        
        // Debug seat capacity flow
        const drivers = allParticipants.filter(p => p.role === 'driver');
        const totalSeatsFromDrivers = drivers.reduce((total, driver) => total + (driver.seatCapacity !== undefined ? driver.seatCapacity : 4), 0);
        console.log('🔢 Seat capacity flow debug:', {
          totalParticipants: allParticipants.length,
          drivers: drivers.length,
          totalSeatsFromDrivers,
          driverSeatCapacities: drivers.map(d => ({ uid: d.uid, seatCapacity: d.seatCapacity })),
          rideDataSeatCapacity: rideData.seatCapacity,
          rideDataCarSeatsAvailable: rideData.carSeatsAvailable
        });
        
        setParticipants(allParticipants);
        
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        // Remove duplicates and filter out declined participants
        const uniqueParticipants = [];
        const seenUids = new Set();
        
        allParticipants.forEach(participant => {
          if (!seenUids.has(participant.uid)) {
            seenUids.add(participant.uid);
            
            // Check if this participant has declined their invitation
            const invitation = rideData.invitations?.[participant.uid];
            if (invitation && invitation.status === 'declined') {
              console.log('🚫 Filtering out declined participant from display:', participant.uid);
              return; // Skip this participant
            }
            
            uniqueParticipants.push(participant);
          }
        });
        
        console.log('👥 Final participants list:', uniqueParticipants.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          status: p.invitationStatus,
          role: p.role,
          hasLocation: !!(p.location && p.location.lat && p.location.lng),
          source: p.source || 'unknown' // Add source tracking
        })));
<<<<<<< HEAD
=======
        
        console.log('🔍 PARTICIPANT SOURCE ANALYSIS:', {
          totalParticipants: uniqueParticipants.length,
          participantsFromParticipantsField: uniqueParticipants.filter(p => p.source === 'participants').length,
          participantsFromInvitationsField: uniqueParticipants.filter(p => p.source === 'invitations').length,
          participantsFromPassengersField: uniqueParticipants.filter(p => p.source === 'passengers').length,
          driversFound: uniqueParticipants.filter(p => p.role === 'driver').length,
          passengersFound: uniqueParticipants.filter(p => p.role === 'passenger').length
        });
          
          // Log participant count breakdown for debugging
          const acceptedCount = uniqueParticipants.filter(p => p.invitationStatus === 'accepted').length;
          const pendingCount = uniqueParticipants.filter(p => p.invitationStatus === 'pending').length;
          const driverCount = uniqueParticipants.filter(p => p.role === 'driver').length;
          const passengerCount = uniqueParticipants.filter(p => p.role === 'passenger').length;
          
          console.log('📊 Participant count breakdown:', {
            total: uniqueParticipants.length,
            accepted: acceptedCount,
            pending: pendingCount,
            drivers: driverCount,
            passengers: passengerCount,
            hasDriver: !!rideData.driver,
            driverUid: rideData.driver?.uid
          });
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        
        setParticipants(uniqueParticipants);
        
        // Resolve display names for all unique UIDs
        const allUids = [...new Set([
          ...uniqueParticipants.map(p => p.uid),
          ...(rideData.invitations ? Object.keys(rideData.invitations) : []),
          rideData.createdBy // Add ride creator
        ])];
        
        // Fetch display names for all UIDs
        allUids.forEach(async (uid) => {
          if (uid && uid !== user?.uid) {
            await getDisplayNameForUid(uid);
          }
        });

        // Calculate route when participants or invitations change
        const hasParticipantsWithLocations = uniqueParticipants.some(p => {
          const hasLocation = p.location && p.location.lat && p.location.lng;
          const isAccepted = p.invitationStatus === 'accepted' || p.status === 'accepted';
          const isOriginalDriver = rideData.driver?.uid === p.uid; // Original driver should always trigger route calculation
          
          console.log('🔍 Route trigger check:', {
            uid: p.uid,
            displayName: p.displayName,
            hasLocation,
            invitationStatus: p.invitationStatus,
            status: p.status,
            isAccepted,
            isOriginalDriver,
            shouldTrigger: hasLocation && (isAccepted || isOriginalDriver)
          });
          
          return hasLocation && (isAccepted || isOriginalDriver);
        });
        const hasInvitationsWithLocations = rideData.invitations && Object.values(rideData.invitations).some(inv => 
          inv.status === 'accepted' && 
          inv.response && inv.response.location && inv.response.location.lat && inv.response.location.lng
        );
        
        if ((hasParticipantsWithLocations || hasInvitationsWithLocations) && rideData.destination?.location) {
          // Check if ride is expired before calculating route
          const createdAt = rideData.createdAt?.toDate ? rideData.createdAt.toDate() : new Date(rideData.createdAt);
          const expirationTime = new Date(createdAt.getTime() + (RIDE_EXPIRATION_HOURS * 60 * 60 * 1000));
          const isExpired = new Date() > expirationTime;
          
          if (!isExpired) {
          console.log('🔄 Triggering route calculation due to participant/invitation changes');
          console.log('🔄 Participants for route calculation:', participants.map(p => ({
            uid: p.uid,
            displayName: p.displayName,
            role: p.role,
            hasLocation: !!(p.location && p.location.lat && p.location.lng),
            hasPickupLocation: !!(p.pickupLocation && p.pickupLocation.lat && p.pickupLocation.lng),
            invitationStatus: p.invitationStatus
          })));
          
          // Immediate route calculation trigger for testing
          console.log('🚀 MANUAL ROUTE CALCULATION TRIGGER - Testing route calculation');
          console.log('🚀 Route trigger conditions:', {
            hasParticipantsWithLocations,
            hasInvitationsWithLocations,
            hasDestination: !!rideData.destination?.location,
            participantsCount: uniqueParticipants.length,
            originalDriverUid: rideData.driver?.uid
          });
          setTimeout(() => {
            // Use the route calculation manager for better control
          }, 1000); // Small delay to ensure display names are loaded
          } else {
            console.log('🚫 Skipping route calculation - ride has expired');
          }
        }
        
        // Set up invitations with names
        if (rideData.invitations) {
          const invitationsWithNames = Object.entries(rideData.invitations).map(([inviteeId, invitation]) => ({
                  inviteeId,
                  invitation,
            displayName: invitation.inviteeName || `User ${inviteeId?.slice(-4)}` || 'Unknown User'
          }));
          setInvitationsWithNames(invitationsWithNames);
        }

        // Check for pending invitation
        if (user && rideData.invitations && !loading) {
          const userInvitation = rideData.invitations[user.uid];
          
          if (userInvitation && userInvitation.status === 'pending' && !showInvitationModal && !isManuallyOpened) {
            console.log('Found pending invitation, showing modal');
            setUserInvitation(userInvitation);
            setShowInvitationModal(true);
          } else if (!userInvitation && showInvitationModal && !isManuallyOpened) {
            console.log('Hiding modal - no invitation found');
            setShowInvitationModal(false);
            setUserInvitation(null);
          }
        }
      } else {
        setError('Ride not found');
        navigate('/rides');
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [rideId, user, navigate, loading, showInvitationModal, isManuallyOpened, isTracking, stopTracking]);

  // Effect to fetch display names when participants change
  useEffect(() => {
    if (!participants.length) return;
    
    // Only fetch if we don't already have the display names
    const uidsToFetch = participants
      .filter(p => p.uid && !displayNames[p.uid])
      .map(p => p.uid);
    
    console.log('🔍 Participant display name status:', participants.map(p => ({
      uid: p.uid,
      isCurrentUser: p.uid === user?.uid,
      hasCachedName: !!displayNames[p.uid],
      cachedName: displayNames[p.uid],
      willFetch: p.uid !== user?.uid && !displayNames[p.uid]
    })));
    
    if (uidsToFetch.length === 0) {
      console.log('🔄 All participant display names already cached');
      return;
    }
    
    console.log('🔄 Effect triggered: Fetching display names for participants:', uidsToFetch);
    
    // Fetch display names for participants that need them
    const fetchDisplayNames = async () => {
      for (const uid of uidsToFetch) {
        console.log(`🚀 Triggering fetch for participant: ${uid}`);
        await getDisplayNameForUid(uid);
      }
    };
    
    fetchDisplayNames();
  }, [participants, user?.uid, displayNames]);

  // Effect to fetch display names for invitations
  useEffect(() => {
    if (!ride?.invitations) return;
    
    // Only fetch if we don't already have the display names
    const uidsToFetch = Object.keys(ride.invitations)
      .filter(inviteeId => inviteeId && !displayNames[inviteeId]);
    
    if (uidsToFetch.length === 0) {
      console.log('🔄 All invitation display names already cached');
      return;
    }
    
    console.log('🔄 Effect triggered: Fetching display names for invitations:', uidsToFetch);
    
    // Fetch display names for invitees that need them
    const fetchInvitationDisplayNames = async () => {
      for (const inviteeId of uidsToFetch) {
        console.log(`🚀 Triggering fetch for invitee: ${inviteeId}`);
        await getDisplayNameForUid(inviteeId);
      }
    };
    
    fetchInvitationDisplayNames();
  }, [ride?.invitations, user?.uid, displayNames]);

  // Effect to fetch display names when ride data changes
  useEffect(() => {
    if (!ride) return;
    
    // Only run this effect once when ride data first loads
    // The other effects will handle ongoing display name fetching
    console.log('🔄 Ride data loaded, display name fetching will be handled by other effects');
  }, [ride?.id]); // Only depend on ride ID, not the entire ride object

  // Effect to update invitationsWithNames when displayNames change
  useEffect(() => {
    if (!ride?.invitations) return;
    
    console.log('🔄 Updating invitationsWithNames with cached display names');
    
    const updatedInvitationsWithNames = Object.entries(ride.invitations).map(([inviteeId, invitation]) => ({
      inviteeId,
      invitation,
      displayName: displayNames[inviteeId] || invitation.inviteeName || `User ${inviteeId?.slice(-4)}` || 'Unknown User'
    }));
    
    setInvitationsWithNames(updatedInvitationsWithNames);
  }, [displayNames, ride?.invitations]);

  // Effect to update participants when displayNames change
  useEffect(() => {
    if (!participants.length) return;
    
    console.log('🔄 Checking participants for display name updates:', participants.map(p => ({
      uid: p.uid,
      currentDisplayName: p.displayName,
      hasCachedName: !!displayNames[p.uid],
      cachedName: displayNames[p.uid]
    })));
    
    // Check if any participants need display name updates
    const needsUpdate = participants.some(participant => 
      displayNames[participant.uid] && 
      displayNames[participant.uid] !== participant.displayName
    );
    
    if (!needsUpdate) {
      console.log('🔄 No participants need display name updates');
      return;
    }
    
    console.log('🔄 Updating participants with cached display names');
    
    const updatedParticipants = participants.map(participant => {
      const cachedName = displayNames[participant.uid];
      const newDisplayName = cachedName || participant.displayName || participant.name || `User ${participant.uid?.slice(-4)}` || 'Unknown User';
      
      console.log(`👤 Updating participant ${participant.uid}: "${participant.displayName}" -> "${newDisplayName}"`);
      
      return {
        ...participant,
        displayName: newDisplayName
      };
    });
    
    setParticipants(updatedParticipants);
  }, [displayNames]); // Remove participants from dependencies to prevent infinite loop

<<<<<<< HEAD
  // Recalculate route when user location changes (for real-time updates)
  useEffect(() => {
    if (location && calculatedRoute && participants.length > 0) {
      // Only recalculate if we're actively tracking and the location has changed significantly
      const shouldRecalculate = isTracking && location.accuracy < 50; // Only if accurate location
      
      if (shouldRecalculate) {
      // Debounce route recalculation to avoid too frequent updates
      const timeoutId = setTimeout(() => {
          // Only recalculate if we're still tracking and have a valid route
          if (isTracking && calculatedRoute) {
        calculateRoute();
          }
        }, 10000); // Recalculate every 10 seconds when location changes (increased from 5s)

      return () => clearTimeout(timeoutId);
    }
    }
  }, [location?.latitude, location?.longitude, isTracking]); // More specific dependencies

  // Location tracking effect
  useEffect(() => {
    if (!ride || !user) {
      if (isTracking) {
        console.log('Stopping location tracking - no ride or user');
      stopTracking();
      }
      setLocationTrackingInitialized(false);
      return;
    }

    const isDriver = ride.driver?.uid === user.uid;

    // Only initialize once per ride/user combination
    if (!locationTrackingInitialized) {
    if (isDriver && !isTracking) {
      console.log('Starting location tracking for driver:', user.uid);
      startTracking(user.uid, { 
        context: LOCATION_CONTEXTS.DRIVER_MODE 
      }).catch(error => {
        console.error('Error starting location tracking:', error);
        setLocationError('Failed to start location tracking');
=======
  // Effect to fetch real-time locations for all participants
  useEffect(() => {
    if (!participants.length || !user?.uid) return;

    console.log('📍 Setting up real-time location tracking for participants:', participants.map(p => ({
      uid: p.uid,
      displayName: p.displayName,
      hasLocation: !!(p.location && p.location.lat && p.location.lng)
    })));

    const locationUnsubscribers = [];

    participants.forEach(async (participant) => {
      if (participant.uid === user.uid) {
        // Skip current user - they're handled by useLocation hook
        return;
      }

      // Special handling for driver - also check if they're actively tracking
      if (participant.role === 'driver' && !participant.location) {
        console.log('📍 Driver has no location, checking if they should be actively tracking...');
        // If this is the current user and they're the driver, their location will come from useLocation hook
        if (participant.uid === user.uid && location) {
          console.log('📍 Current user is driver, using active location tracking');
          return;
        }
      }

      try {
        // Subscribe to user's location updates from their profile
        const userProfileRef = doc(db, 'users', participant.uid);
        const unsubscribe = onSnapshot(userProfileRef, (doc) => {
          if (doc.exists()) {
            const userData = doc.data();
            const currentLocation = userData.currentLocation;
            
            if (currentLocation && currentLocation.lat && currentLocation.lng) {
              console.log('📍 Received location update for participant:', {
                uid: participant.uid,
                displayName: participant.displayName,
                location: currentLocation
              });

              // Update participant's location in state
              setParticipants(prev => prev.map(p => 
                p.uid === participant.uid 
                  ? { ...p, location: currentLocation }
                  : p
              ));
            }
          }
        }, (error) => {
          // Handle permission errors gracefully
          if (error.code === 'permission-denied') {
            console.log('📍 Permission denied for participant location:', participant.uid, '- this is expected for non-friends');
            // Don't treat this as an error - it's expected behavior
            return;
          } else if (error.code === 'not-found') {
            console.log('📍 User profile not found for participant:', participant.uid, '- this is expected for new users');
            return;
          } else {
            console.warn('📍 Error fetching participant location:', participant.uid, error);
          }
        });

        locationUnsubscribers.push(unsubscribe);
      } catch (error) {
        console.warn('📍 Failed to set up location tracking for participant:', participant.uid, error);
      }
    });

    // Cleanup function
    return () => {
      locationUnsubscribers.forEach(unsub => unsub());
    };
  }, [participants, user?.uid]);

  // Effect to update driver location when current user location changes (if they're the driver)
  useEffect(() => {
    if (!participants.length || !location || !ride?.driver?.uid || ride.driver.uid !== user?.uid) return;

    console.log('📍 Current user is driver, updating driver location in participants');
    
    const updatedParticipants = participants.map(participant => {
      if (participant.uid === user.uid && participant.role === 'driver') {
        return {
          ...participant,
          location: { lat: location.latitude, lng: location.longitude }
        };
      }
      return participant;
    });
    
    setParticipants(updatedParticipants);
  }, [location?.latitude, location?.longitude, participants, ride?.driver?.uid, user?.uid]);



  // Handle location consent change (memoized to prevent excessive re-renders)
  const handleLocationConsentChange = useCallback(async (newConsent) => {
    try {
      console.log('📍 Location consent updated:', newConsent);
      
      // Set optimistic UI state immediately for instant feedback
      setOptimisticConsent(newConsent);
      
      if (!user?.uid || !rideId) {
        console.error('Missing user ID or ride ID for consent change');
        return;
      }

      // Update Firestore with new consent
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, {
        [`participants.${user.uid}.live_location_consent`]: newConsent,
        [`participants.${user.uid}.locationSharing`]: newConsent !== 'never', // Backward compatibility
        [`participants.${user.uid}.live_sharing_active`]: false, // Reset active state
        [`participants.${user.uid}.sharing_activated_at`]: null
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
      });
      
      console.log('📍 LiveRideView: Firestore update successful for consent:', newConsent);
      
      // Clear optimistic state after successful Firestore update
      // The real-time listener will take over from here
      setTimeout(() => {
        // Only clear optimistic state if Firestore has updated
        if (currentUserParticipant?.live_location_consent === newConsent) {
          setOptimisticConsent(null);
          console.log('📍 LiveRideView: Cleared optimistic consent, Firestore listener confirmed update');
        } else {
          console.log('📍 LiveRideView: Keeping optimistic consent, Firestore listener not yet updated');
          // Try again in another second
          setTimeout(() => {
            if (currentUserParticipant?.live_location_consent === newConsent) {
              setOptimisticConsent(null);
              console.log('📍 LiveRideView: Cleared optimistic consent on retry');
            } else {
              console.warn('📍 LiveRideView: Firestore listener may not be working, keeping optimistic state');
            }
          }, 2000);
        }
      }, 2000); // Increased from 1 second to 2 seconds

      // Handle immediate activation if needed
      if (newConsent === 'during_ride' && ride?.status === 'active') {
        await activateLocationSharing();
      } else if (newConsent === 'never') {
        await deactivateLocationSharing();
      }
      
    } catch (error) {
      console.error('❌ Error updating location consent:', error);
      // Clear optimistic state on error to revert UI
      setOptimisticConsent(null);
      console.log('📍 LiveRideView: Cleared optimistic consent due to error');
    }
  }, [user?.uid, rideId, ride?.status]);

  // Activate location sharing
  const activateLocationSharing = async () => {
    try {
      if (!user?.uid || !rideId) return;
      
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, {
        [`participants.${user.uid}.live_sharing_active`]: true,
        [`participants.${user.uid}.sharing_activated_at`]: serverTimestamp()
      });
      
    } catch (error) {
      console.error('❌ Error activating location sharing:', error);
    }
  };

  // Deactivate location sharing
  const deactivateLocationSharing = async () => {
    try {
      if (!user?.uid || !rideId) return;
      
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, {
        [`participants.${user.uid}.live_sharing_active`]: false,
        [`participants.${user.uid}.sharing_activated_at`]: null
      });
      
    } catch (error) {
      console.error('❌ Error deactivating location sharing:', error);
    }
  };

  // Get current user's participant data (memoized to prevent excessive re-renders)
  const currentUserParticipant = useMemo(() => {
    const participant = participants.find(p => p.uid === user?.uid);
    console.log('📍 LiveRideView: currentUserParticipant recalculated:', {
      participant,
      participants: participants.map(p => ({ uid: p.uid, live_location_consent: p.live_location_consent })),
      userId: user?.uid,
      timestamp: new Date().toISOString()
    });
    return participant;
  }, [participants, user?.uid]);
  
  // Get driver data for proximity detection (memoized)
  const driver = useMemo(() => 
    participants.find(p => p.role === 'driver' || p.uid === ride?.driver?.uid),
    [participants, ride?.driver?.uid]
  );
  
  // Memoize the current consent value to prevent unnecessary re-renders
  const currentConsent = useMemo(() => {
    // Use optimistic consent if available, otherwise fall back to Firestore data
    const consent = optimisticConsent || currentUserParticipant?.live_location_consent || 'during_ride';
    console.log('📍 LiveRideView: currentConsent recalculated:', {
      consent,
      optimisticConsent,
      firestoreConsent: currentUserParticipant?.live_location_consent,
      participantData: currentUserParticipant,
      userId: user?.uid,
      timestamp: new Date().toISOString(),
      usingOptimistic: !!optimisticConsent
    });
    return consent;
  }, [optimisticConsent, currentUserParticipant?.live_location_consent, currentUserParticipant, user?.uid]);

  // Proximity detection for "on_pickup" consent
  const { isWithinProximity, distance, proximityPercentage } = useProximityDetection(
    driver?.location || driver?.currentLocation,
    currentUserParticipant?.pickupLocation,
    100 // 100 meters threshold
  );

  // Only enable location tracking if user has consented
  const shouldTrackLocation = useMemo(() => {
    // "never" - never track
    if (currentConsent === 'never') {
      return false;
    }
    
    // "during_ride" - always track if ride is active
    if (currentConsent === 'during_ride' && ride?.status === 'active') {
      return true;
    }
    
    // "on_pickup" - only track if driver is within proximity
    if (currentConsent === 'on_pickup') {
      return isWithinProximity && ride?.status === 'active';
    }
    
    // Default: don't track
    return false;
  }, [currentConsent, ride?.status, isWithinProximity]);

  // Control location tracking based on consent
  useEffect(() => {
    if (shouldTrackLocation) {
      if (!isTracking) {
        startTracking();
      }
    } else {
      if (isTracking) {
        stopTracking();
      }
    }
  }, [shouldTrackLocation, isTracking, startTracking, stopTracking]);

  // Auto-clear optimistic state when Firestore data matches
  useEffect(() => {
    if (optimisticConsent && currentUserParticipant?.live_location_consent === optimisticConsent) {
      console.log('📍 LiveRideView: Auto-clearing optimistic consent, Firestore data confirmed');
      setOptimisticConsent(null);
    }
  }, [optimisticConsent, currentUserParticipant?.live_location_consent]);

  // Handle automatic location sharing activation for "on_pickup" consent
  useEffect(() => {
    if (currentConsent === 'on_pickup' && isWithinProximity && ride?.status === 'active') {
      console.log('📍 LiveRideView: Driver within proximity, activating location sharing for pickup');
      activateLocationSharing();
    }
  }, [currentConsent, isWithinProximity, ride?.status]);

  // Automatic location sharing activation based on consent (with debouncing)
  useEffect(() => {
    if (!currentUserParticipant || !user?.uid) return;

    const consent = currentUserParticipant.live_location_consent;
    const isSharingActive = currentUserParticipant.live_sharing_active;

    // Debounce the effect to prevent excessive logging
    const timeoutId = setTimeout(() => {
      // Only log when there's a meaningful change, not on every render
      const shouldLog = consent !== 'never' && (isWithinProximity || ride?.status === 'active');
      if (shouldLog) {
        console.log('🔄 Location sharing check:', {
          consent,
          isSharingActive,
          isWithinProximity,
          distance: distance ? `${distance.toFixed(0)}m` : 'unknown',
          rideStatus: ride?.status
        });
      }

      // Handle "on_pickup" consent
      if (consent === 'on_pickup' && isWithinProximity && !isSharingActive) {
        console.log('🚗 Activating location sharing - driver within pickup range');
        activateLocationSharing();
      }

      // Handle "during_ride" consent
      if (consent === 'during_ride' && ride?.status === 'active' && !isSharingActive) {
        console.log('🚗 Activating location sharing - ride active');
        activateLocationSharing();
      }

      // Handle "never" consent - deactivate if currently active
      if (consent === 'never' && isSharingActive) {
        console.log('🚫 Deactivating location sharing - set to never');
        deactivateLocationSharing();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);

  }, [
    currentUserParticipant?.live_location_consent,
    currentUserParticipant?.live_sharing_active,
    isWithinProximity,
    ride?.status,
    user?.uid
  ]);



  // Load location permission status
  useEffect(() => {
    const loadPermissionStatus = async () => {
      if (user?.uid) {
        try {
          const status = await locationPermissionManager.getPermissionStatus(user.uid);
          setLocationPermissionStatus(status);
        } catch (error) {
          console.error('Error loading permission status:', error);
        }
      }
    };

    loadPermissionStatus();
  }, [user?.uid]);

  // Reset location tracking initialization when ride changes
  useEffect(() => {
    setLocationTrackingInitialized(false);
  }, [rideId]);

  // Recalculate route when invitations change (RSVP responses)
  useEffect(() => {
    if (!ride || !ride.invitations || !ride.destination?.location) return;
    
    // Check if any invitations have location data from RSVP responses
    const hasInvitationsWithLocations = Object.values(ride.invitations).some(inv => 
      inv.response && inv.response.location && inv.response.location.lat && inv.response.location.lng
    );
    
    if (hasInvitationsWithLocations) {
      console.log('🔄 Invitations with locations detected, triggering route recalculation');
      setTimeout(() => {
        // Ensure ride state is still available before calculating route
        if (ride) {
        }
      }, 1000);
    }
  }, [ride?.invitations, ride?.destination?.location]);

  // Get current user's RSVP status
  const getCurrentUserRSVPStatus = () => {
    if (!user || !ride || !ride.invitations) return null;
    return ride.invitations[user.uid];
  };

  // Handle RSVP submission
  const handleRSVPSubmit = async (rsvpData) => {
    if (!ride || !user) return;

    console.log('LiveRideView - RSVP Submit received:', rsvpData);
    console.log('LiveRideView - RSVP Data details:', {
      status: rsvpData.status,
      role: rsvpData.role,
      seatCapacity: rsvpData.seatCapacity,
      location: rsvpData.location,
      pickupLocation: rsvpData.pickupLocation
    });

    setIsSubmittingRSVP(true);
    try {
      const rideRef = doc(db, 'rides', rideId);
      const currentRSVP = getCurrentUserRSVPStatus();
      
<<<<<<< HEAD
      // Update the invitation status
      await updateDoc(rideRef, {
        [`invitations.${user.uid}.status`]: rsvpData.status,
        [`invitations.${user.uid}.respondedAt`]: serverTimestamp(),
        [`invitations.${user.uid}.response`]: rsvpData
      });

=======
      // Validate and clean data before saving
      let cleanedRsvpData = { ...rsvpData };
      
      // Clean location data
      if (cleanedRsvpData.location) {
        if (cleanedRsvpData.location.lng === undefined || 
            cleanedRsvpData.location.lat === undefined ||
            cleanedRsvpData.location.lng === null || 
            cleanedRsvpData.location.lat === null) {
          console.warn('Invalid location data detected, removing location from RSVP data:', cleanedRsvpData.location);
          delete cleanedRsvpData.location;
        }
      }
      
      // Clean seatCapacity data - remove undefined/null values
      if (cleanedRsvpData.seatCapacity === undefined || cleanedRsvpData.seatCapacity === null) {
        delete cleanedRsvpData.seatCapacity;
      }
      
      // Clean other potentially undefined fields
      Object.keys(cleanedRsvpData).forEach(key => {
        if (cleanedRsvpData[key] === undefined) {
          delete cleanedRsvpData[key];
        }
      });
      
      console.log('LiveRideView - Cleaned RSVP data:', cleanedRsvpData);
      
      // Update the invitation status and participants
      const updateData = {
        [`invitations.${user.uid}.status`]: cleanedRsvpData.status,
        [`invitations.${user.uid}.respondedAt`]: serverTimestamp(),
        [`invitations.${user.uid}.response`]: cleanedRsvpData
      };
      
      // If accepted, also add to participants field
      if (cleanedRsvpData.status === 'accepted') {
        const participantData = {
          role: cleanedRsvpData.role || 'passenger',
          status: 'accepted',
          joinedAt: serverTimestamp(),
          pickupLocation: cleanedRsvpData.pickupLocation || null,
          readyTime: cleanedRsvpData.readyTime || null,
          locationSharing: cleanedRsvpData.locationSharing || false
        };
        
        console.log('🔧 RSVP participant data:', {
          uid: user.uid,
          role: participantData.role,
          status: participantData.status,
          seatCapacity: cleanedRsvpData.seatCapacity
        });
        
        // Only add seatCapacity if it's defined and not null (but allow 0)
        if (cleanedRsvpData.seatCapacity !== undefined && cleanedRsvpData.seatCapacity !== null) {
          participantData.seatCapacity = cleanedRsvpData.seatCapacity;
          console.log('🔢 Setting seat capacity from RSVP:', {
            uid: user.uid,
            role: cleanedRsvpData.role,
            seatCapacity: cleanedRsvpData.seatCapacity,
            isZero: cleanedRsvpData.seatCapacity === 0
          });
        } else if (cleanedRsvpData.role === 'driver') {
          participantData.seatCapacity = 4; // Default seat capacity for drivers
          console.log('🔢 Using default seat capacity for driver:', {
            uid: user.uid,
            role: cleanedRsvpData.role,
            defaultSeatCapacity: 4
          });
        }
        
        updateData[`participants.${user.uid}`] = participantData;
        
        // If the user is RSVPing as a driver, also update the ride.driver field
        if (cleanedRsvpData.role === 'driver') {
          console.log('🔧 Updating ride.driver field for RSVP driver:', {
            uid: user.uid,
            displayName: user.displayName,
            seatCapacity: cleanedRsvpData.seatCapacity
          });
          
          updateData.driver = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            role: 'driver',
            seatCapacity: cleanedRsvpData.seatCapacity,
            pickupLocation: cleanedRsvpData.pickupLocation,
            readyTime: cleanedRsvpData.readyTime,
            locationSharing: cleanedRsvpData.locationSharing,
            notes: cleanedRsvpData.notes,
            joinedAt: serverTimestamp()
          };
        }
      }
      
      await updateDoc(rideRef, updateData);

      // Immediately update the participants array with the new RSVP data
      if (cleanedRsvpData.status === 'accepted') {
        console.log('🗺️ Immediately updating participants with new RSVP data:', {
          uid: user.uid,
          displayName: user.displayName,
          role: cleanedRsvpData.role,
          location: cleanedRsvpData.location,
          pickupLocation: cleanedRsvpData.pickupLocation,
          seatCapacity: cleanedRsvpData.seatCapacity
        });
        
        setParticipants(prev => {
          const existingIndex = prev.findIndex(p => p.uid === user.uid);
          const newParticipant = {
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL,
            email: user.email,
            role: cleanedRsvpData.role || 'passenger',
            invitationStatus: 'accepted',
            location: cleanedRsvpData.location,
            pickupLocation: cleanedRsvpData.pickupLocation,
            readyTime: cleanedRsvpData.readyTime,
            locationSharing: cleanedRsvpData.locationSharing,
            notes: cleanedRsvpData.notes,
            seatCapacity: cleanedRsvpData.seatCapacity !== undefined && cleanedRsvpData.seatCapacity !== null 
              ? cleanedRsvpData.seatCapacity 
              : (cleanedRsvpData.role === 'driver' ? 4 : null),
            isCreator: ride.createdBy === user.uid,
            color: '#607D8B'
          };
          
          if (existingIndex >= 0) {
            // Update existing participant
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...newParticipant };
            console.log('🗺️ Updated existing participant in array:', updated[existingIndex]);
            return updated;
          } else {
            // Add new participant
            console.log('🗺️ Added new participant to array:', newParticipant);
            return [...prev, newParticipant];
          }
        });
      } else if (cleanedRsvpData.status === 'declined' || cleanedRsvpData.status === 'maybe') {
        // Remove participant if they declined or are maybe
        setParticipants(prev => {
          const filtered = prev.filter(p => p.uid !== user.uid);
          console.log('🗺️ Removed participant from array:', user.uid);
          return filtered;
        });
      }

>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
      // Handle participant management based on status change
      if (rsvpData.status === 'accepted') {
        const userData = {
          uid: user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email,
          role: rsvpData.role || 'passenger',
          pickupLocation: rsvpData.pickupLocation,
          readyTime: rsvpData.readyTime,
          locationSharing: rsvpData.locationSharing,
          notes: rsvpData.notes,
          joinedAt: new Date()
        };

        if (rsvpData.location) {
          userData.location = {
            lat: rsvpData.location.lat,
            lng: rsvpData.location.lng,
            address: rsvpData.location.address || rsvpData.pickupLocation,
            lastUpdated: new Date()
          };
        }

<<<<<<< HEAD
        if (rsvpData.role === 'driver') {
          await updateDoc(rideRef, {
            driver: userData
          });
=======
        if (cleanedRsvpData.role === 'driver') {
          // Driver data is already updated in the main updateData above
          console.log('🔧 Driver data already updated in main updateData');
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        } else {
          const existingPassengers = ride.passengers || [];
          const existingPassengerUids = ride.passengerUids || [];
          const isAlreadyPassenger = existingPassengers.some(p => p.uid === user.uid);
          
          if (!isAlreadyPassenger) {
            await updateDoc(rideRef, {
              passengers: [...existingPassengers, userData],
              passengerUids: [...existingPassengerUids, user.uid]
            });
          } else {
            const updatedPassengers = existingPassengers.map(p => {
              if (p.uid === user.uid) {
                const updatedUserData = {
                  ...p,
                  pickupLocation: userData.pickupLocation,
                  readyTime: userData.readyTime,
                  locationSharing: userData.locationSharing,
                  notes: userData.notes
                };
                
                if (rsvpData.location) {
                  updatedUserData.location = {
                    lat: rsvpData.location.lat,
                    lng: rsvpData.location.lng,
                    address: rsvpData.location.address || rsvpData.pickupLocation,
                    lastUpdated: new Date()
                  };
                }
                
                return updatedUserData;
              }
              return p;
            });
            
            await updateDoc(rideRef, {
              passengers: updatedPassengers
            });
          }
        }
      } else if (currentRSVP?.status === 'accepted' && rsvpData.status !== 'accepted') {
        // User is changing from accepted to declined/maybe - remove from participants
        if (ride.driver?.uid === user.uid) {
          await updateDoc(rideRef, {
            driver: null
          });
        } else {
          const updatedPassengers = (ride.passengers || []).filter(p => p.uid !== user.uid);
          const updatedPassengerUids = (ride.passengerUids || []).filter(uid => uid !== user.uid);
          
          await updateDoc(rideRef, {
            passengers: updatedPassengers,
            passengerUids: updatedPassengerUids
          });
        }
      } else if (rsvpData.status === 'declined' || rsvpData.status === 'maybe') {
        // User is declining or saying maybe - ensure they're not in participants
        if (ride.driver?.uid === user.uid) {
          await updateDoc(rideRef, {
            driver: null
          });
        } else {
          const updatedPassengers = (ride.passengers || []).filter(p => p.uid !== user.uid);
          const updatedPassengerUids = (ride.passengerUids || []).filter(uid => uid !== user.uid);
          
          await updateDoc(rideRef, {
            passengers: updatedPassengers,
            passengerUids: updatedPassengerUids
          });
        }
      }

      setShowInvitationModal(false);
      setUserInvitation(null);
      setIsManuallyOpened(false);
      
      // Trigger route recalculation after RSVP status change
      console.log('🔄 RSVP status changed, triggering route recalculation');
      setTimeout(() => {
      }, 2000); // Give time for Firestore to update
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      alert('Failed to submit RSVP. Please try again.');
    } finally {
      setIsSubmittingRSVP(false);
    }
  };

  // Handle leaving ride
  const handleLeaveRide = async () => {
    if (!ride || !user) return;
    
    const isDriver = ride.driver?.uid === user.uid;
    const hasInvitation = ride.invitations?.[user.uid];
    
    if (window.confirm('Are you sure you want to leave this ride?')) {
      try {
        if (isDriver) {
          console.log('Stopping location tracking for driver...');
          stopTracking();
        }

        const rideRef = doc(db, 'rides', rideId);
        
        if (hasInvitation) {
          await updateDoc(rideRef, {
            [`invitations.${user.uid}.status`]: 'declined',
            [`invitations.${user.uid}.respondedAt`]: serverTimestamp(),
            [`invitations.${user.uid}.response`]: {
              status: 'declined',
              reason: 'User left the ride',
              leftAt: serverTimestamp()
            }
          });
        }

        if (isDriver) {
          await updateDoc(rideRef, {
            driver: null,
            status: RIDE_STATUS.CANCELLED
          });
          
          await rideStatusService.updateRideStatus(rideId, RIDE_STATUS.CANCELLED, user.uid, 'Driver left the ride');
        } else {
          const updatedPassengers = (ride.passengers || []).filter(p => p.uid !== user.uid);
          const updatedPassengerUids = (ride.passengerUids || []).filter(uid => uid !== user.uid);
          
          await updateDoc(rideRef, {
            passengers: updatedPassengers,
            passengerUids: updatedPassengerUids
          });
        }

<<<<<<< HEAD
        console.log('Ride left successfully, redirecting to dashboard...');
=======
        // Handle routing logic adjustments for active rides
        if (isActiveRide) {
          console.log('🗺️ Adjusting routing logic for active ride...');
          
          // If this was a driver leaving, we need to handle ride cancellation routing
          if (isDriver) {
            console.log('🗺️ Driver left - ride cancelled, no routing recalculation needed');
          } else {
            // If this was a passenger leaving, we might need to recalculate route
            // Check if there are still other passengers
            const remainingPassengers = (ride.passengers || []).filter(p => p.uid !== user.uid);
            
            if (remainingPassengers.length > 0 && ride.driver) {
              console.log('🗺️ Passenger left but others remain - triggering route recalculation');
              // Trigger route recalculation for remaining participants
        setTimeout(() => {
        }, 1000);
            } else {
              console.log('🗺️ No remaining passengers or no driver - no route recalculation needed');
            }
          }
        } else {
          console.log('🗺️ Inactive ride - no routing adjustments needed');
        }

        console.log('✅ Ride left successfully, redirecting to dashboard...');
        
        // Immediately stop listening to ride data to prevent permission errors
        setHasLeftRide(true);
        
        // Show success message before redirecting
        setSuccessMessage('You have successfully left the ride.');
        
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
        
      } catch (error) {
        console.error('Error leaving ride:', error);
        setError('Failed to leave ride. Please try again.');
      }
    }
  };

  // Handle description save
  const handleDescriptionSave = async () => {
    setSavingDescription(true);
    try {
      await updateDoc(doc(db, 'rides', rideId), { description });
      setEditingDescription(false);
    } catch (e) {
      setError('Failed to save description');
    } finally {
      setSavingDescription(false);
    }
  };

  // Handle title save
  const handleTitleSave = async () => {
    setSavingTitle(true);
    try {
      await updateDoc(doc(db, 'rides', rideId), { 
        groupName: title,
        name: title 
      });
      setEditingTitle(false);
    } catch (e) {
      setError('Failed to save title');
    } finally {
      setSavingTitle(false);
    }
  };

  // Handle map full screen toggle
  const handleMapFullScreenToggle = () => {
    setIsMapFullScreen(!isMapFullScreen);
  };

  // Handle map modal close
  const handleMapModalClose = () => {
    setIsMapModalOpen(false);
    setIsMapFullScreen(false); // Reset full screen when closing
<<<<<<< HEAD
  };
=======
    setIsDriveMode(false); // Exit drive mode when closing modal
  };
  
  // Handle compass permission and tracking
  const handleCompassPermission = async () => {
    try {
      if ('DeviceOrientationEvent' in window) {
        // Request permission for iOS 13+
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await DeviceOrientationEvent.requestPermission();
          return permission === 'granted';
        }
        return true; // Permission not required
      }
      return false; // Not supported
    } catch (error) {
      console.error('Error requesting compass permission:', error);
      return false;
    }
  };

  const startCompassTracking = () => {
    if (window._compassHandler) return; // Already tracking
    
    window._compassHandler = (event) => {
      if (event.alpha !== null) {
        setUserHeading(event.alpha);
      }
    };
    
    window.addEventListener('deviceorientation', window._compassHandler);
  };

  const stopCompassTracking = () => {
    if (window._compassHandler) {
      window.removeEventListener('deviceorientation', window._compassHandler);
      delete window._compassHandler;
    }
  };

  // Handle drive mode functions
  const handleEnterDriveMode = async () => {
    if (!calculatedRoute) {
      console.log('⚠️ No route available for drive mode');
      return;
    }
    
    // Request compass permission and start tracking
    const compassPermission = await handleCompassPermission();
    if (compassPermission) {
      startCompassTracking();
    }
    
    setIsDriveMode(true);
    setIsMapFullScreen(true);
    console.log('🚗 Entering drive mode');
  };
  
  const handleExitDriveMode = () => {
    setIsDriveMode(false);
    setNavigationInstructions([]);
    setCurrentInstruction(null);
    setNextTurn(null);
    
    // Stop compass tracking when exiting drive mode
    stopCompassTracking();
    
    console.log('🚗 Exiting drive mode');
  };
  
  const handleToggleVoice = () => {
    setIsVoiceEnabled(!isVoiceEnabled);
    if (isVoiceEnabled) {
      // Stop any ongoing speech
      window.speechSynthesis?.cancel();
    }
    console.log('🔊 Voice navigation:', isVoiceEnabled ? 'disabled' : 'enabled');
  };
  
  
  const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => deg * Math.PI / 180;
    const toDeg = (rad) => rad * 180 / Math.PI;
    
    const dLon = toRad(lon2 - lon1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    return toDeg(Math.atan2(y, x));
  };
  
  const getTurnType = (bearing) => {
    if (bearing >= -22.5 && bearing <= 22.5) return 'Continue straight';
    if (bearing > 22.5 && bearing <= 67.5) return 'Turn slightly right';
    if (bearing > 67.5 && bearing <= 112.5) return 'Turn right';
    if (bearing > 112.5 && bearing <= 157.5) return 'Turn sharply right';
    if (bearing > 157.5 || bearing < -157.5) return 'U-turn';
    if (bearing >= -157.5 && bearing < -112.5) return 'Turn sharply left';
    if (bearing >= -112.5 && bearing < -67.5) return 'Turn left';
    if (bearing >= -67.5 && bearing < -22.5) return 'Turn slightly left';
    return 'Continue';
  };
  
  const calculateDistanceBetweenPoints = (point1, point2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (point2[1] - point1[1]) * Math.PI / 180;
    const dLon = (point2[0] - point1[0]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1[1] * Math.PI / 180) * Math.cos(point2[1] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  
  const getStreetName = (coordinates) => {
    // This would ideally use reverse geocoding to get street names
    // For now, return a generic location
    return 'intersection';
  };
  
  const speakInstruction = (instruction) => {
    if (!isVoiceEnabled || !window.speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(instruction.instruction);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    window.speechSynthesis.speak(utterance);
  };
  
  // Check ride expiration when ride data loads
  useEffect(() => {
    if (ride) {
      const expired = checkRideExpiration(ride);
      if (expired) {
        console.log('🚗 Ride has expired, disabling location tracking and route updates');
      }
    }
  }, [ride]);

  // Check if ride has expired
  const checkRideExpiration = useCallback((rideData) => {
    if (!rideData || !rideData.createdAt) return false;
    
    const now = new Date();
    const createdAt = rideData.createdAt.toDate ? rideData.createdAt.toDate() : new Date(rideData.createdAt);
    const expirationTime = new Date(createdAt.getTime() + (RIDE_EXPIRATION_HOURS * 60 * 60 * 1000));
    
    const isExpired = now > expirationTime;
    
    if (isExpired && !isRideExpired) {
      setIsRideExpired(true);
      setRideExpirationTime(expirationTime);
    }
    
    return isExpired;
  }, [isRideExpired, RIDE_EXPIRATION_HOURS]);

  // Handle location toggle change
  const handleLocationToggleChange = useCallback(async (newConsent) => {
    try {
      console.log('📍 Location consent updated:', newConsent);
      
      // Update optimistic state immediately
      setOptimisticConsent(newConsent);
      
      // Update Firestore
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, {
        [`participants.${user.uid}.live_location_consent`]: newConsent,
        [`participants.${user.uid}.locationSharing`]: newConsent !== 'never', // Backward compatibility
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ Location consent updated in Firestore');
    } catch (error) {
      console.error('❌ Error updating location consent:', error);
      // Revert optimistic state on error
      setOptimisticConsent(null);
    }
  }, [rideId, user?.uid]);
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

  // Get map rotation for drive mode
  const getMapRotation = useCallback(() => {
    if (!isDriveMode || !location) return 0;
    
    // Simple rotation based on user's heading if available
    if (location.heading !== undefined) {
      return location.heading;
    }
<<<<<<< HEAD
  }, [location, isMapFullScreen, isRideExpired]);
=======
    
    return 0;
  }, [isDriveMode, location]);
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

  // Check ride expiration when ride data loads
  useEffect(() => {
    if (ride) {
      const expired = checkRideExpiration(ride);
      if (expired) {
        console.log('🚗 Ride has expired, disabling location tracking and route updates');
      }
    }
  }, [ride, checkRideExpiration]);

  // Trigger route calculation when ride and participants are ready
  useEffect(() => {
    console.log('🔄 Route calculation useEffect triggered:', {
      hasRide: !!ride,
      participantsCount: participants.length,
      isRideExpired,
      hasCalculatedRoute: !!calculatedRoute,
      shouldCalculate: ride && participants.length > 0 && !isRideExpired && !calculatedRoute
    });
    
    if (ride && participants.length > 0 && !isRideExpired && !calculatedRoute) {
      console.log('🔄 Triggering initial route calculation');
      calculateRoute();
    } else {
      console.log('🔄 Route calculation conditions not met, skipping');
    }
  }, [ride, participants, isRideExpired, calculatedRoute]);

  // Recalculate route when avoid tolls setting changes
  useEffect(() => {
    if (calculatedRoute && !isCalculatingRoute) {
      console.log('🔄 Avoid tolls setting changed, recalculating route:', { tollsEnabled });
      calculateRoute();
    }
  }, [tollsEnabled]);

  // Parse route steps and extract turn-by-turn instructions
  const parseRouteSteps = useCallback(() => {
    if (!calculatedRoute || !calculatedRoute.legs) {
      console.log('🔍 No route legs found for turn-by-turn parsing');
      return;
    }

    try {
      // Use the existing extractTurnByTurnInstructions function
      const instructions = extractTurnByTurnInstructions(calculatedRoute);
      
      console.log('🗺️ Parsed turn-by-turn instructions:', {
        totalSteps: instructions.length,
        firstFewSteps: instructions.slice(0, 3).map(step => ({
          instruction: step.instruction,
          distance: step.distance,
          type: step.type
        }))
      });

      setNavigationSteps(instructions);
      setCurrentStepIndex(0); // Reset to first step
      setIsNavigationActive(true);
      
    } catch (error) {
      console.error('❌ Error parsing route steps:', error);
      setNavigationSteps([]);
      setIsNavigationActive(false);
    }
  }, [calculatedRoute]);

  // Parse route steps when route is calculated
  useEffect(() => {
    if (calculatedRoute && calculatedRoute.legs && calculatedRoute.legs.length > 0) {
      console.log('🔄 Route calculated, parsing turn-by-turn steps...');
      parseRouteSteps();
    }
  }, [calculatedRoute, parseRouteSteps]);

  // Get current navigation instruction
  const getCurrentNavigationInstruction = useCallback(() => {
    if (!navigationSteps.length || currentStepIndex >= navigationSteps.length) {
      return null;
    }
    
    const currentStep = navigationSteps[currentStepIndex];
    const nextStep = navigationSteps[currentStepIndex + 1];
    
    return {
      current: currentStep,
      next: nextStep,
      progress: {
        current: currentStepIndex + 1,
        total: navigationSteps.length,
        percentage: Math.round(((currentStepIndex + 1) / navigationSteps.length) * 100)
      }
    };
  }, [navigationSteps, currentStepIndex]);

  // Process route information for turn-by-turn directions
  const getRouteInformation = () => {
    if (!calculatedRoute) {
      return null;
    }

    // Handle legacy route format
    if (calculatedRoute.routes && calculatedRoute.routes.length > 0) {
    const route = calculatedRoute.routes[0];
    const waypoints = route.waypoints || [];
    
    if (waypoints.length === 0) return null;

    // Find current step based on location proximity
    let currentStep = currentRouteStep;
    if (currentLocation && waypoints.length > 0) {
      const distances = waypoints.map((wp, index) => {
        if (!wp.location || !currentLocation) return Infinity;
        const distance = Math.sqrt(
          Math.pow(wp.location.lat - currentLocation.latitude, 2) + 
          Math.pow(wp.location.lng - currentLocation.longitude, 2)
        );
        return { index, distance };
      });
      
      const closest = distances.reduce((min, curr) => curr.distance < min.distance ? curr : min);
      if (closest.distance < 0.01) { // Within ~1km
        currentStep = closest.index;
        setCurrentRouteStep(closest.index);
      }
    }

    const currentWaypoint = waypoints[currentStep];
    const nextWaypoint = waypoints[currentStep + 1];
    const totalSteps = waypoints.length;

    return {
      currentStep,
      totalSteps,
      currentWaypoint,
      nextWaypoint,
      waypoints,
        progress: ((currentStep + 1) / totalSteps) * 100,
        isOptimized: false,
        optimizationType: 'legacy'
    };
    }

    return null;
  };

  // Calculate optimized route based on participants and destination
  const calculateRoute = useCallback(async () => {
    console.log('🚗 Starting route calculation...');
    console.log('🚗 Current state:', {
      hasRide: !!ride,
      rideId: ride?.id,
      participantsCount: participants.length,
      isRideExpired,
      isCalculatingRoute,
      hasDestination: !!ride?.destination?.location
    });
    
    // Early return checks
    if (!ride) {
      console.log('🚗 No ride data available');
      return;
    }
    
    if (isRideExpired) {
      console.log('🚗 Ride has expired, skipping route calculation');
      return;
    }
    
    if (isCalculatingRoute) {
      console.log('🚗 Route calculation already in progress');
      return;
    }
    
    if (!ride.destination?.location) {
      console.log('🚗 No destination available');
      console.log('🚗 Destination data:', ride.destination);
      setRouteError('No destination set for this ride');
      return;
    }
    
    console.log('🚗 Destination found:', {
      name: ride.destination.name,
      location: ride.destination.location
    });
    
    // Set calculation state
    setIsCalculatingRoute(true);
    setRouteError(null);
    
    try {
      console.log('🚗 All participants:', participants.map(p => ({
        uid: p.uid,
        displayName: p.displayName,
        role: p.role,
        hasLocation: !!(p.location && p.location.lat && p.location.lng),
        hasPickupLocation: !!(p.pickupLocation && p.pickupLocation.lat && p.pickupLocation.lng),
        invitationStatus: p.invitationStatus,
        status: p.status,
        location: p.location,
        pickupLocation: p.pickupLocation
      })));
      
      // Get participants with locations
      const participantsWithLocations = participants.filter(p => {
        const hasLocation = (p.location && p.location.lat && p.location.lng) || 
                           (p.pickupLocation && p.pickupLocation.lat && p.pickupLocation.lng);
        const isAccepted = p.invitationStatus === 'accepted' || p.status === 'accepted';
        const isOriginalDriver = ride.driver?.uid === p.uid;
        
        console.log('🚗 Participant filter check:', {
          uid: p.uid,
          displayName: p.displayName,
          hasLocation,
          isAccepted,
          isOriginalDriver,
          willInclude: hasLocation && (isAccepted || isOriginalDriver)
        });
        
        return hasLocation && (isAccepted || isOriginalDriver);
      });
      
      console.log('🚗 Participants with locations:', participantsWithLocations.length);
      console.log('🚗 Participants with locations details:', participantsWithLocations.map(p => ({
        uid: p.uid,
        displayName: p.displayName,
        role: p.role,
        location: p.location,
        pickupLocation: p.pickupLocation
      })));
      
      if (participantsWithLocations.length === 0) {
        console.log('🚗 No participants with locations available');
        setRouteError('No participants with locations available');
        return;
      }
      
      // Separate drivers and passengers
      const drivers = participantsWithLocations.filter(p => 
        p.role === 'driver' || ride.driver?.uid === p.uid
      );
      
      const passengers = participantsWithLocations.filter(p => 
        p.role !== 'driver' && ride.driver?.uid !== p.uid
      );
      
      console.log('🚗 Drivers:', drivers.length, 'Passengers:', passengers.length);
      console.log('🚗 Drivers details:', drivers.map(d => ({
        uid: d.uid,
        displayName: d.displayName,
        role: d.role,
        location: d.location,
        pickupLocation: d.pickupLocation
      })));
      console.log('🚗 Passengers details:', passengers.map(p => ({
        uid: p.uid,
        displayName: p.displayName,
        role: p.role,
        location: p.location,
        pickupLocation: p.pickupLocation
      })));
      
      if (drivers.length === 0) {
        console.log('🚗 No drivers available');
        setRouteError('No drivers available for this ride');
        return;
      }
      
      // Create waypoints array
      const waypoints = [];
      
      // Add driver starting points
      drivers.forEach((driver, index) => {
        const location = driver.location || driver.pickupLocation;
        console.log(`🚗 Processing driver ${index + 1}:`, {
          uid: driver.uid,
          displayName: driver.displayName,
          location,
          hasValidLocation: !!(location && location.lat && location.lng)
        });
        
        if (location && location.lat && location.lng) {
          const waypoint = {
            location: { lat: location.lat, lng: location.lng },
            name: driver.displayName || driver.name || 'Driver',
            type: 'driver',
            uid: driver.uid
          };
          waypoints.push(waypoint);
          console.log(`🚗 Added driver waypoint:`, waypoint);
        } else {
          console.log(`🚗 Skipped driver ${driver.displayName} - no valid location`);
        }
      });
      
      // Add passenger pickup points
      passengers.forEach((passenger, index) => {
        const location = passenger.location || passenger.pickupLocation;
        console.log(`🚗 Processing passenger ${index + 1}:`, {
          uid: passenger.uid,
          displayName: passenger.displayName,
          location,
          hasValidLocation: !!(location && location.lat && location.lng)
        });
        
        if (location && location.lat && location.lng) {
          const waypoint = {
            location: { lat: location.lat, lng: location.lng },
            name: passenger.displayName || passenger.name || 'Passenger',
            type: 'pickup',
            uid: passenger.uid
          };
          waypoints.push(waypoint);
          console.log(`🚗 Added passenger waypoint:`, waypoint);
        } else {
          console.log(`🚗 Skipped passenger ${passenger.displayName} - no valid location`);
        }
      });
      
      // Add destination
      const destinationWaypoint = {
        location: ride.destination.location,
        name: ride.destination.name || 'Destination',
        type: 'destination'
      };
      waypoints.push(destinationWaypoint);
      console.log('🚗 Added destination waypoint:', destinationWaypoint);
      
      console.log('🚗 Final waypoints array:', waypoints);
      console.log('🚗 Waypoints count:', waypoints.length);
      
      if (waypoints.length < 2) {
        console.log('🚗 Not enough waypoints for route calculation');
        setRouteError('Not enough waypoints for route calculation');
        return;
      }
      
      // Calculate route using the location service
      console.log('🚗 Calling getMultiWaypointDirectionsWithFallback with:', {
        waypointLocations: waypoints.map(wp => wp.location),
        profile: ROUTING_PROFILES.DRIVING
      });
      
      const routeResult = await getMultiWaypointDirectionsWithFallback(
        waypoints.map(wp => wp.location),
        {
          profile: ROUTING_PROFILES.DRIVING,
          avoidTolls: !tollsEnabled
        }
      );
      
      console.log('🚗 Route calculation result:', routeResult);
      
      // Handle both array and object responses from Mapbox API
      const routeData = Array.isArray(routeResult) ? routeResult[0] : routeResult;
      console.log('🚗 Processed route data:', routeData);
      console.log('🚗 Raw route data values:', {
        distance: routeData?.distance,
        duration: routeData?.duration,
        distanceType: typeof routeData?.distance,
        durationType: typeof routeData?.duration
      });
      
      // Check if we have route data (either GeoJSON features or Mapbox Directions response)
      const hasGeoJSONFeatures = routeData && routeData.features && routeData.features.length > 0;
      const hasMapboxDirections = routeData && routeData.geometry && routeData.geometry.coordinates;
      
      if (hasGeoJSONFeatures || hasMapboxDirections) {
        let calculatedRouteData;
        
        if (hasGeoJSONFeatures) {
          // Handle GeoJSON format (existing logic)
          calculatedRouteData = {
            ...routeData,
            waypointInfo: waypoints.map((wp, index) => ({
              from: index === 0 ? 'Driver' : waypoints[index - 1].name,
              to: wp.name,
              fromLocation: index === 0 ? null : waypoints[index - 1].location,
              toLocation: wp.location,
              type: wp.type
            })),
            totalDistance: routeData.properties?.distance ? 
              routeData.properties.distance / 1609.34 : 0,
            totalDuration: routeData.properties?.duration ? 
              routeData.properties.duration / 60 : 0,
            optimizationType: 'multi-stop'
          };
        } else {
          // Handle Mapbox Directions API format - convert to GeoJSON
          console.log('🔄 Converting Mapbox Directions response to GeoJSON format');
          console.log('🔄 Route data structure:', {
            hasGeometry: !!routeData.geometry,
            geometryType: routeData.geometry?.type,
            coordinatesCount: routeData.geometry?.coordinates?.length || 0,
            distance: routeData.distance,
            duration: routeData.duration,
            distanceInMiles: routeData.distance ? (routeData.distance / 1609.34) : 0,
            durationInMinutes: routeData.duration
          });
          
          console.log('🔄 About to convert route data:', {
            rawDistance: routeData.features?.[0]?.properties?.distance,
            rawDuration: routeData.features?.[0]?.properties?.duration,
            convertedDistance: routeData.features?.[0]?.properties?.distance ? routeData.features[0].properties.distance / 1609.34 : 0,
            convertedDuration: routeData.features?.[0]?.properties?.duration ? routeData.features[0].properties.duration : 0
          });
          
          calculatedRouteData = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: routeData.geometry,
              properties: {
                distance: routeData.distance * 1609.34, // Convert miles to meters for consistency
                duration: routeData.duration * 60, // Convert minutes to seconds for consistency
                summary: routeData.summary || 'Multi-waypoint route'
              }
            }],
            // Preserve detailed route data for turn-by-turn navigation
            legs: routeData.legs || [],
            waypoints: routeData.waypoints || [],
            waypointInfo: waypoints.map((wp, index) => ({
              from: index === 0 ? 'Driver' : waypoints[index - 1].name,
              to: wp.name,
              fromLocation: index === 0 ? null : waypoints[index - 1].location,
              toLocation: wp.location,
              type: wp.type
            })),
            totalDistance: routeData.distance, // Keep in miles for backward compatibility
            totalDuration: routeData.duration, // Keep in minutes for backward compatibility
            optimizationType: 'multi-stop'
          };
        }
        
        console.log('✅ Route calculated successfully:', {
          distance: calculatedRouteData.totalDistance.toFixed(1) + ' miles',
          duration: calculatedRouteData.totalDuration.toFixed(1) + ' minutes',
          waypoints: calculatedRouteData.waypointInfo.length,
          routeType: calculatedRouteData.type,
          featuresCount: calculatedRouteData.features?.length || 0,
          firstFeatureGeometry: calculatedRouteData.features?.[0]?.geometry?.type,
          firstFeatureCoordinates: calculatedRouteData.features?.[0]?.geometry?.coordinates?.length || 0,
          legsCount: calculatedRouteData.legs?.length || 0,
          hasSteps: calculatedRouteData.legs?.[0]?.steps?.length > 0
        });
        
        setCalculatedRoute(calculatedRouteData);
        console.log('🚗 Route state updated successfully');
      } else {
        console.log('❌ Failed to calculate route - no valid route found');
        console.log('❌ Route result details:', {
          hasResult: !!routeResult,
          hasRouteData: !!routeData,
          hasGeoJSONFeatures: hasGeoJSONFeatures,
          hasMapboxDirections: hasMapboxDirections,
          featuresLength: routeData?.features?.length || 0,
          hasGeometry: !!(routeData && routeData.geometry),
          hasCoordinates: !!(routeData && routeData.geometry && routeData.geometry.coordinates),
          coordinatesLength: routeData?.geometry?.coordinates?.length || 0,
          routeResult: routeResult,
          routeData: routeData
        });
        setRouteError('Failed to calculate route - no valid route found');
      }
      
    } catch (error) {
      console.error('❌ Error calculating route:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setRouteError('Failed to calculate route: ' + error.message);
    } finally {
      console.log('🚗 Route calculation completed, setting isCalculatingRoute to false');
      setIsCalculatingRoute(false);
    }
  }, [ride, participants, isRideExpired, isCalculatingRoute]);

  // Handle passenger status updates
  const updatePassengerStatus = (passengerId, status) => {
    setPassengerStatus(prev => ({
      ...prev,
      [passengerId]: {
        ...prev[passengerId],
        status,
        timestamp: new Date().toISOString()
      }
    }));
  };

  // Get passenger information for current route step
  const getCurrentPassengerInfo = () => {
    const routeInfo = getRouteInformation();
    if (!routeInfo || !routeInfo.currentWaypoint) return null;

    const waypoint = routeInfo.currentWaypoint;
    if (waypoint.type === 'pickup' && waypoint.passengerId) {
      const passenger = participants.find(p => p.uid === waypoint.passengerId);
      return passenger ? {
        ...passenger,
        status: passengerStatus[waypoint.passengerId]?.status || 'pending'
      } : null;
    }
    return null;
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f5f3e7 0%, #e0c9b3 100%)' }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (error && !ride) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f5f3e7 0%, #e0c9b3 100%)' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!ride) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f5f3e7 0%, #e0c9b3 100%)' }}>
        <Alert severity="warning">Ride not found</Alert>
      </Box>
    );
  }

  // Vibe palette
  const vibe = getVibePalette(ride?.destination || null);
  
  // Check if user can edit ride details (all accepted participants can edit)
  const canEditRide = ride ? (
    ride.driver?.uid === user?.uid || 
    (ride.passengers && ride.passengers.some(p => p.uid === user?.uid)) ||
    (ride.invitations && ride.invitations[user?.uid]?.status === 'accepted')
  ) : false;

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      background: '#f8f9fa',
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative',
      overflow: 'auto'
    }}>
      {/* RSVP Modal */}
      {showInvitationModal && ride && user && ride.createdBy && (
        <RideInvitationModal
          isOpen={showInvitationModal}
          onClose={() => { setShowInvitationModal(false); setUserInvitation(null); }}
          ride={ride}
          inviter={{
            uid: ride.createdBy,
            displayName: displayNames[ride.createdBy] || ride.creatorName || 'Ride Creator',
            photoURL: ride.creatorPhotoURL || '/default-avatar.png'
          }}
          currentUserId={user.uid}
          onRSVPSubmit={handleRSVPSubmit}
        />
      )}

            {/* Main Content - Flowing Single Page Design */}
      <Box sx={{
        flex: 1,
        maxWidth: 800,
        mx: 'auto',
        width: '100%',
        px: { xs: 2, sm: 0 },
        background: '#fff',
        borderRadius: { xs: 0, sm: 2 },
        boxShadow: { xs: 'none', sm: '0 4px 12px rgba(0,0,0,0.1)' },
        overflow: 'visible',
        minHeight: '100vh',
        pb: { xs: 4, sm: 2 }
      }}>
        
        {/* Expiration Warning Banner */}
        {isRideExpired && (
          <Box sx={{
            background: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
            border: '1px solid #ef5350',
            borderRadius: { xs: 0, sm: 2 },
            p: 2,
            mb: 2,
            textAlign: 'center'
          }}>
            <Typography variant="body1" fontWeight={600} color="error" sx={{ mb: 0.5 }}>
              ⏰ Ride Expired
            </Typography>
            <Typography variant="body2" color="error">
              This ride has expired and is no longer active. Location tracking and route updates are disabled.
            </Typography>
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
              Performance optimized: API calls and location updates disabled
            </Typography>
          </Box>
        )}
        
        {/* 1. MAP DIV */}
          <Box sx={{
            width: '100%',
          height: { xs: 250, sm: 350 },
            position: 'relative',
          overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            '&:hover': {
            transform: 'scale(1.01)',
            boxShadow: '0 8px 25px rgba(0,0,0,0.15)'
            }
          }} onClick={() => setIsMapModalOpen(true)}>
<<<<<<< HEAD
              <MapView
=======
            {/* MapView participants data */}
            <MapView
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
                users={participants}
                destination={ride.destination?.location ? {
                  lat: ride.destination.location.lat,
                  lng: ride.destination.location.lng
                } : ride.destination}
                calculatedRoute={calculatedRoute}
                userLocation={location}
                isLiveRide={true}
                autoFit={true}
                compact={true}
            hideRouteInfo={true}
              />
            
          {/* Map Info Overlay */}
          <Box sx={{
              position: 'absolute',
            bottom: 0,
              left: 0,
              right: 0,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(10px)',
            p: 2,
            borderTop: '1px solid rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10,
            pointerEvents: 'none'
            }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Live Route Map • {participants.filter(p => p.invitationStatus === 'accepted' || p.status === 'accepted').length} participants
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Tap to view full screen
                </Typography>
            </Box>
          </Box>
              
        {/* 2. RIDE DETAILS DIV */}
        <Box sx={{
          p: { xs: 3, sm: 4 },
          pt: { xs: 4, sm: 5 },
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          mx: { xs: 2, sm: 3 },
          mb: 3
        }}>
          {/* Title */}
          <Box sx={{ 
            mb: 4,
            pb: 3,
            borderBottom: '2px solid rgba(0, 0, 0, 0.06)'
          }}>
              {canEditRide && editingTitle ? (
                <Box display="flex" alignItems="center" gap={1}>
                  <TextField
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    variant="outlined"
                    size="small"
                    sx={{ flex: 1 }}
                    autoFocus
                  />
                  <Button 
                    size="small" 
                    onClick={handleTitleSave}
                    variant="contained"
                    sx={{ background: vibe.accent }}
                  >
                    Save
                  </Button>
                  <Button 
                    size="small" 
                    onClick={() => { setEditingTitle(false); setEditingTitleValue(title); }}
                    variant="outlined"
                  >
                    Cancel
                  </Button>
                </Box>
              ) : (
                <Box display="flex" alignItems="center" gap={1}>
                <Typography 
                  variant="h4" 
                  fontWeight={700} 
                  color={vibe.text} 
                  sx={{ 
                    flex: 1, 
                    fontSize: { xs: '1.5rem', sm: '2rem' },
                    lineHeight: 1.2
                  }}
                >
                    {title || ride?.groupName || ride?.name || 'Untitled Ride'}
                  </Typography>
                  {canEditRide && (
                    <IconButton 
                      size="small" 
                      onClick={() => { setEditingTitle(true); setEditingTitleValue(title); }}
                      sx={{ color: vibe.accent }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              )}
            </Box>

<<<<<<< HEAD
            {/* Ride Details Grid */}
=======
          {/* Tab Navigation - Centered */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center',
            mb: 4 
          }}>
            <Box sx={{ 
              display: 'flex', 
              gap: 0,
              background: 'rgba(0, 0, 0, 0.04)',
              borderRadius: 3,
              p: 0.5,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}>
              <Button
                onClick={() => setActiveTab('ride-info')}
                variant={activeTab === 'ride-info' ? 'contained' : 'text'}
                sx={{
                  background: activeTab === 'ride-info' ? vibe.accent : 'transparent',
                  color: activeTab === 'ride-info' ? '#fff' : 'text.secondary',
                  borderRadius: 2,
                  fontWeight: 600,
                  px: 4,
                  py: 1.5,
                  textTransform: 'none',
                  minWidth: '120px',
                  boxShadow: activeTab === 'ride-info' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                  '&:hover': {
                    background: activeTab === 'ride-info' ? vibe.accent : 'rgba(0,0,0,0.08)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                Ride Info
              </Button>
              <Button
                onClick={() => setActiveTab('group-chat')}
                variant={activeTab === 'group-chat' ? 'contained' : 'text'}
                sx={{
                  background: activeTab === 'group-chat' ? vibe.accent : 'transparent',
                  color: activeTab === 'group-chat' ? '#fff' : 'text.secondary',
                  borderRadius: 2,
                  fontWeight: 600,
                  px: 4,
                  py: 1.5,
                  textTransform: 'none',
                  minWidth: '120px',
                  boxShadow: activeTab === 'group-chat' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                  '&:hover': {
                    background: activeTab === 'group-chat' ? vibe.accent : 'rgba(0,0,0,0.08)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                Group Chat
              </Button>
            </Box>
          </Box>

          {/* Tab Content */}
          {activeTab === 'ride-info' && (
            <Box>
              {/* Ride Summary Stats */}
              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, 
                gap: 2, 
                mb: 4,
                p: 3,
                background: 'rgba(248, 249, 250, 0.4)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.04)'
              }}>
                {/* Total Participants */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" fontWeight={700} color={vibe.accent}>
                    {(() => {
                      // Get all accepted participants (including those with pending invitations that should be counted)
                      const acceptedParticipants = participants.filter(p => 
                        p.invitationStatus === 'accepted' || 
                        (p.invitationStatus === 'pending' && p.role === 'driver')
                      );
                      
                      // Check if driver is already counted in participants
                      const driverInParticipants = acceptedParticipants.some(p => p.uid === ride.driver?.uid);
                      
                      // Calculate total: accepted participants + driver (if not already counted)
                      const totalCount = acceptedParticipants.length + (ride.driver && !driverInParticipants ? 1 : 0);
                      
                      // Calculate total participants
                      
                      return totalCount;
                    })()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    TOTAL PARTICIPANTS
                  </Typography>
                </Box>

                {/* Available Seats */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" fontWeight={700} color={vibe.accent}>
                    {(() => {
                      // Check if there are any drivers in the participants
                      const drivers = participants.filter(p => 
                        p.role === 'driver' && (p.invitationStatus === 'accepted' || p.status === 'accepted')
                      );
                      
                      // Also check if there's a driver in the ride data who might not be in participants yet
                      if (ride.driver && ride.driver.uid && !drivers.some(d => d.uid === ride.driver.uid)) {
                        console.log('🔧 Adding ride driver to drivers list:', {
                          driverUid: ride.driver.uid,
                          driverName: ride.driver.displayName || ride.driver.name,
                          seatCapacity: ride.driver.seatCapacity !== undefined ? ride.driver.seatCapacity : (ride.seatCapacity !== undefined ? ride.seatCapacity : (ride.carSeatsAvailable !== undefined ? ride.carSeatsAvailable : 4))
                        });
                        
                        drivers.push({
                          uid: ride.driver.uid,
                          displayName: ride.driver.displayName || ride.driver.name || displayNames[ride.driver.uid] || `User ${ride.driver.uid?.slice(-4)}`,
                          role: 'driver',
                          invitationStatus: 'accepted',
                          status: 'accepted',
                          seatCapacity: ride.driver.seatCapacity !== undefined ? ride.driver.seatCapacity : (ride.seatCapacity !== undefined ? ride.seatCapacity : (ride.carSeatsAvailable !== undefined ? ride.carSeatsAvailable : 4)),
                          isCreator: ride.createdBy === ride.driver.uid
                        });
                      }
                      
                      // Calculate seat availability
                      
                      // If no drivers, return 0 seats
                      if (drivers.length === 0) {
                      // No drivers found
                        return 0;
                      }
                      
                      // Calculate total seats available from all drivers
                      const totalSeatsAvailable = drivers.reduce((total, driver) => {
                        return total + (driver.seatCapacity !== undefined ? driver.seatCapacity : 4); // Use driver's seat capacity or default to 4
                      }, 0);
                      
                      // Count accepted passengers (excluding drivers)
                      const acceptedPassengers = participants.filter(p => 
                        (p.invitationStatus === 'accepted' || p.status === 'accepted') && 
                        p.role !== 'driver' &&
                        !(ride.driver && ride.driver.uid === p.uid) // Also exclude ride.driver
                      );
                      
                      const remainingSeats = Math.max(0, totalSeatsAvailable - acceptedPassengers.length);
                      
                      // Calculate remaining seats
                      
                      return remainingSeats;
                    })()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    REMAINING SEATS
                  </Typography>
                </Box>

                {/* Pending Invitations */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" fontWeight={700} color="#ff9800">
                    {participants.filter(p => p.invitationStatus === 'pending').length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PENDING RESPONSES
                  </Typography>
                </Box>

                {/* Ride Status */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" fontWeight={700} color={isRideExpired ? '#f44336' : '#4caf50'}>
                    {isRideExpired ? '⏰' : '✅'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {isRideExpired ? 'Expired' : 'Active'}
                  </Typography>
                </Box>
              </Box>

              {/* Driver Status Alert */}
              {(() => {
                const drivers = participants.filter(p => 
                  p.role === 'driver' && p.invitationStatus === 'accepted'
                );
                const acceptedPassengers = participants.filter(p => 
                  p.invitationStatus === 'accepted' && p.role !== 'driver'
                );
                
                // Calculate how many drivers are needed based on actual seat capacities
                const totalSeatsAvailable = drivers.reduce((total, driver) => {
                  return total + (driver.seatCapacity !== undefined ? driver.seatCapacity : 4);
                }, 0);
                const averageSeatsPerDriver = drivers.length > 0 ? totalSeatsAvailable / drivers.length : 4;
                const driversNeeded = Math.ceil(acceptedPassengers.length / averageSeatsPerDriver);
                
                if (drivers.length === 0) {
                  return (
                    <Alert 
                      severity="warning" 
                      sx={{ 
                        mb: 3,
                        '& .MuiAlert-message': {
                          fontSize: '0.9rem',
                          lineHeight: 1.4
                        }
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                        🚗 No drivers available
                      </Typography>
                      <Typography variant="body2">
                        {acceptedPassengers.length > 0 
                          ? `This ride needs at least ${driversNeeded} driver${driversNeeded > 1 ? 's' : ''} for ${acceptedPassengers.length} passenger${acceptedPassengers.length !== 1 ? 's' : ''}.`
                          : 'No passengers have accepted yet. Drivers will be needed once passengers respond.'
                        }
                      </Typography>
                    </Alert>
                  );
                } else if (drivers.length < driversNeeded) {
                  return (
                    <Alert 
                      severity="info" 
                      sx={{ 
                        mb: 3,
                        '& .MuiAlert-message': {
                          fontSize: '0.9rem',
                          lineHeight: 1.4
                        }
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                        🚗 Additional drivers needed
                      </Typography>
                      <Typography variant="body2">
                        {driversNeeded - drivers.length} more driver${driversNeeded - drivers.length > 1 ? 's' : ''} needed for ${acceptedPassengers.length} passenger${acceptedPassengers.length !== 1 ? 's' : ''}.
                      </Typography>
                    </Alert>
                  );
                } else if (acceptedPassengers.length > 0) {
                  return (
                    <Alert 
                      severity="success" 
                      sx={{ 
                        mb: 3,
                        '& .MuiAlert-message': {
                          fontSize: '0.9rem',
                          lineHeight: 1.4
                        }
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                        ✅ Ride ready to start
                      </Typography>
                      <Typography variant="body2">
                        {drivers.length} driver${drivers.length > 1 ? 's' : ''} available for {acceptedPassengers.length} passenger${acceptedPassengers.length !== 1 ? 's' : ''}.
                      </Typography>
                    </Alert>
                  );
                }
                return null;
              })()}

              {/* Detailed Ride Information */}
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, 
              gap: 2.5, 
              mb: 4 
            }}>
              {/* Destination */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 2,
              p: 2.5,
              background: 'rgba(248, 249, 250, 0.8)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'rgba(248, 249, 250, 1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
              }
            }}>
                <Box sx={{ 
                  width: 44, 
                  height: 44, 
                  borderRadius: '50%', 
                  background: `${vibe.accent}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}>
                  <Typography variant="h6" color={vibe.accent}>🎯</Typography>
                </Box>
              <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Destination
                  </Typography>
                <Typography variant="body2" color="text.primary" sx={{ 
                  fontWeight: 500,
                  lineHeight: 1.2,
                  wordBreak: 'break-word'
                }}>
                    {ride.destination?.address || 'No destination set'}
                  </Typography>
                </Box>
              </Box>

              {/* Created Date */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '50%', 
                  background: `${vibe.accent}15`,
                  display: 'flex',
                  alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
                }}>
                  <Typography variant="h6" color={vibe.accent}>📅</Typography>
                </Box>
              <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Created
                  </Typography>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>
                    {ride.createdAt ? (ride.createdAt.toDate ? ride.createdAt.toDate().toLocaleDateString() : ride.createdAt) : 'N/A'}
                  </Typography>
                </Box>
              </Box>

              {/* Ride Status */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '50%', 
                  background: `${vibe.accent}15`,
                  display: 'flex',
                  alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
                }}>
                  <Typography variant="h6" color={vibe.accent}>🚗</Typography>
                </Box>
              <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Status
                  </Typography>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
                  {isRideExpired ? 'Expired' : (ride.status || 'Active')}
                </Typography>
                {isRideExpired && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                    This ride has expired and is no longer active
                  </Typography>
                )}
              </Box>
            </Box>
            
            {/* Ride Expiration Time */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 2,
              p: 2.5,
              background: 'rgba(248, 249, 250, 0.8)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'rgba(248, 249, 250, 1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
              }
            }}>
              <Box sx={{ 
                width: 44, 
                height: 44, 
                borderRadius: '50%', 
                background: isRideExpired ? '#ffebee' : `${vibe.accent}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}>
                <Typography variant="h6" color={isRideExpired ? '#d32f2f' : vibe.accent}>⏰</Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {isRideExpired ? 'Expired' : 'Time Remaining'}
                </Typography>
                <Typography variant="body2" color={isRideExpired ? 'error' : 'text.primary'} sx={{ fontWeight: 500 }}>
                  {getTimeRemaining() || 'Unknown'}
                </Typography>
              </Box>
            </Box>

              {/* Meeting Time (if available) */}
              {ride.meetingTime && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: '50%', 
                    background: `${vibe.accent}15`,
                    display: 'flex',
                    alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                  }}>
                    <Typography variant="h6" color={vibe.accent}>🕐</Typography>
                  </Box>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Meeting Time
                    </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>
                      {ride.meetingTime}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Description */}
            <Box sx={{ 
              mb: 4,
              p: 3,
              background: 'rgba(248, 249, 250, 0.6)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)'
            }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={2} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Description
              </Typography>
              {canEditRide && editingDescription ? (
                <Box display="flex" flexDirection="column" gap={1}>
                  <TextField
                    value={editingDescriptionValue}
                    onChange={(e) => setEditingDescriptionValue(e.target.value)}
                    variant="outlined"
                    multiline
                    rows={3}
                    size="small"
                  />
                  <Box display="flex" gap={1}>
                    <Button 
                      size="small" 
                      onClick={handleDescriptionSave}
                      variant="contained"
                      sx={{ background: vibe.accent }}
                    >
                      Save
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => { setEditingDescription(false); setEditingDescriptionValue(description); }}
                      variant="outlined"
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box display="flex" alignItems="flex-start" gap={2}>
                  <Typography variant="body2" color="text.primary" sx={{ 
                    flex: 1,
                    p: 2,
                    background: 'white',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    minHeight: '60px',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    {description || 'No description provided'}
                  </Typography>
                  {canEditRide && (
                    <IconButton 
                      size="small" 
                      onClick={() => { setEditingDescription(true); setEditingDescriptionValue(description); }}
                      sx={{ 
                        color: vibe.accent, 
                        background: 'white',
                        border: '1px solid rgba(0, 0, 0, 0.06)',
                        '&:hover': {
                          background: 'rgba(0, 0, 0, 0.02)'
                        }
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              )}
          </Box>
            </Box>

<<<<<<< HEAD
        {/* 3. ACTIONS DIV */}
        <Box sx={{
          p: { xs: 3, sm: 4 },
          pt: 0
        }}>
            {/* Passengers Section */}
=======
              {/* Special Notes */}
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
            <Box sx={{ 
              mb: 4,
              p: 3,
              background: 'rgba(248, 249, 250, 0.6)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)'
            }}>
<<<<<<< HEAD
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={3} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Passengers
              </Typography>
              
              {/* Driver */}
              {ride.driver && (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                  mb: 2,
                  p: 2.5,
                  background: 'white',
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                  }
                }}>
                  <Avatar 
                    src={ride.driver.photoURL} 
                    sx={{ width: 40, height: 40, background: vibe.accent }}
                  >
                    {ride.driver.displayName?.charAt(0) || 'D'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {ride.driver.displayName || 'Driver'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Driver
                    </Typography>
                  </Box>
                  <Chip 
                    label="Driver" 
                    size="small" 
                    sx={{ 
                      background: vibe.accent, 
                      color: '#fff',
                      fontSize: '0.7rem'
                    }} 
                  />
                </Box>
              )}

              {/* Passengers */}
              {participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').map((passenger, index) => (
                <Box key={passenger.uid} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                  mb: index < participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').length - 1 ? 2 : 0,
                  p: 2.5,
                  background: 'white',
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                  }
                }}>
                  <Avatar 
                    src={passenger.photoURL} 
                    sx={{ width: 40, height: 40 }}
                  >
                    {passenger.displayName?.charAt(0) || 'P'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {passenger.displayName || `Passenger ${index + 1}`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Passenger
                    </Typography>
                  </Box>
                  <Chip 
                    label="Accepted" 
                    size="small" 
                    color="success"
                    sx={{ fontSize: '0.7rem' }}
                  />
                </Box>
              ))}

              {/* Pending Invitations */}
              {participants.filter(p => p.invitationStatus === 'pending').map((invitee, index) => (
                <Box key={invitee.uid} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                  mb: index < participants.filter(p => p.invitationStatus === 'pending').length - 1 ? 2 : 0,
                  p: 2.5,
                  background: 'rgba(255, 193, 7, 0.1)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 193, 7, 0.3)',
                  boxShadow: '0 2px 8px rgba(255, 193, 7, 0.1)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(255, 193, 7, 0.15)'
                  }
                }}>
                  <Avatar 
                    src={invitee.photoURL} 
                    sx={{ width: 40, height: 40 }}
                  >
                    {invitee.displayName?.charAt(0) || 'I'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {invitee.displayName || `Invitee ${index + 1}`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Pending Response
                    </Typography>
                  </Box>
                  <Chip 
                    label="Pending" 
                    size="small" 
                    color="warning"
                    sx={{ fontSize: '0.7rem' }}
                  />
                </Box>
              ))}
            </Box>

            {/* Location Sharing Section */}
            <Box sx={{ 
              mb: 4,
              p: 3,
              background: 'rgba(248, 249, 250, 0.6)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)'
            }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={3} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Location Sharing
              </Typography>
              {isRideExpired ? (
                <Box sx={{ 
                  p: 2, 
                  background: '#ffebee', 
                  borderRadius: 2, 
                  border: '1px solid #ffcdd2',
                  textAlign: 'center'
                }}>
                  <Typography variant="body2" color="error">
                    Location sharing is disabled for expired rides
=======
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={2} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  SPECIAL NOTES
              </Typography>
                <Typography variant="body2" color="text.primary" sx={{ 
                  p: 2,
                  background: 'white',
                  borderRadius: '8px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  minHeight: '60px',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {ride.specialNotes || 'No special notes'}
                </Typography>
              </Box>

              {/* Participants Section */}
              <Box sx={{ 
                mb: 3,
                p: 2.5,
                background: 'rgba(248, 249, 250, 0.6)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.04)'
              }}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={2.5} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  PARTICIPANTS
                </Typography>
                
                {/* Driver-Passenger Grouped Layout */}
                {(() => {
                  const drivers = participants.filter(p => p.role === 'driver' && (p.invitationStatus === 'accepted' || p.status === 'accepted'));
                  const passengers = participants.filter(p => p.role !== 'driver' && (p.invitationStatus === 'accepted' || p.status === 'accepted'));
                  const pendingInvitees = participants.filter(p => p.role === 'invitee' || p.invitationStatus === 'pending' || p.status === 'pending');
                  
                  // Simple assignment logic: distribute passengers evenly among drivers
                  const getDriverPassengerMapping = () => {
                    if (drivers.length === 0 || passengers.length === 0) return {};
                    
                    const mapping = {};
                    drivers.forEach((driver, index) => {
                      const startIndex = Math.floor((passengers.length * index) / drivers.length);
                      const endIndex = Math.floor((passengers.length * (index + 1)) / drivers.length);
                      mapping[driver.uid] = passengers.slice(startIndex, endIndex);
                    });
                    return mapping;
                  };
                  
                  const driverPassengerMapping = getDriverPassengerMapping();
                  
                  return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {/* Driver Groups */}
                      {drivers.map((driver) => {
                        const assignedPassengers = driverPassengerMapping[driver.uid] || [];
                        
                        return (
                    <Box key={driver.uid} sx={{ 
                            background: 'white',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 0, 0, 0.06)',
                            overflow: 'hidden'
                          }}>
                            {/* Driver Header */}
                            <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 2, 
                      p: 2,
                              background: 'rgba(76, 175, 80, 0.05)',
                              borderBottom: '1px solid rgba(0, 0, 0, 0.06)'
                    }}>
                      <Avatar 
                        src={driver.photoURL} 
                                sx={{ 
                                  width: 40, 
                                  height: 40, 
                                  background: '#4caf50',
                                  color: 'white',
                                  fontWeight: 600
                                }}
                              >
                                <CarIcon fontSize="small" />
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                                <Typography variant="body1" fontWeight={600} color="text.primary">
                                  {driver.displayName || 'Driver'}
                        </Typography>
                          <Typography variant="caption" color="text.secondary">
                                  {driver.seatCapacity !== undefined ? `${driver.seatCapacity} seats available` : 'Seat capacity not specified'}
                          </Typography>
                      </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" color="text.secondary">
                                  Assigned passengers:
                                </Typography>
                                <Typography variant="body2" fontWeight={600} color="primary">
                                  {assignedPassengers.length}
                                </Typography>
                    </Box>
                            </Box>
                            
                            {/* Assigned Passengers */}
                            {assignedPassengers.length > 0 && (
                              <Box sx={{ p: 2, pt: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ 
                                  textTransform: 'uppercase', 
                                  letterSpacing: '0.5px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  mb: 1,
                                  display: 'block'
                                }}>
                                  Assigned Passengers
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  {assignedPassengers.map((passenger) => (
                                    <Box key={passenger.uid} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                                      gap: 1.5,
                                      p: 1.5,
                                      background: 'rgba(33, 150, 243, 0.05)',
                      borderRadius: '8px',
                                      border: '1px solid rgba(33, 150, 243, 0.1)'
                    }}>
                  <Avatar 
                    src={passenger.photoURL} 
                            sx={{ 
                                          width: 28, 
                                          height: 28,
                                          background: '#2196f3',
                                          color: 'white',
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        <PersonIcon fontSize="small" />
                  </Avatar>
                                      <Box sx={{ flex: 1 }}>
                                        <Typography variant="body2" fontWeight={500} color="text.primary">
                                          {passenger.displayName || 'Passenger'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {passenger.pickupLocation?.address || 'Pickup location pending'}
                                        </Typography>
                                      </Box>
                                    </Box>
                        ))}
                      </Box>
                              </Box>
                            )}
                            
                            {/* No passengers assigned */}
                            {assignedPassengers.length === 0 && (
                              <Box sx={{ p: 2, pt: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ 
                                  fontStyle: 'italic',
                                  fontSize: '0.8rem'
                                }}>
                                  No passengers assigned yet
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                      
                      {/* Unassigned Passengers (if any drivers exist but passengers aren't assigned) */}
                      {drivers.length === 0 && passengers.length > 0 && (
                        <Box sx={{ 
                          background: 'white',
                          borderRadius: '12px',
                          border: '1px solid rgba(0, 0, 0, 0.06)',
                          p: 2
                        }}>
                          <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={2} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Unassigned Passengers
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {passengers.map((passenger) => (
                              <Box key={passenger.uid} sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 1.5,
                                p: 1.5,
                                background: 'rgba(255, 152, 0, 0.05)',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 152, 0, 0.1)'
                              }}>
                                <Avatar 
                                  src={passenger.photoURL} 
                                  sx={{ 
                                    width: 28, 
                                    height: 28,
                                    background: '#ff9800',
                                    color: 'white',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  <PersonIcon fontSize="small" />
                                </Avatar>
                  <Box sx={{ flex: 1 }}>
                                  <Typography variant="body2" fontWeight={500} color="text.primary">
                                    {passenger.displayName || 'Passenger'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {passenger.pickupLocation?.address || 'Pickup location pending'}
                    </Typography>
                                </Box>
                                <Typography variant="caption" color="warning.main" fontWeight={600}>
                                  Awaiting driver assignment
                                </Typography>
                              </Box>
                            ))}
                  </Box>
                </Box>
                  )}

                      {/* Pending Invitations */}
                      {pendingInvitees.length > 0 && (
                    <Box sx={{ 
                          background: 'rgba(255, 193, 7, 0.1)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 193, 7, 0.3)',
                          p: 2
                        }}>
                          <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={2} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Pending Invitations ({pendingInvitees.length})
                          </Typography>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {pendingInvitees.map((invitee) => (
                              <Box key={invitee.uid} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                                gap: 1.5,
                                p: 1.5,
                  background: 'rgba(255, 193, 7, 0.1)',
                      borderRadius: '8px',
                                border: '1px solid rgba(255, 193, 7, 0.2)'
                    }}>
                  <Avatar 
                    src={invitee.photoURL} 
                            sx={{ 
                                    width: 28, 
                                    height: 28,
                                    background: '#ffc107',
                                    color: 'white',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  <PersonIcon fontSize="small" />
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                                  <Typography variant="body2" fontWeight={500} color="text.primary">
                                    {invitee.displayName || 'Invitee'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Awaiting response
                    </Typography>
                                </Box>
                              </Box>
                            ))}
                      </Box>
                    </Box>
                  )}

                  {/* Empty State */}
                      {drivers.length === 0 && passengers.length === 0 && pendingInvitees.length === 0 && (
                    <Box sx={{ 
                      textAlign: 'center', 
                      py: 2,
                      color: 'text.secondary'
                    }}>
                      <Typography variant="body2" color="text.secondary">
                            No participants yet. Invite friends to join your ride!
                    </Typography>
                  </Box>
                  )}
                </Box>
                  );
                })()}
            </Box>

              {/* Route Information */}
              {(() => {
              {/* Route Information */}
              })()}
              {/* Route Information removed from main ride info page as requested */}

                  {/* Passenger-Driver Pickup Association */}
                  {calculatedRoute?.waypointInfo && calculatedRoute.waypointInfo.length > 0 && (
                    <Box sx={{ 
                      mt: 3,
                      p: 3,
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid rgba(0, 0, 0, 0.06)'
                    }}>
                      <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={2} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        PICKUP SCHEDULE
                      </Typography>
                      
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {calculatedRoute.waypointInfo.map((leg, index) => {
                          // Find the driver for this leg
                          const driver = participants.find(p => p.role === 'driver' || p.uid === ride.driver?.uid);
                          // Find the passenger being picked up
                          const passenger = participants.find(p => 
                            p.displayName === leg.to || 
                            p.name === leg.to ||
                            (p.location && Math.abs(p.location.lat - leg.toLocation?.lat) < 0.001 && Math.abs(p.location.lng - leg.toLocation?.lng) < 0.001)
                          );
                          
                          return (
                            <Box key={index} sx={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 2,
                              p: 2,
                              background: 'rgba(248, 249, 250, 0.4)',
                              borderRadius: '6px',
                              border: '1px solid rgba(0, 0, 0, 0.04)'
                            }}>
                              {/* Driver Avatar */}
                              <Avatar 
                                src={driver?.photoURL} 
                                sx={{ width: 28, height: 28, background: vibe.accent }}
                              >
                                {driver?.displayName?.charAt(0) || driver?.name?.charAt(0) || 'D'}
                              </Avatar>
                              
                              {/* Pickup Info */}
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" fontWeight={600} color="text.primary">
                                  {driver?.displayName || driver?.name || 'Driver'} → {passenger?.displayName || passenger?.name || leg.to}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {leg.distance ? `${(leg.distance / 1609.34).toFixed(1)} mi` : ''} 
                                  {leg.duration ? ` • ${Math.round(leg.duration / 60)} min` : ''}
                                </Typography>
                              </Box>
                              
                              {/* Passenger Avatar */}
                              {passenger && (
                                <Avatar 
                                  src={passenger.photoURL} 
                                  sx={{ width: 28, height: 28 }}
                                >
                                  {passenger.displayName?.charAt(0) || passenger.name?.charAt(0) || 'P'}
                                </Avatar>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                </Box>
              )}
            </Box>
              )}

          {/* Group Chat Tab */}
          {activeTab === 'group-chat' && (
            <Box sx={{ 
              minHeight: '400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(248, 249, 250, 0.3)',
              borderRadius: '12px',
              border: '2px dashed rgba(0, 0, 0, 0.1)'
            }}>
              <Box sx={{ textAlign: 'center', p: 4 }}>
                <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                  🚧 Group Chat Coming Soon
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  We're implementing enterprise-grade encrypted chat using WhatsApp's API for enhanced security.
                </Typography>
                <Box sx={{ 
                  p: 3, 
                  background: 'white', 
                  borderRadius: '8px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  maxWidth: '400px'
                }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                    Planned Features:
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    • End-to-end encryption
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    • Real-time messaging
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    • File sharing
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    • Location sharing
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
                  </Typography>
                </Box>
              ) : (
              <LocationToggle
                userId={user?.uid}
                rideId={rideId}
                isDriver={ride?.driver?.uid === user?.uid}
                isTracking={isTracking}
                onToggleChange={handleLocationToggleChange}
                compact={false}
              />
              )}
            </Box>

            {/* Action Buttons */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              pt: 4,
              mt: 3,
              borderTop: '2px solid rgba(0, 0, 0, 0.06)'
            }}>
              <Button 
                variant="outlined"
                color="primary"
                size="large"
                onClick={() => {
                  if (!ride) return;
                  setUserInvitation(ride.invitations?.[user?.uid] || { status: 'accepted' });
                  setShowInvitationModal(true);
                  setIsManuallyOpened(true);
                }}
                disabled={!ride}
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                  borderColor: vibe.accent,
                  color: vibe.accent,
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  minHeight: '48px',
                  '&:hover': {
                    borderColor: vibe.accent,
                    backgroundColor: `${vibe.accent}10`
                  }
                }}
              >
                Change RSVP
              </Button>

<<<<<<< HEAD
=======
              {/* Location Sharing Toggle */}
              {!isRideExpired && (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  px: 3,
                  py: 1.5,
                  background: 'rgba(248, 249, 250, 0.8)',
                  borderRadius: 3,
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  minHeight: '44px',
                  flex: { xs: 1, sm: 'none' }
                }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    fontSize: '0.8rem'
                  }}>
                    Location
                  </Typography>
                  <LocationToggle
                    userId={user?.uid}
                    rideId={rideId}
                    isDriver={ride?.driver?.uid === user?.uid}
                    isTracking={isTracking}
                    onToggleChange={handleLocationToggleChange}
                    compact={true}
                    showGranularOptions={true}
                    currentConsent={currentConsent}
                    onConsentChange={handleLocationConsentChange}
                  />
                </Box>
              )}

              {/* Proximity Notifications */}
              {currentConsent === 'on_pickup' && (
                <>
                  {isWithinProximity && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        🚗 Driver is within {distance ? `${distance.toFixed(0)}m` : '100m'} of your pickup location. 
                        Location sharing has been activated automatically.
                      </Typography>
                    </Alert>
                  )}
                  
                  {!isWithinProximity && distance && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        📍 Driver is {distance.toFixed(0)}m away from your pickup location. 
                        Location sharing will activate when they're within 100m.
                      </Typography>
                    </Alert>
                  )}
                </>
              )}
              
              {currentConsent === 'during_ride' && ride?.status === 'active' && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    📍 Location sharing active for the duration of the ride
                  </Typography>
                </Alert>
              )}
              
              {currentConsent === 'never' && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    ⚠️ Location sharing disabled - Driver won't be able to see your location
                  </Typography>
                </Alert>
              )}

>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
              <Button 
                variant="outlined"
                color="error"
                size="large"
                onClick={handleLeaveRide}
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                  borderColor: '#f44336',
                  color: '#f44336',
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  minHeight: '48px',
                  '&:hover': {
                    borderColor: '#d32f2f',
                    backgroundColor: '#ffebee'
                  }
                }}
              >
                Leave Ride
              </Button>
            </Box>
        </Box>

        {/* Route Status */}
        {routeError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="body2">
              Route calculation error: {routeError}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => routeCalculationManager(true)}
              disabled={isCalculatingRoute}
              sx={{ mt: 1 }}
            >
              {isCalculatingRoute ? 'Calculating...' : 'Retry Route'}
            </Button>
          </Alert>
        )}

        {/* Route Calculation Status */}
        {isCalculatingRoute && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              Calculating optimal route...
            </Typography>
          </Alert>
        )}
      </Box>
      
      {/* Map Modal */}
      <Modal 
        open={isMapModalOpen} 
        onClose={handleMapModalClose}
        sx={{
          '& .MuiModal-backdrop': {
            backdropFilter: 'blur(4px)',
            backgroundColor: 'rgba(0,0,0,0.8)'
          },
          '& .MuiModal-root': {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }
        }}
      >
        <Box sx={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          width: '100vw', 
          height: '100vh', 
          maxWidth: '100vw',
          maxHeight: '100vh',
          bgcolor: '#fff', 
          borderRadius: 0, 
          boxShadow: 'none', 
          p: 0, 
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 9999
        }}>
          {/* Header */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            p: 2,
            pb: 2,
            borderBottom: '1px solid rgba(0,0,0,0.1)',
            background: 'rgba(255,255,255,0.98)',
            backdropFilter: 'blur(15px)',
            position: 'sticky',
            top: 0,
            zIndex: 1000
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" color={vibe.accent}>
                Live Ride Route
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton 
                onClick={handleMapFullScreenToggle}
                sx={{ 
                  color: vibe.accent,
                  background: isMapFullScreen ? 'rgba(0,0,0,0.05)' : 'transparent',
                  '&:hover': {
                    background: 'rgba(0,0,0,0.1)',
                    transform: 'scale(1.1)'
                  },
                  transition: 'all 0.2s ease'
                }}
                size="small"
                title={isMapFullScreen ? 'Exit Full Screen' : 'Enter Full Screen'}
              >
                {isMapFullScreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
<<<<<<< HEAD
=======
              
              {/* Drive Mode Button */}
              {calculatedRoute && (
                <IconButton 
                  onClick={isDriveMode ? handleExitDriveMode : handleEnterDriveMode}
                  sx={{ 
                    color: isDriveMode ? '#e74c3c' : '#27ae60',
                    background: isDriveMode ? 'rgba(231,76,60,0.1)' : 'rgba(39,174,96,0.1)',
                    '&:hover': {
                      background: isDriveMode ? 'rgba(231,76,60,0.2)' : 'rgba(39,174,96,0.2)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                  size="small"
                  title={isDriveMode ? 'Exit Drive Mode' : 'Start Driving'}
                >
                  <CarIcon />
                </IconButton>
              )}
              
              {/* Trip Details Button */}
              {calculatedRoute && (
                <IconButton 
                  onClick={() => setShowTripModal(true)}
                  sx={{ 
                    color: '#3498db',
                    background: 'rgba(52,152,219,0.1)',
                    '&:hover': {
                      background: 'rgba(52,152,219,0.2)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                  size="small"
                  title="Trip Details"
                >
                  <CarIcon />
                </IconButton>
              )}
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
              <IconButton 
                onClick={handleMapModalClose}
                sx={{ 
                  color: vibe.accent,
                  '&:hover': {
                    background: 'rgba(0,0,0,0.1)',
                    transform: 'scale(1.1)'
                  },
                  transition: 'all 0.2s ease'
                }}
                size="small"
                title="Close Map"
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
          
          {/* Map Container */}
          <Box sx={{ 
            width: '100%', 
            height: 'calc(100vh - 80px)', 
            borderRadius: 0, 
            overflow: 'hidden', 
            boxShadow: 'none',
            flex: 1,
            position: 'relative'
          }}>
<<<<<<< HEAD
=======
            {console.log('🗺️ LiveRideView - Passing participants to MapView:', participants.map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              status: p.invitationStatus,
              role: p.role,
              hasLocation: !!(p.location && p.location.lat && p.location.lng),
              hasPickupLocation: !!(p.pickupLocation && p.pickupLocation.lat && p.pickupLocation.lng),
              location: p.location,
              pickupLocation: p.pickupLocation,
              pickupLocationType: typeof p.pickupLocation,
              pickupLocationCoords: p.pickupLocation?.lat ? `${p.pickupLocation.lat}, ${p.pickupLocation.lng}` : 'No coords',
              isCreator: p.isCreator
            })))}
            
            {console.log('🗺️ LiveRideView - Participants that should show on map:', participants.filter(p => 
              ((p.location && p.location.lat && p.location.lng) || (p.pickupLocation && p.pickupLocation.lat && p.pickupLocation.lng)) && (p.invitationStatus === 'accepted' || p.role === 'driver')
            ).map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              role: p.role,
              status: p.invitationStatus,
              location: p.location,
              pickupLocation: p.pickupLocation,
              hasLocation: !!(p.location && p.location.lat && p.location.lng),
              hasPickupLocation: !!(p.pickupLocation && p.pickupLocation.lat && p.pickupLocation.lng),
              isCreator: p.isCreator
            })))}
            
            {/* MapView participants data */}
            
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
            <MapView
              users={participants}
              destination={ride.destination?.location ? {
                lat: ride.destination.location.lat,
                lng: ride.destination.location.lng,
                address: ride.destination.address
              } : ride.destination}
              calculatedRoute={calculatedRoute}
              userLocation={location}
              isLiveRide={true}
              autoFit={true}
              hideRouteInfo={false}
            />
            
            {/* Route Information Overlay */}
            <Box sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              right: 16,
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(10px)',
              borderRadius: 2,
              p: 2,
              border: '1px solid rgba(0,0,0,0.1)',
              zIndex: 1000
            }}>
<<<<<<< HEAD
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                    Route Information
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {calculatedRoute?.routes?.[0]?.distance ? 
                      `${(calculatedRoute.routes[0].distance / 1609.34).toFixed(1)} miles` : 
                      calculatedRoute?.routes?.[0]?.legs?.[0]?.distance ? 
                      `${(calculatedRoute.routes[0].legs[0].distance / 1609.34).toFixed(1)} miles` : 
                      'Calculating...'}
=======
              <RouteInformation 
                calculatedRoute={calculatedRoute}
                variant="compact"
                vibe={vibe}
              />
              
              {/* Debug: Turn-by-Turn Navigation Steps */}
              {navigationSteps.length > 0 && (
                <Box sx={{ mt: 2, p: 2, background: 'rgba(76, 175, 80, 0.1)', borderRadius: 1, border: '1px solid rgba(76, 175, 80, 0.2)' }}>
                  <Typography variant="caption" fontWeight={600} color="text.primary" display="block" mb={1}>
                    🗺️ Parsed Turn-by-Turn Steps ({navigationSteps.length} total):
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
                  </Typography>
                  <Box sx={{ maxHeight: 100, overflowY: 'auto' }}>
                    {navigationSteps.slice(0, 5).map((step, index) => (
                      <Typography key={index} variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontSize: '0.7rem' }}>
                        {index + 1}. {step.instruction} ({step.distance.toFixed(1)} mi)
                      </Typography>
                    ))}
                    {navigationSteps.length > 5 && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
                        ... and {navigationSteps.length - 5} more steps
                      </Typography>
                    )}
                  </Box>
                </Box>
<<<<<<< HEAD
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                    {calculatedRoute?.routes?.[0]?.duration ? 
                      `${Math.round(calculatedRoute.routes[0].duration / 60)} min` :
                      calculatedRoute?.routes?.[0]?.legs?.[0]?.duration ? 
                      `${Math.round(calculatedRoute.routes[0].legs[0].duration / 60)} min` :
                      'Calculating...'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Estimated Time
                  </Typography>
                </Box>
              </Box>
=======
              )}
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
              
              {/* Route Steps/Directions */}
              {calculatedRoute?.routes?.[0]?.legs?.[0]?.steps && (
                <Box sx={{ mt: 2, maxHeight: 120, overflowY: 'auto' }}>
                  <Typography variant="caption" fontWeight={600} color="text.primary" display="block" mb={1}>
                    Directions:
                  </Typography>
                  {calculatedRoute.routes[0].legs[0].steps.slice(0, 3).map((step, index) => (
                    <Typography key={index} variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                      {index + 1}. {step.maneuver.instruction}
                    </Typography>
                  ))}
                  {calculatedRoute.routes[0].legs[0].steps.length > 3 && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      ... and {calculatedRoute.routes[0].legs[0].steps.length - 3} more steps
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
<<<<<<< HEAD
          </Box>
        </Box>
      </Modal>
=======
            )}
            
            {/* Turn-by-Turn Directions - Top of Map in Drive Mode */}
            {isDriveMode && currentInstruction && (
              <Box sx={{
                position: 'absolute',
                top: 16,
                left: 16,
                right: 16,
                background: 'rgba(255, 248, 220, 0.95)',
                backdropFilter: 'blur(15px)',
                borderRadius: '12px',
                p: 2.5,
                border: '1px solid rgba(0,0,0,0.1)',
                zIndex: 1000,
                color: '#2c2c2c'
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body1" fontWeight={700} color="#2c2c2c" sx={{ fontSize: '1rem', mb: 0.5 }}>
                      {currentInstruction.turnType}
                    </Typography>
                    <Typography variant="caption" color="rgba(44,44,44,0.7)" sx={{ fontSize: '0.8rem' }}>
                      {nextTurn ? `Next: ${nextTurn.turnType}` : 'Approaching destination'}
                    </Typography>
                  </Box>
                  
                  {/* Progress Indicator */}
                  <Box sx={{ textAlign: 'right', ml: 2 }}>
                    <Typography variant="body2" fontWeight={700} color="#4CAF50" sx={{ fontSize: '1.1rem' }}>
                      {Math.round(routeProgress)}%
                    </Typography>
                    <Typography variant="caption" color="rgba(44,44,44,0.6)" sx={{ fontSize: '0.75rem' }}>
                      Progress
                    </Typography>
                  </Box>
                </Box>
                
                {/* Compact Progress Bar */}
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{
                    width: '100%',
                    height: 4,
                    background: 'rgba(0,0,0,0.15)',
                    borderRadius: 2,
                    overflow: 'hidden'
                  }}>
                    <Box sx={{
                      width: `${routeProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4CAF50, #8BC34A)',
                      transition: 'width 0.3s ease'
                    }} />
                  </Box>
                </Box>
              </Box>
            )}
            
            {/* Drive Mode Navigation Interface */}
            {isDriveMode && (
              <>

                
                {/* Compact Drive Mode Controls - Bottom */}
                <Box sx={{
                  position: 'absolute',
                  bottom: 12,
                  left: 16,
                  right: 16,
                  background: 'rgba(255, 248, 220, 0.95)',
                  backdropFilter: 'blur(15px)',
                  borderRadius: '8px',
                  p: 1.5,
                  border: '1px solid rgba(0,0,0,0.1)',
                  zIndex: 1001,
                  color: '#2c2c2c'
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    {/* Voice Toggle */}
                    <IconButton 
                      onClick={handleToggleVoice}
                      sx={{ 
                        color: isVoiceEnabled ? '#4CAF50' : '#f44336',
                        background: 'rgba(0,0,0,0.08)',
                        borderRadius: '6px',
                        padding: '4px',
                        minWidth: '32px',
                        width: '32px',
                        height: '32px',
                        '&:hover': { 
                          background: 'rgba(0,0,0,0.15)',
                          transform: 'scale(1.05)'
                        },
                        transition: 'all 0.2s ease'
                      }}
                      size="small"
                      title={isVoiceEnabled ? 'Mute Voice' : 'Enable Voice'}
                    >
                      {isVoiceEnabled ? '🔊' : '🔇'}
                    </IconButton>
                    
                    {/* Compass Indicator */}
                    {isCompassEnabled && (
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        background: 'rgba(0,0,0,0.08)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        minHeight: '32px'
                      }}>
                        <Typography variant="caption" color="#2c2c2c" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
                          🧭 {Math.round(userHeading)}°
                        </Typography>
                      </Box>
                    )}
                    
                    {/* Exit Drive Mode Button */}
                    <Button
                      onClick={handleExitDriveMode}
                      variant="outlined"
                      size="small"
                      sx={{
                        color: '#f44336',
                        borderColor: '#f44336',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        minHeight: '32px',
                        '&:hover': {
                          borderColor: '#d32f2f',
                          background: 'rgba(244, 67, 54, 0.1)',
                          transform: 'scale(1.05)'
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Exit
                    </Button>
                  </Box>
                </Box>
              </>
            )}
            
            {/* Ride Summary Modal - Live Ride View Version */}
            {calculatedRoute && !isDriveMode && (() => {
              console.log('🔍 Route Information Modal - Route Data Structure:', {
                calculatedRoute,
                totalDistance: calculatedRoute.totalDistance,
                totalDuration: calculatedRoute.totalDuration,
                features: calculatedRoute.features,
                distance: calculatedRoute.distance,
                duration: calculatedRoute.duration,
                routes: calculatedRoute.routes
              });
              return true;
            })() && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 2000,
                  background: 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(15px)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 25px rgba(0, 0, 0, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  width: '400px',
                  maxWidth: 'calc(100vw - 32px)',
                  overflow: 'hidden',
                  animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '@keyframes slideUp': {
                    '0%': {
                      opacity: 0,
                      transform: 'translateX(-50%) translateY(20px)',
                    },
                    '100%': {
                      opacity: 1,
                      transform: 'translateX(-50%) translateY(0)',
                    }
                  }
                }}
              >
                {/* Compact Header */}
                <Box
                  sx={{
                    background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(69, 160, 73, 0.95))',
                    backdropFilter: 'blur(15px)',
                    color: 'white',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CarIcon sx={{ fontSize: 18, color: 'white' }} />
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.9rem', lineHeight: 1.2 }}>
                      {ride.destination?.name || ride.destination?.address || 'Destination'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                      onClick={() => setShowTripModal(true)}
                      size="small"
                      sx={{ 
                        color: 'white', 
                        background: 'rgba(255,255,255,0.15)',
                        padding: '4px',
                        '&:hover': { 
                          background: 'rgba(255,255,255,0.25)',
                          transform: 'scale(1.05)'
                        },
                        transition: 'all 0.2s ease'
                      }}
                      title="Trip Details"
                    >
                      <CarIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      onClick={() => {
                        setShowRideSummaryModal(false);
                      }}
                      size="small"
                      sx={{ 
                        color: 'white', 
                        background: 'rgba(255,255,255,0.15)',
                        padding: '4px',
                        '&:hover': { 
                          background: 'rgba(255,255,255,0.25)',
                          transform: 'scale(1.05)'
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                </Box>

                {/* Compact Route Info Layout */}
                <Box sx={{ 
                  padding: '20px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2
                }}>
                  <RouteInformation 
                    calculatedRoute={calculatedRoute}
                    variant="modal"
                    showStartButton={true}
                    showAvoidTolls={true}
                    avoidTolls={tollsEnabled}
                    onAvoidTollsChange={(newValue) => {
                      setTollsEnabled(newValue);
                      // Route will be recalculated automatically via useEffect
                    }}
                    onStartClick={handleEnterDriveMode}
                    destination={ride.destination}
                    vibe={vibe}
                  />
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Modal>
      
      {/* New Trip Modal */}
      <TripModal
        open={showTripModal}
        onClose={() => setShowTripModal(false)}
        ride={ride}
        onEnterDriveMode={handleEnterDriveMode}
        onTollsToggle={setTollsEnabled}
        onSeatsChange={setSelectedSeats}
        tollsEnabled={tollsEnabled}
        selectedSeats={selectedSeats}
      />
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
    </Box>
  );
}

export default LiveRideView; 
