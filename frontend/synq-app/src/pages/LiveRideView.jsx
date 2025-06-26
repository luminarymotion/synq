import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapView from '../components/MapView';
import { useLocation } from '../services/locationTrackingService';
import rideStatusService, { RIDE_STATUS, STATUS_METADATA, STATUS_TRANSITIONS } from '../services/rideStatusService';
import RideInvitationModal from '../components/RideInvitationModal';
import { calculateOptimizedRoute } from '../services/routeOptimizerService';
import '../styles/LiveRideView.css';

function LiveRideView() {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [statusHistory, setStatusHistory] = useState([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [userInvitation, setUserInvitation] = useState(null);
  const [isSubmittingRSVP, setIsSubmittingRSVP] = useState(false);
  const [isManuallyOpened, setIsManuallyOpened] = useState(false);
  const [mapRef, setMapRef] = useState(null);
  const [routeLoadingState, setRouteLoadingState] = useState('idle'); // 'idle', 'loading', 'success', 'error'
  const [routeErrorMessage, setRouteErrorMessage] = useState(null);
  const [mapState, setMapState] = useState('preview'); // 'preview', 'pending', 'active', 'live'

  const {
    location,
    isTracking,
    status: locationStatus,
    error: locationServiceError,
    startTracking,
    stopTracking
  } = useLocation({
    preset: 'realtime',
    updateFirebase: true,
    onLocationUpdate: async (locationData) => {
      if (!ride || ride.driver?.uid !== user.uid) return;

      try {
        // Update ride document with new currentLocation (not location to preserve pickup location)
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
        // Clear location error on successful update
        setLocationError(null);
      } catch (error) {
        console.error('Error updating ride with location:', error);
        setLocationError('Failed to update location in ride');
      }
    },
    onError: (errorMessage) => {
      console.error('Location tracking error:', errorMessage);
      // Only set location error for non-critical issues
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

  // Subscribe to ride updates and optimize route when needed
  useEffect(() => {
    if (!rideId || !user) return;

    const rideRef = doc(db, 'rides', rideId);
    const unsubscribe = onSnapshot(rideRef, async (doc) => {
        if (doc.exists()) {
        const rideData = doc.data();
        
        setRide(rideData);

        // Update status history from ride data
        setStatusHistory(rideData.statusHistory || []);

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

        // Update participants list with invitation statuses
        const allParticipants = [];
        
        // Define colors for participants
        const participantColors = [
          '#2196F3', // Blue (driver)
          '#FF5722', // Orange
          '#4CAF50', // Green
          '#9C27B0', // Purple
          '#FF9800', // Amber
          '#795548', // Brown
          '#607D8B', // Blue Grey
          '#E91E63', // Pink
          '#00BCD4', // Cyan
          '#8BC34A'  // Light Green
        ];
        
        // Add driver with invitation status
        if (rideData.driver) {
          const driverInvitation = rideData.invitations?.[rideData.driver.uid];
          allParticipants.push({
            ...rideData.driver,
            role: 'driver',
            invitationStatus: driverInvitation?.status || 'accepted', // Driver is always accepted
            isCreator: rideData.creatorId === rideData.driver.uid,
            color: participantColors[0], // Blue for driver
            // Include currentLocation for real-time updates
            currentLocation: rideData.driver.currentLocation || null
          });
        }
        
        // Add passengers with invitation statuses
        if (rideData.passengers) {
          rideData.passengers.forEach((passenger, index) => {
            const passengerInvitation = rideData.invitations?.[passenger.uid];
            allParticipants.push({
              ...passenger,
              role: 'passenger',
              invitationStatus: passengerInvitation?.status || 'accepted',
              isCreator: rideData.creatorId === passenger.uid,
              color: participantColors[index + 1] || participantColors[1] // Start from index 1 (orange)
            });
          });
        }
        
        // Add pending invitations that haven't responded yet
        if (rideData.invitations) {
          Object.entries(rideData.invitations).forEach(([inviteeId, invitation], index) => {
            // Only add if they're not already in participants and status is pending
            const isAlreadyParticipant = allParticipants.some(p => p.uid === inviteeId);
            if (!isAlreadyParticipant && invitation.status === 'pending') {
              allParticipants.push({
                uid: inviteeId,
                displayName: invitation.inviteeName || 'Unknown User',
                photoURL: invitation.inviteePhotoURL,
                email: invitation.inviteeEmail,
                role: invitation.role || 'passenger',
                invitationStatus: 'pending',
                isCreator: rideData.creatorId === inviteeId,
                isPendingInvitation: true,
                color: participantColors[allParticipants.length] || participantColors[1]
              });
            }
          });
        }
        
        setParticipants(allParticipants);

        // Debug logging for participants and their locations
        console.log('LiveRideView - Participants data:', {
          totalParticipants: allParticipants.length,
          participants: allParticipants.map(p => ({
            uid: p.uid,
            displayName: p.displayName,
            role: p.role,
            hasLocation: !!p.location,
            location: p.location,
            invitationStatus: p.invitationStatus
          }))
        });

        // Check if current user has a pending invitation
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

        // Optimize route if we have destination location (required for any route)
        if (rideData.destination?.location) {
          try {
            setRouteLoadingState('loading');
            setRouteErrorMessage(null);
            
            console.log('LiveRideView - Starting route optimization');
            console.log('LiveRideView - Destination location:', rideData.destination.location);
            console.log('LiveRideView - Driver location:', rideData.driver?.currentLocation || rideData.driver?.location);
            console.log('LiveRideView - Passengers:', rideData.passengers?.length || 0);
            
            // Determine map state based on ride progress
            let newMapState = 'preview';
            if (rideData.status === 'active' || rideData.status === 'in_progress') {
              newMapState = 'live';
            } else if (rideData.passengers && rideData.passengers.length > 0) {
              newMapState = 'active';
            } else if (rideData.invitations && Object.keys(rideData.invitations).length > 0) {
              newMapState = 'pending';
            }
            setMapState(newMapState);
            
            // Prepare waypoints for route optimization
            const waypoints = [];
            
            // Add starting point - prioritize driver's current location, then driver's location, then creator's location
            let startingLocation = null;
            if (rideData.driver?.currentLocation) {
              startingLocation = rideData.driver.currentLocation;
              console.log('LiveRideView - Using driver current location as starting point');
            } else if (rideData.driver?.location) {
              startingLocation = rideData.driver.location;
              console.log('LiveRideView - Using driver location as starting point');
            } else if (rideData.creatorId === user?.uid && location) {
              // If current user is creator and has location, use it as starting point
              startingLocation = {
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy
              };
              console.log('LiveRideView - Using creator location as starting point');
            } else {
              // Fallback: use destination as starting point (will be adjusted by route optimization)
              startingLocation = rideData.destination.location;
              console.log('LiveRideView - Using destination as fallback starting point');
            }
            
            if (startingLocation) {
              waypoints.push({
                ...startingLocation,
                type: 'driver',
                role: 'driver',
                name: rideData.driver?.displayName || rideData.driver?.name || 'Driver'
              });
              console.log('LiveRideView - Added starting waypoint:', {
                location: startingLocation,
                type: 'starting_point'
              });
            }
            
            // Add passengers as pickup points
            if (rideData.passengers) {
              rideData.passengers.forEach(passenger => {
                if (passenger.location) {
                  waypoints.push({
                    ...passenger.location,
                    type: 'pickup',
                    role: 'passenger',
                    name: passenger.displayName || passenger.name
                  });
                }
              });
            }
            
            // Add destination
            if (rideData.destination?.location) {
              waypoints.push({
                ...rideData.destination.location,
                type: 'destination',
                role: 'destination',
                name: 'Final Destination'
              });
            }
            
            console.log('LiveRideView - Waypoints prepared:', waypoints.length);
            
            // Use the route optimization service
            const optimizedRouteData = await calculateOptimizedRoute(waypoints, {
              timeWindows: {},
              capacity: 8,
              maxDistance: 100,
              trafficConditions: 'current'
            });
            
            console.log('LiveRideView - Route optimization completed:', optimizedRouteData);
            
            // Convert VRP route data to GeoJSON format for MapView
            const geoJsonRoute = convertVRPToGeoJSON(optimizedRouteData, waypoints);
            
            console.log('LiveRideView - Converted to GeoJSON:', geoJsonRoute);
            
            setOptimizedRoute(geoJsonRoute);
            setRouteLoadingState('success');
            
          } catch (error) {
            console.error('Error optimizing route:', error);
            setRouteLoadingState('error');
            setRouteErrorMessage(error.message);
            
            // Fallback to simple route calculation
            try {
              console.log('LiveRideView - Trying fallback route calculation');
              const simpleRoute = await calculateSimpleRoute(rideData, user, location);
              console.log('LiveRideView - Fallback route result:', simpleRoute);
              setOptimizedRoute(simpleRoute);
              setRouteLoadingState('success');
              setRouteErrorMessage(null);
            } catch (fallbackError) {
              console.error('Fallback route calculation also failed:', fallbackError);
              setRouteLoadingState('error');
              setRouteErrorMessage('Failed to calculate route. Please try again.');
            }
          }
        } else {
          console.log('LiveRideView - Skipping route optimization - missing destination:', {
            hasDestinationLocation: !!rideData.destination?.location,
            destinationLocation: rideData.destination?.location
          });
          setRouteLoadingState('error');
          setRouteErrorMessage('Destination location is required for route calculation');
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
  }, [rideId, user, navigate]);

  // Separate effect for location tracking
  useEffect(() => {
    if (!ride || !user) {
      // Stop tracking if no ride or user
      if (isTracking) {
        console.log('Stopping location tracking - no ride or user');
      stopTracking();
      }
      return;
    }

    const isDriver = ride.driver?.uid === user.uid;

    // Start location tracking if user is the driver and not already tracking
    if (isDriver && !isTracking) {
      console.log('Starting location tracking for driver:', user.uid);
      startTracking(user.uid).catch(error => {
        console.error('Error starting location tracking:', error);
        setLocationError('Failed to start location tracking');
      });
    } else if (!isDriver && isTracking) {
      // Stop tracking if user is no longer the driver
      console.log('Stopping location tracking - user is no longer driver');
      stopTracking();
    }

    // Cleanup function - only run on unmount or when ride/user changes
    return () => {
      if (isTracking) {
        console.log('Cleaning up location tracking');
        stopTracking();
      }
    };
  }, [ride?.driver?.uid, user?.uid]); // Removed isTracking, startTracking, stopTracking from dependencies

  // Get current user's RSVP status
  const getCurrentUserRSVPStatus = () => {
    if (!user || !ride?.invitations) {
      console.log('getCurrentUserRSVPStatus: Missing user or invitations', {
        hasUser: !!user,
        hasRide: !!ride,
        hasInvitations: !!ride?.invitations,
        userId: user?.uid,
        rideId: ride?.id
      });
      return null;
    }
    
    const invitation = ride.invitations[user.uid];
    console.log('getCurrentUserRSVPStatus: Found invitation', {
      userId: user.uid,
      invitation,
      allInvitations: ride.invitations
    });
    return invitation;
  };

  // Handle opening RSVP modal for status change
  const handleChangeRSVP = () => {
    const currentRSVP = getCurrentUserRSVPStatus();
    if (currentRSVP) {
      setIsManuallyOpened(true);
      setUserInvitation(currentRSVP);
      setShowInvitationModal(true);
    }
  };

  const handleStatusUpdate = async (newStatus, reason = null) => {
    if (!ride || !user) return;

    try {
      setIsUpdatingStatus(true);
      const result = await rideStatusService.updateRideStatus(rideId, newStatus, user.uid, reason);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update ride status');
      }
    } catch (error) {
      console.error('Error updating ride status:', error);
      setError(error.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleLeaveRide = async () => {
    if (!ride || !user) return;

    const isDriver = ride.driver?.uid === user.uid;
    const isCreator = ride.creatorId === user.uid;
    const hasInvitation = ride.invitations?.[user.uid];
    
    if (window.confirm('Are you sure you want to leave this ride?')) {
      try {
        // Stop location tracking immediately to prevent permission errors
        if (isDriver) {
          console.log('Stopping location tracking for driver...');
          stopTracking();
        }

        const rideRef = doc(db, 'rides', rideId);
        
        // Update invitation status to 'declined' for tracking purposes
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

        // Handle participant removal
        if (isDriver) {
          // If driver is leaving, update ride status to cancelled
          await updateDoc(rideRef, {
            driver: null,
            status: RIDE_STATUS.CANCELLED
          });
          
          // Add status history entry
          await rideStatusService.updateRideStatus(rideId, RIDE_STATUS.CANCELLED, user.uid, 'Driver left the ride');
        } else {
          // Remove from passengers list and passengerUids array
          const updatedPassengers = (ride.passengers || []).filter(p => p.uid !== user.uid);
          const updatedPassengerUids = (ride.passengerUids || []).filter(uid => uid !== user.uid);
          
          console.log('Leaving ride - updating database:', {
            rideId,
            userId: user.uid,
            originalPassengers: ride.passengers?.length || 0,
            originalPassengerUids: ride.passengerUids?.length || 0,
            updatedPassengers: updatedPassengers.length,
            updatedPassengerUids: updatedPassengerUids.length,
            timestamp: new Date().toISOString()
          });
          
          await updateDoc(rideRef, {
            passengers: updatedPassengers,
            passengerUids: updatedPassengerUids
          });
        }

        // Redirect to dashboard with a small delay to ensure database update is processed
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

  const handleShareRide = () => {
    setIsSharing(true);
    const shareUrl = `${window.location.origin}/rides/${rideId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        alert('Ride link copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy ride link');
      })
      .finally(() => {
        setIsSharing(false);
      });
  };

  const handleRSVPSubmit = async (rsvpData) => {
    if (!ride || !user) return;

    console.log('LiveRideView - RSVP Submit received:', {
      rsvpData,
      user: user.uid,
      hasLocation: !!rsvpData.location,
      locationData: rsvpData.location
    });

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
        // Add user to participants if not already there
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
          joinedAt: serverTimestamp()
        };

        // Add location data if provided
        if (rsvpData.location) {
          userData.location = {
            lat: rsvpData.location.lat,
            lng: rsvpData.location.lng,
            address: rsvpData.location.address || rsvpData.pickupLocation,
            lastUpdated: serverTimestamp()
          };
          console.log('LiveRideView - Adding location to userData:', userData.location);
        } else {
          console.log('LiveRideView - No location data provided in RSVP');
        }

        console.log('LiveRideView - Final userData to save:', userData);

        if (rsvpData.role === 'driver') {
          await updateDoc(rideRef, {
            driver: userData
          });
          console.log('LiveRideView - Updated driver with location data');
        } else {
          // Check if user is already in passengers list
          const existingPassengers = ride.passengers || [];
          const existingPassengerUids = ride.passengerUids || [];
          const isAlreadyPassenger = existingPassengers.some(p => p.uid === user.uid);
          
          if (!isAlreadyPassenger) {
            await updateDoc(rideRef, {
              passengers: [...existingPassengers, userData],
              passengerUids: [...existingPassengerUids, user.uid]
            });
            console.log('LiveRideView - Added new passenger with location data');
          } else {
            // Update existing passenger with new location data - avoid serverTimestamp in arrays
            const updatedPassengers = existingPassengers.map(p => {
              if (p.uid === user.uid) {
                // Create new user data without serverTimestamp for array update
                const updatedUserData = {
                  ...p,
                  pickupLocation: userData.pickupLocation,
                  readyTime: userData.readyTime,
                  locationSharing: userData.locationSharing,
                  notes: userData.notes
                };
                
                // Add location if provided
                if (rsvpData.location) {
                  updatedUserData.location = {
                    lat: rsvpData.location.lat,
                    lng: rsvpData.location.lng,
                    address: rsvpData.location.address || rsvpData.pickupLocation,
                    lastUpdated: new Date() // Use regular Date instead of serverTimestamp
                  };
                  console.log('LiveRideView - Updated existing passenger with location:', updatedUserData.location);
                }
                
                return updatedUserData;
              }
              return p;
            });
            
            await updateDoc(rideRef, {
              passengers: updatedPassengers
            });
            console.log('LiveRideView - Updated existing passenger with location data');
          }
        }
      } else if (currentRSVP?.status === 'accepted' && rsvpData.status !== 'accepted') {
        // Remove user from participants if they were accepted but are now changing to another status
        if (ride.driver?.uid === user.uid) {
          // Remove as driver
          await updateDoc(rideRef, {
            driver: null
          });
        } else {
          // Remove from passengers and passengerUids
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

  // Get current status metadata
  const currentStatusMeta = ride ? STATUS_METADATA[ride.status] : null;

  // Get available status transitions for the current user
  const getAvailableTransitions = () => {
    if (!ride || !user) return [];
    
    const isDriver = ride.driver?.uid === user.uid;
    const isCreator = ride.creatorId === user.uid;
    
    if (!isDriver && !isCreator) return [];

    const transitions = STATUS_TRANSITIONS[ride.status] || [];
    return transitions.map(status => ({
      status,
      ...STATUS_METADATA[status]
    }));
  };

  // Add click handler for sidebar toggle
  const handleSidebarClick = (e) => {
    if (e.target === e.currentTarget) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  if (loading) {
    return (
      <div className="live-ride-container">
        <div className="live-ride-content">
          <div className="live-ride-map-wrapper">
            <div className="live-ride-map-container">
              <div className="map-loading-overlay">
                <div className="modern-loading-container">
                  <div className="loading-spinner-modern">
                    <div className="spinner-ring outer"></div>
                    <div className="spinner-ring middle"></div>
                    <div className="spinner-ring inner"></div>
                    <div className="spinner-center">
                      <i className="fas fa-car"></i>
                    </div>
                  </div>
                  <div className="loading-content">
                    <h3 className="loading-title">Loading Ride Details</h3>
                    <p className="loading-subtitle">Getting your ride information ready</p>
                    <div className="loading-progress">
                      <div className="progress-bar">
                        <div className="progress-fill"></div>
                      </div>
                      <div className="progress-steps">
                        <span className="step active">Connecting to ride</span>
                        <span className="step">Loading participants</span>
                        <span className="step">Preparing map</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !ride) {
    return (
      <div className="live-ride-container">
        <div className="error-message">
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/rides')}
          >
            Back to Rides
          </button>
        </div>
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="live-ride-container">
        <div className="error-message">
          <div className="alert alert-warning" role="alert">
            Ride not found
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/rides')}
          >
            Back to Rides
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="live-ride-container">
      {/* Notifications */}
      {locationError && (
        <div className="alert alert-warning mb-3" role="alert">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {locationError}
        </div>
      )}

      <div className="live-ride-content">
        {/* Map Container - Now first in the DOM order */}
        <div className="live-ride-map-wrapper">
          <div className="live-ride-map-container">
            {/* Route Loading Overlay */}
            {routeLoadingState === 'loading' && (
              <div className="map-loading-overlay">
                <div className="modern-loading-container">
                  <div className="loading-spinner-modern">
                    <div className="spinner-ring outer"></div>
                    <div className="spinner-ring middle"></div>
                    <div className="spinner-ring inner"></div>
                    <div className="spinner-center">
                      <i className="fas fa-route"></i>
                    </div>
                  </div>
                  <div className="loading-content">
                    <h3 className="loading-title">Calculating Optimal Route</h3>
                    <p className="loading-subtitle">Finding the best path for your journey</p>
                    <div className="loading-progress">
                      <div className="progress-bar">
                        <div className="progress-fill"></div>
                      </div>
                      <div className="progress-steps">
                        <span className="step active">Analyzing destinations</span>
                        <span className="step">Optimizing route</span>
                        <span className="step">Finalizing directions</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Route Error Overlay */}
            {routeLoadingState === 'error' && (
              <div className="map-error-overlay">
                <div className="error-message">
                  <i className="fas fa-exclamation-triangle text-warning"></i>
                  <p className="mt-2">{routeErrorMessage || 'Failed to load route'}</p>
                  <button 
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => {
                      setRouteLoadingState('idle');
                      // Trigger route recalculation
                      if (ride && ride.destination?.location) {
                        setOptimizedRoute(null);
                      }
                    }}
                  >
                    <i className="fas fa-redo me-1"></i>
                    Retry
                  </button>
                </div>
              </div>
            )}
            
            {/* Contextual Map Information */}
            {routeLoadingState === 'success' && (
              <div className={`map-context-overlay map-state-${mapState}`}>
                <div className="map-context-content">
                  {mapState === 'preview' && (
                    <div className="preview-info">
                      <h5><i className="fas fa-route me-2"></i>Route Preview</h5>
                      <p>This shows your planned route to the destination.</p>
                      <div className="preview-stats">
                        {optimizedRoute && (
                          <>
                            <span className="stat-item">
                              <i className="fas fa-road me-1"></i>
                              {formatDistance(optimizedRoute.totalDistance)}
                            </span>
                            <span className="stat-item">
                              <i className="fas fa-clock me-1"></i>
                              {formatDuration(optimizedRoute.totalDuration)}
                            </span>
                          </>
                        )}
                      </div>
                      <small className="text-muted">
                        Invite friends to see pickup points and optimize the route further
                      </small>
                    </div>
                  )}
                  
                  {mapState === 'pending' && (
                    <div className="pending-info">
                      <h5><i className="fas fa-users me-2"></i>Pending Invitations</h5>
                      <p>Waiting for friends to respond to ride invitations.</p>
                      <div className="pending-stats">
                        <span className="stat-item">
                          <i className="fas fa-user-clock me-1"></i>
                          {Object.keys(ride?.invitations || {}).length} pending
                        </span>
                      </div>
                      <small className="text-muted">
                        Route will update as people accept invitations
                      </small>
                    </div>
                  )}
                  
                  {mapState === 'active' && (
                    <div className="active-info">
                      <h5><i className="fas fa-car me-2"></i>Active Ride</h5>
                      <p>Ride is active with confirmed participants.</p>
                      <div className="active-stats">
                        <span className="stat-item">
                          <i className="fas fa-users me-1"></i>
                          {ride?.passengers?.length || 0} passengers
                        </span>
                        {optimizedRoute && (
                          <span className="stat-item">
                            <i className="fas fa-route me-1"></i>
                            Optimized route
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {mapState === 'live' && (
                    <div className="live-info">
                      <h5><i className="fas fa-satellite me-2"></i>Live Tracking</h5>
                      <p>Real-time location tracking is active.</p>
                      <div className="live-stats">
                        <span className="stat-item">
                          <i className="fas fa-signal me-1"></i>
                          Live updates
                        </span>
                        {location && (
                          <span className="stat-item">
                            <i className="fas fa-crosshairs me-1"></i>
                            Location active
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <MapView 
              ref={setMapRef}
              users={participants}
              destination={{
                ...ride.destination,
                lat: Array.isArray(ride.destination.location) ? ride.destination.location[1] : ride.destination.location.lat,
                lng: Array.isArray(ride.destination.location) ? ride.destination.location[0] : ride.destination.location.lng
              }}
              userLocation={location ? {
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy
              } : null}
              calculatedRoute={optimizedRoute}
              isLiveRide={true}
            />
          </div>
        </div>

        {/* Sliding Sidebar - Now overlays the map */}
        <div 
          className={`live-ride-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}
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

          <div className="sidebar-content">
        <div className="ride-info">
          <h2>
            <span className="badge bg-primary me-2">{ride.id}</span>
            {ride.destination?.address}
          </h2>
              <div className="ride-status-info">
                <span className={`badge bg-${currentStatusMeta?.color || 'secondary'} me-2`}>
                  <i className={`fas ${currentStatusMeta?.icon || 'fa-question-circle'} me-1`}></i>
                  {currentStatusMeta?.label || 'Unknown Status'}
                </span>
                <small className="text-muted">
            Started {new Date(ride.createdAt?.toDate()).toLocaleString()}
                </small>
              </div>
              
              {/* Route Statistics */}
              {optimizedRoute && routeLoadingState === 'success' && (
                <div className="route-statistics">
                  <h6 className="mt-3 mb-2">
                    <i className="fas fa-route me-2"></i>
                    Route Information
                  </h6>
                  <div className="route-stats-grid">
                    <div className="route-stat-item">
                      <div className="stat-label">Distance</div>
                      <div className="stat-value">
                        <i className="fas fa-road me-1"></i>
                        {formatDistance(optimizedRoute.totalDistance)}
                      </div>
                    </div>
                    <div className="route-stat-item">
                      <div className="stat-label">Duration</div>
                      <div className="stat-value">
                        <i className="fas fa-clock me-1"></i>
                        {formatDuration(optimizedRoute.totalDuration)}
                      </div>
                    </div>
                  </div>
                  {optimizedRoute.routeType === 'simple_straight_line' && (
                    <small className="text-muted">
                      <i className="fas fa-info-circle me-1"></i>
                      Configure MapQuest API key for road-following routes
                    </small>
                  )}
                </div>
              )}
        </div>

        <div className="ride-actions">
              {/* RSVP Status Section */}
              {getCurrentUserRSVPStatus() && (
                <div className="rsvp-status-section">
                  <div className="rsvp-status-info">
                    <small className="text-muted">
                      Your RSVP Status: <span className={`badge bg-${getInvitationStatusColor(getCurrentUserRSVPStatus().status)}`}>
                        {getInvitationStatusText(getCurrentUserRSVPStatus().status)}
                      </span>
                    </small>
                  </div>
                    <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={handleChangeRSVP}
                    >
                    <i className="fas fa-edit me-1"></i>
                    Change RSVP
                    </button>
                </div>
              )}

              {/* Fallback RSVP Section for users with invitations but no status */}
              {!getCurrentUserRSVPStatus() && ride?.invitations?.[user?.uid] && (
                <div className="rsvp-status-section">
                  <div className="rsvp-status-info">
                    <small className="text-muted">
                      You have a pending invitation for this ride
                    </small>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setIsManuallyOpened(true);
                      setUserInvitation(ride.invitations[user.uid]);
                      setShowInvitationModal(true);
                    }}
                  >
                    <i className="fas fa-reply me-1"></i>
                    Respond to Invitation
                  </button>
                </div>
              )}

              <div className="action-buttons">
          <button 
            className="btn btn-outline-primary me-2"
            onClick={handleShareRide}
            disabled={isSharing}
          >
            {isSharing ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                Sharing...
              </>
            ) : (
              <>
                <i className="bi bi-share me-1"></i>
                Share Ride
              </>
            )}
          </button>
          <button 
            className="btn btn-outline-danger"
            onClick={handleLeaveRide}
          >
            <i className="bi bi-box-arrow-right me-1"></i>
            Leave Ride
          </button>
        </div>

              {getAvailableTransitions().length > 0 && (
                <div className="status-actions">
                  {getAvailableTransitions().map(({ status, label, icon, color }) => (
                    <button
                      key={status}
                      className={`btn btn-outline-${color} me-2`}
                      onClick={() => handleStatusUpdate(status)}
                      disabled={isUpdatingStatus}
                    >
                      {isUpdatingStatus ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                          Updating...
                        </>
                      ) : (
                        <>
                          <i className={`fas ${icon} me-1`}></i>
                          {label}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
      </div>

            <div className="ride-details">
        </div>

              <div className="participants-list">
                <div className="participants-header">
                <h6>Participants</h6>
                  <span className="participant-count">{participants.length}</span>
                </div>
                <div className="participants-table">
                  {participants.map((participant, index) => (
                    <div 
                      key={participant.uid || index} 
                      className={`participant-item ${participant.isPendingInvitation ? 'pending-invitation' : ''}`}
                    >
                      <div className="participant-info">
                        <div className="participant-avatar">
                          {participant.photoURL ? (
                            <img src={participant.photoURL} alt={participant.displayName || participant.name} />
                          ) : (
                            <div className="avatar-placeholder">
                              {(participant.displayName || participant.name || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="participant-details">
                          <div className="participant-name">
                            {participant.displayName || participant.name || 'Unknown User'}
                            {participant.isCreator && (
                              <span className="creator-badge" title="Ride Creator">
                                <i className="fas fa-crown"></i>
                      </span>
                            )}
                            {/* Color indicator for map identification */}
                            {participant.color && (
                              <span 
                                className="map-color-indicator" 
                                style={{ backgroundColor: participant.color }}
                                title={`Map marker color: ${participant.color}`}
                              >
                                <i className="fas fa-map-marker-alt"></i>
                              </span>
                            )}
                          </div>
                        {participant.invitationStatus && (
                            <div className={`invitation-status-badge ${participant.invitationStatus}`}>
                              <i className={`fas ${getInvitationStatusIcon(participant.invitationStatus)}`}></i>
                            {getInvitationStatusText(participant.invitationStatus)}
                            </div>
                        )}
                      </div>
                      </div>
                      <div className="participant-meta">
                        <span className={`role-badge ${participant.role || 'passenger'}`}>
                          <i className={`fas fa-${participant.role === 'driver' ? 'car' : 'user'}`}></i>
                          {participant.role || 'passenger'}
                        </span>
                        {participant.isPendingInvitation && (
                          <span className="pending-indicator">
                            <i className="fas fa-clock"></i>
                            Pending Response
                        </span>
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .live-ride-container {
          position: fixed;
          top: 64px; /* Height of the header */
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          width: 100vw;
          height: calc(100vh - 64px);
          z-index: 1; /* Lower z-index to stay below header */
          pointer-events: none; /* Allow clicks to pass through to header */
        }

        .live-ride-content {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          pointer-events: auto; /* Re-enable pointer events for content */
        }

        .live-ride-map-wrapper {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }

        .live-ride-map-container {
          width: 100%;
          height: 100%;
        }

        .live-ride-sidebar {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: 400px;
          background: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          border-right: 1px solid #eef2f7;
          transition: transform 0.3s ease;
          z-index: 2; /* Higher than map but lower than header */
          height: 100%;
          pointer-events: auto;
        }

        .live-ride-sidebar.closed {
          transform: translateX(-400px);
        }

        .sidebar-handle {
          position: absolute;
          right: -16px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 3; /* Higher than sidebar */
          background: #ffffff;
          border-radius: 50%;
          padding: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          pointer-events: auto;
        }

        .sidebar-toggle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #eef2f7;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #2196F3;
        }

        .sidebar-toggle:hover {
          background: #2196F3;
          border-color: #2196F3;
          color: #ffffff;
        }

        .sidebar-content {
          padding: 1.5rem;
          height: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          background: #ffffff;
        }

        .ride-info {
          margin-bottom: 1.5rem;
        }

        .ride-status-info {
          display: flex;
          align-items: center;
          margin-top: 0.5rem;
        }

        .status-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .timeline {
          position: relative;
          padding-left: 2rem;
        }

        .timeline-item {
          position: relative;
          padding-bottom: 1.5rem;
        }

        .timeline-item:last-child {
          padding-bottom: 0;
        }

        .timeline-marker {
          position: absolute;
          left: -2rem;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 50%;
          background: #f8f9fa;
          border: 2px solid #dee2e6;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .timeline-content {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 0.5rem;
        }

        .timeline-header {
          display: flex;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .timeline-text {
          color: #6c757d;
          font-size: 0.875rem;
        }

        .route-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 0.5rem;
          border: 1px solid #eef2f7;
        }

        .stat-item i {
          color: #2196F3;
          font-size: 1.25rem;
        }

        @media (max-width: 768px) {
          .live-ride-container {
            top: 56px; /* Smaller header height on mobile */
            height: calc(100vh - 56px);
          }

          .live-ride-sidebar {
            width: 100%;
            max-width: 400px;
          }

          .live-ride-sidebar.closed {
            transform: translateX(-100%);
          }

          .sidebar-content {
            padding: 1rem;
          }
        }

        /* Add styles for notifications to ensure they're clickable */
        .alert {
          position: relative;
          z-index: 2;
          pointer-events: auto;
        }

        /* Participant list styles */
        .participants-list {
          margin-top: 1.5rem;
        }

        .participants-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .participant-count {
          background: #e9ecef;
          color: #495057;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .participants-table {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .participant-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
        }

        .participant-item:hover {
          background: #e9ecef;
          border-color: #dee2e6;
        }

        .participant-item.pending-invitation {
          background: #fff3cd;
          border-color: #ffeaa7;
          opacity: 0.8;
        }

        .participant-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
        }

        .participant-avatar {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
        }

        .participant-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          background: #2196F3;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1rem;
        }

        .participant-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
        }

        .participant-name {
          font-weight: 600;
          color: #212529;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .creator-badge {
          color: #ffc107;
          font-size: 0.875rem;
        }

        .invitation-status-badge {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-weight: 500;
        }

        .invitation-status-badge.pending {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }

        .invitation-status-badge.accepted {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .invitation-status-badge.declined {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .invitation-status-badge.maybe {
          background: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }

        .participant-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.5rem;
        }

        .role-badge {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-weight: 500;
        }

        .role-badge.driver {
          background: #e3f2fd;
          color: #1976d2;
          border: 1px solid #bbdefb;
        }

        .role-badge.passenger {
          background: #f3e5f5;
          color: #7b1fa2;
          border: 1px solid #e1bee7;
        }

        .pending-indicator {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          color: #856404;
          font-weight: 500;
        }

        .pending-indicator i {
          color: #ffc107;
        }

        /* Map color indicator styles */
        .map-color-indicator {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          margin-left: 8px;
          color: white;
          font-size: 10px;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          cursor: help;
          transition: transform 0.2s ease;
        }

        .map-color-indicator:hover {
          transform: scale(1.1);
        }

        .map-color-indicator i {
          color: white;
        }

        /* Route information styles */
        .route-breakdown {
          margin-top: 1rem;
        }

        .route-segment {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .route-segment:last-child {
          margin-bottom: 0;
        }

        .route-segment-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #dee2e6;
        }

        .route-segment-title {
          font-weight: 600;
          color: #212529;
          display: flex;
          align-items: center;
        }

        .driver-name {
          color: #6c757d;
          font-weight: 500;
          margin-left: 0.5rem;
        }

        .route-segment-stats {
          font-size: 0.875rem;
        }

        .waypoints-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .waypoint-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: #ffffff;
          border-radius: 0.375rem;
          border: 1px solid #e9ecef;
        }

        .waypoint-marker {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          border-radius: 50%;
          background: #f8f9fa;
          flex-shrink: 0;
        }

        .waypoint-marker i {
          font-size: 1rem;
        }

        .waypoint-info {
          flex: 1;
          min-width: 0;
        }

        .waypoint-name {
          font-weight: 500;
          color: #212529;
          margin-bottom: 0.25rem;
        }

        .waypoint-role {
          display: flex;
          align-items: center;
        }

        .waypoint-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          color: #6c757d;
          flex-shrink: 0;
        }

        .route-passengers {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #dee2e6;
        }

        .passengers-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .passenger-badge {
          background: #e3f2fd;
          color: #1976d2;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
          border: 1px solid #bbdefb;
        }

        .route-optimization-details {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #dee2e6;
        }

        .optimization-info {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 0.375rem;
          border: 1px solid #e9ecef;
        }

        .info-item i {
          font-size: 1rem;
          width: 1.5rem;
          text-align: center;
        }

        .info-item span {
          font-size: 0.875rem;
          color: #495057;
        }

        /* Enhanced role badge styles */
        .role-badge.waypoint {
          background: #e9ecef;
          color: #495057;
          border: 1px solid #ced4da;
        }

        .role-badge.destination {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .role-badge.origin {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .role-badge.pickup {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }
      `}</style>

    {/* Ride Invitation Modal - moved outside main container */}
    {showInvitationModal && userInvitation && ride && (
      <RideInvitationModal
        isOpen={showInvitationModal}
        onClose={() => {
          setShowInvitationModal(false);
          setUserInvitation(null);
          setIsManuallyOpened(false);
        }}
        ride={ride}
        inviter={userInvitation.inviter}
        currentUserId={user?.uid}
        onRSVPSubmit={handleRSVPSubmit}
      />
    )}
    </>
  );
}

// Helper functions
function formatDistance(meters) {
  if (!meters) return 'N/A';
  const miles = meters / 1609.34; // Convert meters to miles
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// Route optimization function
async function optimizeRoute(rideData, user = null, location = null) {
  try {
    console.log('LiveRideView - Starting route optimization');
    
    // Prepare waypoints for route optimization
    const waypoints = [];
    
    // Add starting point - prioritize driver's current location, then driver's location, then creator's location
    let startingLocation = null;
    if (rideData.driver?.currentLocation) {
      startingLocation = rideData.driver.currentLocation;
      console.log('LiveRideView - Using driver current location as starting point');
    } else if (rideData.driver?.location) {
      startingLocation = rideData.driver.location;
      console.log('LiveRideView - Using driver location as starting point');
    } else if (rideData.creatorId === user?.uid && location) {
      // If current user is creator and has location, use it as starting point
      startingLocation = {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy
      };
      console.log('LiveRideView - Using creator location as starting point');
    } else {
      // Fallback: use destination as starting point (will be adjusted by route optimization)
      startingLocation = rideData.destination.location;
      console.log('LiveRideView - Using destination as fallback starting point');
    }
    
    if (startingLocation) {
      waypoints.push({
        ...startingLocation,
        type: 'driver',
        role: 'driver',
        name: rideData.driver?.displayName || rideData.driver?.name || 'Driver'
      });
      console.log('LiveRideView - Added starting waypoint:', {
        location: startingLocation,
        type: 'starting_point'
      });
    }
    
    // Add passengers as pickup points
    if (rideData.passengers) {
      rideData.passengers.forEach(passenger => {
        if (passenger.location) {
          waypoints.push({
            ...passenger.location,
            type: 'pickup',
            role: 'passenger',
            name: passenger.displayName || passenger.name
          });
        }
      });
    }
    
    // Add destination
    if (rideData.destination?.location) {
      waypoints.push({
        ...rideData.destination.location,
        type: 'destination',
        role: 'destination',
        name: 'Final Destination'
      });
    }
    
    console.log('LiveRideView - Waypoints prepared:', waypoints.length);
    
    // Use the route optimization service
    const optimizedRouteData = await calculateOptimizedRoute(waypoints, {
      timeWindows: {},
      capacity: 8,
      maxDistance: 100,
      trafficConditions: 'current'
    });
    
    console.log('LiveRideView - Route optimization completed:', optimizedRouteData);
    
    // Convert VRP route data to GeoJSON format for MapView
    const geoJsonRoute = convertVRPToGeoJSON(optimizedRouteData, waypoints);
    
    console.log('LiveRideView - Converted to GeoJSON:', geoJsonRoute);
    
    return geoJsonRoute;
  } catch (error) {
    console.error('Error optimizing route:', error);
    // Fallback to simple route calculation
    try {
      console.log('LiveRideView - Trying fallback route calculation');
      const simpleRoute = await calculateSimpleRoute(rideData, user, location);
      console.log('LiveRideView - Fallback route result:', simpleRoute);
      return simpleRoute;
    } catch (fallbackError) {
      console.error('Fallback route calculation also failed:', fallbackError);
      throw fallbackError;
    }
  }
}

// Convert VRP route data to GeoJSON format
function convertVRPToGeoJSON(vrpRouteData, waypoints) {
  try {
    console.log('Converting VRP route to GeoJSON:', vrpRouteData);
    console.log('Original waypoints:', waypoints);
    
    // If we have routes array from VRP, use the first route
    if (vrpRouteData.routes && vrpRouteData.routes.length > 0) {
      const route = vrpRouteData.routes[0];
      console.log('Using VRP route:', route);
      
      // The optimized waypoints are in route.waypoints array
      if (route.waypoints && Array.isArray(route.waypoints)) {
        console.log('Found waypoints in route.waypoints:', route.waypoints.length);
        const coordinates = route.waypoints.map(wp => [wp.lng, wp.lat]);
        console.log('Route waypoints coordinates:', coordinates);
        
        if (coordinates.length < 2) {
          console.warn('Not enough waypoints for route:', coordinates.length);
          throw new Error('Not enough waypoints for route visualization');
        }
        
        // Calculate total distance
        let totalDistance = 0;
        for (let i = 0; i < coordinates.length - 1; i++) {
          const point1 = { lat: coordinates[i][1], lng: coordinates[i][0] };
          const point2 = { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] };
          totalDistance += calculateDistance(point1, point2);
        }
        
        // Calculate duration using 45 mph average speed (more realistic than 2 min/km)
        const totalDistanceMiles = totalDistance / 1609.34; // Convert meters to miles
        const totalDuration = (totalDistanceMiles / 45) * 60 * 60; // Convert to seconds: (miles / mph) * 60 min/hr * 60 sec/min
        
        const geoJsonFeature = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          },
          properties: {
            summary: {
              distance: totalDistance,
              duration: totalDuration
            }
          }
        };
        
        const result = {
          type: 'FeatureCollection',
          features: [geoJsonFeature],
          totalDistance: totalDistance,
          totalDuration: totalDuration,
          routeType: 'vrp_optimized'
        };
        
        console.log('VRP waypoints to GeoJSON conversion result:', result);
        return result;
      }
      
      // Fallback: try to reconstruct from driver and passengers
      console.log('No waypoints array found, trying to reconstruct from driver and passengers');
      const coordinates = [];
      
      // Add driver location
      if (route.driver?.currentLocation) {
        coordinates.push([route.driver.currentLocation.lng, route.driver.currentLocation.lat]);
        console.log('Added driver coordinate:', [route.driver.currentLocation.lng, route.driver.currentLocation.lat]);
      } else if (route.driver?.lng && route.driver?.lat) {
        coordinates.push([route.driver.lng, route.driver.lat]);
        console.log('Added driver coordinate:', [route.driver.lng, route.driver.lat]);
      }
      
      // Add passenger pickup locations
      if (route.passengers) {
        route.passengers.forEach((passenger, index) => {
          if (passenger.location) {
            coordinates.push([passenger.location.lng, passenger.location.lat]);
            console.log(`Added passenger ${index + 1} coordinate:`, [passenger.location.lng, passenger.location.lat]);
          } else if (passenger.lng && passenger.lat) {
            coordinates.push([passenger.lng, passenger.lat]);
            console.log(`Added passenger ${index + 1} coordinate:`, [passenger.lng, passenger.lat]);
          } else {
            console.log(`Skipping passenger ${index + 1} - no location:`, passenger);
          }
        });
      }
      
      // Add destination
      if (waypoints.length > 0) {
        const destination = waypoints[waypoints.length - 1];
        coordinates.push([destination.lng, destination.lat]);
        console.log('Added destination coordinate:', [destination.lng, destination.lat]);
      }
      
      console.log('Final coordinates array:', coordinates);
      
      if (coordinates.length < 2) {
        console.warn('Not enough coordinates for route line:', coordinates.length);
        throw new Error('Not enough coordinates for route visualization');
      }
      
      // Create GeoJSON feature
      const geoJsonFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {
          summary: {
            distance: vrpRouteData.totalDistance || 0,
            duration: vrpRouteData.totalDuration || 0
          }
        }
      };
      
      const result = {
        type: 'FeatureCollection',
        features: [geoJsonFeature],
        totalDistance: vrpRouteData.totalDistance || 0,
        totalDuration: vrpRouteData.totalDuration || 0,
        routeType: 'vrp_reconstructed'
      };
      
      console.log('VRP to GeoJSON conversion result:', result);
      return result;
    }
    
    // Handle case where route optimization returns waypoints directly
    if (Array.isArray(vrpRouteData)) {
      console.log('Route optimization returned waypoints array directly');
      const coordinates = vrpRouteData.map(wp => [wp.lng, wp.lat]);
      console.log('Waypoints coordinates:', coordinates);
      
      if (coordinates.length < 2) {
        console.warn('Not enough waypoints for route:', coordinates.length);
        throw new Error('Not enough waypoints for route visualization');
      }
      
      // Calculate total distance
      let totalDistance = 0;
      for (let i = 0; i < coordinates.length - 1; i++) {
        const point1 = { lat: coordinates[i][1], lng: coordinates[i][0] };
        const point2 = { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] };
        totalDistance += calculateDistance(point1, point2);
      }
      
      // Calculate duration using 45 mph average speed (more realistic than 2 min/km)
      const totalDistanceMiles = totalDistance / 1609.34; // Convert meters to miles
      const totalDuration = (totalDistanceMiles / 45) * 60 * 60; // Convert to seconds: (miles / mph) * 60 min/hr * 60 sec/min
      
      const geoJsonFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {
          summary: {
            distance: totalDistance,
            duration: totalDuration
          }
        }
      };
      
      const result = {
        type: 'FeatureCollection',
        features: [geoJsonFeature],
        totalDistance: totalDistance,
        totalDuration: totalDuration,
        routeType: 'waypoints_direct'
      };
      
      console.log('Waypoints to GeoJSON conversion result:', result);
      return result;
    }
    
    // Handle case where route optimization returns a single route object with waypoints
    if (vrpRouteData.waypoints && Array.isArray(vrpRouteData.waypoints)) {
      console.log('Route optimization returned route object with waypoints');
      const coordinates = vrpRouteData.waypoints.map(wp => [wp.lng, wp.lat]);
      console.log('Route waypoints coordinates:', coordinates);
      
      if (coordinates.length < 2) {
        console.warn('Not enough waypoints for route:', coordinates.length);
        throw new Error('Not enough waypoints for route visualization');
      }
      
      // Calculate total distance
      let totalDistance = 0;
      for (let i = 0; i < coordinates.length - 1; i++) {
        const point1 = { lat: coordinates[i][1], lng: coordinates[i][0] };
        const point2 = { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] };
        totalDistance += calculateDistance(point1, point2);
      }
      
      // Calculate duration using 45 mph average speed (more realistic than 2 min/km)
      const totalDistanceMiles = totalDistance / 1609.34; // Convert meters to miles
      const totalDuration = (totalDistanceMiles / 45) * 60 * 60; // Convert to seconds: (miles / mph) * 60 min/hr * 60 sec/min
      
      const geoJsonFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {
          summary: {
            distance: totalDistance,
            duration: totalDuration
          }
        }
      };
      
      const result = {
        type: 'FeatureCollection',
        features: [geoJsonFeature],
        totalDistance: totalDistance,
        totalDuration: totalDuration,
        routeType: 'route_object'
      };
      
      console.log('Route waypoints to GeoJSON conversion result:', result);
      return result;
    }
    
    // Fallback: create simple route from waypoints
    console.log('Using fallback waypoints conversion');
    const coordinates = waypoints.map(wp => [wp.lng, wp.lat]);
    console.log('Fallback coordinates:', coordinates);
    
    if (coordinates.length < 2) {
      console.warn('Not enough waypoints for fallback route:', coordinates.length);
      throw new Error('Not enough waypoints for route visualization');
    }
    
    const geoJsonFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: {
        summary: {
          distance: vrpRouteData.totalDistance || 0,
          duration: vrpRouteData.totalDuration || 0
        }
      }
    };
    
    const totalDistance = vrpRouteData.totalDistance || 0;
    const totalDuration = vrpRouteData.totalDuration || 0;
    
    return {
      type: 'FeatureCollection',
      features: [geoJsonFeature],
      totalDistance: totalDistance,
      totalDuration: totalDuration,
      routeType: 'simple'
    };
    
  } catch (error) {
    console.error('Error converting VRP to GeoJSON:', error);
    throw error;
  }
}

// Fallback route calculation function
async function calculateSimpleRoute(rideData, user = null, location = null) {
  try {
    console.log('LiveRideView - Using fallback route calculation');
    
    // Simple route: starting point -> passengers -> destination
    const waypoints = [];
    
    // Add starting point - prioritize driver's current location, then driver's location, then creator's location
    let startingLocation = null;
    if (rideData.driver?.currentLocation) {
      startingLocation = rideData.driver.currentLocation;
      console.log('LiveRideView - Using driver current location as starting point (fallback)');
    } else if (rideData.driver?.location) {
      startingLocation = rideData.driver.location;
      console.log('LiveRideView - Using driver location as starting point (fallback)');
    } else if (rideData.creatorId === user?.uid && location) {
      // If current user is creator and has location, use it as starting point
      startingLocation = {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy
      };
      console.log('LiveRideView - Using creator location as starting point (fallback)');
    } else {
      // Fallback: use destination as starting point
      startingLocation = rideData.destination.location;
      console.log('LiveRideView - Using destination as fallback starting point (fallback)');
    }
    
    if (startingLocation) {
      waypoints.push(startingLocation);
    }
    
    if (rideData.passengers) {
      rideData.passengers.forEach(passenger => {
        if (passenger.location) {
          waypoints.push(passenger.location);
        }
      });
    }
    
    if (rideData.destination?.location) {
      waypoints.push(rideData.destination.location);
    }
    
    // Calculate simple distance and duration
    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const distance = calculateDistance(waypoints[i], waypoints[i + 1]);
      totalDistance += distance;
    }
    
    // Calculate duration using 45 mph average speed (more realistic than 2 min/km)
    const totalDistanceMiles = totalDistance / 1609.34; // Convert meters to miles
    const totalDuration = (totalDistanceMiles / 45) * 60 * 60; // Convert to seconds: (miles / mph) * 60 min/hr * 60 sec/min
    
    // Convert to GeoJSON format
    const coordinates = waypoints.map(wp => [wp.lng, wp.lat]);
    
    const geoJsonFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: {
        summary: {
          distance: totalDistance,
          duration: totalDuration
        }
      }
    };
    
    return {
      type: 'FeatureCollection',
      features: [geoJsonFeature],
      totalDistance: totalDistance,
      totalDuration: totalDuration,
      routeType: 'simple'
    };
  } catch (error) {
    console.error('Error in fallback route calculation:', error);
    throw error;
  }
}

// Helper function to calculate distance between two points
function calculateDistance(point1, point2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getInvitationStatusColor(status) {
  const colors = {
    pending: 'warning',
    accepted: 'success',
    declined: 'danger',
    maybe: 'info'
  };
  return colors[status] || 'secondary';
}

function getInvitationStatusText(status) {
  const texts = {
    pending: 'Pending Response',
    accepted: 'Accepted',
    declined: 'Declined',
    maybe: 'Considering'
  };
  return texts[status] || status;
}

function getInvitationStatusIcon(status) {
  const icons = {
    pending: 'fa-clock',
    accepted: 'fa-check-circle',
    declined: 'fa-times-circle',
    maybe: 'fa-question-circle'
  };
  return icons[status] || 'fa-question-circle';
}

export default LiveRideView; 