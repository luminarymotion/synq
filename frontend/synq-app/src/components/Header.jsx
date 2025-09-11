import React, { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import NotificationsIcon from '@mui/icons-material/Notifications';
import HomeIcon from '@mui/icons-material/Home';
import GroupIcon from '@mui/icons-material/Group';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import MessageIcon from '@mui/icons-material/Message';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
<<<<<<< HEAD
=======
import { collection, query, where, onSnapshot, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { markNotificationAsRead, createRideInvitationNotification } from '../services/notificationService';
import Tooltip from '@mui/material/Tooltip';
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)

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
};

const navLinks = [
  { label: 'Home', icon: <HomeIcon sx={{ color: palette.accent2 }} fontSize="small" />, path: '/dashboard' },
  { label: 'Friends', icon: <GroupIcon sx={{ color: palette.accent2 }} fontSize="small" />, path: '/friends' },
  { label: 'Groups', icon: <GroupIcon sx={{ color: palette.accent3 }} fontSize="small" />, path: '/groups' },
  { label: 'Rides', icon: <DirectionsCarIcon sx={{ color: palette.accent2 }} fontSize="small" />, path: '/rides' },
];

function stringAvatar(name) {
  if (!name) return '';
  const parts = name.split(' ');
  return parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name[0].toUpperCase();
}

