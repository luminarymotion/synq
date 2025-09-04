import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Typography,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Switch,
  Button,
  Alert,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Security as SecurityIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Help as HelpIcon
} from '@mui/icons-material';
import {
  locationPermissionManager,
  LOCATION_PERMISSIONS,
  CONSENT_LEVELS,
  LOCATION_CONTEXTS
} from '../services/locationTrackingService';

const LocationPermissionSettings = ({ userId, onSettingsChange }) => {
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [userPreferences, setUserPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);

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
      } catch (err) {
        setError('Failed to load permission settings: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadPermissions();
    }
  }, [userId]);

  // Handle permission level change
  const handlePermissionLevelChange = (newLevel) => {
    setPendingChanges({
      ...userPreferences,
      permissionLevel: newLevel
    });
    setShowConfirmDialog(true);
  };

  // Handle feature toggle
  const handleFeatureToggle = async (feature, enabled) => {
    try {
      setSaving(true);
      const updatedPrefs = {
        ...userPreferences,
        features: {
          ...userPreferences.features,
          [feature]: enabled
        }
      };

      await locationPermissionManager.saveUserPreferences(userId, updatedPrefs);
      setUserPreferences(updatedPrefs);
      
      if (onSettingsChange) {
        onSettingsChange(updatedPrefs);
      }
    } catch (err) {
      setError('Failed to update feature settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Apply pending changes
  const applyPendingChanges = async () => {
    try {
      setSaving(true);
      await locationPermissionManager.saveUserPreferences(userId, pendingChanges);
      setUserPreferences(pendingChanges);
      setPendingChanges(null);
      setShowConfirmDialog(false);
      
      if (onSettingsChange) {
        onSettingsChange(pendingChanges);
      }
    } catch (err) {
      setError('Failed to save permission settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Get permission level description
  const getPermissionLevelDescription = (level) => {
    const descriptions = {
      [LOCATION_PERMISSIONS.NEVER]: {
        title: 'Never Share Location',
        description: 'Location sharing is completely disabled. Some features may not work.',
        icon: <CancelIcon color="error" />,
        color: 'error'
      },
      [LOCATION_PERMISSIONS.WHILE_USING]: {
        title: 'While Using App',
        description: 'Share location only when the app is active and in use.',
        icon: <LocationIcon color="primary" />,
        color: 'primary'
      },
      [LOCATION_PERMISSIONS.RIDE_ONLY]: {
        title: 'During Rides Only',
        description: 'Share location only when participating in active rides.',
        icon: <LocationIcon color="secondary" />,
        color: 'secondary'
      },
      [LOCATION_PERMISSIONS.DRIVER_ONLY]: {
        title: 'Driver Mode Only',
        description: 'Share location only when you are the driver of a ride.',
        icon: <LocationIcon color="warning" />,
        color: 'warning'
      },
      [LOCATION_PERMISSIONS.ALWAYS]: {
        title: 'Always Share',
        description: 'Share location continuously, even when app is in background.',
        icon: <LocationIcon color="success" />,
        color: 'success'
      }
    };

    return descriptions[level] || descriptions[LOCATION_PERMISSIONS.WHILE_USING];
  };

  // Get browser permission status
  const getBrowserPermissionStatus = () => {
    if (!permissionStatus) return null;

    const status = permissionStatus.browserPermission;
    const canRequest = permissionStatus.canRequest;

    if (status === 'granted') {
      return { text: 'Granted', color: 'success', icon: <CheckCircleIcon /> };
    } else if (status === 'denied') {
      return { text: 'Denied', color: 'error', icon: <CancelIcon /> };
    } else if (status === 'prompt') {
      return { text: 'Not Set', color: 'warning', icon: <WarningIcon /> };
    } else {
      return { text: 'Unknown', color: 'default', icon: <HelpIcon /> };
    }
  };

  if (loading) {
    return (
      <Card sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading permission settings...</Typography>
      </Card>
    );
  }

  const currentLevel = userPreferences?.permissionLevel || LOCATION_PERMISSIONS.WHILE_USING;
  const levelInfo = getPermissionLevelDescription(currentLevel);
  const browserStatus = getBrowserPermissionStatus();

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <SecurityIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>
          Location Sharing Settings
        </Typography>
        <Tooltip title="Learn more about location permissions">
          <IconButton size="small" onClick={() => setShowHelpDialog(true)}>
            <HelpIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Current Status */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Current Status
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          {levelInfo.icon}
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              {levelInfo.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {levelInfo.description}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={`Browser: ${browserStatus?.text}`}
            color={browserStatus?.color}
            icon={browserStatus?.icon}
            size="small"
          />
          <Chip
            label={`Last Updated: ${new Date(userPreferences?.lastUpdated).toLocaleDateString()}`}
            variant="outlined"
            size="small"
          />
        </Box>
      </Card>

      {/* Permission Level Selection */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Location Sharing Level
        </Typography>
        
        <FormControl component="fieldset" fullWidth>
          <RadioGroup
            value={currentLevel}
            onChange={(e) => handlePermissionLevelChange(e.target.value)}
          >
            {Object.values(LOCATION_PERMISSIONS).map((level) => {
              const info = getPermissionLevelDescription(level);
              return (
                <FormControlLabel
                  key={level}
                  value={level}
                  control={<Radio />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {info.icon}
                      <Box>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {info.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {info.description}
                        </Typography>
                      </Box>
                    </Box>
                  }
                  sx={{ 
                    mb: 2, 
                    p: 2, 
                    border: level === currentLevel ? 2 : 1,
                    borderColor: level === currentLevel ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    backgroundColor: level === currentLevel ? 'primary.50' : 'transparent'
                  }}
                />
              );
            })}
          </RadioGroup>
        </FormControl>
      </Card>

      {/* Feature Toggles */}
      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Feature Settings
        </Typography>
        
        <List>
          <ListItem>
            <ListItemIcon>
              <LocationIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="Ride Tracking"
              secondary="Share location during active rides for route optimization"
            />
            <Switch
              checked={userPreferences?.features?.rideTracking || false}
              onChange={(e) => handleFeatureToggle('rideTracking', e.target.checked)}
              disabled={saving}
            />
          </ListItem>
          
          <Divider />
          
          <ListItem>
            <ListItemIcon>
              <LocationIcon color="secondary" />
            </ListItemIcon>
            <ListItemText
              primary="Background Tracking"
              secondary="Allow location sharing when app is in background"
            />
            <Switch
              checked={userPreferences?.features?.backgroundTracking || false}
              onChange={(e) => handleFeatureToggle('backgroundTracking', e.target.checked)}
              disabled={saving}
            />
          </ListItem>
          
          <Divider />
          
          <ListItem>
            <ListItemIcon>
              <SettingsIcon color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="Driver Mode"
              secondary="Enable enhanced tracking when you are the driver"
            />
            <Switch
              checked={userPreferences?.features?.driverMode || false}
              onChange={(e) => handleFeatureToggle('driverMode', e.target.checked)}
              disabled={saving}
            />
          </ListItem>
          
          <Divider />
          
          <ListItem>
            <ListItemIcon>
              <InfoIcon color="info" />
            </ListItemIcon>
            <ListItemText
              primary="Analytics"
              secondary="Allow location data for app improvement (anonymized)"
            />
            <Switch
              checked={userPreferences?.features?.analytics || false}
              onChange={(e) => handleFeatureToggle('analytics', e.target.checked)}
              disabled={saving}
            />
          </ListItem>
        </List>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={() => setShowHelpDialog(true)}
          startIcon={<HelpIcon />}
        >
          Help
        </Button>
        
        <Button
          variant="contained"
          onClick={() => window.location.reload()}
          disabled={saving}
        >
          Refresh
        </Button>
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onClose={() => setShowConfirmDialog(false)}>
        <DialogTitle>Confirm Permission Change</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to change your location sharing level to "{getPermissionLevelDescription(pendingChanges?.permissionLevel)?.title}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This may affect how the app functions and which features are available.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirmDialog(false)} disabled={saving}>
            Cancel
          </Button>
          <Button 
            onClick={applyPendingChanges} 
            variant="contained" 
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Help Dialog */}
      <Dialog 
        open={showHelpDialog} 
        onClose={() => setShowHelpDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Location Sharing Help</DialogTitle>
        <DialogContent>
          <Typography variant="h6" gutterBottom>
            Understanding Location Permissions
          </Typography>
          
          <Typography paragraph>
            Location sharing helps us provide better ride coordination and route optimization. 
            Here's what each permission level means:
          </Typography>

          <List>
            <ListItem>
              <ListItemIcon>
                <CancelIcon color="error" />
              </ListItemIcon>
              <ListItemText
                primary="Never Share Location"
                secondary="Location sharing is completely disabled. You can still use the app, but ride coordination features will be limited."
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <LocationIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="While Using App"
                secondary="Location is shared only when the app is active and in use. This is the recommended setting for most users."
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <LocationIcon color="secondary" />
              </ListItemIcon>
              <ListItemText
                primary="During Rides Only"
                secondary="Location is shared only when you are participating in an active ride. This provides privacy while enabling ride features."
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <LocationIcon color="warning" />
              </ListItemIcon>
              <ListItemText
                primary="Driver Mode Only"
                secondary="Location is shared only when you are the driver of a ride. This is ideal for drivers who want minimal location sharing."
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <LocationIcon color="success" />
              </ListItemIcon>
              <ListItemText
                primary="Always Share"
                secondary="Location is shared continuously, even when the app is in the background. This enables the most features but uses more battery."
              />
            </ListItem>
          </List>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Privacy & Security
          </Typography>
          
          <Typography paragraph>
            Your location data is:
          </Typography>
          
          <List dense>
            <ListItem>
              <ListItemText primary="• Encrypted in transit and at rest" />
            </ListItem>
            <ListItem>
              <ListItemText primary="• Only shared with ride participants when necessary" />
            </ListItem>
            <ListItem>
              <ListItemText primary="• Never sold to third parties" />
            </ListItem>
            <ListItem>
              <ListItemText primary="• Automatically deleted after ride completion" />
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHelpDialog(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LocationPermissionSettings; 