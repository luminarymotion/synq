import React, { useState, useEffect } from 'react';
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
import Badge from '@mui/material/Badge';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import HomeIcon from '@mui/icons-material/Home';
import GroupIcon from '@mui/icons-material/Group';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import MessageIcon from '@mui/icons-material/Message';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { markNotificationAsRead, createRideInvitationNotification } from '../services/notificationService';
import Tooltip from '@mui/material/Tooltip';

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
  const [notificationAnchorEl, setNotificationAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const open = Boolean(anchorEl);
  const notificationOpen = Boolean(notificationAnchorEl);

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
      where('recipientId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    console.log('🔍 Notifications query:', {
      collection: 'notifications',
      recipientId: user.uid,
      orderBy: 'createdAt'
    });

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      console.log('📨 Notifications snapshot received:', {
        size: snapshot.size,
        empty: snapshot.empty,
        docs: snapshot.docs.map(doc => ({
          id: doc.id,
          type: doc.data().type,
          title: doc.data().title,
          recipientId: doc.data().recipientId
        }))
      });

      const notificationsList = [];
      let unread = 0;

      snapshot.forEach((doc) => {
        const notification = { id: doc.id, ...doc.data() };
        console.log('📄 Raw notification data:', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          recipientId: notification.recipientId,
          createdAt: notification.createdAt,
          createdAtType: typeof notification.createdAt,
          hasToDate: notification.createdAt && typeof notification.createdAt.toDate === 'function'
        });
        notificationsList.push(notification);
        if (!notification.read) {
          unread++;
        }
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
    try {
      // Mark as read first
      await markNotificationAsRead(notification.id);
      console.log('Notification marked as read:', notification.id);
      
      // Close the notification dropdown
      handleNotificationMenuClose();
      
      // Navigate based on notification type
      switch (notification.type) {
        case 'ride_invitation':
          if (notification.rideId) {
            console.log('🚗 Navigating to ride invitation:', notification.rideId);
            navigate(`/rides`);
          }
          break;
        case 'ride_update':
          if (notification.rideId) {
            console.log('🔄 Navigating to ride update:', notification.rideId);
            navigate(`/rides`);
          }
          break;
        case 'friend_request':
          console.log('👥 Navigating to friends page');
          navigate('/friends');
          break;
        default:
          console.log('📱 Unknown notification type:', notification.type);
          break;
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'ride_invitation':
        return <DirectionsCarIcon fontSize="small" />;
      case 'ride_update':
        return <NotificationsIcon fontSize="small" />;
      case 'friend_request':
        return <GroupIcon fontSize="small" />;
      default:
        return <NotificationsIcon fontSize="small" />;
    }
  };

  // Get notification color based on type
  const getNotificationColor = (type) => {
    switch (type) {
      case 'ride_invitation':
        return palette.accent2;
      case 'ride_update':
        return palette.accent3;
      case 'friend_request':
        return palette.accent;
      default:
        return palette.textSoft;
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
        {/* Center: Navigation Links - Only show for authenticated users */}
        {user && (
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
                {link.label}
              </Button>
            ))}
          </Stack>
        )}
        {/* Right: Notification Bell and User Avatar */}
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Notification Bell */}
            <IconButton 
              onClick={handleNotificationMenuOpen}
              size="medium"
              sx={{ 
                color: palette.textSoft,
                '&:hover': { color: palette.accent2 }
              }}
            >
              <Badge badgeContent={unreadCount} color="error" max={99}>
                {unreadCount > 0 ? (
                  <NotificationsActiveIcon sx={{ color: palette.accent2 }} />
                ) : (
                  <NotificationsIcon />
                )}
              </Badge>
            </IconButton>

            {/* Notification Dropdown */}
            <Menu
              anchorEl={notificationAnchorEl}
              open={notificationOpen}
              onClose={handleNotificationMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{
                sx: {
                  width: 400,
                  maxHeight: 500,
                  overflow: 'auto'
                }
              }}
            >
              <Box px={2} py={1.5} borderBottom={`1px solid ${palette.border}`}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={600} color={palette.text}>
                    Notifications
                  </Typography>
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
              
              {console.log('🎨 Rendering notifications dropdown, count:', notifications.length, 'notifications:', notifications) || null}
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
                        title={`Click to view ${notification.type === 'ride_invitation' ? 'ride invitation' : notification.type === 'friend_request' ? 'friend request' : 'details'}`}
                        placement="left"
                      >
                        <ListItem 
                          sx={{ 
                            px: 2, 
                            py: 1.5,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: palette.card },
                            bgcolor: !notification.read ? `${palette.accent}10` : 'transparent'
                          }}
                          onClick={() => handleNotificationClick(notification)}
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