import React from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  SkipNext as SkipIcon,
  AccessTime as TimeIcon,
  Straighten as DistanceIcon
} from '@mui/icons-material';

const RouteInformationPanel = ({
  routeInfo,
  passengerInfo,
  onPassengerStatusUpdate,
  showFullRoute,
  onToggleFullRoute,
  vibe,
  currentLocation
}) => {
  if (!routeInfo) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No route information available
        </Typography>
      </Box>
    );
  }

  const { currentStep, totalSteps, currentWaypoint, nextWaypoint, waypoints, totalDistance, totalDuration, progress } = routeInfo;

  // Calculate distance between two points in meters
  const calculateDistance = (point1, point2) => {
    if (!point1 || !point2) return 0;
    
    const lat1 = point1.lat || point1.latitude;
    const lng1 = point1.lng || point1.longitude;
    const lat2 = point2.lat || point2.latitude;
    const lng2 = point2.lng || point2.longitude;
    
    if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
    
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Get direction instruction for current waypoint
  const getDirectionInstruction = (waypoint) => {
    if (!waypoint) return 'Continue on current route';
    
    switch (waypoint.type) {
      case 'start':
        return 'Start your journey';
      case 'pickup':
        return `Pick up ${waypoint.displayName || 'passenger'}`;
      case 'return_to_road':
        return 'Return to main route';
      case 'destination':
        return 'Arrive at destination';
      case 'intermediate':
        // For intermediate points, provide more meaningful directions
        if (waypoint.displayName && waypoint.displayName.includes('Waypoint')) {
          return 'Continue on route';
        } else if (waypoint.displayName && waypoint.displayName.includes('Route Point')) {
          return 'Continue on route';
        } else if (waypoint.displayName) {
          return `Continue toward ${waypoint.displayName}`;
        }
        return 'Continue on route';
      default:
        return 'Continue to next waypoint';
    }
  };

  // Get distance to next waypoint
  const getDistanceToNext = () => {
    if (!currentLocation || !nextWaypoint?.location) return null;
    
    const distanceMeters = calculateDistance(currentLocation, nextWaypoint.location);
    
    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)}m`;
    } else {
      return `${(distanceMeters / 1000).toFixed(1)}km`;
    }
  };

  // Get ETA to next waypoint
  const getETA = () => {
    const distanceToNext = getDistanceToNext();
    if (!distanceToNext) return null;
    
    const distanceMeters = parseFloat(distanceToNext.replace('km', '000').replace('m', ''));
    const averageSpeedMph = 25; // 25 mph average in city
    const timeMinutes = Math.round((distanceMeters / 1000) / (averageSpeedMph * 1.609) * 60);
    
    return `${timeMinutes} min`;
  };

  // Format address for display
  const formatAddress = (location) => {
    if (!location?.address) {
      if (location?.lat && location?.lng) {
        return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
      }
      return 'Location not available';
    }
    
    const address = location.address;
    const addressParts = address.split(',');
    
    if (addressParts.length >= 2) {
      return `${addressParts[0]}, ${addressParts[addressParts.length - 2]}`;
    }
    
    return address;
  };

  // Get meaningful waypoint name for display
  const getWaypointDisplayName = (waypoint) => {
    if (waypoint.displayName) {
      // For intermediate waypoints, show a more user-friendly name
      if (waypoint.type === 'intermediate') {
        if (waypoint.displayName.includes('Waypoint') || waypoint.displayName.includes('Route Point')) {
          return 'Continue on route';
        }
      }
      return waypoint.displayName;
    }
    
    // Fallback to address or coordinates
    if (waypoint.location?.address) {
      const address = waypoint.location.address;
      const addressParts = address.split(',');
      return addressParts[0] || 'Route point';
    }
    
    return 'Route point';
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Progress Bar */}
      <Box sx={{ p: 1 }}>
        <LinearProgress 
          variant="determinate" 
          value={progress} 
          sx={{ 
            height: 4, 
            borderRadius: 2,
            backgroundColor: 'rgba(0,0,0,0.1)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: vibe.accent
            }
          }} 
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {currentStep + 1} of {totalSteps} waypoints
        </Typography>
      </Box>

      <Divider />

      {/* Current Direction */}
      <Box sx={{ p: 2, flex: 1, overflow: 'hidden' }}>
        {!showFullRoute ? (
          // Compact view - Current direction only
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box sx={{ 
                background: vibe.accent, 
                color: 'white', 
                borderRadius: '50%', 
                width: 48, 
                height: 48, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <LocationIcon />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {getDirectionInstruction(currentWaypoint)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {getWaypointDisplayName(currentWaypoint)}
                </Typography>
              </Box>
            </Box>

            {/* Distance and ETA */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              {getDistanceToNext() && (
                <Chip 
                  icon={<DistanceIcon />} 
                  label={`${getDistanceToNext()} to next`} 
                  size="small" 
                  variant="outlined"
                />
              )}
              {getETA() && (
                <Chip 
                  icon={<TimeIcon />} 
                  label={`${getETA()} to next`} 
                  size="small" 
                  variant="outlined"
                />
              )}
            </Box>

            {/* Passenger Actions */}
            {passengerInfo && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" mb={1}>
                  Passenger: {passengerInfo.displayName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<CheckIcon />}
                    onClick={() => onPassengerStatusUpdate(passengerInfo.uid, 'picked_up')}
                    sx={{ 
                      background: '#4caf50', 
                      color: 'white',
                      '&:hover': { background: '#45a049' }
                    }}
                  >
                    Picked Up
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SkipIcon />}
                    onClick={() => onPassengerStatusUpdate(passengerInfo.uid, 'skipped')}
                    sx={{ borderColor: '#ff9800', color: '#ff9800' }}
                  >
                    Skip
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CancelIcon />}
                    onClick={() => onPassengerStatusUpdate(passengerInfo.uid, 'cancelled')}
                    sx={{ borderColor: '#f44336', color: '#f44336' }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}

            {/* Route Summary */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Total: {totalDistance ? `${(totalDistance / 1000).toFixed(1)}km` : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ETA: {totalDuration ? `${Math.round(totalDuration / 60)}min` : 'N/A'}
                </Typography>
              </Box>
              <Button
                variant="text"
                size="small"
                endIcon={<ExpandIcon />}
                onClick={onToggleFullRoute}
                sx={{ color: vibe.accent }}
              >
                View Full Route
              </Button>
            </Box>
          </Box>
        ) : (
          // Expanded view - Full route list
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Full Route
              </Typography>
              <Button
                variant="text"
                size="small"
                endIcon={<CollapseIcon />}
                onClick={onToggleFullRoute}
                sx={{ color: vibe.accent }}
              >
                Collapse
              </Button>
            </Box>
            
            <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
              {waypoints.map((waypoint, index) => {
                const isCurrent = index === currentStep;
                const nextWaypoint = waypoints[index + 1];
                const distanceToNext = nextWaypoint ? calculateDistance(waypoint.location, nextWaypoint.location) : 0;
                
                return (
                  <ListItem 
                    key={index}
                    sx={{ 
                      py: 1,
                      background: isCurrent ? 'rgba(0,0,0,0.05)' : 'transparent',
                      borderLeft: isCurrent ? `3px solid ${vibe.accent}` : 'none'
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Box sx={{ 
                        background: isCurrent ? vibe.accent : 'rgba(0,0,0,0.2)', 
                        color: isCurrent ? 'white' : 'rgba(0,0,0,0.6)', 
                        borderRadius: '50%', 
                        width: 32, 
                        height: 32, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: '0.8rem'
                      }}>
                        {index + 1}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                      <Typography
                              component="span"
                              sx={{ 
                                fontWeight: isCurrent ? 600 : 400,
                                color: isCurrent ? 'text.primary' : 'text.secondary'
                              }}
                            >
                              {getWaypointDisplayName(waypoint)}
                            </Typography>
                          {waypoint.type === 'pickup' && (
                            <Chip 
                              label="Pickup" 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                              sx={{ fontSize: '0.6rem', height: 20 }}
                            />
                          )}
                          {distanceToNext > 0 && (
                            <Chip 
                              label={`${distanceToNext < 1000 ? `${Math.round(distanceToNext)}m` : `${(distanceToNext / 1000).toFixed(1)}km`}`}
                              size="small" 
                              variant="outlined"
                              sx={{ fontSize: '0.6rem', height: 20, color: 'text.secondary' }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {formatAddress(waypoint.location)}
                        </Typography>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default RouteInformationPanel;
