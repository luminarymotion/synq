import React, { useState, useEffect } from 'react';
import {
  Box,
  Switch,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Alert,
  FormControl,
  Select,
  MenuItem
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  LocationOff as LocationOffIcon,
  Info as InfoIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import {
  locationPermissionManager,
  LOCATION_PERMISSIONS,
  LOCATION_CONTEXTS
} from '../services/locationTrackingService';

const LocationToggle = ({ 
  userId, 
  rideId, 
  isDriver, 
  isTracking, 
  onToggleChange, 
  onOpenSettings,
  compact = false,
  showGranularOptions = false, // NEW - show granular location sharing options
  currentConsent = 'never', // NEW - current location consent setting
  onConsentChange = null // NEW - callback for consent changes
}) => {
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [userPreferences, setUserPreferences] = useState(null);
  const [rideOverride, setRideOverride] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load current permission status and preferences
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        const [status, prefs] = await Promise.all([
          locationPermissionManager.getPermissionStatus(userId),
          locationPermissionManager.getUserPreferences(userId)
        ]);

        setPermissionStatus(status);
        setUserPreferences(prefs);

        // Check if there's a ride-specific override
        const overrideKey = `ride_override_${rideId}_${userId}`;
        const storedOverride = localStorage.getItem(overrideKey);
        if (storedOverride) {
          setRideOverride(JSON.parse(storedOverride));
        }
      } catch (err) {
        setError('Failed to load location settings');
      } finally {
        setLoading(false);
      }
    };

    if (userId && rideId) {
      loadPermissions();
    }
  }, [userId, rideId]);

  // Determine if location sharing is currently enabled
  const isLocationEnabled = () => {
    if (rideOverride !== null) {
      return rideOverride.enabled;
    }
    
    if (!userPreferences) return false;
    
    // Check if current context allows location sharing
    const context = isDriver ? LOCATION_CONTEXTS.DRIVER_MODE : LOCATION_CONTEXTS.RIDE_ACTIVE;
    return userPreferences.permissionLevel !== LOCATION_PERMISSIONS.NEVER;
  };

  // Handle toggle change
  const handleToggleChange = async (enabled) => {
    try {
      setError(null);
      
      // Save ride-specific override
      const overrideKey = `ride_override_${rideId}_${userId}`;
      const overrideData = {
        enabled,
        timestamp: Date.now(),
        context: isDriver ? 'driver' : 'passenger'
      };
      
      localStorage.setItem(overrideKey, JSON.stringify(overrideData));
      setRideOverride(overrideData);
      
      // Notify parent component
      if (onToggleChange) {
        onToggleChange(enabled, overrideData);
      }
      
    } catch (err) {
      setError('Failed to update location setting');
    }
  };

  // Handle granular consent change
  const handleConsentChange = async (newConsent) => {
    try {
      console.log('🔄 LocationToggle: handleConsentChange called with:', newConsent);
      setError(null);
      
      // Notify parent component of consent change
      if (onConsentChange) {
        console.log('🔄 LocationToggle: Calling onConsentChange with:', newConsent);
        onConsentChange(newConsent);
      } else {
        console.warn('🔄 LocationToggle: onConsentChange is not provided');
      }
      
      // Also update the toggle state based on consent
      const isEnabled = newConsent !== 'never';
      if (onToggleChange) {
        console.log('🔄 LocationToggle: Calling onToggleChange with:', isEnabled);
        onToggleChange(isEnabled, { consent: newConsent });
      } else {
        console.warn('🔄 LocationToggle: onToggleChange is not provided');
      }
      
    } catch (err) {
      console.error('❌ LocationToggle: Failed to update location consent:', err);
      setError('Failed to update location consent');
    }
  };

  // Get status display info
  const getStatusInfo = () => {
    if (rideOverride !== null) {
      return {
        text: rideOverride.enabled ? 'Enabled for this ride' : 'Disabled for this ride',
        color: rideOverride.enabled ? 'success' : 'error',
        icon: rideOverride.enabled ? <LocationIcon /> : <LocationOffIcon />
      };
    }
    
    if (!userPreferences) {
      return {
        text: 'Unknown',
        color: 'default',
        icon: <LocationOffIcon />
      };
    }
    
    const level = userPreferences.permissionLevel;
    switch (level) {
      case LOCATION_PERMISSIONS.NEVER:
        return {
          text: 'Never share',
          color: 'error',
          icon: <LocationOffIcon />
        };
      case LOCATION_PERMISSIONS.WHILE_USING:
        return {
          text: 'While using app',
          color: 'primary',
          icon: <LocationIcon />
        };
      case LOCATION_PERMISSIONS.RIDE_ONLY:
        return {
          text: 'During rides',
          color: 'secondary',
          icon: <LocationIcon />
        };
      case LOCATION_PERMISSIONS.DRIVER_ONLY:
        return {
          text: isDriver ? 'Driver mode' : 'Driver only',
          color: isDriver ? 'success' : 'warning',
          icon: <LocationIcon />
        };
      case LOCATION_PERMISSIONS.ALWAYS:
        return {
          text: 'Always share',
          color: 'success',
          icon: <LocationIcon />
        };
      default:
        return {
          text: 'Unknown',
          color: 'default',
          icon: <LocationOffIcon />
        };
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  const statusInfo = getStatusInfo();
  const isEnabled = isLocationEnabled();

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {showGranularOptions ? (
          // Granular location sharing options
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              value={currentConsent}
              onChange={(e) => {
                console.log('🔄 LocationToggle: Select onChange triggered with value:', e.target.value);
                handleConsentChange(e.target.value);
              }}
              onOpen={() => {
                console.log('🔄 LocationToggle: Select opened');
              }}
              onClose={() => {
                console.log('🔄 LocationToggle: Select closed');
              }}
              sx={{
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0c9b3' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#b08968' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a47551' },
                '& .MuiSelect-select': { py: 1 }
              }}
            >
              <MenuItem value="never">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOffIcon fontSize="small" />
                  <Typography variant="body2">Never</Typography>
                </Box>
              </MenuItem>
              <MenuItem value="on_pickup">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationIcon fontSize="small" />
                  <Typography variant="body2">After Pickup</Typography>
                </Box>
              </MenuItem>
              <MenuItem value="during_ride">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationIcon fontSize="small" />
                  <Typography variant="body2">During Ride</Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
        ) : (
          // Original simple toggle
          <Tooltip title={rideOverride !== null ? "Override your default location setting for this ride" : "Toggle location sharing for this ride"}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {isEnabled ? 'ON' : 'OFF'}
              </Typography>
              <Switch
                checked={isEnabled}
                onChange={(e) => handleToggleChange(e.target.checked)}
                size="small"
                color="primary"
              />
            </Box>
          </Tooltip>
        )}
        
        {/* Status indicator */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          px: 2,
          py: 1,
          background: isTracking && currentConsent !== 'never' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(158, 158, 158, 0.1)',
          borderRadius: 1,
          border: `1px solid ${isTracking && currentConsent !== 'never' ? '#4caf50' : '#9e9e9e'}`
        }}>
          <LocationIcon 
            fontSize="small" 
            color={isTracking && currentConsent !== 'never' ? 'success' : 'disabled'} 
          />
          <Typography variant="caption" color={isTracking && currentConsent !== 'never' ? 'success.main' : 'text.secondary'}>
            {isTracking && currentConsent !== 'never' ? 'Live sharing active' : 'Location sharing off'}
          </Typography>
        </Box>
        
        {onOpenSettings && (
          <Tooltip title="Location Settings">
            <IconButton size="small" onClick={onOpenSettings}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        backgroundColor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LocationIcon color={isEnabled ? 'primary' : 'disabled'} />
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>
              Location Sharing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {rideOverride !== null 
                ? (rideOverride.enabled ? 'Enabled for this ride' : 'Disabled for this ride')
                : `Default: ${statusInfo.text}`
              }
            </Typography>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={isEnabled}
            onChange={(e) => handleToggleChange(e.target.checked)}
            color="primary"
          />
          {onOpenSettings && (
            <Tooltip title="Open Location Settings">
              <IconButton size="small" onClick={onOpenSettings}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      
      {rideOverride !== null && (
        <Alert severity="info" sx={{ mt: 1 }}>
          <Typography variant="body2">
            This setting overrides your default location sharing preference for this ride only.
          </Typography>
        </Alert>
      )}
      
      {isTracking && isEnabled && (
        <Alert severity="success" sx={{ mt: 1 }}>
          <Typography variant="body2">
            Location is currently being shared with ride participants.
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default LocationToggle; 