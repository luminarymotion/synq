import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/Dashboard.css';
import { Link, useNavigate } from 'react-router-dom';
import RideHistory from '../components/RideHistory';
import { 
  subscribeToFriendsList,
  getUserRideHistory
} from '../services/firebaseOperations';
import SimpleLoading from '../components/SimpleLoading';

// Set Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || import.meta.env.VITE_MAPBOX_API_KEY || 'pk.eyJ1IjoibHVtaW5hcnkwIiwiYSI6ImNtY3c2M2VjYTA2OWsybXEwYm12emU2MnkifQ.nC7J3ggSse2k9HYdJ1sdYg';
import { Box, Container, Typography, Card, CardContent, Button, Stack, Divider, Avatar, IconButton } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AddIcon from '@mui/icons-material/Add';
import NotificationsIcon from '@mui/icons-material/Notifications';

function Dashboard() {
  const { user } = useUserAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allRides, setAllRides] = useState([]);
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState(null);
  const mapRefs = useRef({});
  const [mapsInitialized, setMapsInitialized] = useState({});
  const [error, setError] = useState(null);

  // Placeholder data
  const userName = 'Luminary';
  const availableRides = 0;
  const myGroups = 4;
  const ridesThisWeek = 3;
  const groups = [
    { name: 'Green Lake Neighbors', members: 47, avatar: '/group1.jpg' },
    { name: 'University Carpool', members: 18, avatar: '/group2.jpg' },
    { name: 'Soccer Parents Network', members: 31, avatar: '/group3.jpg' },
  ];

  // Build real recent activity feed
  const activityFeed = useMemo(() => {
    console.log('Building activity feed with:', { allRides: allRides.length, friends: friends.length });
    
    const feed = [];

    // Add ride activities
    allRides.forEach(ride => {
      console.log('Processing ride:', ride.id, ride.status, ride.destination);
      
      // Add ride creation
      if (ride.userType === 'driver') {
        feed.push({
          type: 'ride-created',
          text: `You created a ride to ${ride.destination?.address || 'Unknown destination'}`,
          time: ride.createdAt ? ride.createdAt.toDate() : new Date(),
          avatar: '/ride1.jpg',
          id: ride.id,
        });
      }
      
      // Add ride joining
      if (ride.userType === 'passenger') {
        feed.push({
          type: 'ride-joined',
          text: `You joined a ride to ${ride.destination?.address || 'Unknown destination'}`,
          time: ride.createdAt ? ride.createdAt.toDate() : new Date(),
          avatar: '/ride1.jpg',
          id: ride.id,
        });
      }
      
      if (ride.status === 'active' || ride.status === 'created') {
        feed.push({
          type: 'ride-active',
          text: `Ride to ${ride.destination?.address || 'Unknown destination'} is active`,
          time: ride.createdAt ? ride.createdAt.toDate() : new Date(),
          avatar: '/ride1.jpg',
          id: ride.id,
        });
      }
      if (ride.status === 'completed') {
        feed.push({
          type: 'ride-completed',
          text: `Completed ride to ${ride.destination?.address || 'Unknown destination'}`,
          time: ride.completedAt ? ride.completedAt.toDate() : (ride.updatedAt ? ride.updatedAt.toDate() : new Date()),
          avatar: '/ride1.jpg',
          id: ride.id,
        });
      }
      if (ride.status === 'cancelled') {
        feed.push({
          type: 'ride-cancelled',
          text: `Ride to ${ride.destination?.address || 'Unknown destination'} was cancelled`,
          time: ride.updatedAt ? ride.updatedAt.toDate() : new Date(),
          avatar: '/ride1.jpg',
          id: ride.id,
        });
      }
    });

    // Add friend activities (joining groups, etc.)
    friends.forEach(friend => {
      console.log('Processing friend:', friend.id, friend.relationship);
      if (friend.relationship && friend.relationship.communityId) {
        feed.push({
          type: 'friend-group',
          text: `${friend.profile.displayName} joined group (${friend.relationship.communityId})`,
          time: friend.relationship.addedAt ? new Date(friend.relationship.addedAt) : new Date(),
          avatar: friend.profile.photoURL || '/default-avatar.png',
          id: friend.id,
        });
      }
      // Add general friend activity
      feed.push({
        type: 'friend-added',
        text: `You became friends with ${friend.profile.displayName}`,
        time: friend.relationship?.addedAt ? new Date(friend.relationship.addedAt) : new Date(),
        avatar: friend.profile.photoURL || '/default-avatar.png',
        id: friend.id,
      });
    });

    // Add fallback activity if no real data
    if (feed.length === 0) {
      feed.push(
        {
          type: 'welcome',
          text: 'Welcome to SynqRoute! Start by creating or joining a ride.',
          time: new Date(),
          avatar: '/ride1.jpg',
          id: 'welcome-1',
        },
        {
          type: 'tip',
          text: 'Connect with friends to see their ride activities here.',
          time: new Date(Date.now() - 60000), // 1 minute ago
          avatar: '/group1.jpg',
          id: 'tip-1',
        }
      );
    }

    // Sort by time, most recent first
    feed.sort((a, b) => b.time - a.time);
    
    console.log('Final activity feed:', feed);
    return feed;
  }, [allRides, friends]);

  // Helper function to handle query errors
  const handleQueryError = (error) => {
    console.error('Query error:', error);
    if (error.code === 'failed-precondition') {
      setError('Please wait while we update our database indexes');
    } else {
      setError('Failed to load rides');
    }
    setLoading(false);
  };

  // Helper function to format time
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to calculate ETA
  const calculateETA = (createdAt) => {
    if (!createdAt) return 'N/A';
    const startTime = createdAt.toDate();
    const now = new Date();
    const duration = Math.round((now - startTime) / 1000 / 60); // in minutes
    return `${duration} min ago`;
  };

  // Main ride fetching effect
  useEffect(() => {
    if (!user) return;

    console.log('Setting up ride listeners for dashboard');

    // Simple queries that should work with existing indexes
    const queries = [];

    // Query for rides where user is driver (only active/created rides)
    const driverQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', 'in', ['active', 'created'])
    );
    queries.push({ query: driverQuery, type: 'driver' });

    // Query for rides where user is passenger (only active/created rides)
    const passengerQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('status', 'in', ['active', 'created'])
    );
    queries.push({ query: passengerQuery, type: 'passenger' });

    // Set up subscriptions
    const unsubscribes = [];

    queries.forEach(({ query: firestoreQuery, type }) => {
      const unsubscribe = onSnapshot(firestoreQuery, 
        (snapshot) => {
          const rides = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            userType: type
          }));
          console.log(`${type} rides:`, rides);
          console.log(`${type} rides details:`, rides.map(ride => ({
            id: ride.id,
            status: ride.status,
            driver: ride.driver?.uid,
            passengers: ride.passengerUids,
            createdAt: ride.createdAt
          })));

          // Update all rides state
          setAllRides(prevRides => {
            // Remove rides from this type and add new ones
            const filteredRides = prevRides.filter(ride => ride.userType !== type);
            const newRides = [...filteredRides, ...rides];
            console.log('Updated allRides state:', newRides.map(ride => ({
              id: ride.id,
              status: ride.status,
              userType: ride.userType
            })));
            return newRides;
          });
            setLoading(false);
        },
        handleQueryError
      );
      unsubscribes.push(unsubscribe);
    });

    // Cleanup function
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [user]);

  // Friends loading effect
  useEffect(() => {
    if (!user) return;

    setIsLoadingFriends(true);
    const unsubscribeFriends = subscribeToFriendsList(user.uid, (result) => {
      if (result.success) {
        setFriends(result.friends);
      } else {
        setFriendError(result.error);
      }
      setIsLoadingFriends(false);
    });

    return () => {
      unsubscribeFriends();
    };
  }, [user]);

  // Map initialization effect
  useEffect(() => {
    if (!loading && allRides.length > 0) {
      allRides.forEach(ride => {
        if (!mapsInitialized[ride.id]) {
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            initializeMap(ride);
            setMapsInitialized(prev => ({ ...prev, [ride.id]: true }));
          });
        }
      });
    }
  }, [loading, allRides, mapsInitialized]);

  // Map initialization function
  const initializeMap = (ride) => {
    const mapElement = document.getElementById(`map-${ride.id}`);
    if (!mapElement) {
      console.log(`Map element not found for ride ${ride.id}`);
      return;
    }

    if (mapRefs.current[ride.id]) {
      console.log(`Map already initialized for ride ${ride.id}`);
      return;
    }

    console.log(`Initializing Mapbox map for ride ${ride.id}`, ride);

    try {
      const map = new mapboxgl.Map({
        container: mapElement,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-96.7970, 32.7767], // Default to Dallas
        zoom: 12,
        interactive: false // Disable interactions for snapshot view
      });

      // Wait for map to load before adding markers
      map.on('load', () => {
        const bounds = new mapboxgl.LngLatBounds();
        let hasFeatures = false;

        // Add driver location
        if (ride.driver?.location) {
          console.log('Adding driver location:', ride.driver.location);
          const driverMarker = new mapboxgl.Marker({
            color: '#4CAF50',
            scale: 0.8
          })
          .setLngLat([ride.driver.location.lng, ride.driver.location.lat])
          .addTo(map);
          
          bounds.extend([ride.driver.location.lng, ride.driver.location.lat]);
          hasFeatures = true;
        }

        // Add passenger locations
        if (ride.passengers) {
          ride.passengers.forEach((passenger, index) => {
            if (passenger.location) {
              console.log(`Adding passenger ${index} location:`, passenger.location);
              const passengerMarker = new mapboxgl.Marker({
                color: '#FF9800',
                scale: 0.6
              })
              .setLngLat([passenger.location.lng, passenger.location.lat])
              .addTo(map);
              
              bounds.extend([passenger.location.lng, passenger.location.lat]);
              hasFeatures = true;
            }
          });
        }

        // Add destination
        if (ride.destination?.location) {
          console.log('Adding destination location:', ride.destination.location);
          const destMarker = new mapboxgl.Marker({
            color: '#fa314a',
            scale: 0.8
          })
          .setLngLat([ride.destination.location.lng, ride.destination.location.lat])
          .addTo(map);
          
          bounds.extend([ride.destination.location.lng, ride.destination.location.lat]);
          hasFeatures = true;
        }

        // Fit map to all features
        if (hasFeatures) {
          map.fitBounds(bounds, {
            padding: 20,
            maxZoom: 14,
            duration: 0
          });
        }
      });

      mapRefs.current[ride.id] = map;
      console.log(`Mapbox map initialized successfully for ride ${ride.id}`);
    } catch (error) {
      console.error(`Error initializing Mapbox map for ride ${ride.id}:`, error);
    }
  };

  // Process and sort rides
  const seenIds = new Set();
  const uniqueRides = allRides
    .filter(ride => {
      if (seenIds.has(ride.id)) {
        return false;
      }
      seenIds.add(ride.id);
      
      // Filter out rides where user has declined invitation
      if (ride.invitations && ride.invitations[user?.uid]) {
        const userInvitation = ride.invitations[user.uid];
        if (userInvitation.status === 'declined') {
          console.log('Filtering out declined ride:', ride.id);
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      // Sort by status priority (active first, then created, then others)
      const statusOrder = { active: 0, created: 1, forming: 2, cancelled: 3 };
      const aOrder = statusOrder[a.status] || 4;
      const bOrder = statusOrder[b.status] || 4;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Then sort by creation time (newest first)
      if (a.createdAt && b.createdAt) {
        return b.createdAt.toDate() - a.createdAt.toDate();
      }
      
      return b.id.localeCompare(a.id);
    });

  console.log('Final unique rides for dashboard:', uniqueRides);

  if (loading) {
    return (
      <SimpleLoading 
        message="Loading your dashboard..."
        size="large"
      />
    );
  }

  return (
    <Box sx={{ background: '#f9f6f2', minHeight: '100vh', py: { xs: 2, md: 5 } }}>
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 3, md: 6 } }}>
        <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
          {/* Main Content (2/3) */}
          <Box sx={{ flex: 2, minWidth: 0 }}>
            {/* Welcome Card */}
            <Card sx={{ borderRadius: 5, mb: 4, background: 'linear-gradient(90deg, #f9f6f2 60%, #f5f3e7 100%)', boxShadow: '0 4px 24px 0 #e0c9b3', p: { xs: 2, md: 5 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
        <Typography variant="h4" fontWeight={700} color="#4e342e" mb={1}>
          Welcome back, {userName}! <span role="img" aria-label="sparkles">✨</span>
        </Typography>
                <Typography variant="body1" color="#7c5e48" mb={2}>
                  Your community is active with 12 rides this week
        </Typography>
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" sx={{ background: '#a47551', color: '#fff', borderRadius: 2, fontWeight: 600, px: 3, py: 1.2, fontSize: 18 }} onClick={() => navigate('/create-group')}>Offer a Ride</Button>
                  <Button variant="outlined" sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600, px: 3, py: 1.2, fontSize: 18 }}>Find Rides</Button>
                </Stack>
              </Box>
              <Avatar src="/profile-placeholder.jpg" sx={{ width: 100, height: 100, ml: 4, boxShadow: 3 }} />
            </Card>

            {/* Stats Row */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} mb={4}>
              <Card sx={{ flex: 1, borderRadius: 4, boxShadow: 0, minHeight: 120 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" color="#7c5e48">Rides available today</Typography>
                    <Typography variant="h4" fontWeight={700}>{availableRides}</Typography>
                  </Box>
                  <Avatar src="/ride1.jpg" sx={{ width: 56, height: 56 }} />
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, borderRadius: 4, boxShadow: 0, minHeight: 120 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" color="#7c5e48">Groups you've joined</Typography>
                    <Typography variant="h4" fontWeight={700}>{myGroups}</Typography>
                  </Box>
                  <Avatar src="/group1.jpg" sx={{ width: 56, height: 56 }} />
            </CardContent>
          </Card>
              <Card sx={{ flex: 1, borderRadius: 4, boxShadow: 0, minHeight: 120 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
              <Box>
                    <Typography variant="subtitle2" color="#7c5e48">Your community rating</Typography>
                    <Typography variant="h4" fontWeight={700}>4.9</Typography>
              </Box>
                  <Avatar src="/ride2.jpg" sx={{ width: 56, height: 56 }} />
            </CardContent>
          </Card>
              <Card sx={{ flex: 1, borderRadius: 4, boxShadow: 0, minHeight: 120 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
              <Box>
                    <Typography variant="subtitle2" color="#7c5e48">Miles saved this month</Typography>
                    <Typography variant="h4" fontWeight={700}>127</Typography>
              </Box>
                  <Avatar src="/group2.jpg" sx={{ width: 56, height: 56 }} />
            </CardContent>
          </Card>
        </Stack>

            {/* Active Rides */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, mb: 4 }}>
              <CardContent sx={{ py: 4 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h6" fontWeight={600} color="#4e342e">
                    <DirectionsCarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Your Active Rides
              </Typography>
                  <Button 
                    component={Link} 
                    to="/rides" 
                    variant="text" 
                    endIcon={<AddIcon />} 
                    sx={{ color: '#b08968', fontWeight: 600 }}
                  >
                View All
              </Button>
            </Box>
                {uniqueRides.filter(ride => ride.status === 'active' || ride.status === 'created').length === 0 ? (
              <Box display="flex" flexDirection="column" alignItems="center" py={4}>
                    <DirectionsCarIcon sx={{ fontSize: 48, color: '#b08968', mb: 2 }} />
                    <Typography color="#b08968" mb={1} fontSize={18}>No active rides</Typography>
                    <Typography color="#b08968" mb={2} fontSize={15}>Create or join a ride to get started</Typography>
                <Button 
                  variant="contained" 
                  startIcon={<AddIcon />} 
                  onClick={() => navigate('/create-group')}
                      sx={{ background: '#b08968', color: '#fff', borderRadius: 2, mt: 1, px: 4, fontWeight: 600, fontSize: 16 }}
                >
                  Create a Ride
                </Button>
              </Box>
            ) : (
              <Stack spacing={2}>
                {uniqueRides
                      .filter(ride => ride.status === 'active' || ride.status === 'created')
                  .slice(0, 3)
                      .map(ride => (
                        <Box 
                          key={ride.id} 
                          sx={{ 
                            background: '#f9f6ef', 
                            borderRadius: 2, 
                            p: 2, 
                            display: 'flex', 
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': {
                              background: '#f5f3e7',
                              transform: 'translateY(-1px)',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }
                          }}
                          onClick={() => navigate(`/rides/${ride.id}`)}
                        >
                          <Avatar 
                            src={ride.groupAvatar || '/default-avatar.png'} 
                            alt={ride.groupName || 'Ride'} 
                            sx={{ width: 48, height: 48, mr: 2, bgcolor: '#b08968' }} 
                          />
                          <Box sx={{ flex: 1 }}>
                            <Typography fontWeight={600} color="#4e342e" fontSize={16}>
                              {ride.groupName || 'Ride Group'}
                            </Typography>
                            <Typography variant="body2" color="#7c5e48" fontSize={14}>
                              {!ride.destination ? 'No destination' : 
                               typeof ride.destination === 'string' ? ride.destination : 
                               ride.destination.address || 'Unknown destination'}
                            </Typography>
                            <Typography variant="caption" color="#b08968" fontSize={12}>
                              {ride.status === 'active' ? '🟢 Active' : '🟡 Forming'} • {ride.userType === 'driver' ? 'Driver' : 'Passenger'}
                            </Typography>
                        </Box>
                        <Button 
                          variant="outlined" 
                          size="small"
                            sx={{ 
                              color: '#b08968', 
                              borderColor: '#b08968',
                              borderRadius: 2,
                              fontWeight: 600,
                              fontSize: 12,
                              px: 2
                            }}
                        >
                            View
                        </Button>
                      </Box>
                  ))}
              </Stack>
            )}
          </CardContent>
        </Card>

            {/* Rides Near You */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, mb: 4 }}>
              <CardContent sx={{ py: 4 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h6" fontWeight={600} color="#4e342e">
                    Rides Near You
              </Typography>
              <Button variant="text" endIcon={<AddIcon />} sx={{ color: '#b08968', fontWeight: 600 }}>
                    View All 15 Rides
              </Button>
            </Box>
                {/* Placeholder for rides list logic */}
              <Box display="flex" flexDirection="column" alignItems="center" py={4}>
                  <Avatar src="/ride1.jpg" sx={{ width: 64, height: 64, mb: 2 }} />
                  <Typography color="#b08968" mb={1} fontSize={18}>Be the first to offer a ride!</Typography>
                  <Typography color="#b08968" mb={2} fontSize={15}>Your community is waiting for someone like you to get things started</Typography>
                <Button 
                  variant="contained" 
                  startIcon={<AddIcon />} 
                  onClick={() => navigate('/create-group')}
                    sx={{ background: '#b08968', color: '#fff', borderRadius: 2, mt: 1, px: 4, fontWeight: 600, fontSize: 16 }}
                >
                    Create Your First Ride
                </Button>
              </Box>
                {/* TODO: Replace above with actual rides list logic */}
          </CardContent>
        </Card>

            {/* Community Pulse (Activity Feed) */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, mb: 2 }}>
              <CardContent sx={{ py: 3 }}>
            <Typography variant="h6" fontWeight={600} color="#4e342e" mb={2}>
                  Community Pulse
                </Typography>
                <Typography variant="body2" color="#b08968" mb={2}>
                  What's happening in your ride-sharing network
            </Typography>
            <Stack spacing={1}>
              {activityFeed.length === 0 ? (
                <Typography color="#b08968">No recent activity yet.</Typography>
              ) : (
                activityFeed.slice(0, 10).map((activity, idx) => (
                  <Box key={activity.id + idx} sx={{ background: '#f9f6ef', borderRadius: 2, p: 2, display: 'flex', alignItems: 'center' }}>
                    <Avatar src={activity.avatar} sx={{ width: 32, height: 32, mr: 2 }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{activity.text}</Typography>
                      <Typography variant="caption" color="#b08968">{activity.time.toLocaleString()}</Typography>
                    </Box>
                  </Box>
                ))
              )}
            </Stack>
          </CardContent>
        </Card>
          </Box>

          {/* Sidebar (1/3) */}
          <Box className="dashboard-sidebar-bg" sx={{ flex: 1, minWidth: 280, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 3, position: 'sticky', top: 32, alignSelf: 'flex-start', background: { md: '#f9f6ef' }, borderRadius: 4, boxShadow: { md: '0 2px 16px 0 #e0c9b3' }, p: { md: 2, xs: 0 } }}>
            {/* My Communities */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, mb: 2 }}>
              <CardContent sx={{ py: 3 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h6" fontWeight={600} color="#4e342e">
                    My Communities
              </Typography>
              <IconButton size="small" sx={{ color: '#b08968' }}>
                <AddIcon />
              </IconButton>
            </Box>
                {/* TODO: Replace with actual communities logic */}
                <Stack spacing={2}>
                  <Box display="flex" alignItems="center">
                    <Avatar src="/group2.jpg" sx={{ width: 32, height: 32, mr: 2 }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>University Carpool</Typography>
                      <Typography variant="caption" color="#b08968">18 members • school</Typography>
                    </Box>
                  </Box>
                  <Box display="flex" alignItems="center">
                    <Avatar src="/group3.jpg" sx={{ width: 32, height: 32, mr: 2 }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Weekend Warriors</Typography>
                      <Typography variant="caption" color="#b08968">28 members • social</Typography>
                    </Box>
                  </Box>
                  <Box display="flex" alignItems="center">
                    <Avatar src="/group1.jpg" sx={{ width: 32, height: 32, mr: 2 }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Soccer Parents Network</Typography>
                      <Typography variant="caption" color="#b08968">31 members • sports</Typography>
                    </Box>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Trending Communities */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, mb: 2 }}>
              <CardContent sx={{ py: 3 }}>
                <Typography variant="h6" fontWeight={600} color="#4e342e" mb={2}>
                  Trending Communities
                </Typography>
                {/* TODO: Replace with trending communities logic */}
            <Stack spacing={2}>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center">
                      <Avatar src="/group1.jpg" sx={{ width: 32, height: 32, mr: 2 }} />
                      <Box>
                        <Typography variant="body2" fontWeight={500}>Family Adventure Club</Typography>
                        <Typography variant="caption" color="#b08968">12 members</Typography>
                      </Box>
                    </Box>
                    <Button size="small" variant="outlined" sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600 }}>Join</Button>
                  </Box>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center">
                      <Avatar src="/group2.jpg" sx={{ width: 32, height: 32, mr: 2 }} />
                  <Box>
                        <Typography variant="body2" fontWeight={500}>Green Lake Neighbors</Typography>
                        <Typography variant="caption" color="#b08968">47 members</Typography>
                      </Box>
                    </Box>
                    <Button size="small" variant="outlined" sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600 }}>Join</Button>
                  </Box>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center">
                      <Avatar src="/group3.jpg" sx={{ width: 32, height: 32, mr: 2 }} />
                      <Box>
                        <Typography variant="body2" fontWeight={500}>Downtown Commuters</Typography>
                        <Typography variant="caption" color="#b08968">24 members</Typography>
                      </Box>
                    </Box>
                    <Button size="small" variant="outlined" sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600 }}>Join</Button>
                </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Quick Actions */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, background: '#f9f6ef' }}>
              <CardContent sx={{ py: 3 }}>
            <Typography variant="h6" fontWeight={600} color="#4e342e" mb={2}>
              Quick Actions
            </Typography>
            <Stack spacing={2}>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={() => navigate('/create-group')}
                    sx={{ background: '#a47551', color: '#fff', borderRadius: 2, fontWeight: 600, fontSize: 16, py: 1.2 }}
              >
                    Offer a Ride
              </Button>
                  <Button variant="outlined" sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600, fontSize: 16, py: 1.2 }}>
                    Find Communities
              </Button>
                  <Button variant="outlined" sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600, fontSize: 16, py: 1.2 }}>
                    Browse Destinations
              </Button>
            </Stack>
          </CardContent>
        </Card>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

export default Dashboard; 