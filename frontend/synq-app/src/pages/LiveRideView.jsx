import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
// Simplified location imports - removed dependency on locationTrackingService
import rideStatusService, { RIDE_STATUS } from '../services/rideStatusService';
import { getMultiWaypointDirections, getMultiWaypointDirectionsWithFallback, ROUTING_PROFILES } from '../services/locationService';
import RideInvitationModal from '../components/RideInvitationModal';
import RouteInformationPanel from '../components/RouteInformationPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import LocationToggle from '../components/LocationToggle';
import TripModal from '../components/TripModal';
import useLocation from '../hooks/useLocation';
import '../styles/LiveRideView.css';
import { 
  Box, Typography, Card, Button, Stack, Divider, Avatar, Chip, Alert, TextField, Modal, IconButton
} from '@mui/material';


import {
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  DirectionsCar
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
  // Simple constants for location permissions
  const LOCATION_PERMISSIONS = {
    NEVER: 'never',
    WHILE_USING: 'while_using',
    RIDE_ONLY: 'ride_only',
    DRIVER_ONLY: 'driver_only',
    ALWAYS: 'always'
  };
  
  const LOCATION_CONTEXTS = {
    DRIVER_MODE: 'driver_mode',
    RIDE_ACTIVE: 'ride_active'
  };
  
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useUserAuth();
  
  // Component initialization tracking (disabled to reduce console spam)
  // console.log('🚀 LiveRideView component initializing:', { rideId, hasUser: !!user, userUid: user?.uid });
  
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
  
  // Compass/heading state for drive mode
  const [userHeading, setUserHeading] = useState(0);
  const [isCompassEnabled, setIsCompassEnabled] = useState(false);
  
  // Tab management
  const [activeTab, setActiveTab] = useState('ride-info');
  
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
  
  // Route optimization
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [lastRouteCalculation, setLastRouteCalculation] = useState(null);
  const [routeCalculationQueue, setRouteCalculationQueue] = useState([]);
  const [routeCache, setRouteCache] = useState(new Map());
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  
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

  const {
    location,
    isTracking,
    startTracking,
    stopTracking
  } = useLocation({
    preset: 'ultra_fast',
    updateFirebase: true, // Always enable Firebase updates, we'll handle expiration in the callback
    onError: (error) => {
      console.log('📍 Location tracking error:', error);
      // Don't set error state for expected permission issues
      if (!error.message?.includes('User not found') && !error.message?.includes('permission denied')) {
        setLocationError(error.message);
      }
    },
    onLocationUpdate: async (locationData) => {
      if (!ride || !user || ride.driver?.uid !== user.uid || isRideExpired || ride.status === 'expired') {
        console.log('📍 Location update skipped - not driver or ride expired:', {
          hasRide: !!ride,
          hasUser: !!user,
          driverUid: ride?.driver?.uid,
          userUid: user?.uid,
          isDriver: ride?.driver?.uid === user?.uid,
          isExpired: isRideExpired,
          rideStatus: ride?.status
        });
        return;
      }

      // Validate location accuracy and freshness
      const isAccurate = locationData.accuracy && locationData.accuracy < 100; // Within 100 meters
      const isRecent = locationData.timestamp && (Date.now() - locationData.timestamp) < 30000; // Within 30 seconds
      
      if (!isAccurate || !isRecent) {
        console.log('📍 Location update skipped - accuracy:', locationData.accuracy, 'recent:', isRecent);
        return;
      }

      try {
        // Check if ride still exists and user is still the driver
        const rideRef = doc(db, 'rides', rideId);
        const rideDoc = await getDoc(rideRef);
        if (!rideDoc.exists()) {
          console.log('📍 Ride document no longer exists');
          return;
        }
        const currentRideData = rideDoc.data();
        console.log('📍 Current ride data:', {
          driverUid: currentRideData.driver?.uid,
          userUid: user.uid,
          isDriver: currentRideData.driver?.uid === user.uid,
          rideStatus: currentRideData.status
        });
        if (currentRideData.driver?.uid !== user.uid) {
          console.log('📍 User is no longer the driver');
          return;
        }
        // Check if the ride is still active
        if (currentRideData.status === 'cancelled' || currentRideData.status === 'completed' || currentRideData.status === 'expired') {
          console.log('📍 Ride is no longer active, status:', currentRideData.status);
          return;
        }

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
        
        // Trigger route recalculation if significant movement detected (only for active rides)
        if (calculatedRoute && location && !isRideExpired) {
          const distanceMoved = Math.sqrt(
            Math.pow(locationData.latitude - location.latitude, 2) + 
            Math.pow(locationData.longitude - location.longitude, 2)
          );
          
          if (distanceMoved > 0.001) { // More than ~100 meters
            console.log('📍 Significant movement detected, triggering route update');
            setTimeout(() => routeCalculationManager(true), 2000);
          }
        }
      } catch (error) {
        console.error('Error updating ride with location:', error);
        // Check if it's a permission error
        if (error.code === 'permission-denied' || error.message?.includes('permission')) {
          console.log('📍 Permission denied for location update - user may no longer be driver or ride expired');
          setLocationError('Location update failed - permission denied');
        } else {
          setLocationError('Failed to update location in ride');
        }
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
    },
  });

  // State to store resolved display names
  const [displayNames, setDisplayNames] = useState({});

  // Route calculation manager with caching and debouncing
  const routeCalculationManager = useCallback(async (force = false) => {
    console.log('🚀 Route calculation manager called:', { force, hasRide: !!ride, isExpired: isRideExpired });
    
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
      setIsCalculatingRoute(false); // Reset calculation state when using cached route
      return;
    }

    // Queue the calculation if one is already in progress
    if (isCalculatingRoute) {
      console.log('🚫 Route calculation queued - one already in progress');
      setRouteCalculationQueue(prev => [...prev, { force, timestamp: now }]);
      return;
    }

    console.log('🔄 Calling calculateRoute from route calculation manager');
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
    
    // If ride is expired and status is not already "expired", update it in Firestore
    if (expired && rideData.status !== 'expired') {
      console.log('🚫 Ride has expired, updating status in Firestore');
      updateExpiredRideStatus(rideData.id || rideId);
    }
    
    return expired;
  }, [RIDE_EXPIRATION_HOURS, rideId]);

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
    console.log('🚗 calculateRoute function called');
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
      
      // Get driver's seat availability (default to 4 seats for compatibility)
      const drivers = participants.filter(p => 
        p.role === 'driver' && p.invitationStatus === 'accepted'
      );
      
      // If no drivers, we can't calculate a route
      if (drivers.length === 0) {
        console.log('🚫 No drivers available, skipping route calculation');
        setIsCalculatingRoute(false);
        setRouteError('No drivers available for this ride');
        return;
      }
      
      const totalSeatsAvailable = drivers.length * 4; // Each driver has 4 seats
      
      console.log('🚗 Driver seat availability:', { 
        drivers: drivers.length,
        totalSeatsAvailable,
        driverIds: drivers.map(d => d.uid),
        driverNames: drivers.map(d => d.displayName)
      });
      
      // Get all participants with locations (only accepted ones)
      const allUsersWithLocations = participants.filter(p => 
        p.location && p.location.lat && p.location.lng && 
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
                role: invitation.response.role || 'passenger',
                invitationStatus: invitation.status,
                type: 'pickup'
              });
            }
          }
        });
      }
      
      // Combine all users with locations and limit based on driver's seat availability
      const allPickupPoints = [...allUsersWithLocations, ...inviteesWithLocations];
      
      // Limit passengers based on total seats available from all drivers
      const limitedPickupPoints = allPickupPoints.slice(0, totalSeatsAvailable);
      
      if (limitedPickupPoints.length < allPickupPoints.length) {
        console.log(`⚠️ Limited passengers from ${allPickupPoints.length} to ${limitedPickupPoints.length} based on driver seat availability (${totalSeatsAvailable} total seats from ${drivers.length} drivers)`);
      }
      
      // Check if we've calculated recently (within last 30 seconds)
      if (lastRouteCalculation && (now - lastRouteCalculation) < 30000) {
        console.log('🚫 Route calculated recently, checking if new pickup points...');
        
        // Check if we have new pickup points that weren't in the previous calculation
        const currentPickupPoints = limitedPickupPoints.length;
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
        totalPickupPoints: limitedPickupPoints.length,
        limitedBySeats: limitedPickupPoints.length < allPickupPoints.length,
        totalSeatsAvailable,
        drivers: drivers.length,
        participants: allUsersWithLocations.map(p => ({ uid: p.uid, name: p.displayName, status: p.invitationStatus })),
        invitees: inviteesWithLocations.map(p => ({ uid: p.uid, name: p.displayName, status: p.invitationStatus }))
      });
      
      console.log('🗺️ Detailed pickup points for route calculation:', {
        allUsersWithLocations: allUsersWithLocations.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          status: p.invitationStatus,
          location: p.location,
          pickupLocation: p.pickupLocation
        })),
        inviteesWithLocations: inviteesWithLocations.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          status: p.invitationStatus,
          location: p.location,
          pickupLocation: p.pickupLocation
        })),
        limitedPickupPoints: limitedPickupPoints.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          status: p.invitationStatus,
          location: p.location,
          pickupLocation: p.pickupLocation
        }))
      });
      
      // Add driver's starting location as the first waypoint (origin)
      if (driver && driver.location) {
          waypoints.push({
            ...driver,
          lat: driver.location.lat,
          lng: driver.location.lng,
          location: driver.location,
          type: 'origin',
          displayName: driver.displayName || 'Driver'
        });
        console.log('🚗 Added driver origin waypoint:', driver.displayName, 'at', driver.location);
      } else if (location && ride.driver?.uid === user?.uid) {
        // Use current user's location as driver origin if they are the driver and no profile location
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
      } else {
        // Driver location not available - cannot calculate complete route
        console.log('⚠️ Driver location not available, cannot calculate complete route');
        console.log('Driver data:', driver);
        console.log('Current user location:', location);
        console.log('Is current user driver?', ride.driver?.uid === user?.uid);
        return;
      }

      // Add all pickup points to waypoints (limited by driver's seat availability)
      limitedPickupPoints.forEach(pickupPoint => {
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

      // Log complete waypoint structure for debugging
      console.log('🗺️ Complete waypoint structure:', waypoints.map(w => ({
        type: w.type,
        displayName: w.displayName,
        role: w.role,
        location: w.location,
        uid: w.uid
      })));

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

        // Ensure we have a driver origin waypoint
        const hasDriverOrigin = waypoints.some(w => w.type === 'origin');
        if (!hasDriverOrigin) {
          console.log('⚠️ No driver origin waypoint found, waiting for driver location...');
          return;
        }
        
        if (waypoints.length < expectedWaypoints) {
          console.log('Waiting for all waypoints to be available before calculating route');
          return;
        }
        
        // Advanced route optimization for multi-stop pickup
        console.log('🚗 Starting advanced route optimization...');
        
        try {
          // Transform waypoints to the format expected by getMultiWaypointDirections
          const formattedWaypoints = waypoints.map(waypoint => ({
            lat: waypoint.location.lat,
            lng: waypoint.location.lng,
            name: waypoint.displayName || `Waypoint ${waypoint.type}`,
            type: waypoint.type
          }));

          console.log('🗺️ Formatted waypoints for multi-waypoint routing:', formattedWaypoints);

          if (formattedWaypoints.length < 2) {
            console.log('❌ Not enough waypoints for route calculation');
            return;
          }

          // Use the enhanced routing function with automatic fallback
          console.log('🗺️ Requesting optimized route using enhanced routing with fallback...');
          
          // Collect toll preferences from all participants
          const tollPreferences = [];
          
          // Add driver's preference
          if (driver && driver.avoidTolls !== undefined) {
            tollPreferences.push({ uid: driver.uid, avoidTolls: driver.avoidTolls });
          }
          
          // Add participants' preferences
          participants.forEach(participant => {
            if (participant.avoidTolls !== undefined) {
              tollPreferences.push({ uid: participant.uid, avoidTolls: participant.avoidTolls });
            }
          });
          
          // Add invitees' preferences
          if (ride.invitations) {
            Object.entries(ride.invitations).forEach(([inviteeId, invitation]) => {
              if (invitation.response && invitation.response.avoidTolls !== undefined) {
                tollPreferences.push({ uid: inviteeId, avoidTolls: invitation.response.avoidTolls });
              }
            });
          }
          
          // Determine final toll preference (if any participant wants to avoid tolls, avoid them)
          const shouldAvoidTolls = tollPreferences.some(pref => pref.avoidTolls);
          
          console.log('🚗 Toll preferences collected:', {
            preferences: tollPreferences,
            finalDecision: shouldAvoidTolls ? 'avoid tolls' : 'allow tolls'
          });
          
          const routes = await getMultiWaypointDirectionsWithFallback(formattedWaypoints, {
            profile: ROUTING_PROFILES.DRIVING_TRAFFIC,
            fallbackProfile: ROUTING_PROFILES.DRIVING,
            annotations: ['distance', 'duration'],
            continueStraight: false,
            avoidTolls: shouldAvoidTolls
          });

          if (routes && routes.length > 0) {
            const optimizedRoute = routes[0];
            
            // Calculate total metrics (already converted to miles/minutes by the function)
            const totalDistance = optimizedRoute.distance;
            const totalDuration = optimizedRoute.duration;
            
            // Extract waypoint information
            const waypointInfo = optimizedRoute.legs?.map((leg, index) => ({
              from: waypoints[index]?.displayName || `Waypoint ${index + 1}`,
              to: waypoints[index + 1]?.displayName || `Waypoint ${index + 2}`,
              distance: leg.distance,
              duration: leg.duration,
              steps: leg.steps
            })) || [];

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
            setIsCalculatingRoute(false); // Reset calculation state on success
            console.log('✅ Route calculation completed successfully:', {
              totalDistance: enhancedRouteData.totalDistance,
              totalDuration: enhancedRouteData.totalDuration,
              waypointCount: enhancedRouteData.waypointInfo?.length || 0
            });
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
          setIsCalculatingRoute(false); // Reset calculation state for fallback
          console.log('⚠️ Using fallback route calculation');
        }
      } else {
        console.log('Not enough waypoints for route calculation:', waypoints.length);
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      setRouteError('Failed to calculate route: ' + error.message);
    } finally {
      console.log('🏁 Route calculation finally block - setting isCalculatingRoute to false');
      setIsCalculatingRoute(false);
    }
  };

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

  // Effect to set up ride subscription
  useEffect(() => {
    // Debug logging (disabled to reduce console spam)
    // console.log('🔍 Ride subscription effect triggered:', { rideId, hasUser: !!user, userUid: user?.uid });
    
    if (!rideId || !user || showInvitationModal || isManuallyOpened || hasLeftRide) {
      // console.log('❌ Ride subscription effect blocked:', { reason: ... });
      return;
    }

    console.log('🚀 Setting up ride subscription for:', rideId);
    setLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, 'rides', rideId),
      (docSnapshot) => {
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
          
        setRide(rideData);
        setDescription(rideData.description || '');
        const rideTitle = rideData.groupName || rideData.name || 'Untitled Ride';
        setTitle(rideTitle);
        console.log('🎯 Setting ride title:', { 
          groupName: rideData.groupName, 
          name: rideData.name, 
          finalTitle: rideTitle 
        });
        
        // Stop location tracking if ride is cancelled or expired
        if ((rideData.status === RIDE_STATUS.CANCELLED || isExpired) && isTracking) {
          console.log('Ride cancelled or expired - stopping location tracking');
          stopTracking();
        }

        // Stop location tracking if user is no longer the driver
        if (rideData.driver?.uid !== user?.uid && isTracking) {
          console.log('User is no longer driver - stopping location tracking');
          stopTracking();
        }

        // Update participants list
        const allParticipants = [];
        
        console.log('🔍 Ride data structure:', {
          hasDriver: !!rideData.driver,
          driverUid: rideData.driver?.uid,
          driverName: rideData.driver?.name,
          creatorId: rideData.creatorId,
          currentUserId: user?.uid,
          passengers: rideData.passengers?.length || 0,
          invitations: Object.keys(rideData.invitations || {}).length
        });
        
        // Add driver (only if not already in passengers or invitations)
        if (rideData.driver) {
          // Check if this driver is actually the creator and should be a passenger
          const isCreatorDriver = rideData.creatorId === rideData.driver.uid;
          const shouldBePassenger = isCreatorDriver && rideData.creatorRole === 'passenger';
          
          console.log('🔍 Driver analysis:', {
            driverUid: rideData.driver.uid,
            creatorId: rideData.creatorId,
            creatorRole: rideData.creatorRole,
            isCreatorDriver,
            shouldBePassenger
          });
          
          // Skip adding driver if creator should be passenger
          if (shouldBePassenger) {
            console.log('🔍 Skipping driver - creator should be passenger');
          } else {
            const isDriverAlreadyIncluded = rideData.passengers?.some(p => p.uid === rideData.driver.uid) ||
                                          rideData.invitations?.[rideData.driver.uid];
            
            if (!isDriverAlreadyIncluded) {
              const driverData = {
              ...rideData.driver,
              role: 'driver',
              invitationStatus: 'accepted',
              isCreator: rideData.creatorId === rideData.driver.uid,
              color: '#2196F3',
              displayName: rideData.driver.displayName || rideData.driver.name || `User ${rideData.driver.uid?.slice(-4)}` || 'Driver'
              };

              // If current user is the driver and has location, use it immediately
              if (rideData.driver.uid === user?.uid && location) {
                driverData.location = { lat: location.latitude, lng: location.longitude };
                console.log('📍 Current user is driver, using active location:', driverData.location);
              }

              // Try to get driver's current location from their profile (only if not already set)
              if (!driverData.location) {
                try {
                  const driverProfileRef = doc(db, 'users', rideData.driver.uid);
                  getDoc(driverProfileRef).then((driverDoc) => {
                    if (driverDoc.exists()) {
                      const driverProfileData = driverDoc.data();
                      if (driverProfileData.currentLocation && driverProfileData.currentLocation.lat && driverProfileData.currentLocation.lng) {
                        console.log('📍 Found driver current location from profile:', {
                          uid: rideData.driver.uid,
                          displayName: driverData.displayName,
                          location: driverProfileData.currentLocation
                        });

                        // Update driver's location in participants
                        setParticipants(prev => prev.map(p => 
                          p.uid === rideData.driver.uid 
                            ? { ...p, location: driverProfileData.currentLocation }
                            : p
                        ));
                      } else {
                        console.log('📍 Driver profile found but no current location available');
                      }
                    } else {
                      console.log('📍 Driver profile not found');
                    }
                  }).catch((error) => {
                    // Handle permission errors gracefully
                    if (error.code === 'permission-denied') {
                      console.log('📍 Permission denied for driver profile:', rideData.driver.uid, '- this is expected');
                    } else {
                      console.warn('📍 Error fetching driver profile for location:', rideData.driver.uid, error);
                    }
                  });
                } catch (error) {
                  console.warn('📍 Failed to fetch driver profile for location:', rideData.driver.uid, error);
                }
              }

              allParticipants.push(driverData);
            }
          }
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
            }
          });
        }
        
        // Add invitations (only accepted and pending ones - exclude declined)
        if (rideData.invitations) {
          Object.entries(rideData.invitations).forEach(([inviteeId, invitation]) => {
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
                role: invitation.role || 'passenger',
                invitationStatus: invitation.status,
                isCreator: rideData.creatorId === inviteeId,
                isPendingInvitation: invitation.status === 'pending',
                color: '#607D8B'
              };
              
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
                    location: participantData.location
                  });
                  
                  // Log the complete participant data for debugging
                  console.log('🗺️ Complete participant data with RSVP location:', {
                    uid: inviteeId,
                    displayName: participantData.displayName,
                    status: invitation.status,
                    role: participantData.role,
                    location: participantData.location,
                    pickupLocation: participantData.pickupLocation,
                    readyTime: participantData.readyTime,
                    locationSharing: participantData.locationSharing,
                    notes: participantData.notes
                  });
                }
              }

                // Try to get current location from user profile if RSVP location is not available
                if (!participantData.location && invitation.status === 'accepted') {
                  // Use a more robust approach with proper error handling
                  const fetchUserLocation = async () => {
                    try {
                      const userProfileRef = doc(db, 'users', inviteeId);
                      const userDoc = await getDoc(userProfileRef);
                      
                      if (userDoc.exists()) {
                        const userData = userDoc.data();
                        if (userData.currentLocation && userData.currentLocation.lat && userData.currentLocation.lng) {
                          console.log('📍 Found current location for participant from profile:', {
                            uid: inviteeId,
                            displayName: participantData.displayName,
                            location: userData.currentLocation
                          });

                          // Update participant's location in state
                          setParticipants(prev => prev.map(p => 
                            p.uid === inviteeId 
                              ? { ...p, location: userData.currentLocation }
                              : p
                          ));
                        }
                      }
                    } catch (error) {
                      // Handle permission errors gracefully
                      if (error.code === 'permission-denied') {
                        console.log('📍 Permission denied for user profile:', inviteeId, '- this is expected for non-friends');
                      } else {
                        console.warn('📍 Error fetching user profile for location:', inviteeId, error);
                      }
                    }
                  };

                  // Execute the fetch function
                  fetchUserLocation();
              }
              
              allParticipants.push(participantData);
            }
          });
        }
        
        setParticipants(allParticipants);
        
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
          hasLocation: !!(p.location && p.location.lat && p.location.lng)
        })));
          
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
        
        setParticipants(uniqueParticipants);
        
        console.log('🗺️ Final participants state updated with RSVP data:', uniqueParticipants.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          status: p.invitationStatus,
          role: p.role,
          hasLocation: !!(p.location && p.location.lat && p.location.lng),
          location: p.location,
          pickupLocation: p.pickupLocation
        })));
        
        // Additional debug: Check if any participants have RSVP locations
        const participantsWithRSVPLocations = uniqueParticipants.filter(p => 
          p.location && p.location.lat && p.location.lng && p.invitationStatus === 'accepted'
        );
        
        console.log('🗺️ Participants with RSVP locations:', participantsWithRSVPLocations.map(p => ({
          uid: p.uid,
          displayName: p.displayName,
          role: p.role,
          location: p.location,
          pickupLocation: p.pickupLocation
        })));
        
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
        const hasParticipantsWithLocations = uniqueParticipants.some(p => 
          p.location && p.location.lat && p.location.lng && p.invitationStatus === 'accepted'
        );
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
          setTimeout(() => {
            // Use the route calculation manager for better control
            routeCalculationManager(true); // Force calculation for participant changes
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
        
        setLoading(false);
        } else {
          console.log('Ride document does not exist');
          setError('Ride not found');
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error in ride subscription:', error);
        
        // Handle different types of Firebase errors
        if (error.code === 'permission-denied') {
          console.log('Permission denied for ride subscription - user may not have access to this ride');
          setError('You do not have permission to view this ride. Please check your account status.');
        } else if (error.code === 'unavailable') {
          console.error('Database service unavailable for ride subscription');
          setError('Database service is temporarily unavailable. Please try again later.');
        } else if (error.code === 'not-found') {
          console.error('Ride not found');
          setError('Ride not found. It may have been deleted or you may not have access to it.');
        } else {
          console.error('Unexpected error in ride subscription:', error);
          setError('Failed to load ride data. Please try again later.');
        }
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [rideId, user?.uid, showInvitationModal, isManuallyOpened, hasLeftRide]);

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

  // Recalculate route when participants get location updates
  useEffect(() => {
    if (!calculatedRoute || !participants.length) return;

    // Check if we have enough participants with locations to calculate a route
    const participantsWithLocations = participants.filter(p => 
      p.location && p.location.lat && p.location.lng && p.invitationStatus === 'accepted'
    );

    if (participantsWithLocations.length > 0 && ride?.destination?.location) {
      console.log('📍 Participants received location updates, triggering route recalculation:', 
        participantsWithLocations.map(p => ({ uid: p.uid, displayName: p.displayName }))
      );

      // Check if driver now has a location
      const driver = participants.find(p => p.role === 'driver');
      const driverHasLocation = driver && driver.location && driver.location.lat && driver.location.lng;

      // If driver just got a location, this is important for route calculation
      if (driverHasLocation) {
        console.log('🚗 Driver now has location, this will enable complete route calculation!');
      }

      // Debounce route recalculation to avoid too frequent updates
      const timeoutId = setTimeout(() => {
          routeCalculationManager(true); // Force calculation for participant location changes
        }, 2000); // Small delay to ensure all location updates are processed

      return () => clearTimeout(timeoutId);
    }
  }, [participants.map(p => p.location?.lat && p.location?.lng).join(',')]); // Track location changes

  // Trigger route recalculation when participants array changes (for new RSVP responses)
  useEffect(() => {
    if (!calculatedRoute || !participants.length || !ride?.destination?.location) return;

    // Check if we have new participants with locations
    const participantsWithLocations = participants.filter(p => 
      p.location && p.location.lat && p.location.lng && p.invitationStatus === 'accepted'
    );

    if (participantsWithLocations.length > 0) {
      console.log('🗺️ Participants array updated, checking for new RSVP locations:', 
        participantsWithLocations.map(p => ({ 
          uid: p.uid, 
          displayName: p.displayName, 
          hasPickupLocation: !!p.pickupLocation 
        }))
      );

      // Trigger route recalculation after a short delay to ensure all updates are processed
      const timeoutId = setTimeout(() => {
        console.log('🗺️ Triggering route recalculation due to participants update');
        routeCalculationManager(true);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [participants.length]); // Track when participants array length changes

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
        // Don't set error for expected "User not found" errors
        if (!error.message?.includes('User not found')) {
        setLocationError('Failed to start location tracking');
        }
      });
        setLocationTrackingInitialized(true);
    } else if (!isDriver && isTracking) {
      console.log('Stopping location tracking - user is no longer driver');
      stopTracking();
        setLocationTrackingInitialized(true);
      }
    }

    // Cleanup function
    return () => {
      if (isTracking) {
        console.log('Cleaning up location tracking');
        stopTracking();
      }
    };
  }, [ride?.driver?.uid, user?.uid, locationTrackingInitialized]); // Removed isTracking, startTracking, stopTracking from dependencies

  // Handle location tracking status changes
  useEffect(() => {
    if (locationTrackingInitialized) {
      const isDriver = ride?.driver?.uid === user?.uid;
      
      // If user is no longer driver but still tracking, stop it
      if (!isDriver && isTracking) {
        console.log('User is no longer driver, stopping location tracking');
        stopTracking();
      }
    }
  }, [ride?.driver?.uid, user?.uid, isTracking, locationTrackingInitialized]);

  // Handle location toggle change
  const handleLocationToggleChange = (enabled, overrideData) => {
    console.log('Location toggle changed:', { enabled, overrideData });
    
    if (enabled && isTracking && ride?.driver?.uid === user?.uid) {
      // Location was enabled, restart tracking if needed
      console.log('Location enabled, ensuring tracking is active');
      if (!isTracking) {
        startTracking(user.uid, { 
          context: LOCATION_CONTEXTS.DRIVER_MODE 
        });
      }
    } else if (!enabled && isTracking) {
      // Location was disabled, stop tracking
      console.log('Location disabled, stopping tracking');
      stopTracking();
    }
  };



  // Load location permission status
  useEffect(() => {
    const loadPermissionStatus = async () => {
      if (user?.uid) {
        try {
          // Simplified - just set default status
          setLocationPermissionStatus('granted');
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
          calculateRoute();
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

    setIsSubmittingRSVP(true);
    try {
      const rideRef = doc(db, 'rides', rideId);
      const currentRSVP = getCurrentUserRSVPStatus();
      
      // Validate and clean location data before saving
      let cleanedRsvpData = { ...rsvpData };
      if (cleanedRsvpData.location) {
        if (cleanedRsvpData.location.lng === undefined || 
            cleanedRsvpData.location.lat === undefined ||
            cleanedRsvpData.location.lng === null || 
            cleanedRsvpData.location.lat === null) {
          console.warn('Invalid location data detected, removing location from RSVP data:', cleanedRsvpData.location);
          delete cleanedRsvpData.location;
        }
      }
      
      // Update the invitation status
      await updateDoc(rideRef, {
        [`invitations.${user.uid}.status`]: cleanedRsvpData.status,
        [`invitations.${user.uid}.respondedAt`]: serverTimestamp(),
        [`invitations.${user.uid}.response`]: cleanedRsvpData
      });

      // Immediately update the participants array with the new RSVP data
      if (cleanedRsvpData.status === 'accepted' && cleanedRsvpData.location) {
        console.log('🗺️ Immediately updating participants with new RSVP data:', {
          uid: user.uid,
          displayName: user.displayName,
          location: cleanedRsvpData.location,
          pickupLocation: cleanedRsvpData.pickupLocation
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
      }

      // Handle participant management based on status change
      if (cleanedRsvpData.status === 'accepted') {
        const userData = {
          uid: user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email,
          role: cleanedRsvpData.role || 'passenger',
          pickupLocation: cleanedRsvpData.pickupLocation,
          readyTime: cleanedRsvpData.readyTime,
          locationSharing: cleanedRsvpData.locationSharing,
          notes: cleanedRsvpData.notes,
          joinedAt: new Date()
        };

        if (cleanedRsvpData.location) {
          userData.location = {
            lat: cleanedRsvpData.location.lat,
            lng: cleanedRsvpData.location.lng,
            address: cleanedRsvpData.location.address || cleanedRsvpData.pickupLocation,
            lastUpdated: new Date()
          };
          
          // Validate location data - if lng is undefined, remove the location
          if (userData.location.lng === undefined || userData.location.lat === undefined) {
            console.warn('Invalid location data detected, removing location:', userData.location);
            delete userData.location;
          }
        }

        if (cleanedRsvpData.role === 'driver') {
          const driverData = {
            ...userData,
            avoidTolls: cleanedRsvpData.avoidTolls || false
          };
          await updateDoc(rideRef, {
            driver: driverData
          });
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
                
                if (cleanedRsvpData.location) {
                  updatedUserData.location = {
                    lat: cleanedRsvpData.location.lat,
                    lng: cleanedRsvpData.location.lng,
                    address: cleanedRsvpData.location.address || cleanedRsvpData.pickupLocation,
                    lastUpdated: new Date()
                  };
                  
                  // Validate location data - if lng is undefined, remove the location
                  if (updatedUserData.location.lng === undefined || updatedUserData.location.lat === undefined) {
                    console.warn('Invalid location data detected, removing location:', updatedUserData.location);
                    delete updatedUserData.location;
                  }
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
      } else if (currentRSVP?.status === 'accepted' && cleanedRsvpData.status !== 'accepted') {
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
        routeCalculationManager(true); // Force calculation for RSVP changes
      }, 2000); // Give time for Firestore to update
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      let errorMessage = 'Failed to submit RSVP. Please try again.';
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not have access to update this ride.';
      } else if (error.message.includes('location')) {
        errorMessage = 'There was an issue with the location data. Please try selecting your pickup location again.';
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmittingRSVP(false);
    }
  };

  // Handle leaving ride
  const handleLeaveRide = async () => {
    if (!ride || !user) return;
    
    const isDriver = ride.driver?.uid === user.uid;
    const hasInvitation = ride.invitations?.[user.uid];
    const isExpired = isRideExpired || ride.status === 'expired';
    const isActiveRide = ride.status === 'active' || ride.status === 'created' || ride.status === 'forming' || ride.status === 'pending' || ride.status === 'ready';
    
    const confirmMessage = isExpired 
      ? 'This ride has expired. Are you sure you want to leave this ride?' 
      : 'Are you sure you want to leave this ride?';
    
    if (window.confirm(confirmMessage)) {
      try {
        console.log('🚨 User leaving ride:', {
          rideId,
          userId: user.uid,
          isDriver,
          rideStatus: ride.status,
          isExpired,
          isActiveRide,
          hasInvitation
        });

        if (isDriver) {
          console.log('📍 Stopping location tracking for driver...');
          stopTracking();
        }

        const rideRef = doc(db, 'rides', rideId);
        
        // Handle invitations
        if (hasInvitation) {
          await updateDoc(rideRef, {
            [`invitations.${user.uid}.status`]: 'left',
            [`invitations.${user.uid}.respondedAt`]: serverTimestamp(),
            [`invitations.${user.uid}.response`]: {
              status: 'left',
              reason: isExpired ? 'User left expired ride' : 'User left the ride',
              leftAt: serverTimestamp()
            }
          });
        }

        // Handle driver leaving
        if (isDriver) {
          const updateData = {
            driver: null,
            updatedAt: serverTimestamp(),
            statusHistory: arrayUnion({
              status: 'driver_left',
              timestamp: new Date().toISOString(),
              updatedBy: user.uid,
              reason: isExpired ? 'Driver left expired ride' : 'Driver left the ride',
              previousStatus: ride.status
            })
          };
          
          // Only update status if ride is not already expired/cancelled
          if (isActiveRide) {
            updateData.status = 'cancelled';
            updateData.statusHistory = arrayUnion({
                status: 'cancelled',
                timestamp: new Date().toISOString(),
                updatedBy: user.uid,
                reason: 'Driver left the ride',
                previousStatus: ride.status
            });
          }
          
          await updateDoc(rideRef, updateData);
          
          console.log('🚨 Driver left ride - ride status updated to cancelled');
        } else {
          // Handle passenger leaving
          const updatedPassengers = (ride.passengers || []).filter(p => p.uid !== user.uid);
          const updatedPassengerUids = (ride.passengerUids || []).filter(uid => uid !== user.uid);
          
          const updateData = {
            passengers: updatedPassengers,
            passengerUids: updatedPassengerUids,
            updatedAt: serverTimestamp(),
            statusHistory: arrayUnion({
              status: 'passenger_left',
              timestamp: new Date().toISOString(),
              updatedBy: user.uid,
              reason: isExpired ? 'Passenger left expired ride' : 'Passenger left the ride',
              previousStatus: ride.status
            })
          };

          await updateDoc(rideRef, updateData);
          
          console.log('🚨 Passenger left ride - passenger arrays updated');
        }

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
                routeCalculationManager(true);
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
        
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
        
      } catch (error) {
        console.error('❌ Error leaving ride:', error);
        
        // Handle permission errors for expired rides
        if (error.code === 'permission-denied' && isExpired) {
          console.log('⚠️ Permission denied for expired ride - this is expected');
          // Still redirect user since they can't interact with expired rides anyway
          setHasLeftRide(true);
          setSuccessMessage('You have left the expired ride.');
          setTimeout(() => {
            navigate('/dashboard');
          }, 1500);
        } else {
          setError('Failed to leave ride. Please try again.');
        }
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
    setIsDriveMode(false); // Exit drive mode when closing modal
  };
  
  // Drive mode functions
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
    generateNavigationInstructions();
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
  
  const generateNavigationInstructions = () => {
    if (!calculatedRoute) return;
    
    try {
      const routeFeature = calculatedRoute.features?.[0];
      if (!routeFeature?.geometry?.coordinates) return;
      
      const coordinates = routeFeature.geometry.coordinates;
      const instructions = [];
      
      // Generate turn-by-turn instructions from route geometry
      for (let i = 0; i < coordinates.length - 1; i++) {
        const current = coordinates[i];
        const next = coordinates[i + 1];
        
        // Calculate bearing between points
        const bearing = calculateBearing(current[1], current[0], next[1], next[0]);
        
        // Determine turn type based on bearing change
        const turnType = getTurnType(bearing);
        
        instructions.push({
          index: i,
          coordinates: current,
          bearing,
          turnType,
          distance: calculateDistanceBetweenPoints(current, next),
          instruction: `${turnType} at ${getStreetName(current)}`
        });
      }
      
      setNavigationInstructions(instructions);
      setCurrentInstruction(instructions[0]);
      setNextTurn(instructions[1]);
      
      // Start voice navigation if enabled
      if (isVoiceEnabled) {
        speakInstruction(instructions[0]);
      }
      
      console.log('🗺️ Generated navigation instructions:', instructions.length);
    } catch (error) {
      console.error('❌ Error generating navigation instructions:', error);
    }
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
  
  const updateRouteProgress = () => {
    if (!calculatedRoute || !location) return;
    
    try {
      const routeFeature = calculatedRoute.features?.[0];
      if (!routeFeature?.geometry?.coordinates) return;
      
      const coordinates = routeFeature.geometry.coordinates;
      let totalDistance = 0;
      let traveledDistance = 0;
      
      // Calculate total route distance
      for (let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += calculateDistanceBetweenPoints(coordinates[i], coordinates[i + 1]);
      }
      
      // Find closest point on route to current location
      let minDistance = Infinity;
      let closestIndex = 0;
      
      for (let i = 0; i < coordinates.length; i++) {
        const distance = calculateDistanceBetweenPoints(
          [location.longitude, location.latitude],
          coordinates[i]
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = i;
        }
      }
      
      // Calculate progress based on closest point
      const progress = (closestIndex / (coordinates.length - 1)) * 100;
      setRouteProgress(Math.min(progress, 100));
      
      // Update current instruction based on progress
      if (navigationInstructions.length > 0) {
        const currentIndex = Math.floor(progress / 100 * navigationInstructions.length);
        if (currentIndex < navigationInstructions.length) {
          setCurrentInstruction(navigationInstructions[currentIndex]);
          setNextTurn(navigationInstructions[currentIndex + 1]);
          
          // Speak next instruction if approaching turn
          if (currentIndex > 0 && isVoiceEnabled) {
            const nextInstruction = navigationInstructions[currentIndex];
            if (nextInstruction.distance < 0.5) { // Within 500m of turn
              speakInstruction(nextInstruction);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error updating route progress:', error);
    }
  };
  
  // Compass/heading functionality for drive mode
  const handleCompassPermission = async () => {
    try {
      // Check if device orientation is supported
      if (!window.DeviceOrientationEvent) {
        console.log('⚠️ Device orientation not supported on this device');
        return false;
      }
      
      // Request permission for iOS devices
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          console.log('✅ Compass permission granted');
          return true;
        } else {
          console.log('❌ Compass permission denied');
          return false;
        }
      }
      
      // For Android and other devices, assume permission is granted
      return true;
    } catch (error) {
      console.error('❌ Error requesting compass permission:', error);
      return false;
    }
  };
  
  const startCompassTracking = () => {
    if (!window.DeviceOrientationEvent) {
      console.log('⚠️ Device orientation not supported');
      return;
    }
    
    const handleOrientation = (event) => {
      if (event.alpha !== null) {
        // iOS devices
        setUserHeading(event.alpha);
      } else if (event.webkitCompassHeading !== undefined) {
        // WebKit devices (Safari)
        setUserHeading(event.webkitCompassHeading);
      } else if (event.absolute && event.alpha !== null) {
        // Android devices
        setUserHeading(event.alpha);
      }
    };
    
    window.addEventListener('deviceorientation', handleOrientation);
    
    // Store the handler for cleanup
    window._compassHandler = handleOrientation;
    
    setIsCompassEnabled(true);
    console.log('🧭 Compass tracking started');
  };
  
  const stopCompassTracking = () => {
    if (window._compassHandler) {
      window.removeEventListener('deviceorientation', window._compassHandler);
      delete window._compassHandler;
    }
    
    setIsCompassEnabled(false);
    setUserHeading(0);
    console.log('🧭 Compass tracking stopped');
  };
  
  const getMapRotation = () => {
    if (!isDriveMode || !isCompassEnabled) return 0;
    
    // Calculate the rotation needed to orient the map with user's heading
    // This will make the map rotate so "up" is the direction the user is facing
    return -userHeading;
  };

  // Handle keyboard shortcuts for map modal
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isMapModalOpen) return;
      
      // F11 or F key for full screen toggle
      if (event.key === 'F11' || event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        handleMapFullScreenToggle();
      }
      
      // Escape key to close modal
      if (event.key === 'Escape') {
        event.preventDefault();
        handleMapModalClose();
      }
      
      // Arrow keys for route navigation in full screen
      if (isMapFullScreen && calculatedRoute) {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          setCurrentRouteStep(prev => Math.min(prev + 1, (calculatedRoute.routes?.[0]?.waypoints?.length || 0) - 1));
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setCurrentRouteStep(prev => Math.max(prev - 1, 0));
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMapModalOpen, isMapFullScreen, calculatedRoute]);

  // Update current location for route tracking
  useEffect(() => {
    if (location && isMapFullScreen && !isRideExpired) {
      setCurrentLocation(location);
    }
  }, [location, isMapFullScreen, isRideExpired]);
  
  // Update route progress in drive mode
  useEffect(() => {
    if (isDriveMode && location && calculatedRoute) {
      updateRouteProgress();
    }
  }, [location, isDriveMode, calculatedRoute]);
  
  // Cleanup compass tracking on unmount
  useEffect(() => {
    return () => {
      if (window._compassHandler) {
        stopCompassTracking();
      }
    };
  }, []);

  // Check ride expiration when ride data loads
  useEffect(() => {
    if (ride) {
      const expired = checkRideExpiration(ride);
      if (expired) {
        console.log('🚗 Ride has expired, disabling location tracking and route updates');
      }
    }
  }, [ride, checkRideExpiration]);

  // Process route information for turn-by-turn directions
  const getRouteInformation = () => {
    if (!calculatedRoute) {
      return null;
    }

    // Handle new optimized route format
    if (calculatedRoute.type === 'FeatureCollection' && calculatedRoute.features) {
      const routeFeature = calculatedRoute.features[0];
      const properties = routeFeature.properties;
      
      // Convert waypointInfo to waypoints format expected by RouteInformationPanel
      const waypoints = [];
      if (calculatedRoute.waypointInfo && calculatedRoute.waypointInfo.length > 0) {
        // First, build a mapping of display names to actual participant data
        const participantMap = new Map();
        
        // Add driver
        const driver = participants.find(p => p.role === 'driver' || p.uid === ride.driver?.uid);
        if (driver) {
          participantMap.set(driver.displayName || 'Driver', driver);
          participantMap.set('Driver', driver);
        }
        
        // Add passengers
        participants.forEach(p => {
          if (p.role !== 'driver' && p.displayName) {
            participantMap.set(p.displayName, p);
          }
        });
        
        // Add destination
        if (ride.destination) {
          const destinationName = ride.destination.name || 
                                 ride.destination.address || 
                                 ride.destination.displayName || 
                                 'Destination';
          participantMap.set('Destination', ride.destination);
          participantMap.set(destinationName, ride.destination);
        }
        
        calculatedRoute.waypointInfo.forEach((leg, index) => {
          // Add the "from" waypoint
          if (index === 0) {
            const fromParticipant = participantMap.get(leg.from) || participantMap.get('Driver');
            waypoints.push({
              type: 'origin',
              displayName: leg.from || 'Driver',
              location: fromParticipant?.location || { lat: 0, lng: 0 },
              isCurrent: index === currentRouteStep,
              uid: fromParticipant?.uid,
              role: fromParticipant?.role
            });
          }
          
          // Add the "to" waypoint
          const toParticipant = participantMap.get(leg.to);
          const isDestination = index === calculatedRoute.waypointInfo.length - 1;
          waypoints.push({
            type: isDestination ? 'destination' : 'pickup',
            displayName: leg.to || `Waypoint ${index + 2}`,
            location: toParticipant?.location || { lat: 0, lng: 0 },
            isCurrent: index + 1 === currentRouteStep,
            distance: leg.distance,
            duration: leg.duration,
            uid: toParticipant?.uid,
            role: toParticipant?.role
          });
        });
      } else {
        // Fallback: create basic waypoints from participants
        const driver = participants.find(p => p.role === 'driver');
        if (driver && driver.location) {
          waypoints.push({
            type: 'origin',
            displayName: driver.displayName || 'Driver',
            location: driver.location,
            isCurrent: currentRouteStep === 0
          });
        }
        
        const passengers = participants.filter(p => p.role !== 'driver' && p.location);
        passengers.forEach((passenger, index) => {
          waypoints.push({
            type: 'pickup',
            displayName: passenger.displayName || `Passenger ${index + 1}`,
            location: passenger.location,
            isCurrent: currentRouteStep === index + 1
          });
        });
        
        if (ride.destination && ride.destination.location) {
          waypoints.push({
            type: 'destination',
            displayName: 'Destination',
            location: ride.destination.location,
            isCurrent: currentRouteStep === waypoints.length
          });
        }
      }

      return {
        isOptimized: properties?.routeType === 'optimized',
        optimizationType: calculatedRoute.optimizationType || 'basic',
        totalDistance: calculatedRoute.totalDistance || 0,
        totalDuration: calculatedRoute.totalDuration || 0,
        waypointCount: waypoints.length,
        waypointInfo: calculatedRoute.waypointInfo || [],
        progress: ((currentRouteStep + 1) / waypoints.length) * 100,
        currentStep: currentRouteStep,
        totalSteps: waypoints.length,
        currentWaypoint: waypoints[currentRouteStep] || waypoints[0],
        nextWaypoint: waypoints[currentRouteStep + 1],
        waypoints: waypoints,
        routeGeometry: routeFeature.geometry
      };
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
      totalDistance: calculatedRoute.totalDistance,
      totalDuration: calculatedRoute.totalDuration,
        progress: ((currentStep + 1) / totalSteps) * 100,
        isOptimized: false,
        optimizationType: 'legacy'
    };
    }

    return null;
  };

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
        console.log('🔵 LiveRideView: Rendering RideInvitationModal with props:', {
          showInvitationModal,
          rideId: ride?.id,
          userId: user?.uid,
          createdBy: ride?.createdBy
        }) || (
        <RideInvitationModal
          isOpen={showInvitationModal}
          onClose={() => { 
            console.log('🔵 LiveRideView: Closing modal');
            setShowInvitationModal(false); 
            setUserInvitation(null); 
          }}
          ride={ride}
          inviter={{
            uid: ride.createdBy,
            displayName: displayNames[ride.createdBy] || ride.creatorName || 'Ride Creator',
            photoURL: ride.creatorPhotoURL || '/default-avatar.png'
          }}
          currentUserId={user.uid}
          onRSVPSubmit={handleRSVPSubmit}
        />
        )
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

        {/* Success Message Banner */}
        {successMessage && (
          <Box sx={{
            background: 'linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%)',
            border: '1px solid #4caf50',
            borderRadius: { xs: 0, sm: 2 },
            p: 2,
            mb: 2,
            textAlign: 'center'
          }}>
            <Typography variant="body1" fontWeight={600} color="success.main" sx={{ mb: 0.5 }}>
              ✅ {successMessage}
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
            mx: { xs: 1, sm: 2 },
            mb: 3,
            borderRadius: '12px',
            '&:hover': {
            transform: 'scale(1.01)',
            boxShadow: '0 8px 25px rgba(0,0,0,0.15)'
            }
          }} onClick={() => setIsMapModalOpen(true)}>
            {console.log('🗺️ LiveRideView - Passing participants to MapView:', participants.map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              status: p.invitationStatus,
              role: p.role,
              hasLocation: !!(p.location && p.location.lat && p.location.lng),
              location: p.location
            })))}
            
            {console.log('🗺️ LiveRideView - Participants that should show on map:', participants.filter(p => 
              p.location && p.location.lat && p.location.lng && (p.invitationStatus === 'accepted' || p.role === 'driver')
            ).map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              role: p.role,
              status: p.invitationStatus,
              location: p.location,
              pickupLocation: p.pickupLocation
            })))}
            <MapView
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
              Live Route Map • {participants.filter(p => p.location && p.invitationStatus === 'accepted').length} participants
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Tap to view full screen
                </Typography>
            </Box>
          </Box>
              
        {/* 2. DESTINATION & TABS DIV */}
        <Box sx={{
          p: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3 },
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          mx: { xs: 1, sm: 2 },
          mb: 3,
          overflow: 'hidden'
        }}>
          {/* Destination */}
          <Box sx={{ 
            mb: 3,
            pb: 3,
            borderBottom: '2px solid rgba(0, 0, 0, 0.06)'
          }}>
                <Box display="flex" alignItems="center" gap={1}>
                <Typography 
                variant="h6" 
                fontWeight={600} 
                color="text.primary" 
                  sx={{ 
                    flex: 1, 
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                    lineHeight: 1.2
                  }}
                >
                Ride to {ride.destination?.address || 'No destination set'}
                  </Typography>
              {/* Edit Button */}
                  {canEditRide && (
                    <IconButton 
                      size="small" 
                  onClick={() => { /* TODO: Implement inline destination editing */ }}
                      sx={{ color: vibe.accent }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
            </Box>

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
                      
                      console.log('🔢 Total participants calculation:', {
                        acceptedParticipants: acceptedParticipants.length,
                        driverInParticipants,
                        hasDriver: !!ride.driver,
                        totalCount
                      });
                      
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
                        p.role === 'driver' && p.invitationStatus === 'accepted'
                      );
                      
                      console.log('🔢 Seat calculation debug:', {
                        totalParticipants: participants.length,
                        allParticipants: participants.map(p => ({
                          uid: p.uid,
                          displayName: p.displayName,
                          role: p.role,
                          status: p.invitationStatus,
                          isCreator: p.isCreator
                        })),
                        drivers: drivers.map(d => ({
                          uid: d.uid,
                          displayName: d.displayName,
                          role: d.role,
                          status: d.invitationStatus
                        }))
                      });
                      
                      // If no drivers, return 0 seats
                      if (drivers.length === 0) {
                        console.log('🔢 No drivers found, returning 0 seats');
                        return 0;
                      }
                      
                      // Calculate total seats available from all drivers
                      const totalSeatsAvailable = drivers.length * 4; // Each driver has 4 seats
                      
                      // Count accepted passengers (excluding drivers)
                      const acceptedPassengers = participants.filter(p => 
                        p.invitationStatus === 'accepted' && p.role !== 'driver'
                      );
                      
                      const remainingSeats = Math.max(0, totalSeatsAvailable - acceptedPassengers.length);
                      
                      console.log('🔢 Seat calculation:', {
                        drivers: drivers.length,
                        totalSeatsAvailable,
                        acceptedPassengers: acceptedPassengers.length,
                        remainingSeats
                      });
                      
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
                
                // Calculate how many drivers are needed
                const passengersPerDriver = 4; // Each driver can take 4 passengers
                const driversNeeded = Math.ceil(acceptedPassengers.length / passengersPerDriver);
                
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
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, 
                gap: 3, 
              mb: 4 
            }}>
                {/* Start Time */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 2,
                  p: 3,
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
                    <Typography variant="h6" color={vibe.accent}>🕐</Typography>
                </Box>
              <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      START TIME
                  </Typography>
                <Typography variant="body2" color="text.primary" sx={{ 
                  fontWeight: 500,
                      lineHeight: 1.2
                }}>
                      {ride.startTime ? new Date(ride.startTime).toLocaleString() : 
                       ride.createdAt ? ride.createdAt.toDate().toLocaleString() : 'Not set'}
                  </Typography>
                </Box>
              </Box>

                {/* Destination */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 2,
                  p: 3,
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
                      DESTINATION
                </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ 
                      fontWeight: 500,
                      lineHeight: 1.2,
                      wordBreak: 'break-word'
                    }}>
                      {ride.destination?.address || 'No destination set'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                      *make this copyable for both laptop and mobile views
                    </Typography>
                  </Box>
                </Box>
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
                  DESCRIPTION
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

              {/* Special Notes */}
            <Box sx={{ 
              mb: 4,
              p: 3,
              background: 'rgba(248, 249, 250, 0.6)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)'
            }}>
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
                
                {/* Compact Participants Layout */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Driver Row */}
              {ride.driver && (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                      p: 2,
                  background: 'white',
                      borderRadius: '8px',
                      border: '1px solid rgba(0, 0, 0, 0.06)'
                }}>
                  <Avatar 
                    src={ride.driver.photoURL} 
                        sx={{ width: 32, height: 32, background: vibe.accent }}
                  >
                        {ride.driver.displayName?.charAt(0) || ride.driver.name?.charAt(0) || 'D'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} color="text.primary">
                          driver: {ride.driver.displayName || ride.driver.name || 'Driver'}
                    </Typography>
                  </Box>
                </Box>
              )}

                  {/* Accepted Passengers Row */}
                  {participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').length > 0 && (
                    <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                      p: 2,
                  background: 'white',
                      borderRadius: '8px',
                      border: '1px solid rgba(0, 0, 0, 0.06)'
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').map((passenger, index) => (
                  <Avatar 
                            key={passenger.uid}
                    src={passenger.photoURL} 
                            sx={{ 
                              width: 32, 
                              height: 32,
                              border: '2px solid white',
                              ml: index > 0 ? -1 : 0,
                              zIndex: participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').length - index
                            }}
                  >
                    {passenger.displayName?.charAt(0) || 'P'}
                  </Avatar>
                        ))}
                      </Box>
                  <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} color="text.primary">
                          riders: {participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').map(p => p.displayName || 'Rider').join(', ')}
                    </Typography>
                  </Box>
                </Box>
                  )}

                  {/* Pending Invitations Row */}
                  {participants.filter(p => p.invitationStatus === 'pending').length > 0 && (
                    <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                      p: 2,
                  background: 'rgba(255, 193, 7, 0.1)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 193, 7, 0.3)'
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {participants.filter(p => p.invitationStatus === 'pending').map((invitee, index) => (
                  <Avatar 
                            key={invitee.uid}
                    src={invitee.photoURL} 
                            sx={{ 
                              width: 32, 
                              height: 32,
                              border: '2px solid white',
                              ml: index > 0 ? -1 : 0,
                              zIndex: participants.filter(p => p.invitationStatus === 'pending').length - index
                            }}
                  >
                    {invitee.displayName?.charAt(0) || 'I'}
                  </Avatar>
                        ))}
                      </Box>
                  <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} color="text.primary">
                          pending: {participants.filter(p => p.invitationStatus === 'pending').map(p => p.displayName || 'Invitee').join(', ')}
                    </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* Empty State */}
                  {participants.filter(p => p.role !== 'driver' && p.invitationStatus === 'accepted').length === 0 && 
                   participants.filter(p => p.invitationStatus === 'pending').length === 0 && (
                    <Box sx={{ 
                      textAlign: 'center', 
                      py: 2,
                      color: 'text.secondary'
                    }}>
                      <Typography variant="body2" color="text.secondary">
                        No passengers yet. Invite friends to join your ride!
                    </Typography>
                  </Box>
                  )}
                </Box>
            </Box>

              {/* Route Information */}
              {(() => {
                console.log('🔍 Route display check:', {
                  hasCalculatedRoute: !!calculatedRoute,
                  isCalculatingRoute,
                  routeType: calculatedRoute?.type,
                  totalDistance: calculatedRoute?.totalDistance,
                  totalDuration: calculatedRoute?.totalDuration,
                  hasWaypointInfo: !!calculatedRoute?.waypointInfo,
                  routeKeys: calculatedRoute ? Object.keys(calculatedRoute) : []
                });
                return null;
              })()}
              {calculatedRoute && (
            <Box sx={{ 
              mb: 4,
              p: 3,
              background: 'rgba(248, 249, 250, 0.6)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)'
            }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={3} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ROUTE INFORMATION
              </Typography>
                  
                <Box sx={{ 
                    display: 'grid', 
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, 
                    gap: 3 
                  }}>
                    {/* Distance */}
                    <Box sx={{ 
                      textAlign: 'center',
                      p: 2,
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid rgba(0, 0, 0, 0.06)'
                    }}>
                      <Typography variant="h6" fontWeight={700} color={vibe.accent}>
                        {calculatedRoute?.totalDistance ? 
                          `${calculatedRoute.totalDistance.toFixed(1)}` :
                          calculatedRoute?.routes?.[0]?.distance ? 
                          `${calculatedRoute.routes[0].distance.toFixed(1)}` :
                          calculatedRoute?.routes?.[0]?.legs?.[0]?.distance ? 
                          `${(calculatedRoute.routes[0].legs[0].distance / 1609.34).toFixed(1)}` : 
                          '--'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Miles
                      </Typography>
                    </Box>

                    {/* Duration */}
                    <Box sx={{ 
                      textAlign: 'center',
                      p: 2,
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid rgba(0, 0, 0, 0.06)'
                    }}>
                      <Typography variant="h6" fontWeight={700} color={vibe.accent}>
                        {calculatedRoute?.totalDuration ? 
                          `${Math.round(calculatedRoute.totalDuration)}` :
                          calculatedRoute?.routes?.[0]?.duration ? 
                          `${Math.round(calculatedRoute.routes[0].duration)}` :
                          calculatedRoute?.routes?.[0]?.legs?.[0]?.duration ? 
                          `${Math.round(calculatedRoute.routes[0].legs[0].duration / 60)}` :
                          '--'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Minutes
                      </Typography>
                    </Box>

                    {/* Route Status */}
                    <Box sx={{ 
                      textAlign: 'center',
                      p: 2,
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid rgba(0, 0, 0, 0.06)'
                    }}>
                      <Typography variant="h6" fontWeight={700} color={isCalculatingRoute ? '#ff9800' : '#4caf50'}>
                        {isCalculatingRoute ? '🔄' : '✅'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {isCalculatingRoute ? 'Calculating' : 'Ready'}
                      </Typography>
                    </Box>
                  </Box>

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

                  {/* Route Error Display */}
                  {routeError && (
                    <Box sx={{ 
                      mt: 3,
                  p: 2, 
                  background: '#ffebee', 
                  borderRadius: 2, 
                  border: '1px solid #ffcdd2',
                  textAlign: 'center'
                }}>
                      <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                        Route calculation error: {routeError}
                  </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => routeCalculationManager(true)}
                        disabled={isCalculatingRoute}
                        sx={{ 
                          borderColor: '#f44336',
                          color: '#f44336',
                          '&:hover': {
                            borderColor: '#d32f2f',
                            backgroundColor: '#ffebee'
                          }
                        }}
                      >
                        {isCalculatingRoute ? 'Calculating...' : 'Retry Route'}
                      </Button>
                </Box>
              )}
            </Box>
              )}

              {/* Ride Creation & Management Details */}





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
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Box>

        {/* 3. ACTIONS DIV */}
        <Box sx={{
          p: { xs: 2, sm: 3 },
          pt: 0
        }}>


            {/* Action Buttons */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 3,
              pt: 3,
              mt: 2,
              borderTop: '1px solid rgba(0, 0, 0, 0.08)',
              alignItems: { xs: 'stretch', sm: 'center' }
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
                  borderRadius: 3,
                  fontWeight: 600,
                  borderColor: vibe.accent,
                  color: vibe.accent,
                  px: 3,
                  py: 1.5,
                  fontSize: '0.95rem',
                  minHeight: '44px',
                  flex: { xs: 1, sm: 'none' },
                  '&:hover': {
                    borderColor: vibe.accent,
                    backgroundColor: `${vibe.accent}10`
                  }
                }}
              >
                CHANGE RSVP
              </Button>

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
                  />
                </Box>
              )}

              <Button 
                variant="outlined"
                color="error"
                size="large"
                onClick={handleLeaveRide}
                sx={{
                  borderRadius: 3,
                  fontWeight: 600,
                  borderColor: '#f44336',
                  color: '#f44336',
                  px: 3,
                  py: 1.5,
                  fontSize: '0.95rem',
                  minHeight: '44px',
                  flex: { xs: 1, sm: 'none' },
                  '&:hover': {
                    borderColor: '#d32f2f',
                    backgroundColor: '#ffebee'
                  }
                }}
              >
                LEAVE RIDE
              </Button>
            </Box>
        </Box>
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
                  <DirectionsCar />
                </IconButton>
              )}
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
            {console.log('🗺️ LiveRideView - Passing participants to MapView:', participants.map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              status: p.invitationStatus,
              role: p.role,
              hasLocation: !!(p.location && p.location.lat && p.location.lng),
              location: p.location,
              isCreator: p.isCreator
            })))}
            
            {console.log('🗺️ LiveRideView - Participants that should show on map:', participants.filter(p => 
              p.location && p.location.lat && p.location.lng && (p.invitationStatus === 'accepted' || p.role === 'driver')
            ).map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              role: p.role,
              status: p.invitationStatus,
              location: p.location,
              pickupLocation: p.pickupLocation,
              isCreator: p.isCreator
            })))}
            
            {console.log('🗺️ LiveRideView - All participants with locations:', participants.filter(p => 
              p.location && p.location.lat && p.location.lng
            ).map(p => ({
              uid: p.uid,
              displayName: p.displayName,
              role: p.role,
              status: p.invitationStatus,
              location: p.location,
              pickupLocation: p.pickupLocation,
              isCreator: p.isCreator
            })))}
            
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
              mapRotation={getMapRotation()}
              isDriveMode={isDriveMode}
            />
            
            {/* Route Information Overlay - Hidden in Drive Mode */}
            {!isDriveMode && (
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                    Route Information
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                      {calculatedRoute?.totalDistance ? 
                        `${calculatedRoute.totalDistance.toFixed(1)} miles` : 
                        calculatedRoute?.routes?.[0]?.distance ? 
                        `${calculatedRoute.routes[0].distance.toFixed(1)} miles` : 
                      calculatedRoute?.routes?.[0]?.legs?.[0]?.distance ? 
                      `${(calculatedRoute.routes[0].legs[0].distance / 1609.34).toFixed(1)} miles` : 
                      'Calculating...'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                      {calculatedRoute?.totalDuration ? 
                        `${Math.round(calculatedRoute.totalDuration)} min` :
                        calculatedRoute?.routes?.[0]?.duration ? 
                        `${Math.round(calculatedRoute.routes[0].duration)} min` :
                      calculatedRoute?.routes?.[0]?.legs?.[0]?.duration ? 
                      `${Math.round(calculatedRoute.routes[0].legs[0].duration / 60)} min` :
                      'Calculating...'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Estimated Time
                  </Typography>
                </Box>
              </Box>
              
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
            {calculatedRoute && !isDriveMode && (
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
                  width: '600px',
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
                      <DirectionsCar sx={{ fontSize: 16 }} />
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
                  {/* Seat Availability */}
                  <Box sx={{
                    textAlign: 'center',
                    minWidth:'80px',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '10px',
                    boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
                    border: '1px solid rgba(76, 175, 80, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 5px 15px rgba(0,0,0,0.12)'
                    }
                  }}>
                    <Typography variant="h5" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.5rem', mb: 0.5 }}>
                      {ride.seatsAvailable}
                    </Typography>
                    <Typography variant="caption" color="#7f8c8d" fontWeight={600} sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      seats available
                    </Typography>
                  </Box>

                  {/* Distance Display */}
                  <Box sx={{ 
                    textAlign: 'center',
                    minWidth: '80px',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '10px',
                    boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
                    border: '1px solid rgba(76, 175, 80, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 5px 15px rgba(0,0,0,0.12)'
                    }
                  }}>
                    <Typography variant="h5" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.5rem', mb: 0.5 }}>
                      {calculatedRoute?.totalDistance ? 
                        calculatedRoute.totalDistance.toFixed(1) : 
                        calculatedRoute?.routes?.[0]?.distance ? 
                        calculatedRoute.routes[0].distance.toFixed(1) : 
                        calculatedRoute?.routes?.[0]?.legs?.[0]?.distance ? 
                        (calculatedRoute.routes[0].legs[0].distance / 1609.34).toFixed(1) : 
                        '0.0'}
                    </Typography>
                    <Typography variant="caption" color="#7f8c8d" fontWeight={600} sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      miles
                    </Typography>
                  </Box>

                  {/* Time Display with Start Button */}
                  <Box sx={{ 
                    textAlign: 'center',
                    minWidth: '80px',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '10px',
                    boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
                    border: '1px solid rgba(76, 175, 80, 0.15)',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 5px 15px rgba(0,0,0,0.12)'
                    }
                  }}>
                    <Typography variant="h5" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.5rem', mb: 0.5 }}>
                      {calculatedRoute?.totalDuration ? 
                        Math.round(calculatedRoute.totalDuration) :
                        calculatedRoute?.routes?.[0]?.duration ? 
                        Math.round(calculatedRoute.routes[0].duration) :
                        calculatedRoute?.routes?.[0]?.legs?.[0]?.duration ? 
                        Math.round(calculatedRoute.routes[0].legs[0].duration / 60) :
                        '0'}
                    </Typography>
                    <Typography variant="caption" color="#7f8c8d" fontWeight={600} sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      min
                    </Typography>
                    
                    {/* Compact Start Button */}
                    <Button
                      onClick={handleEnterDriveMode}
                      sx={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-10px',
                        minWidth: '28px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #4CAF50, #45a049)',
                        color: 'white',
                        padding: 0,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        '&:hover': {
                          background: 'linear-gradient(135deg, #45a049, #3d8b40)',
                          transform: 'scale(1.1)',
                          boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)'
                        },
                        transition: 'all 0.2s ease',
                        boxShadow: '0 3px 10px rgba(76, 175, 80, 0.3)'
                      }}
                    >
                      ▶
                    </Button>
                  </Box>
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
        calculatedRoute={calculatedRoute}
        onEnterDriveMode={handleEnterDriveMode}
        onTollsToggle={setTollsEnabled}
        onSeatsChange={setSelectedSeats}
        tollsEnabled={tollsEnabled}
        selectedSeats={selectedSeats}
      />
    </Box>
  );
}

export default LiveRideView; 
