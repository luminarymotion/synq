import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  LocationOff as LocationOffIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { getCurrentLocation } from '../services/locationService';

const LocationPermissionRequest = ({ 
  onLocationObtained, 
  onPermissionDenied, 
  isDriver = false,
  compact = false 
}) => {
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  // Check current permission status
  useEffect(() => {
    const checkPermissionStatus = async () => {
      if (!navigator.permissions) {
        setPermissionStatus('not-supported');
        return;
      }

      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(permission.state);
        
        permission.onchange = () => {
          setPermissionStatus(permission.state);
        };
      } catch (error) {
        console.warn('Could not check geolocation permission:', error);
        setPermissionStatus('unknown');
      }
    };

    checkPermissionStatus();
  }, []);

  const requestLocationPermission = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      console.log('Requesting location permission...');
      const location = await getCurrentLocation();
      console.log('Location obtained:', location);
      
      setPermissionStatus('granted');
      onLocationObtained?.(location);
    } catch (error) {
      console.error('Location permission denied or failed:', error);
      setError(error.message);
      setPermissionStatus('denied');
      onPermissionDenied?.(error);
    } finally {
      setIsRequesting(false);
    }
  };

  const getStatusInfo = () => {
    switch (permissionStatus) {
      case 'granted':
        return {
          text: 'Location Access Granted',
          color: 'success',
          icon: <CheckCircleIcon />,
          showButton: false
        };
      case 'denied':
        return {
          text: 'Location Access Denied',
          color: 'error',
          icon: <LocationOffIcon />,
          showButton: true
        };
      case 'prompt':
        return {
          text: 'Location Access Not Set',
          color: 'warning',
          icon: <WarningIcon />,
          showButton: true
        };
      case 'not-supported':
        return {
          text: 'Location Not Supported',
          color: 'error',
          icon: <LocationOffIcon />,
          showButton: false
        };
      default:
        return {
          text: 'Location Status Unknown',
          color: 'default',
          icon: <LocationIcon />,
          showButton: true
        };
    }
  };

  const statusInfo = getStatusInfo();

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          label={statusInfo.text}
          color={statusInfo.color}
          icon={statusInfo.icon}
          size="small"
        />
        {statusInfo.showButton && (
          <Button
            size="small"
            variant="outlined"
            onClick={requestLocationPermission}
            disabled={isRequesting}
            startIcon={<LocationIcon />}
          >
            {isRequesting ? 'Requesting...' : 'Enable'}
          </Button>
        )}
        <Tooltip title="Location Settings Help">
          <IconButton size="small" onClick={() => setShowHelpDialog(true)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Card sx={{ p: 3, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <LocationIcon color={permissionStatus === 'granted' ? 'success' : 'primary'} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            Location Permission Required
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isDriver 
              ? 'As a driver, you need to share your location for route optimization and passenger coordination.'
              : 'Sharing your location helps with ride coordination and pickup timing.'
            }
          </Typography>
        </Box>
        <Tooltip title="Location Settings Help">
          <IconButton onClick={() => setShowHelpDialog(true)}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Chip
          label={statusInfo.text}
          color={statusInfo.color}
          icon={statusInfo.icon}
        />
        
        {statusInfo.showButton && (
          <Button
            variant="contained"
            onClick={requestLocationPermission}
            disabled={isRequesting}
            startIcon={<LocationIcon />}
          >
            {isRequesting ? 'Requesting Permission...' : 'Enable Location Sharing'}
          </Button>
        )}
      </Box>

      {/* Help Dialog */}
      <Dialog 
        open={showHelpDialog} 
        onClose={() => setShowHelpDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Location Permission Help</DialogTitle>
        <DialogContent>
          <Typography variant="h6" gutterBottom>
            Why Location Permission is Needed
          </Typography>
          
          <Typography paragraph>
            Location sharing enables important features for ride coordination:
          </Typography>

          <Box component="ul" sx={{ pl: 2 }}>
            <li><Typography variant="body2">Route optimization for drivers</Typography></li>
            <li><Typography variant="body2">Real-time pickup coordination</Typography></li>
            <li><Typography variant="body2">Estimated arrival times</Typography></li>
            <li><Typography variant="body2">Safety features and emergency location sharing</Typography></li>
          </Box>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            How to Enable Location Permission
          </Typography>
          
          <Typography paragraph>
            If permission was denied, you can enable it in your browser settings:
          </Typography>

          <Box component="ol" sx={{ pl: 2 }}>
            <li><Typography variant="body2">Click the location icon in your browser's address bar</Typography></li>
            <li><Typography variant="body2">Select "Allow" for location access</Typography></li>
            <li><Typography variant="body2">Refresh the page and try again</Typography></li>
          </Box>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Privacy & Security
          </Typography>
          
          <Typography paragraph>
            Your location data is:
          </Typography>
          
          <Box component="ul" sx={{ pl: 2 }}>
            <li><Typography variant="body2">Only shared with ride participants</Typography></li>
            <li><Typography variant="body2">Encrypted in transit and at rest</Typography></li>
            <li><Typography variant="body2">Automatically deleted after ride completion</Typography></li>
            <li><Typography variant="body2">Never sold to third parties</Typography></li>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHelpDialog(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default LocationPermissionRequest;