function Header() {
  const { user, logOut } = useUserAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
<<<<<<< HEAD
=======
  const [notificationAnchorEl, setNotificationAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [clickedNotificationId, setClickedNotificationId] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
  const open = Boolean(anchorEl);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };
  const handleSettings = () => {
    handleMenuClose();
    navigate('/settings');
  };
  const handleLogout = async () => {
    handleMenuClose();
    await logOut();
    navigate('/login');
  };

<<<<<<< HEAD
=======
  // Notification handling
  const handleNotificationMenuOpen = (event) => {
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleNotificationMenuClose = () => {
    setNotificationAnchorEl(null);
  };

  // Fetch notifications from Firestore
  useEffect(() => {
    if (!user?.uid) return;

    console.log('🔔 Setting up notifications listener for user:', user.uid);

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
      // Removed orderBy to avoid index requirement
    );

    console.log('🔍 Notifications query:', {
      collection: 'notifications',
      userId: user.uid,
      orderBy: 'none (avoiding index requirement)'
    });

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      console.log('📨 Notifications snapshot received:', {
        size: snapshot.size,
        empty: snapshot.empty,
        docs: snapshot.docs.map(doc => ({
          id: doc.id,
          type: doc.data().type,
          title: doc.data().title,
          userId: doc.data().userId
        }))
      });

      // Additional debugging for empty notifications
      if (snapshot.empty) {
        console.log('🔍 No notifications found - checking query parameters:', {
          userId: user.uid,
          queryCollection: 'notifications',
          orderBy: 'createdAt'
        });
      }

      const notificationsList = [];
      let unread = 0;

      snapshot.forEach((doc) => {
        const notification = { id: doc.id, ...doc.data() };
        console.log('📄 Raw notification data:', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          userId: notification.userId,
          createdAt: notification.createdAt,
          createdAtType: typeof notification.createdAt,
          hasToDate: notification.createdAt && typeof notification.createdAt.toDate === 'function'
        });
        notificationsList.push(notification);
        if (!notification.read) {
          unread++;
        }
      });

      // Sort notifications by createdAt (newest first) since we removed orderBy from query
      notificationsList.sort((a, b) => {
        // Handle different timestamp formats
        const getTimestamp = (notification) => {
          if (!notification.createdAt) return 0;
          
          // If it's a Firestore timestamp with toDate method
          if (notification.createdAt.toDate && typeof notification.createdAt.toDate === 'function') {
            return notification.createdAt.toDate().getTime();
          }
          
          // If it's already a Date object
          if (notification.createdAt instanceof Date) {
            return notification.createdAt.getTime();
          }
          
          // If it's a timestamp number
          if (typeof notification.createdAt === 'number') {
            return notification.createdAt;
          }
          
          // If it's a string, try to parse it
          if (typeof notification.createdAt === 'string') {
            const parsed = new Date(notification.createdAt);
            return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
          }
          
          // If it's an object with seconds/nanoseconds (Firestore timestamp)
          if (notification.createdAt.seconds) {
            return notification.createdAt.seconds * 1000 + (notification.createdAt.nanoseconds || 0) / 1000000;
          }
          
          return 0;
        };
        
        const aTime = getTimestamp(a);
        const bTime = getTimestamp(b);
        
        console.log('🕒 Sorting notification timestamps:', {
          aId: a.id,
          aTime: aTime,
          aCreatedAt: a.createdAt,
          bId: b.id,
          bTime: bTime,
          bCreatedAt: b.createdAt,
          result: bTime - aTime
        });
        
        return bTime - aTime; // Newest first
      });

      console.log('📋 Processed notifications:', {
        total: notificationsList.length,
        unread: unread,
        notifications: notificationsList.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          read: n.read,
          createdAt: n.createdAt,
          createdAtType: typeof n.createdAt,
          hasToDate: n.createdAt && typeof n.createdAt.toDate === 'function'
        }))
      });

      console.log('🔧 Setting notifications state:', {
        notificationsList: notificationsList.length,
        unread: unread
      });
      setNotifications(notificationsList);
      setUnreadCount(unread);
    }, (error) => {
      console.error('❌ Error in notifications listener:', error);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Handle notification click and navigation
  const handleNotificationClick = async (notification) => {
    console.log('🔔 CLICK HANDLER CALLED - Notification clicked:', {
      id: notification.id,
      type: notification.type,
      metadata: notification.metadata,
      title: notification.title,
      fullNotification: notification
    });
    
    try {

      // Set loading state
      setClickedNotificationId(notification.id);

      // Mark as read first
      await markNotificationAsRead(notification.id);
      console.log('✅ Notification marked as read:', notification.id);
      
      // Close the notification dropdown
      handleNotificationMenuClose();
      
      // Navigate based on notification type
      console.log('🧭 Starting navigation logic for type:', notification.type);
      switch (notification.type) {
        case 'ride_invitation':
        case 'ride-invitation': // Support both formats
          const rideId = notification.metadata?.rideId || notification.rideId;
          console.log('🚗 Ride invitation - rideId:', rideId, 'metadata:', notification.metadata);
          if (rideId) {
            console.log('🚗 Navigating to ride invitation:', rideId);
            navigate(`/rides/${rideId}`);
          } else {
            console.log('⚠️ No ride ID found in notification, navigating to rides list');
            navigate('/rides');
          }
          break;
          
        case 'ride_update':
        case 'ride-update': // Support both formats
          const updateRideId = notification.metadata?.rideId || notification.rideId;
          if (updateRideId) {
            console.log('🔄 Navigating to ride update:', updateRideId);
            navigate(`/rides/${updateRideId}`);
          } else {
            console.log('⚠️ No ride ID found in notification, navigating to rides list');
            navigate('/rides');
          }
          break;
          
        case 'friend_request':
        case 'friend-request': // Support both formats
          console.log('👥 Navigating to friends page for friend request');
          navigate('/friends');
          break;
          
        case 'friend_request_accepted':
        case 'friend_request_rejected':
        case 'friend_added':
        case 'friend-request-accepted': // Support both formats
        case 'friend-request-rejected':
        case 'friend-added':
          console.log('👥 Navigating to friends page for friend response');
          navigate('/friends');
          break;
          
        case 'ride_invitation_response':
        case 'ride-invitation-response': // Support both formats
          const responseRideId = notification.metadata?.rideId || notification.rideId;
          if (responseRideId) {
            console.log('📝 Navigating to ride for invitation response:', responseRideId);
            navigate(`/rides/${responseRideId}`);
          } else {
            console.log('⚠️ No ride ID found in notification, navigating to rides list');
            navigate('/rides');
          }
          break;
          
        default:
          console.log('📱 Unknown notification type:', notification.type);
          // For unknown types, try to navigate to a general page
          navigate('/dashboard');
          break;
      }
    } catch (error) {
      console.error('❌ Error handling notification click:', error);
    } finally {
      // Clear loading state
      setClickedNotificationId(null);
    }
  };

  // Get notification action text for tooltip
  const getNotificationActionText = (type) => {
    switch (type) {
      case 'ride_invitation':
      case 'ride-invitation':
        return 'view ride invitation';
      case 'ride_update':
      case 'ride-update':
        return 'view ride updates';
      case 'ride_invitation_response':
      case 'ride-invitation-response':
        return 'view ride response';
      case 'friend_request':
      case 'friend-request':
        return 'view friend request';
      case 'friend_request_accepted':
      case 'friend_request_rejected':
      case 'friend_added':
      case 'friend-request-accepted':
      case 'friend-request-rejected':
      case 'friend-added':
        return 'view friends';
      default:
        return 'view details';
    }
  };

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'ride_invitation':
      case 'ride-invitation':
        return <DirectionsCarIcon fontSize="small" />;
      case 'ride_update':
      case 'ride-update':
        return <NotificationsIcon fontSize="small" />;
      case 'friend_request':
      case 'friend-request':
        return <GroupIcon fontSize="small" />;
      default:
        return <NotificationsIcon fontSize="small" />;
    }
  };

  // Get notification color based on type
  const getNotificationColor = (type) => {
    switch (type) {
      case 'ride_invitation':
      case 'ride-invitation':
        return palette.accent2;
      case 'ride_update':
      case 'ride-update':
        return palette.accent3;
      case 'friend_request':
      case 'friend-request':
        return palette.accent;
      default:
        return palette.textSoft;
    }
  };

  // Clear all notifications for the current user
  const clearAllNotifications = async () => {
    try {
      console.log('🗑️ Clearing all notifications for user:', user.uid);
      
      if (!user?.uid) {
        console.log('❌ No user found, cannot clear notifications');
        return;
      }
      
      // Get all notifications for the user
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid)
      );
      
      const snapshot = await getDocs(notificationsQuery);
      
      if (snapshot.empty) {
        console.log('📭 No notifications to clear');
        return;
      }
      
      // Delete all notifications in batches
      const batch = writeBatch(db);
      let deleteCount = 0;
      
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });
      
      await batch.commit();
      
      console.log(`✅ Cleared ${deleteCount} notifications`);
      
      // Show success message
      setSuccessMessage(`Cleared ${deleteCount} notifications`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
    }
  };

  // Test function to create a sample notification (remove in production)
  const createTestNotification = async () => {
    try {
      const testRideData = {
        id: 'test-ride-123',
        destination: { address: 'Test Destination' },
        createdBy: 'test-user'
      };
      
      await createRideInvitationNotification(
        user.uid,
        testRideData,
        'Test User'
      );
      
      console.log('Test notification created successfully');
    } catch (error) {
      console.error('Error creating test notification:', error);
    }
  };

