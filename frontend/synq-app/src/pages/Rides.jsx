import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import SimpleLoading from '../components/SimpleLoading';
import '../styles/Rides.css';
import { Box, Container, Card, CardContent, Typography, Button, Avatar, Stack, Divider, Alert, IconButton, Chip } from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import GroupIcon from '@mui/icons-material/Group';
import HistoryIcon from '@mui/icons-material/History';

/*
 * Rides Page Component
 * 
 * This page will serve as the central hub for all ride-related information:
 * - Active rides (moved from dashboard)
 * - Ride invitations
 * - Ride statistics
 * - Ride preferences
 * - Group rides
 * - Ride invitations
 * 
 * The dashboard's "Your Active Rides" section will be moved here
 * to provide a more comprehensive ride management experience.
 */

// Ghibli-inspired earthy palette
const palette = {
  bg: '#f5f3e7', // warm cream
  card: '#f9f6ef', // lighter cream
  accent: '#b5c99a', // soft green
  accent2: '#a47551', // brown
  accent3: '#e2b07a', // muted gold
  text: '#4e342e', // deep brown
  textSoft: '#7c5e48',
  border: '#e0c9b3',
  rideBg: '#e6ede3', // pale green
};

function Rides() {
  const { user } = useUserAuth();
  const [searchParams] = useSearchParams();
  const [activeRides, setActiveRides] = useState([]);
  const [rideInvitations, setRideInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leavingRideId, setLeavingRideId] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);



  // Handle scrolling to specific ride
  useEffect(() => {
    const rideId = searchParams.get('rideId');
    if (rideId && !loading && activeRides.length > 0) {
      const rideElement = document.getElementById(`ride-${rideId}`);
      if (rideElement) {
        rideElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        rideElement.classList.add('highlight-ride');
        setTimeout(() => {
          rideElement.classList.remove('highlight-ride');
        }, 2000);
      }
    }
  }, [searchParams, loading, activeRides]);

  // Helper function to handle query errors
  const handleQueryError = (error) => {
    if (error.code === 'failed-precondition') {
      // Extract index URL from error message if available
      const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
      const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;

      if (indexUrl) {
        setError(
          <div>
            <p>We're currently building the necessary database indexes. This usually takes a few minutes.</p>
            <p className="mb-2">You can check the status of the index build here:</p>
            <a 
              href={indexUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm"
            >
              <i className="bi bi-box-arrow-up-right me-1"></i>
              View Index Status
            </a>
            <p className="mt-2 text-muted small">
              Once the index is built, refresh this page to see your rides.
            </p>
          </div>
        );
      } else {
        setError(
          <div>
            <p>We're currently building the necessary database indexes. This usually takes a few minutes.</p>
            <p className="text-muted small">
              Please wait a few minutes and refresh this page to see your rides.
            </p>
          </div>
        );
      }
      setActiveRides([]);
    } else if (error.code === 'permission-denied') {
      setError('You do not have permission to view these rides. Please check your account status.');
    } else if (error.code === 'unavailable') {
      setError(
        <div>
          <p>The database service is currently unavailable.</p>
          <p className="text-muted small">Please try again in a few minutes.</p>
        </div>
      );
    } else {
      setError(
        <div>
          <p>An unexpected error occurred while loading rides.</p>
          <p className="text-muted small">Error details: {error.message}</p>
        </div>
      );
    }
    setLoading(false);
  };



  useEffect(() => {
    if (!user) {
      return;
    }

    const rideId = searchParams.get('rideId');

    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // If we have a specific rideId, query for that ride first
    if (rideId) {
      const rideRef = doc(db, 'rides', rideId);
      const unsubscribeSpecific = onSnapshot(rideRef, 
        (doc) => {
          if (!doc.exists()) {
            setError('Ride not found');
            setActiveRides([]);
          setLoading(false);
          return;
        }

          const specificRide = {
            id: doc.id,
            ...doc.data()
          };
        
        // Check if user is either driver or passenger
        const isDriver = specificRide.driver?.uid === user.uid;
        const isPassenger = specificRide.passengerUids?.includes(user.uid);
        
        if (!isDriver && !isPassenger) {
          setError('You are not authorized to view this ride');
          setActiveRides([]);
          setLoading(false);
          return;
        }

          setError(null);
        setActiveRides([specificRide]);
        setLoading(false);
        }, 
        (error) => {
          handleQueryError(error);
        }
      );

      return () => {
        unsubscribeSpecific();
      };
    }

    // If no specific rideId, get all active and recent rides for the user
    
    // Query for active rides where user is driver
    const driverActiveQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', '==', 'active')
    );

    // Query for active rides where user is passenger
    const passengerActiveQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('status', '==', 'active')
    );

    // Query for recent rides (within 24 hours) where user is driver
    const driverRecentQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('createdAt', '>=', twentyFourHoursAgo),
      where('status', '==', 'created')
    );

    // Query for recent rides (within 24 hours) where user is passenger
    const passengerRecentQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('createdAt', '>=', twentyFourHoursAgo),
      where('status', '==', 'created')
    );

    // Query for rides where user has pending invitations
    const pendingInvitationsQuery = query(
      collection(db, 'rides'),
      where(`invitations.${user.uid}.status`, '==', 'pending')
    );

    // Query for cancelled rides where user is driver
    const driverCancelledQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', '==', 'cancelled')
    );

    // Query for cancelled rides where user is passenger
    const passengerCancelledQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('status', '==', 'cancelled')
    );
    const unsubscribeDriverActive = onSnapshot(driverActiveQuery, (snapshot) => {
      const driverActiveRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'active'
      }));
      
      const unsubscribePassengerActive = onSnapshot(passengerActiveQuery, (passengerSnapshot) => {
        const passengerActiveRides = passengerSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          type: 'active'
        }));

        const unsubscribeDriverRecent = onSnapshot(driverRecentQuery, (recentSnapshot) => {
          const driverRecentRides = recentSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            type: 'recent'
          }));

          const unsubscribePassengerRecent = onSnapshot(passengerRecentQuery, (finalSnapshot) => {
            const passengerRecentRides = finalSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              type: 'recent'
            }));

            const unsubscribePendingInvitations = onSnapshot(pendingInvitationsQuery, (pendingSnapshot) => {
              const pendingInvitationRides = pendingSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'invitation'
              }));

              const unsubscribeDriverCancelled = onSnapshot(driverCancelledQuery, (cancelledSnapshot) => {
                const driverCancelledRides = cancelledSnapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data(),
                  type: 'cancelled'
                }));

                const unsubscribePassengerCancelled = onSnapshot(passengerCancelledQuery, (finalCancelledSnapshot) => {
                  const passengerCancelledRides = finalCancelledSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    type: 'cancelled'
                  }));

                  // Separate active rides from invitations
                  const activeRidesList = [
                ...driverActiveRides,
                ...passengerActiveRides,
                ...driverRecentRides,
                ...passengerRecentRides,
                    ...driverCancelledRides,
                    ...passengerCancelledRides
                  ].filter(ride => {
                // Filter out rides where user has declined invitation
                if (ride.invitations && ride.invitations[user.uid]) {
                  const userInvitation = ride.invitations[user.uid];
                  if (userInvitation.status === 'declined') {
                        return false;
                      }
                      // Also filter out rides where user has a pending invitation
                      if (userInvitation.status === 'pending') {
                    return false;
                  }
                }
                return true;
                  });

                  // Handle invitations separately - only include pending invitations
                  const invitationsList = pendingInvitationRides.filter(ride => {
                    // Only include rides where user has a pending invitation
                    if (ride.invitations && ride.invitations[user.uid]) {
                      const userInvitation = ride.invitations[user.uid];
                      return userInvitation.status === 'pending';
                    }
                    return false;
                  });

                  // Sort active rides
                  const sortedActiveRides = activeRidesList.sort((a, b) => {
                    // First sort by type (active rides first, then recent, then cancelled)
                if (a.type !== b.type) {
                  if (a.type === 'active') return -1;
                  if (b.type === 'active') return 1;
                      if (a.type === 'recent') return -1;
                      if (b.type === 'recent') return 1;
                      return a.type === 'cancelled' ? -1 : 1;
                }
                // Then sort by creation time
                if (a.createdAt && b.createdAt) {
                  return b.createdAt.toDate() - a.createdAt.toDate();
                }
                return b.id.localeCompare(a.id);
              });
            
                  // Sort invitations by creation time
                  const sortedInvitations = invitationsList.sort((a, b) => {
                    if (a.createdAt && b.createdAt) {
                      return b.createdAt.toDate() - a.createdAt.toDate();
                    }
                    return b.id.localeCompare(a.id);
                  });
                
              setError(null);
                  setActiveRides(sortedActiveRides);
                  setRideInvitations(sortedInvitations);
              setLoading(false);
            }, (error) => {
                  handleQueryError(error);
                });

                return () => unsubscribePassengerCancelled();
              }, (error) => {
                handleQueryError(error);
              });

              return () => unsubscribeDriverCancelled();
            }, (error) => {
              handleQueryError(error);
            });

            return () => unsubscribePendingInvitations();
          }, (error) => {
            handleQueryError(error);
          });

          return () => unsubscribePassengerRecent();
        }, (error) => {
          handleQueryError(error);
        });

        return () => unsubscribeDriverRecent();
      }, (error) => {
        handleQueryError(error);
      });

      return () => unsubscribePassengerActive();
    }, (error) => {
      handleQueryError(error);
    });

    return () => {
      unsubscribeDriverActive();
    };
  }, [user, searchParams]);

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateETA = (createdAt) => {
    if (!createdAt) return 'N/A';
    const startTime = createdAt.toDate();
    const now = new Date();
    const duration = Math.round((now - startTime) / 1000 / 60); // in minutes
    return `${duration} min ago`;
  };



  const handleLeaveRide = async (rideId) => {
    try {
      // Add confirmation dialog
      if (!window.confirm('Are you sure you want to leave this ride?')) {
        return;
      }
      
      setLeavingRideId(rideId);
      
      const rideDoc = await getDoc(doc(db, 'rides', rideId));
      
      if (!rideDoc.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = rideDoc.data();
      const isDriver = rideData.driver?.uid === user.uid;

      // Handle driver leaving
      if (isDriver) {
        // For cancelled rides, just remove the driver reference
        if (rideData.status === 'cancelled') {
          await updateDoc(doc(db, 'rides', rideId), {
            driver: null,
            updatedAt: serverTimestamp(),
            statusHistory: arrayUnion({
              status: 'driver_removed',
              timestamp: new Date().toISOString(),
              updatedBy: user.uid,
              reason: 'Driver left cancelled ride',
              previousStatus: rideData.status
            })
          });
        } else {
          // For active/created rides, set status to cancelled
          await updateDoc(doc(db, 'rides', rideId), {
            driver: null,
            status: 'cancelled',
            updatedAt: serverTimestamp(),
            statusHistory: arrayUnion({
              status: 'cancelled',
              timestamp: new Date().toISOString(),
              updatedBy: user.uid,
              reason: 'Driver left the ride',
              previousStatus: rideData.status || 'active'
            })
          });
        }
      } else {
        // Handle passenger leaving - remove from passengers array regardless of status
        // For cancelled rides, we need to handle different data structures
        let updateData = {
          updatedAt: serverTimestamp(),
          statusHistory: arrayUnion({
            status: 'passenger_left',
            timestamp: new Date().toISOString(),
            updatedBy: user.uid,
            reason: 'Passenger left the ride',
            previousStatus: rideData.status || 'active'
          })
        };

        // Handle passengers array if it exists
        if (rideData.passengers && Array.isArray(rideData.passengers)) {
          const updatedPassengers = rideData.passengers.filter(p => p.uid !== user.uid);
          updateData.passengers = updatedPassengers;
        }

        // Handle passengerUids array if it exists
        if (rideData.passengerUids && Array.isArray(rideData.passengerUids)) {
          const updatedPassengerUids = rideData.passengerUids.filter(uid => uid !== user.uid);
          updateData.passengerUids = updatedPassengerUids;
        }

        // Handle invitations if they exist
        if (rideData.invitations && rideData.invitations[user.uid]) {
          updateData[`invitations.${user.uid}.status`] = 'left';
          updateData[`invitations.${user.uid}.leftAt`] = new Date().toISOString();
        }

        // Handle participants if they exist (alternative data structure)
        if (rideData.participants && rideData.participants[user.uid]) {
          updateData[`participants.${user.uid}.status`] = 'left';
          updateData[`participants.${user.uid}.leftAt`] = new Date().toISOString();
        }
        
        await updateDoc(doc(db, 'rides', rideId), updateData);
      }

      // Update local state - remove the ride from the user's view
      setActiveRides(prevRides => {
        const filteredRides = prevRides.filter(ride => ride.id !== rideId);
        return filteredRides;
      });
      
      // Show success message
      setError(null);
      setSuccessMessage('You have successfully left the ride.');
      setTimeout(() => setSuccessMessage(null), 3000); // Hide after 3 seconds
      
    } catch (error) {
      // Handle specific Firestore errors
      let errorMessage = 'Failed to leave ride';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'You do not have permission to leave this ride.';
      } else if (error.code === 'not-found') {
        errorMessage = 'Ride not found. It may have been deleted.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Service temporarily unavailable. Please try again.';
      } else if (error.code === 'deadline-exceeded') {
        errorMessage = 'Operation timed out. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setLeavingRideId(null);
    }
  };

  if (loading) {
    return (
      <SimpleLoading 
        message="Loading your rides..."
        size="large"
      />
    );
  }

  if (error) {
    return (
      <div className="rides-page-container">
        <div className="rides-content-wrapper">
          <div className="alert alert-warning" role="alert">
            {typeof error === 'string' ? error : error}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Box sx={{ background: palette.bg, minHeight: '100vh', py: 5 }}>
      <Container maxWidth="md">
        <Typography variant="h4" fontWeight={700} color={palette.text} mb={3}>
          Your Rides
        </Typography>
        

        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}
        {/* Quick Actions Section - moved above Active Rides */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: 2, mb: 4, p: 1 }}>
          <CardContent>
            <Typography variant="h6" color={palette.textSoft} mb={2}>
              Quick Actions
            </Typography>
            <Stack spacing={2}>
              <Button
                component={Link}
                to="/create-group"
                variant="contained"
                startIcon={<DirectionsCarIcon />}
                sx={{ background: palette.accent2, color: '#fff', borderRadius: 2, fontWeight: 600 }}
              >
                Create a Ride
              </Button>
              <Button variant="outlined" startIcon={<GroupIcon />} sx={{ color: palette.accent2, borderColor: palette.border, borderRadius: 2, fontWeight: 600 }}>
                Find Groups
              </Button>
            </Stack>
          </CardContent>
        </Card>
        {/* Active Rides Section */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: 2, mb: 4, p: 1 }}>
          <CardContent>
            <Typography variant="h6" color={palette.textSoft} mb={2}>
              <DirectionsCarIcon sx={{ mr: 1, color: palette.accent2 }} /> Your Rides
            </Typography>
            <Divider sx={{ mb: 2, background: palette.border }} />
            {activeRides.length === 0 ? (
              <Box textAlign="center" py={4}>
                <DirectionsCarIcon sx={{ fontSize: 48, color: palette.accent2, mb: 2 }} />
                <Typography color={palette.textSoft} mb={1}>No rides found</Typography>
                <Typography color={palette.textSoft} variant="body2">Join or create a ride to get started!</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {activeRides.map(ride => (
                  <Box key={ride.id} sx={{ background: palette.rideBg, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box display="flex" alignItems="center">
                      <Avatar src={ride.groupAvatar || '/default-avatar.png'} alt={ride.groupName} sx={{ width: 48, height: 48, mr: 2, bgcolor: palette.accent }} />
                      <Box>
                        <Typography fontWeight={600} color={palette.text}>{ride.groupName || 'Ride Group'}</Typography>
                        <Typography variant="body2" color={palette.textSoft}>
                          {!ride.destination ? 'Destination' : 
                           typeof ride.destination === 'string' ? ride.destination : 
                           ride.destination.address || 'Unknown destination'}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                          <Chip 
                            label={ride.status || 'Unknown'} 
                            size="small"
                            color={
                              ride.status === 'active' ? 'success' :
                              ride.status === 'created' ? 'primary' :
                              ride.status === 'cancelled' ? 'error' :
                              ride.status === 'invitation' ? 'warning' : 'default'
                            }
                            variant="outlined"
                          />
                          {ride.type && (
                            <Chip 
                              label={ride.type} 
                              size="small"
                              color="secondary"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>
                    </Box>
                    <Box display="flex" gap={1}>
                      <Button 
                        component={Link}
                        to={`/rides/${ride.id}`}
                        variant="contained" 
                        color="primary" 
                        size="small"
                        sx={{ 
                          borderRadius: 2, 
                          fontWeight: 600,
                          minWidth: 80
                        }}
                      >
                        View Ride
                      </Button>
                      
                      <Button 
                        variant="outlined" 
                        color="error" 
                        size="small" 
                        onClick={() => handleLeaveRide(ride.id)} 

                        disabled={leavingRideId === ride.id} 
                        sx={{ 
                          borderRadius: 2, 
                          fontWeight: 600, 
                          borderColor: palette.accent2, 
                          color: palette.accent2,
                          '&:disabled': {
                            opacity: 0.6,
                            cursor: 'not-allowed'
                          },
                          '&:hover': {
                            backgroundColor: 'rgba(164, 117, 81, 0.1)'
                          }
                        }}
                      >
                        {leavingRideId === ride.id ? 'Leaving...' : 'Leave'}
                      </Button>
                      

                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
        {/* Ride Invitations Section */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: 2, mb: 4, p: 1 }}>
          <CardContent>
            <Typography variant="h6" color={palette.textSoft} mb={2}>
              <HistoryIcon sx={{ mr: 1, color: palette.accent2 }} /> Ride Invitations
            </Typography>
            <Typography variant="body2" color={palette.textSoft} mb={2}>
              You have pending invitations for these rides. Click "View Ride" to see details and respond to the invitation through the ride's RSVP system.
            </Typography>
            {rideInvitations.length === 0 ? (
            <Box textAlign="center" py={4}>
                <Typography color={palette.textSoft} mb={1}>No pending ride invitations</Typography>
                <Typography color={palette.textSoft} variant="body2">New ride invitations will appear here. Click "View Ride" to respond through the ride's RSVP system.</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {rideInvitations.map(invitation => (
                  <Box key={invitation.id} sx={{ background: palette.rideBg, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box display="flex" alignItems="center">
                      <Avatar src={invitation.groupAvatar || '/default-avatar.png'} alt={invitation.groupName} sx={{ width: 48, height: 48, mr: 2, bgcolor: palette.accent3 }} />
                      <Box>
                        <Typography fontWeight={600} color={palette.text}>
                          {invitation.name || invitation.groupName || 'Ride Invitation'}
                        </Typography>
                        <Typography variant="body2" color={palette.textSoft}>
                          {!invitation.destination ? 'Destination' : 
                           typeof invitation.destination === 'string' ? invitation.destination : 
                           invitation.destination.address || 'Unknown destination'}
                        </Typography>
                        {invitation.createdAt && (
                          <Typography variant="caption" color={palette.textSoft} display="block" mt={0.5}>
                            Invited: {invitation.createdAt.toDate().toLocaleDateString()}
                          </Typography>
                        )}
                        <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                          <Chip 
                            label="Pending Response" 
                            size="small"
                            color="warning"
                            variant="outlined"
                          />
                          <Chip 
                            label="Click to Respond" 
                            size="small"
                            color="info"
                            variant="outlined"
                          />
                        </Box>
                      </Box>
                    </Box>
                    <Box>
                      <Button 
                        component={Link}
                        to={`/rides/${invitation.id}`}
                        variant="contained" 
                        color="primary" 
                        size="small"
                        sx={{ 
                          borderRadius: 2, 
                          fontWeight: 600,
                          minWidth: 100
                        }}
                      >
                        View Ride
                      </Button>
                    </Box>
            </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default Rides; 