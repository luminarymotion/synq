import React, { useState, useEffect, useMemo } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc, Timestamp } from 'firebase/firestore';
import '../styles/Dashboard.css';
import { Link, useNavigate } from 'react-router-dom';
import RideHistory from '../components/RideHistory';
import { 
  subscribeToFriendsList,
  getUserRideHistory
} from '../services/firebaseOperations';
import SimpleLoading from '../components/SimpleLoading';

import { Box, Container, Typography, Card, CardContent, Button, Stack, Divider, Avatar, IconButton, Chip } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AddIcon from '@mui/icons-material/Add';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

function Dashboard() {
  const { user } = useUserAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allRides, setAllRides] = useState([]);
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendError, setFriendError] = useState(null);
  const [error, setError] = useState(null);

  // Ride expiration constants
  const RIDE_EXPIRATION_HOURS = 24; // Rides expire after 24 hours

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

  // Helper function to check if a ride has expired
  const isRideExpired = (ride) => {
    if (!ride.createdAt) return false;
    
    const createdAt = ride.createdAt.toDate();
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
    
    return hoursSinceCreation >= RIDE_EXPIRATION_HOURS;
  };

  // Helper function to get ride time remaining
  const getRideTimeRemaining = (ride) => {
    if (!ride.createdAt) return 'Unknown';
    
    const createdAt = ride.createdAt.toDate();
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, RIDE_EXPIRATION_HOURS - hoursSinceCreation);
    
    if (hoursRemaining < 1) {
      const minutesRemaining = Math.floor(hoursRemaining * 60);
      return `${minutesRemaining}m remaining`;
    } else {
      return `${Math.floor(hoursRemaining)}h ${Math.floor((hoursRemaining % 1) * 60)}m remaining`;
    }
  };

  // Helper function to get ride status display info
  const getRideStatusInfo = (ride) => {
    if (isRideExpired(ride)) {
      return {
        label: 'Expired',
        color: '#f44336',
        icon: <AccessTimeIcon sx={{ fontSize: 16 }} />,
        bgColor: '#ffebee'
      };
    }
    
    switch (ride.status) {
      case 'active':
        return {
          label: 'Active',
          color: '#4caf50',
          icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
          bgColor: '#e8f5e8'
        };
      case 'created':
        return {
          label: 'Forming',
          color: '#ff9800',
          icon: <AccessTimeIcon sx={{ fontSize: 16 }} />,
          bgColor: '#fff3e0'
        };
      case 'forming':
        return {
          label: 'Forming',
          color: '#ff9800',
          icon: <AccessTimeIcon sx={{ fontSize: 16 }} />,
          bgColor: '#fff3e0'
        };
      case 'pending':
        return {
          label: 'Pending',
          color: '#2196f3',
          icon: <AccessTimeIcon sx={{ fontSize: 16 }} />,
          bgColor: '#e3f2fd'
        };
      case 'ready':
        return {
          label: 'Ready',
          color: '#4caf50',
          icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
          bgColor: '#e8f5e8'
        };
      default:
        return {
          label: ride.status || 'Unknown',
          color: '#9e9e9e',
          icon: <AccessTimeIcon sx={{ fontSize: 16 }} />,
          bgColor: '#f5f5f5'
        };
    }
  };

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
    
    // Handle different types of Firebase errors
    if (error.code === 'permission-denied') {
      console.log('Permission denied for ride query - user may not have access to some rides');
      // Don't set error state for permission denied - this is expected for some users
      // Just log it and continue
      return;
    } else if (error.code === 'failed-precondition') {
      setError('Please wait while we update our database indexes');
    } else if (error.code === 'unavailable') {
      setError('Database service is temporarily unavailable. Please try again later.');
    } else if (error.code === 'resource-exhausted') {
      setError('Database quota exceeded. Please try again later.');
    } else {
      console.error('Unexpected query error:', error);
      setError('Failed to load rides. Please try again later.');
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
    console.log('Current user:', { uid: user.uid, email: user.email, displayName: user.displayName });

    // Simple queries that should work with existing indexes
    const queries = [];

    // Query for rides where user is driver (only active/created/forming/pending/ready rides)
    const driverQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', user.uid),
      where('status', 'in', ['active', 'created', 'forming', 'pending', 'ready'])
    );
    queries.push({ query: driverQuery, type: 'driver' });

    // Query for rides where user is passenger (only active/created/forming/pending/ready rides)
    const passengerQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', user.uid),
      where('status', 'in', ['active', 'created', 'forming', 'pending', 'ready'])
    );
    queries.push({ query: passengerQuery, type: 'passenger' });

    // Query for rides where user is in participants field (covers ride creators and RSVP participants)
    const participantQuery = query(
      collection(db, 'rides'),
      where(`participants.${user.uid}.status`, '==', 'accepted'),
      where('status', 'in', ['active', 'created', 'forming', 'pending', 'ready'])
    );
    queries.push({ query: participantQuery, type: 'participant' });

    // Note: We now cover all cases - driver, passenger, and participant fields
    // This ensures ride creators and RSVP participants are included in active rides

    // console.log('🔍 Dashboard queries setup for user:', user.uid, user.displayName);
    // console.log('Total queries to execute:', queries.length);
    // queries.forEach((q, index) => {
    //   console.log(`Query ${index + 1} (${q.type}):`, q.query);
    // });

    // Set up subscriptions
    const unsubscribes = [];

    queries.forEach(({ query: firestoreQuery, type }) => {
      const unsubscribe = onSnapshot(firestoreQuery, 
        (snapshot) => {
          console.log(`📊 ${type} query returned ${snapshot.docs.length} documents`);
          let rides = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            userType: type === 'accepted_invitation' ? 'passenger' : type === 'participant' ? 'participant' : type
          }));

          // console.log(`${type} rides:`, rides);
          // console.log(`${type} rides details:`, rides.map(ride => ({
          //   id: ride.id,
          //   status: ride.status,
          //   driver: ride.driver?.uid,
          //   driverName: ride.driver?.name || ride.driver?.displayName,
          //   passengers: ride.passengerUids,
          //   createdAt: ride.createdAt,
          //   userType: ride.userType
          // })));

          // Update all rides state
          setAllRides(prevRides => {
            // Remove rides from this type and add new ones
            const filteredRides = prevRides.filter(ride => ride.userType !== type);
            const newRides = [...filteredRides, ...rides];
            // console.log('Updated allRides state:', newRides.map(ride => ({
            //   id: ride.id,
            //   status: ride.status,
            //   userType: ride.userType
            // })));
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

  // Process and sort rides - now with proper expiration filtering
  const activeRides = useMemo(() => {
  const seenIds = new Set();
  const uniqueRides = allRides
    .filter(ride => {
      if (seenIds.has(ride.id)) {
        return false;
      }
      seenIds.add(ride.id);
      
      // Filter out rides where user has declined invitation (but not for ride creators)
      if (ride.invitations && ride.invitations[user?.uid] && ride.createdBy !== user?.uid) {
        const userInvitation = ride.invitations[user.uid];
        if (userInvitation.status === 'declined') {
          console.log('Filtering out declined ride:', ride.id);
          return false;
        }
          // Only include rides where user has accepted the invitation or is directly participating
          if (userInvitation.status === 'pending') {
            console.log('Filtering out pending invitation ride:', ride.id);
            return false;
          }
      }
      
      return true;
    })
      .filter(ride => {
        // Only include rides that are not expired
        return !isRideExpired(ride);
      })
    .sort((a, b) => {
        // Sort by status priority (active first, then ready, then forming, then created, then pending)
        const statusOrder = { 
          active: 0, 
          ready: 1, 
          forming: 2, 
          created: 3, 
          pending: 4 
        };
        const aOrder = statusOrder[a.status] || 5;
        const bOrder = statusOrder[b.status] || 5;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Then sort by creation time (newest first)
      if (a.createdAt && b.createdAt) {
        return b.createdAt.toDate() - a.createdAt.toDate();
      }
      
      return b.id.localeCompare(a.id);
    });

    console.log('Final active rides for dashboard (expired filtered out):', uniqueRides);
    return uniqueRides;
  }, [allRides, user?.uid]);

  console.log('Final unique rides for dashboard:', activeRides);

  if (loading) {
    return (
      <SimpleLoading 
        message="Loading your dashboard..."
        size="large"
      />
    );
  }

  return (
    <Box sx={{ background: '#f9f6f2', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3, md: 4 } }}>
        {/* Unified Single-Column Layout */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          
          {/* Welcome Card - Enhanced for mobile/web consistency */}
          <Card sx={{ 
            borderRadius: { xs: 3, md: 4 }, 
            background: 'linear-gradient(135deg, #f9f6f2 0%, #f5f3e7 100%)', 
            boxShadow: '0 4px 24px 0 #e0c9b3', 
            p: { xs: 3, md: 4 },
            position: 'relative',
            overflow: 'hidden'
          }}>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' }, 
              alignItems: { xs: 'flex-start', sm: 'center' }, 
              justifyContent: 'space-between',
              gap: { xs: 2, sm: 3 }
            }}>
              <Box sx={{ flex: 1 }}>
        <Typography variant="h4" fontWeight={700} color="#4e342e" mb={1}>
          Welcome back, {userName}! <span role="img" aria-label="sparkles">✨</span>
        </Typography>
                <Typography variant="body1" color="#7c5e48" mb={3}>
                  Your community is active with 12 rides this week
        </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button 
                    variant="contained" 
                    onClick={() => navigate('/create-group')}
                    sx={{ 
                      background: '#a47551', 
                      color: '#fff', 
                      borderRadius: 2, 
                      fontWeight: 600, 
                      px: 3, 
                      py: 1.2, 
                      fontSize: { xs: 16, md: 18 }
                    }}
                  >
                    Offer a Ride
                  </Button>
                  <Button 
                    variant="outlined" 
                    sx={{ 
                      color: '#b08968', 
                      borderColor: '#e0c9b3', 
                      borderRadius: 2, 
                      fontWeight: 600, 
                      px: 3, 
                      py: 1.2, 
                      fontSize: { xs: 16, md: 18 }
                    }}
                  >
                    Find Rides
                  </Button>
                </Stack>
              </Box>
              <Avatar 
                src="/profile-placeholder.jpg" 
                sx={{ 
                  width: { xs: 80, sm: 100 }, 
                  height: { xs: 80, sm: 100 }, 
                  boxShadow: 3,
                  alignSelf: { xs: 'center', sm: 'flex-end' }
                }} 
              />
            </Box>
            </Card>

          {/* Stats Grid - Responsive grid that adapts to screen size */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { 
              xs: '1fr', 
              sm: 'repeat(2, 1fr)', 
              md: 'repeat(4, 1fr)' 
            }, 
            gap: 2 
          }}>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="subtitle2" color="#7c5e48" mb={1}>Active rides today</Typography>
                <Typography variant="h4" fontWeight={700} color="#4e342e">{activeRides.length}</Typography>
                </CardContent>
              </Card>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="subtitle2" color="#7c5e48" mb={1}>Groups you've joined</Typography>
                <Typography variant="h4" fontWeight={700} color="#4e342e">{myGroups}</Typography>
            </CardContent>
          </Card>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="subtitle2" color="#7c5e48" mb={1}>Your community rating</Typography>
                <Typography variant="h4" fontWeight={700} color="#4e342e">4.9</Typography>
            </CardContent>
          </Card>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="subtitle2" color="#7c5e48" mb={1}>Miles saved this month</Typography>
                <Typography variant="h4" fontWeight={700} color="#4e342e">127</Typography>
            </CardContent>
          </Card>
          </Box>

          {/* Active Rides Section - Now properly filtered for non-expired rides */}
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ py: 3 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Typography variant="h6" fontWeight={600} color="#4e342e">
                    <DirectionsCarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Your Active Rides ({activeRides.length})
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
              {activeRides.length === 0 ? (
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
                  {activeRides
                  .slice(0, 3)
                    .map(ride => {
                      const statusInfo = getRideStatusInfo(ride);
                      const timeRemaining = getRideTimeRemaining(ride);
                      
                      return (
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
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography fontWeight={600} color="#4e342e" fontSize={16}>
                              {ride.groupName || 'Ride Group'}
                            </Typography>
                              <Chip
                                label={statusInfo.label}
                                size="small"
                                icon={statusInfo.icon}
                                sx={{
                                  backgroundColor: statusInfo.bgColor,
                                  color: statusInfo.color,
                                  fontWeight: 600,
                                  fontSize: '11px',
                                  height: '20px'
                                }}
                              />
                            </Box>
                            <Typography variant="body2" color="#7c5e48" fontSize={14} mb={1}>
                              {!ride.destination ? 'No destination' : 
                               typeof ride.destination === 'string' ? ride.destination : 
                               ride.destination.address || 'Unknown destination'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="caption" color="#b08968" fontSize={12}>
                                {ride.userType === 'driver' ? '🚗 Driver' : '👤 Passenger'}
                              </Typography>
                              <Typography variant="caption" color="#666" fontSize={11}>
                                ⏰ {timeRemaining}
                            </Typography>
                            </Box>
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
                      );
                    })}
              </Stack>
            )}
          </CardContent>
        </Card>

          {/* Communities and Activity Grid - Side by side on larger screens */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, 
            gap: 3 
          }}>
            
            {/* My Communities */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Typography variant="h6" fontWeight={600} color="#4e342e">
                    <GroupIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    My Communities
              </Typography>
              <IconButton size="small" sx={{ color: '#b08968' }}>
                <AddIcon />
              </IconButton>
            </Box>
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

            {/* Community Pulse */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3 }}>
                <Typography variant="h6" fontWeight={600} color="#4e342e" mb={2}>
                  Community Pulse
                </Typography>
                <Typography variant="body2" color="#b08968" mb={3}>
                  What's happening in your ride-sharing network
                </Typography>
                <Stack spacing={1}>
                  {activityFeed.length === 0 ? (
                    <Typography color="#b08968">No recent activity yet.</Typography>
                  ) : (
                    activityFeed.slice(0, 5).map((activity, idx) => (
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

        {/* Quick Actions */}
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <CardContent sx={{ py: 3 }}>
              <Typography variant="h6" fontWeight={600} color="#4e342e" mb={3}>
              Quick Actions
            </Typography>
              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, 
                gap: 2 
              }}>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={() => navigate('/create-group')}
                    sx={{ background: '#a47551', color: '#fff', borderRadius: 2, fontWeight: 600, fontSize: 16, py: 1.2 }}
              >
                    Offer a Ride
              </Button>
                <Button 
                  variant="outlined" 
                  sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600, fontSize: 16, py: 1.2 }}
                >
                    Find Communities
              </Button>
                <Button 
                  variant="outlined" 
                  sx={{ color: '#b08968', borderColor: '#e0c9b3', borderRadius: 2, fontWeight: 600, fontSize: 16, py: 1.2 }}
                >
                    Browse Destinations
              </Button>
              </Box>
          </CardContent>
        </Card>

        </Box>
      </Container>
    </Box>
  );
}

export default Dashboard; 