>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
  return (
    <AppBar position="static" elevation={0} sx={{ background: palette.bg, borderBottom: `2px solid ${palette.border}`, color: palette.text, boxShadow: '0 2px 8px 0 #e0c9b3', borderRadius: 0 }}>
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: 72, px: { xs: 0.5, sm: 2 } }}>
        {/* Left: Logo/Title */}
        <Typography variant="h5" fontWeight={700} sx={{ 
          color: palette.accent2, 
          letterSpacing: 1, 
          fontFamily: 'serif', 
          pl: { xs: 0.5, sm: 1 },
          fontSize: { xs: '1rem', sm: '1.5rem' }
        }}>
          RideShare
        </Typography>
        {/* Center: Navigation Links */}
        <Stack direction="row" spacing={{ xs: 0.5, sm: 2 }} sx={{ flexGrow: 1, justifyContent: 'center' }}>
          {navLinks.map((link) => (
            <Button
              key={link.label}
              component={Link}
              to={link.path}
              startIcon={React.cloneElement(link.icon, { fontSize: 'small' })}
              sx={{
                color: location.pathname.startsWith(link.path) ? palette.accent2 : palette.textSoft,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: { xs: 10, sm: 18 },
                borderBottom: location.pathname.startsWith(link.path) ? `3px solid ${palette.accent2}` : '3px solid transparent',
                borderRadius: 0,
                background: 'none',
                minWidth: { xs: 60, sm: 110 },
                fontFamily: 'serif',
                letterSpacing: 0.5,
                px: { xs: 0.5, sm: 2 },
                '& .MuiButton-startIcon': {
                  marginRight: { xs: 0.5, sm: 1 }
                }
              }}
            >
<<<<<<< HEAD
              {link.label}
            </Button>
          ))}
        </Stack>
        {/* Right: User Avatar and Menu */}
        {user && (
          <Box>
=======
              {/* Success Message */}
              {successMessage && (
                <Box px={2} py={1} bgcolor={`${palette.accent}20`} borderBottom={`1px solid ${palette.border}`}>
                  <Typography variant="body2" color={palette.accent2} textAlign="center">
                    {successMessage}
                  </Typography>
                </Box>
              )}
              
              <Box px={2} py={1.5} borderBottom={`1px solid ${palette.border}`}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={600} color={palette.text}>
                    Notifications
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={createTestNotification}
                      sx={{ 
                        fontSize: '0.7rem', 
                        minWidth: 'auto',
                        borderColor: palette.accent2,
                        color: palette.accent2
                      }}
                    >
                      Test
                    </Button>
                    {notifications.length > 0 && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={clearAllNotifications}
                        sx={{ 
                          fontSize: '0.7rem', 
                          minWidth: 'auto',
                          borderColor: palette.accent3,
                          color: palette.accent3
                        }}
                      >
                        Clear All
                      </Button>
                    )}
                  </Box>
                </Box>
                {unreadCount > 0 && (
                  <Chip 
                    label={`${unreadCount} unread`} 
                    size="small" 
                    color="error" 
                    sx={{ mt: 1 }}
                  />
                )}
              </Box>
              
              {console.log('🎨 Rendering notifications dropdown, count:', notifications.length, 'notifications:', notifications.map(n => ({
                id: n.id,
                type: n.type,
                title: n.title,
                metadata: n.metadata,
                hasOnClick: true
              }))) || null}
              {notifications.length === 0 ? (
                <Box px={2} py={3} textAlign="center">
                  <Typography variant="body2" color={palette.textSoft}>
                    No notifications yet
                  </Typography>
                </Box>
              ) : (
                <List sx={{ p: 0 }}>
                  {notifications.map((notification, index) => (
                    <React.Fragment key={notification.id}>
                      <Tooltip 
                        title={`Click to ${getNotificationActionText(notification.type)}`}
                        placement="left"
                      >
                        <ListItem 
                          sx={{ 
                            px: 2, 
                            py: 1.5,
                            cursor: clickedNotificationId === notification.id ? 'wait' : 'pointer',
                            '&:hover': { bgcolor: palette.card },
                            bgcolor: !notification.read ? `${palette.accent}10` : 'transparent',
                            opacity: clickedNotificationId === notification.id ? 0.7 : 1,
                            transition: 'opacity 0.2s ease'
                          }}
                          onClick={(e) => {
                            console.log('🔔 ONCLICK TRIGGERED - Event:', e);
                            console.log('🔔 ONCLICK TRIGGERED - Notification:', notification);
                            if (clickedNotificationId === notification.id) {
                              console.log('⚠️ Notification already being processed, ignoring click');
                              return;
                            }
                            handleNotificationClick(notification);
                          }}
                        >
                        <ListItemIcon sx={{ color: getNotificationColor(notification.type) }}>
                          {getNotificationIcon(notification.type)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" fontWeight={!notification.read ? 600 : 400}>
                              {notification.title}
                            </Typography>
                          }
                          secondary={
                            <React.Fragment>
                              <Typography variant="caption" color={palette.textSoft}>
                                {notification.message}
                              </Typography>
                              <Typography variant="caption" display="block" color={palette.accent2} sx={{ mt: 0.5 }}>
                                {notification.createdAt && typeof notification.createdAt.toDate === 'function' 
                                  ? new Date(notification.createdAt.toDate()).toLocaleString()
                                  : notification.createdAt 
                                    ? new Date(notification.createdAt).toLocaleString()
                                    : 'Just now'
                                }
                              </Typography>
                            </React.Fragment>
                          }
                        />
                        {!notification.read && (
                          <Chip 
                            label="New" 
                            size="small" 
                            color="primary" 
                            sx={{ ml: 1 }}
                          />
                        )}
                        <ArrowForwardIosIcon 
                          sx={{ 
                            ml: 1, 
                            color: palette.textSoft, 
                            fontSize: '0.8rem',
                            opacity: 0.7
                          }} 
                        />
                                              </ListItem>
                        </Tooltip>
                        {index < notifications.length - 1 && (
                          <Divider sx={{ mx: 2 }} />
                        )}
                      </React.Fragment>
                  ))}
                </List>
              )}
            </Menu>

            {/* User Avatar */}
>>>>>>> 096174b (feature/build-routing-for-live-rides: have basic routing down, implementing drive mode for users, then will move onto improving routing algo)
            <IconButton onClick={handleMenuOpen} size="medium">
              <Avatar
                src={user.photoURL || undefined}
                sx={{ bgcolor: palette.accent2, width: 36, height: 36, fontFamily: 'serif', fontWeight: 700 }}
              >
                {!user.photoURL && stringAvatar(user.displayName || user.email)}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={open}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <Box px={2} py={1}>
                <Typography variant="subtitle1" fontWeight={600} color={palette.text}>
                  {user.displayName || user.email}
                </Typography>
                <Typography variant="body2" color={palette.accent2}>
                  {user.email}
                </Typography>
              </Box>
              <MenuItem onClick={handleSettings}>
                <SettingsIcon fontSize="small" sx={{ mr: 1, color: palette.accent2 }} />
                Settings
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <LogoutIcon fontSize="small" sx={{ mr: 1, color: palette.accent2 }} />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}

export default Header; 