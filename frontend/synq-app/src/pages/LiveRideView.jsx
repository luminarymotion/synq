import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
import { useLocation } from '../services/locationTrackingService';
import rideStatusService, { RIDE_STATUS } from '../services/rideStatusService';
import { calculateOptimizedRoute } from '../services/routeOptimizerService';
import RideInvitationModal from '../components/RideInvitationModal';
import RouteInformationPanel from '../components/RouteInformationPanel';
import '../styles/LiveRideView.css';
import { 
  Box, Typography, Card, Button, Stack, Divider, Avatar, Chip, Alert, TextField, Modal, IconButton
} from '@mui/material';
import {
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Close as CloseIcon
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
  const [description, setDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  
  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  
  // Location tracking
  const [locationError, setLocationError] = useState(null);
  
  // Route optimization
  const [calculatedRoute, setCalculatedRoute] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);
  
  // Route information and passenger management for full screen mode
  const [currentRouteStep, setCurrentRouteStep] = useState(0);
  const [passengerStatus, setPassengerStatus] = useState({});
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  const {
    location,
    isTracking,
    startTracking,
    stopTracking
  } = useLocation({
    preset: 'realtime',
    updateFirebase: true,
    onLocationUpdate: async (locationData) => {
      if (!ride || ride.driver?.uid !== user.uid) return;

      try {
        const rideRef = doc(db, 'rides', rideId);
        await updateDoc(rideRef, {
          'driver.currentLocation': {
            lat: locationData.latitude,
            lng: locationData.longitude,
            accuracy: locationData.accuracy,
            address: locationData.address,
            lastUpdated: serverTimestamp()
          }
        });
        setLocationError(null);
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
      console.log('Location tracking status:', status);
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

  // Calculate optimized route based on participants and destination
  const calculateRoute = async () => {
    if (!ride) return;

    setIsCalculatingRoute(true);
    setRouteError(null);

    try {
      // Create waypoints array
      const waypoints = [];
      
      // Add driver as starting point (from participants or invitations)
      let driver = null;
      
      // First check if there's a driver in participants
      if (ride.driver) {
        driver = {
          ...ride.driver,
          role: 'driver',
          currentLocation: ride.driver.currentLocation,
          location: ride.driver.location || ride.driver.currentLocation,
          displayName: displayNames[ride.driver.uid] || ride.driver.displayName || 'Driver'
        };
      }
      
      if (driver) {
        const driverLocation = driver.currentLocation || driver.location;
        if (driverLocation && driverLocation.lat && driverLocation.lng) {
          waypoints.push({
            ...driver,
            lat: driverLocation.lat,
            lng: driverLocation.lng,
            location: driverLocation,
            type: 'driver',
            displayName: driver.displayName
          });
        }
      }

      // Use participants array which now includes all users with locations
      const allUsersWithLocations = participants.filter(p => 
        p.location && p.location.lat && p.location.lng && p.role !== 'driver'
      );
      
      console.log('Users with locations for route calculation:', allUsersWithLocations.map(u => ({
        uid: u.uid,
        displayName: u.displayName,
        role: u.role,
        status: u.invitationStatus,
        location: u.location
      })));
      
      // Add all users with locations to waypoints
      allUsersWithLocations.forEach(user => {
        waypoints.push({
          ...user,
          lat: user.location.lat,
          lng: user.location.lng,
          location: user.location,
          type: 'pickup',
          displayName: user.displayName
        });
      });

      // Add destination
      if (ride.destination && ride.destination.location) {
        waypoints.push({
          ...ride.destination,
          lat: ride.destination.location.lat,
          lng: ride.destination.location.lng,
          location: ride.destination.location,
          type: 'destination',
          displayName: 'Destination'
        });
      }

      console.log('Calculating route with waypoints:', waypoints.map(wp => ({
        type: wp.type,
        displayName: wp.displayName,
        location: wp.location,
        role: wp.role,
        uid: wp.uid
      })));
      
      console.log('Participants with locations:', participants.filter(p => p.location).map(p => ({
        uid: p.uid,
        displayName: p.displayName,
        role: p.role,
        status: p.invitationStatus,
        location: p.location
      })));
      
      // Debug: Check what the route optimizer will receive
      console.log('Route optimizer input analysis:', {
        totalWaypoints: waypoints.length,
        drivers: waypoints.filter(w => w.type === 'driver' || w.role === 'driver').length,
        pickupPoints: waypoints.filter(w => (w.type === 'pickup' || w.type === 'waypoint' || w.type === 'passenger') && w.role !== 'driver').length,
        destinations: waypoints.filter(w => w.type === 'destination' || w.type === 'end').length,
        waypointTypes: waypoints.map(w => ({ type: w.type, role: w.role, displayName: w.displayName }))
      });
      
      // More detailed waypoint analysis
      console.log('Detailed waypoint breakdown:', waypoints.map(wp => ({
        displayName: wp.displayName,
        type: wp.type,
        role: wp.role,
        uid: wp.uid,
        hasLocation: !!(wp.location && wp.location.lat && wp.location.lng),
        location: wp.location,
        isDriver: wp.type === 'driver' || wp.role === 'driver',
        isPickup: (wp.type === 'pickup' || wp.type === 'waypoint' || wp.type === 'passenger') && wp.role !== 'driver',
        isDestination: wp.type === 'destination' || wp.type === 'end'
      })));

      if (waypoints.length >= 2) {
        // Check if we have the expected waypoints for a proper route
        const expectedWaypoints = 1 + allUsersWithLocations.length + (ride.destination && ride.destination.location ? 1 : 0);
        
        console.log('Route calculation check:', {
          actualWaypoints: waypoints.length,
          expectedWaypoints: expectedWaypoints,
          driver: waypoints.filter(w => w.type === 'driver').length,
          passengers: allUsersWithLocations.length,
          destination: ride.destination && ride.destination.location ? 1 : 0
        });
        
        if (waypoints.length < expectedWaypoints) {
          console.log('Waiting for all waypoints to be available before calculating route');
          return;
        }
        
        const routeData = await calculateOptimizedRoute(waypoints, {
          maxPassengers: 8,
          maxRouteDistance: 100,
          maxRouteDuration: 120
        });

        console.log('Route calculation completed:', routeData);
        setCalculatedRoute(routeData);
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
        setTitle(rideData.groupName || rideData.name || 'Untitled Ride');

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
            allParticipants.push({
              ...passenger,
              role: 'passenger',
                invitationStatus: 'accepted',
              isCreator: rideData.creatorId === passenger.uid,
                color: ['#FF5722', '#4CAF50', '#9C27B0', '#FF9800'][index % 4],
                displayName: passenger.displayName || passenger.name || `User ${passenger.uid?.slice(-4)}` || 'Passenger'
            });
            }
          });
        }
        
        // Add invitations (including accepted ones with pickup locations)
        if (rideData.invitations) {
          Object.entries(rideData.invitations).forEach(([inviteeId, invitation]) => {
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
              
              // Add location data from RSVP response if available (regardless of status)
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
        
        // Remove duplicates
        const uniqueParticipants = [];
        const seenUids = new Set();
        
        allParticipants.forEach(participant => {
          if (!seenUids.has(participant.uid)) {
            seenUids.add(participant.uid);
            uniqueParticipants.push(participant);
          }
        });
        
        setParticipants(uniqueParticipants);

        // Set participants immediately with available data
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

        // Calculate route when participants change
        if (uniqueParticipants.length > 0) {
          setTimeout(() => calculateRoute(), 1000); // Small delay to ensure display names are loaded
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
      // Debounce route recalculation to avoid too frequent updates
      const timeoutId = setTimeout(() => {
        calculateRoute();
      }, 5000); // Recalculate every 5 seconds when location changes

      return () => clearTimeout(timeoutId);
    }
  }, [location]);

  // Location tracking effect
  useEffect(() => {
    if (!ride || !user) {
      if (isTracking) {
        console.log('Stopping location tracking - no ride or user');
      stopTracking();
      }
      return;
    }

    const isDriver = ride.driver?.uid === user.uid;

    if (isDriver && !isTracking) {
      console.log('Starting location tracking for driver:', user.uid);
      startTracking(user.uid).catch(error => {
        console.error('Error starting location tracking:', error);
        setLocationError('Failed to start location tracking');
      });
    } else if (!isDriver && isTracking) {
      console.log('Stopping location tracking - user is no longer driver');
      stopTracking();
    }

    return () => {
      if (isTracking) {
        console.log('Cleaning up location tracking');
        stopTracking();
      }
    };
  }, [ride?.driver?.uid, user?.uid, isTracking, startTracking, stopTracking]);

  // Get current user's RSVP status
  const getCurrentUserRSVPStatus = () => {
    if (!user || !ride?.invitations) return null;
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
    if (location && isMapFullScreen) {
      setCurrentLocation(location);
    }
  }, [location, isMapFullScreen]);

  // Process route information for turn-by-turn directions
  const getRouteInformation = () => {
    if (!calculatedRoute || !calculatedRoute.routes || calculatedRoute.routes.length === 0) {
      return null;
    }

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
      progress: ((currentStep + 1) / totalSteps) * 100
    };
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
  const vibe = getVibePalette(ride?.destination);
  
  // Check if user can edit ride details (all accepted participants can edit)
  const canEditRide = ride && (
    ride.driver?.uid === user?.uid || 
    (ride.passengers && ride.passengers.some(p => p.uid === user?.uid)) ||
    (ride.invitations && ride.invitations[user?.uid]?.status === 'accepted')
  );

  return (
    <Box sx={{ minHeight: '100vh', background: vibe.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
      {/* RSVP Modal */}
      {showInvitationModal && ride && user && (
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
      
      <Box sx={{ 
          perspective: 1800,
          width: '100%',
          maxWidth: 1100,
          minHeight: 500,
          position: 'relative',
      }}>
        {/* Card Flip Container */}
        <Box
          sx={{
            width: '100%',
            minHeight: 500,
            borderRadius: 6,
            boxShadow: 6,
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.7s cubic-bezier(.4,2,.3,1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'none',
            background: 'transparent',
          }}
        >
          {/* FRONT (Postcard) */}
          <Card
            sx={{
              width: '100%',
              minHeight: 500,
              borderRadius: 6,
              boxShadow: 6,
            display: 'flex',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.92)',
            position: 'absolute',
            top: 0,
            left: 0,
              backfaceVisibility: 'hidden',
              zIndex: 2,
            }}
          >
            {/* Left Side: Ride Info */}
            <Box sx={{ flex: 2, p: 5, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                            {/* Action Buttons */}
              <Box sx={{ position: 'absolute', top: 20, right: 20, zIndex: 10, display: 'flex', gap: 1 }}>
                <Button 
                  variant="outlined"
                  color="primary"
                  size="small"
                  onClick={() => {
                    if (!ride) return; // Prevent opening modal if ride is not loaded
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
                    px: 2,
                    py: 1,
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
                  size="small"
                  onClick={handleLeaveRide}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 600,
                    borderColor: '#f44336',
                    color: '#f44336',
                    px: 2,
                    py: 1,
                    '&:hover': {
                      borderColor: '#d32f2f',
                      backgroundColor: '#ffebee'
                    }
                  }}
                >
                  Leave Ride
              </Button>
          </Box>
              
              {/* Editable Title */}
              <Box mb={2}>
                {canEditRide && editingTitle ? (
                  <Box display="flex" alignItems="center" gap={1}>
                    <TextField
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      fullWidth
                      size="small"
                      sx={{ background: '#fff', borderRadius: 2 }}
                    />
                    <Button onClick={handleTitleSave} disabled={savingTitle} variant="contained" sx={{ background: vibe.accent, color: '#fff', borderRadius: 2, minWidth: 80 }}>
                      {savingTitle ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => { setEditingTitle(false); setTitle(ride.groupName || ride.name || 'Untitled Ride'); }} variant="text" sx={{ color: vibe.accent }}>
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h4" fontWeight={700} color={vibe.text} sx={{ flex: 1 }}>
                      {title}
              </Typography>
                    {canEditRide && (
                      <Button onClick={() => setEditingTitle(true)} variant="text" sx={{ color: vibe.accent, fontWeight: 600 }}>
                        Edit
                      </Button>
                    )}
                  </Box>
                )}
              </Box>
              <Divider sx={{ my: 2, background: vibe.accent, opacity: 0.2 }} />
              
              {/* Editable Description */}
              <Box mb={2}>
                <Typography variant="subtitle1" color={vibe.accent} fontWeight={600} mb={0.5}>Description</Typography>
                {canEditRide && editingDescription ? (
                  <Box display="flex" alignItems="center" gap={1}>
                    <TextField
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      multiline
                      minRows={2}
                      maxRows={5}
                      fullWidth
                      size="small"
                      sx={{ background: '#fff', borderRadius: 2 }}
                    />
                    <Button onClick={handleDescriptionSave} disabled={savingDescription} variant="contained" sx={{ background: vibe.accent, color: '#fff', borderRadius: 2, minWidth: 80 }}>
                      {savingDescription ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => { setEditingDescription(false); setDescription(ride.description || ''); }} variant="text" sx={{ color: vibe.accent }}>
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body1" color={vibe.text} sx={{ whiteSpace: 'pre-line', flex: 1 }}>
                      {description || 'No description provided.'}
                    </Typography>
                    {canEditRide && (
                      <Button onClick={() => setEditingDescription(true)} variant="text" sx={{ color: vibe.accent, fontWeight: 600 }}>
                        Edit
                      </Button>
                    )}
                  </Box>
                )}
              </Box>
              
              <Box mb={2}>
                <Typography variant="subtitle1" color={vibe.accent} fontWeight={600}>Destination</Typography>
                <Typography variant="body1" color={vibe.text}>
                  {ride.destination?.address || 'No destination set'}
                </Typography>
              </Box>
              
              <Box mb={2}>
                <Typography variant="subtitle1" color={vibe.accent} fontWeight={600}>Status</Typography>
                <Chip 
                  label={ride.status || 'Unknown'} 
                  color={ride.status === 'active' ? 'success' : 'warning'} 
                  sx={{ fontWeight: 600, fontSize: 16, background: vibe.accent, color: '#fff' }} 
                />
              </Box>
              
              <Box mb={2}>
                <Typography variant="subtitle1" color={vibe.accent} fontWeight={600}>Created At</Typography>
                <Typography variant="body2" color={vibe.text}>
                  {ride.createdAt ? (ride.createdAt.toDate ? ride.createdAt.toDate().toLocaleString() : ride.createdAt) : 'N/A'}
                  </Typography>
      </Box>
            </Box>
            
            {/* Right Side: Users & Map */}
            <Box sx={{ flex: 1.2, p: 5, borderLeft: `2px solid ${vibe.accent}22`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', background: 'rgba(255,255,255,0.85)', height: '100%' }}>
              {/* Map Preview */}
                            <Box width="100%" mb={4} display="flex" flexDirection="column" alignItems="flex-end" sx={{ mt: 8 }}>
                {/* Route Status */}
                {routeError && (
                  <Alert severity="error" sx={{ mb: 2, fontSize: '0.75rem' }}>
                    {routeError}
                  </Alert>
                )}
                {isCalculatingRoute && (
                  <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
                    Calculating optimized route...
                  </Alert>
                )}
                {calculatedRoute && (
                  <Alert severity="success" sx={{ mb: 2, fontSize: '0.75rem' }}>
                    Route optimized! {calculatedRoute.totalDistance ? `${Math.round(calculatedRoute.totalDistance / 1000)}km` : ''}
                  </Alert>
                )}
                
                <Box
                  sx={{ 
                    width: 180,
                    height: 120,
                    borderRadius: 3,
                    boxShadow: 2,
                    overflow: 'hidden',
                    background: '#e0e7ef',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    border: `2px solid ${vibe.accent}`,
                    mr: 0
                  }}
                  onClick={() => setIsMapModalOpen(true)}
                >
                  <MapView
                    users={participants}
                    destination={ride.destination?.location ? {
                      lat: ride.destination.location.lat,
                      lng: ride.destination.location.lng,
                      address: ride.destination.address
                    } : ride.destination}
                    calculatedRoute={calculatedRoute}
                    userLocation={location}
                    isLiveRide={false}
                    compact={true}
                  />
                  <Box sx={{ position: 'absolute', bottom: 8, right: 8, background: '#fff', borderRadius: 2, px: 1, py: 0.5, boxShadow: 1, color: vibe.accent, fontWeight: 600, fontSize: 13, opacity: 0.9 }}>
                    View Map
                  </Box>
                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <Typography variant="caption" color={vibe.accent}>
                    Click to zoom and see live route
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={calculateRoute}
                    disabled={isCalculatingRoute}
                    sx={{
                      fontSize: '0.7rem',
                      py: 0.5,
                      px: 1,
                      borderColor: vibe.accent,
                      color: vibe.accent,
                      '&:hover': {
                        borderColor: vibe.accent,
                        backgroundColor: `${vibe.accent}10`
                      }
                    }}
                  >
                    {isCalculatingRoute ? 'Calculating...' : 'Recalculate Route'}
                  </Button>
                </Box>
          </Box>
              
              {/* Who's going */}
              <Box width="100%" mt="auto" pt={6}>
                <Typography variant="subtitle1" color={vibe.accent} fontWeight={600} mb={1}>Who's going</Typography>
                <Stack spacing={1}>
                  {participants.map((p, idx) => {
                    const isCurrentUser = p.uid === user?.uid;
                    const statusText = p.invitationStatus === 'accepted' ? 'Confirmed' :
                                      p.invitationStatus === 'maybe' ? 'Maybe' :
                                      p.invitationStatus === 'pending' ? 'Pending' :
                                      p.invitationStatus === 'declined' ? 'Declined' : '';
                    
                    const statusColor = p.invitationStatus === 'accepted' ? '#4caf50' :
                                       p.invitationStatus === 'maybe' ? '#ff9800' :
                                       p.invitationStatus === 'pending' ? '#9e9e9e' :
                                       p.invitationStatus === 'declined' ? '#f44336' : '#9e9e9e';
                    
                    return (
                      <Box key={p.uid || idx} display="flex" alignItems="center" gap={1}>
                        <Avatar 
                          src={p.photoURL || (isCurrentUser ? user.photoURL : '/default-avatar.png')} 
                          alt={p.displayName} 
                          sx={{ width: 36, height: 36, bgcolor: vibe.accent }} 
                        />
                        <Box sx={{ flex: 1 }}>
                          <Typography color={vibe.text} fontWeight={500}>
                            {displayNames[p.uid] || p.displayName || p.name || `User ${p.uid?.slice(-4)}` || 'Unknown User'}
                            {isCurrentUser && <span style={{ color: vibe.accent, fontWeight: 600 }}> (You)</span>}
                          </Typography>
                          {statusText && (
                            <Typography variant="caption" color={statusColor} fontWeight={600}>
                              {statusText}
                            </Typography>
                          )}
                        </Box>
                        {/* Role icons */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {p.role === 'driver' && (
                            <Chip 
                              label="Driver" 
                              size="small" 
                              icon={<CarIcon sx={{ fontSize: 14 }} />}
                              sx={{ 
                                background: vibe.accent, 
                                color: '#fff', 
                                fontSize: 10,
                                height: 20,
                                '& .MuiChip-icon': { color: '#fff' }
                              }} 
                            />
                          )}
                          {p.role === 'passenger' && (
                            <Chip 
                              label="Passenger" 
                              size="small" 
                              icon={<PersonIcon sx={{ fontSize: 14 }} />}
                              sx={{ 
                                background: '#9e9e9e', 
                                color: '#fff', 
                                fontSize: 10,
                                height: 20,
                                '& .MuiChip-icon': { color: '#fff' }
                              }} 
                            />
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
                
                {/* Show message if no participants */}
                {participants.length === 0 && (
                  <Typography variant="body2" color={vibe.text} sx={{ fontStyle: 'italic' }}>
                    No participants yet
              </Typography>
                )}
                </Box>
              </Box>
            
            {/* Turned corner */}
            <Box
                    sx={{ 
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 64,
                height: 64,
                cursor: 'pointer',
                zIndex: 10,
                background: 'none',
              }}
              onClick={() => setIsFlipped(true)}
            >
              <svg width="64" height="64" viewBox="0 0 64 64" style={{ position: 'absolute', bottom: 0, right: 0 }}>
                <polygon points="0,64 64,0 64,64" fill="#e0e7ef" />
                <text x="48" y="56" fontSize="14" fill="#b08968" fontWeight="bold" textAnchor="end" style={{ pointerEvents: 'none' }}>flip</text>
              </svg>
            </Box>
          </Card>
          
          {/* BACK (Invitee Status) */}
          <Card
            sx={{
              width: '100%',
              minHeight: 500,
              borderRadius: 6,
              boxShadow: 6,
              display: 'flex',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.97)',
              position: 'absolute',
              top: 0,
              left: 0,
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              zIndex: 3,
            }}
          >
            {/* Left: Groupchat */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 6 }}>
              <Typography variant="h5" color="#4e342e" fontWeight={600} mb={2}>groupchat</Typography>
              <Box sx={{ width: '100%', height: 200, background: '#f5f3e7', borderRadius: 3, boxShadow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b08968', fontSize: 22, fontWeight: 500 }}>
                (chat UI WIP)
              </Box>
            </Box>
            
            {/* Divider */}
            <Divider orientation="vertical" flexItem sx={{ mx: 0, my: 6, borderColor: '#e0c9b3', borderWidth: 2 }} />
            
            {/* Right: Invitee status */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', p: 6 }}>
              <Typography variant="h6" color="#4e342e" fontWeight={600} mb={3}>Invitation Status</Typography>
              
              {/* Driver Status */}
              {ride.driver && (
                <Box sx={{ mb: 3, width: '100%' }}>
                  <Typography variant="subtitle2" color="#7c5e48" fontWeight={600} mb={1}>Driver</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, background: '#f5f3e7', borderRadius: 2 }}>
                    <Avatar 
                      src={ride.driver.photoURL || '/default-avatar.png'} 
                      alt={ride.driver.displayName || ride.driver.name || 'Driver'} 
                      sx={{ width: 32, height: 32, bgcolor: '#b08968' }} 
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" color="#4e342e" fontWeight={500}>
                        {displayNames[ride.driver.uid] || ride.driver.displayName || ride.driver.name || `User ${ride.driver.uid?.slice(-4)}` || 'Driver'}
                      </Typography>
                      <Chip label="Confirmed" size="small" sx={{ background: '#4caf50', color: '#fff', fontSize: 10, height: 20 }} />
                    </Box>
                  </Box>
                </Box>
              )}
              
              {/* Invitees Status */}
              {ride.invitations && Object.keys(ride.invitations).length > 0 && (
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" color="#7c5e48" fontWeight={600} mb={2}>Invitees</Typography>
                  <Stack spacing={1}>
                    {invitationsWithNames.map(({ inviteeId, invitation, displayName }) => {
                      // Skip driver if they're also in invitations
                      if (ride.driver?.uid === inviteeId) return null;
                      
                      const isCurrentUser = inviteeId === user?.uid;
                      
                      const statusColor = invitation.status === 'accepted' ? '#4caf50' : 
                                        invitation.status === 'declined' ? '#f44336' : 
                                        invitation.status === 'maybe' ? '#ff9800' : '#9e9e9e';
                      
                      const statusText = invitation.status === 'pending' ? 'Pending' :
                                        invitation.status === 'accepted' ? 'Accepted' :
                                        invitation.status === 'declined' ? 'Declined' :
                                        invitation.status === 'maybe' ? 'Maybe' : 'Unknown';
                      
                      return (
                        <Box key={inviteeId} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, background: '#f5f3e7', borderRadius: 2 }}>
                          <Avatar 
                            src={invitation.inviteePhotoURL || (isCurrentUser ? user.photoURL : '/default-avatar.png')} 
                            alt={displayName} 
                            sx={{ width: 28, height: 28, bgcolor: '#b08968' }} 
                          />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" color="#4e342e" fontWeight={500}>
                              {displayNames[inviteeId] || displayName || invitation.inviteeName || `User ${inviteeId?.slice(-4)}` || 'Unknown User'}
                              {isCurrentUser && <span style={{ color: '#b08968', fontWeight: 600 }}> (You)</span>}
                            </Typography>
                          </Box>
                          <Chip 
                            label={statusText} 
                            size="small"
                            sx={{ 
                              background: statusColor, 
                              color: '#fff', 
                              fontSize: 10, 
                              height: 18,
                              fontWeight: 600
                            }} 
                          />
                        </Box>
                      );
                    })}
          </Stack>
                </Box>
              )}
              
              {/* No invitations message */}
              {(!ride.invitations || Object.keys(ride.invitations).length === 0) && (
                <Box sx={{ width: '100%', textAlign: 'center', color: '#b08968', mt: 2 }}>
                  <Typography variant="body2">No invitations sent yet</Typography>
                </Box>
              )}
            </Box>
            
            {/* Turned corner to flip back */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 64,
                height: 64,
                cursor: 'pointer',
                zIndex: 10,
                background: 'none',
              }}
              onClick={() => setIsFlipped(false)}
            >
              <svg width="64" height="64" viewBox="0 0 64 64" style={{ position: 'absolute', bottom: 0, right: 0 }}>
                <polygon points="0,64 64,0 64,64" fill="#e0e7ef" />
                <text x="48" y="56" fontSize="14" fill="#b08968" fontWeight="bold" textAnchor="end" style={{ pointerEvents: 'none' }}>flip</text>
              </svg>
            </Box>
          </Card>
        </Box>
      </Box>
      
      {/* Map Modal */}
      <Modal open={isMapModalOpen} onClose={handleMapModalClose}>
        <Box sx={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)', 
          width: isMapFullScreen ? '100vw' : { xs: '95vw', sm: 700 },
          height: isMapFullScreen ? '100vh' : 'auto',
          maxWidth: isMapFullScreen ? '100vw' : 700,
          maxHeight: isMapFullScreen ? '100vh' : '90vh',
          bgcolor: '#fff', 
          borderRadius: isMapFullScreen ? 0 : 4, 
          boxShadow: 24, 
          p: isMapFullScreen ? 0 : 3, 
          outline: 'none',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            p: isMapFullScreen ? 2 : 0,
            pb: isMapFullScreen ? 1 : 2,
            borderBottom: isMapFullScreen ? '1px solid #e0e0e0' : 'none',
            background: isMapFullScreen ? 'rgba(255,255,255,0.98)' : 'transparent',
            backdropFilter: isMapFullScreen ? 'blur(10px)' : 'none'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" color={vibe.accent}>
                Live Ride Route
              </Typography>
              {isMapFullScreen && (
                <Chip 
                  label="Full Screen" 
                  size="small" 
                  sx={{ 
                    background: vibe.accent, 
                    color: '#fff', 
                    fontSize: '0.7rem',
                    height: 20
                  }} 
                />
              )}
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
            height: isMapFullScreen ? 'calc(100vh - 80px)' : { xs: 300, sm: 400 }, 
            borderRadius: isMapFullScreen ? 0 : 3, 
            overflow: 'hidden', 
            boxShadow: isMapFullScreen ? 'none' : 2,
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
            />
            
            {/* Floating Full Screen Button for Mobile */}
            {!isMapFullScreen && (
              <Box sx={{ 
                position: 'absolute', 
                top: 16, 
                right: 16, 
                zIndex: 1000,
                display: { xs: 'block', sm: 'none' }
              }}>
                <IconButton
                  onClick={handleMapFullScreenToggle}
                  sx={{
                    background: 'rgba(255,255,255,0.9)',
                    color: vibe.accent,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    '&:hover': {
                      background: 'rgba(255,255,255,1)',
                      transform: 'scale(1.1)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                  size="small"
                  title="Full Screen"
                >
                  <FullscreenIcon />
                </IconButton>
              </Box>
            )}
            
            {/* Route Information Panel - Full Screen Mode */}
            {isMapFullScreen && (
              <Box sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(10px)',
                borderTop: '1px solid rgba(0,0,0,0.1)',
                zIndex: 1000,
                maxHeight: '40vh',
                overflow: 'hidden'
              }}>
                <RouteInformationPanel
                  routeInfo={getRouteInformation()}
                  passengerInfo={getCurrentPassengerInfo()}
                  onPassengerStatusUpdate={updatePassengerStatus}
                  showFullRoute={showFullRoute}
                  onToggleFullRoute={() => setShowFullRoute(!showFullRoute)}
                  vibe={vibe}
                  currentLocation={currentLocation}
                />
              </Box>
            )}
          </Box>
          
          {/* Footer - only show in non-fullscreen mode */}
          {!isMapFullScreen && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button 
                onClick={handleMapModalClose} 
                sx={{ color: vibe.accent, fontWeight: 600 }}
              >
                Close
              </Button>
            </Box>
          )}
        </Box>
      </Modal>
    </Box>
  );
}

export default LiveRideView; 
