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
              {link.label}
            </Button>
          ))}
        </Stack>
        {/* Right: User Avatar and Menu */}
        {user && (
          <Box>
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