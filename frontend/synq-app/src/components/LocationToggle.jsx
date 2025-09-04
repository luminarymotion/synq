import React, { useState, useEffect } from 'react';
import {
  Box,
  Switch,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Alert
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
  compact = false 
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
        <Tooltip title={statusInfo.text}>
          <Chip
            icon={statusInfo.icon}
            label={statusInfo.text}
            color={statusInfo.color}
            size="small"
            variant="outlined"
            sx={{ 
              fontSize: '0.7rem',
              height: 24,
              '& .MuiChip-icon': { fontSize: '0.8rem' }
            }}
          />
        </Tooltip>
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