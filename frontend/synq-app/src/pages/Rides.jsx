import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { updateRideParticipation } from '../services/firebaseOperations';
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
 * - Ride history
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leavingRideId, setLeavingRideId] = useState(null);

  console.log('Rides component rendered:', {
    user: user?.uid,
    loading,
    error,
    activeRidesCount: activeRides.length,
    searchParams: Object.fromEntries(searchParams.entries())
  });

  // Handle scrolling to specific ride
  useEffect(() => {
    console.log('Scroll effect triggered:', {
      rideId: searchParams.get('rideId'),
      loading,
      activeRidesCount: activeRides.length
    });
    const rideId = searchParams.get('rideId');
    if (rideId && !loading && activeRides.length > 0) {
      const rideElement = document.getElementById(`ride-${rideId}`);
      if (rideElement) {
        console.log('Scrolling to ride element:', rideElement);
        rideElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        rideElement.classList.add('highlight-ride');
        setTimeout(() => {
          rideElement.classList.remove('highlight-ride');
        }, 2000);
      } else {
        console.log('Ride element not found in DOM');
      }
    }
  }, [searchParams, loading, activeRides]);

  // Helper function to handle query errors
  const handleQueryError = (error) => {
    console.log('Handling query error:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });

    if (error.code === 'failed-precondition') {
      // Extract index URL from error message if available
      const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
      const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;
      
      console.log('Index building required:', {
        indexUrl,
        errorMessage: error.message
      });

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
      console.error('Permission denied:', error);
      setError('You do not have permission to view these rides. Please check your account status.');
    } else if (error.code === 'unavailable') {
      console.error('Service unavailable:', error);
      setError(
        <div>
          <p>The database service is currently unavailable.</p>
          <p className="text-muted small">Please try again in a few minutes.</p>
        </div>
      );
    } else {
      console.error('Unexpected error:', error);
      setError(
        <div>
          <p>An unexpected error occurred while loading rides.</p>
          <p className="text-muted small">Error details: {error.message}</p>
        </div>
      );
    }
    setLoading(false);
  };

  // Add a function to check index status
  const checkIndexStatus = async (indexUrl) => {
    if (!indexUrl) return;
    
    try {
      console.log('Checking index status for:', indexUrl);
      // Extract project ID and index ID from the URL
      const projectIdMatch = indexUrl.match(/project\/([^/]+)/);
      const indexIdMatch = indexUrl.match(/indexes\/([^?]+)/);
      
      if (projectIdMatch && indexIdMatch) {
        const projectId = projectIdMatch[1];
        const indexId = indexIdMatch[1];
        console.log('Index details:', { projectId, indexId });
        
        // You could implement a backend endpoint to check index status
        // For now, we'll just log that we would check it
        console.log('Would check index status for:', { projectId, indexId });
      }
    } catch (error) {
      console.error('Error checking index status:', error);
    }
  };

  useEffect(() => {
    console.log('Main effect triggered:', {
      user: user?.uid,
      rideId: searchParams.get('rideId'),
      timestamp: new Date().toISOString()
    });

    if (!user) {
      console.log('No user found, returning early');
      return;
    }

    const rideId = searchParams.get('rideId');
    console.log('Looking for ride with ID:', rideId);

    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    console.log('Timestamp for 24 hours ago:', twentyFourHoursAgo.toISOString());

    // If we have a specific rideId, query for that ride first
    if (rideId) {
      console.log('Querying for specific ride:', rideId);
      const rideRef = doc(db, 'rides', rideId);
      const unsubscribeSpecific = onSnapshot(rideRef, 
        (doc) => {
          console.log('Specific ride document:', {
            exists: doc.exists(),
            id: doc.id,
            data: doc.data(),
            timestamp: new Date().toISOString()
          });
          
          if (!doc.exists()) {
          console.log('No ride found with ID:', rideId);
            setError('Ride not found');
            setActiveRides([]);
          setLoading(false);
          return;
        }

          const specificRide = {
            id: doc.id,
            ...doc.data()
          };
          console.log('Found specific ride:', {
            ...specificRide,
            timestamp: new Date().toISOString()
          });
        
        // Check if user is either driver or passenger
        const isDriver = specificRide.driver?.uid === user.uid;
        const isPassenger = specificRide.passengerUids?.includes(user.uid);
          
          console.log('User authorization check:', {
            isDriver,
            isPassenger,
            userId: user.uid,
            driverId: specificRide.driver?.uid,
            passengerUids: specificRide.passengerUids
          });
        
        if (!isDriver && !isPassenger) {
          console.log('User is not authorized to view this ride');
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
          console.error('Error fetching specific ride:', {
            error,
            timestamp: new Date().toISOString()
          });
          handleQueryError(error);
        }
      );

      return () => {
        console.log('Cleaning up specific ride subscription');
        unsubscribeSpecific();
      };
    }

    // If no specific rideId, get all active and recent rides for the user
    console.log('Fetching all active and recent rides for user:', {
      userId: user.uid,
      timestamp: new Date().toISOString()
    });
    
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

    console.log('Setting up ride listeners');
    const unsubscribeDriverActive = onSnapshot(driverActiveQuery, (snapshot) => {
      console.log('Driver active rides snapshot:', {
        empty: snapshot.empty,
        docs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        timestamp: new Date().toISOString()
      });
      const driverActiveRides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'active'
      }));
      
      const unsubscribePassengerActive = onSnapshot(passengerActiveQuery, (passengerSnapshot) => {
        console.log('Passenger active rides snapshot:', passengerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        const passengerActiveRides = passengerSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          type: 'active'
        }));

        const unsubscribeDriverRecent = onSnapshot(driverRecentQuery, (recentSnapshot) => {
          console.log('Driver recent rides snapshot:', recentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          const driverRecentRides = recentSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            type: 'recent'
          }));

          const unsubscribePassengerRecent = onSnapshot(passengerRecentQuery, (finalSnapshot) => {
            console.log('Passenger recent rides snapshot:', finalSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            const passengerRecentRides = finalSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              type: 'recent'
            }));

            const unsubscribePendingInvitations = onSnapshot(pendingInvitationsQuery, (pendingSnapshot) => {
              console.log('Pending invitations snapshot:', pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
              const pendingInvitationRides = pendingSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'invitation'
              }));

              // Combine all rides
              const allRides = [
                ...driverActiveRides,
                ...passengerActiveRides,
                ...driverRecentRides,
                ...passengerRecentRides,
                ...pendingInvitationRides
              ];

              // Deduplicate and sort rides
              const uniqueRides = Array.from(
                new Map(allRides.map(ride => [ride.id, ride])).values()
              ).filter(ride => {
                // Filter out rides where user has declined invitation
                if (ride.invitations && ride.invitations[user.uid]) {
                  const userInvitation = ride.invitations[user.uid];
                  if (userInvitation.status === 'declined') {
                    console.log('Filtering out declined ride:', ride.id);
                    return false;
                  }
                }
                return true;
              }).sort((a, b) => {
                // First sort by type (active rides first, then invitations, then recent)
                if (a.type !== b.type) {
                  if (a.type === 'active') return -1;
                  if (b.type === 'active') return 1;
                  if (a.type === 'invitation') return -1;
                  if (b.type === 'invitation') return 1;
                  return a.type === 'recent' ? -1 : 1;
                }
                // Then sort by creation time
                if (a.createdAt && b.createdAt) {
                  return b.createdAt.toDate() - a.createdAt.toDate();
                }
                return b.id.localeCompare(a.id);
              });
            
              console.log('Final unique rides:', uniqueRides);
              setError(null);
              setActiveRides(uniqueRides);
              setLoading(false);
            }, (error) => {
              console.error('Error fetching pending invitations:', error);
              handleQueryError(error);
            });

            return () => unsubscribePendingInvitations();
          }, (error) => {
            console.error('Error fetching passenger recent rides:', error);
            handleQueryError(error);
          });

          return () => unsubscribePassengerRecent();
        }, (error) => {
          console.error('Error fetching driver recent rides:', error);
          handleQueryError(error);
        });

        return () => unsubscribeDriverRecent();
      }, (error) => {
        console.error('Error fetching passenger active rides:', error);
        handleQueryError(error);
      });

      return () => unsubscribePassengerActive();
    }, (error) => {
      console.error('Error fetching driver active rides:', {
        error,
        timestamp: new Date().toISOString()
      });
      handleQueryError(error);
    });

    return () => {
      console.log('Cleaning up all ride subscriptions');
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
      setLeavingRideId(rideId);
      const rideDoc = await getDoc(doc(db, 'rides', rideId));
      if (!rideDoc.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = rideDoc.data();
      const isDriver = rideData.driverId === user.uid;

      // Use updateRideParticipation instead of leaveRide
      const result = await updateRideParticipation(rideId, user.uid, 'left');
      if (!result.success) {
        throw new Error(result.error || 'Failed to leave ride');
      }

      // Update local state
      setActiveRides(prevRides => prevRides.filter(ride => ride.id !== rideId));
    } catch (error) {
      console.error('Error leaving ride:', error);
      setError(error.message || 'Failed to leave ride');
    } finally {
      setLeavingRideId(null);
    }
  };

  console.log('Before render:', {
    loading,
    error,
    activeRidesCount: activeRides.length
  });

  if (loading) {
    console.log('Rendering loading state');
    return (
      <SimpleLoading 
        message="Loading your rides..."
        size="large"
      />
    );
  }

  if (error) {
    console.log('Rendering error state:', {
      error,
      timestamp: new Date().toISOString()
    });
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

  console.log('Rendering main content');
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
              <DirectionsCarIcon sx={{ mr: 1, color: palette.accent2 }} /> Active Rides
            </Typography>
            <Divider sx={{ mb: 2, background: palette.border }} />
            {activeRides.length === 0 ? (
              <Box textAlign="center" py={4}>
                <DirectionsCarIcon sx={{ fontSize: 48, color: palette.accent2, mb: 2 }} />
                <Typography color={palette.textSoft} mb={1}>No active rides</Typography>
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
                        <Typography variant="caption" color={palette.accent2}>{ride.status || 'Active'}</Typography>
                      </Box>
                    </Box>
                    <Box>
                      <Button variant="outlined" color="error" size="small" onClick={() => handleLeaveRide(ride.id)} disabled={leavingRideId === ride.id} sx={{ borderRadius: 2, fontWeight: 600, borderColor: palette.accent2, color: palette.accent2 }}>
                        Leave
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
        {/* Ride History Section */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: 2, mb: 4, p: 1 }}>
          <CardContent>
            <Typography variant="h6" color={palette.textSoft} mb={2}>
              <HistoryIcon sx={{ mr: 1, color: palette.accent2 }} /> Ride History
            </Typography>
            {/* Placeholder for ride history, replace with actual logic if needed */}
            <Box textAlign="center" py={4}>
              <Typography color={palette.textSoft} mb={1}>No ride history yet</Typography>
              <Typography color={palette.textSoft} variant="body2">Your completed rides will appear here.</Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default Rides; 