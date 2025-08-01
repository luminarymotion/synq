import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
import { useLocation, LOCATION_PERMISSIONS, LOCATION_CONTEXTS, locationPermissionManager } from '../services/locationTrackingService';
import rideStatusService, { RIDE_STATUS } from '../services/rideStatusService';
// Route optimization temporarily disabled - Mapbox integration pending
import RideInvitationModal from '../components/RideInvitationModal';
import RouteInformationPanel from '../components/RouteInformationPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import LocationToggle from '../components/LocationToggle';
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
  Edit as EditIcon
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
    onLocationUpdate: async (locationData) => {
      if (!ride || ride.driver?.uid !== user.uid || isRideExpired) return;

      // Validate location accuracy and freshness
      const isAccurate = locationData.accuracy && locationData.accuracy < 100; // Within 100 meters
      const isRecent = locationData.timestamp && (Date.now() - locationData.timestamp) < 30000; // Within 30 seconds
      
      if (!isAccurate || !isRecent) {
        console.log('📍 Location update skipped - accuracy:', locationData.accuracy, 'recent:', isRecent);
        return;
      }

      try {
        const rideRef = doc(db, 'rides', rideId);
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

  // Subscribe to ride updates
  useEffect(() => {
    if (!rideId || !user) return;

    const rideRef = doc(db, 'rides', rideId);
    const unsubscribe = onSnapshot(rideRef, async (doc) => {
        if (doc.exists()) {
        const rideData = doc.data();
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
                    location: response.location
                  });
                }
              }
              
              allParticipants.push(participantData);
            }
          });
        }
        
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
      
      // Update the invitation status
      await updateDoc(rideRef, {
        [`invitations.${user.uid}.status`]: rsvpData.status,
        [`invitations.${user.uid}.respondedAt`]: serverTimestamp(),
        [`invitations.${user.uid}.response`]: rsvpData
      });

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

        if (rsvpData.role === 'driver') {
          await updateDoc(rideRef, {
            driver: userData
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
        routeCalculationManager(true); // Force calculation for RSVP changes
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

        console.log('Ride left successfully, redirecting to dashboard...');
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

            {/* Ride Details Grid */}
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

        {/* 3. ACTIONS DIV */}
        <Box sx={{
          p: { xs: 3, sm: 4 },
          pt: 0
        }}>
            {/* Passengers Section */}
            <Box sx={{ 
              mb: 4,
              p: 3,
              background: 'rgba(248, 249, 250, 0.6)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.04)'
            }}>
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
                  </Typography>
                </Box>
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
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}

export default LiveRideView; 
