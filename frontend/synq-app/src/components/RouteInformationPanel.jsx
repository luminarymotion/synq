import React, { useState } from 'react';
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
  ListItemIcon,
  Collapse,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  SkipNext as SkipIcon,
  AccessTime as TimeIcon,
  Straighten as DistanceIcon,
  Directions as DirectionsIcon,
  TurnSharpRight as TurnRightIcon,
  TurnSharpLeft as TurnLeftIcon,
  Straight as StraightIcon,
  Merge as MergeIcon,
  ExitToApp as ExitIcon,
  NavigateNext as NextIcon,
  NavigateBefore as PrevIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon
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
  const [expandedWaypoints, setExpandedWaypoints] = useState(new Set());

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

  // Toggle waypoint expansion
  const toggleWaypointExpansion = (index) => {
    const newExpanded = new Set(expandedWaypoints);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedWaypoints(newExpanded);
  };

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
    // If we have optimized route data, use that
    if (routeInfo?.waypointInfo && routeInfo.waypointInfo.length > 0) {
      const currentIndex = routeInfo.currentStep;
      if (currentIndex < routeInfo.waypointInfo.length) {
        const leg = routeInfo.waypointInfo[currentIndex];
        return `${leg.distance.toFixed(1)} mi`;
      }
    }
    
    // Fallback to calculated distance
    if (!currentLocation || !nextWaypoint?.location) return null;
    
    const distanceMeters = calculateDistance(currentLocation, nextWaypoint.location);
    const distanceMiles = distanceMeters * 0.000621371; // Convert meters to miles
    
    return `${distanceMiles.toFixed(1)} mi`;
  };

  // Get ETA to next waypoint
  const getETA = () => {
    // If we have optimized route data, use that
    if (routeInfo?.waypointInfo && routeInfo.waypointInfo.length > 0) {
      const currentIndex = routeInfo.currentStep;
      if (currentIndex < routeInfo.waypointInfo.length) {
        const leg = routeInfo.waypointInfo[currentIndex];
        return `${Math.round(leg.duration)} min`;
      }
    }
    
    // Fallback to estimated time
    const distanceToNext = getDistanceToNext();
    if (!distanceToNext) return null;
    
    const distanceMiles = parseFloat(distanceToNext.replace(' mi', ''));
    const averageSpeedMph = 25; // 25 mph average in city
    const timeMinutes = Math.round((distanceMiles / averageSpeedMph) * 60);
    
    return `${timeMinutes} min`;
  };

  // Format address for display
  const formatAddress = (location) => {
    if (!location) {
      return 'Location not available';
    }
    
    // If we have an address, use it
    if (location.address) {
      const address = location.address;
      const addressParts = address.split(',');
      
      if (addressParts.length >= 2) {
        return `${addressParts[0]}, ${addressParts[addressParts.length - 2]}`;
      }
      
      return address;
    }
    
    // If we have coordinates, show them
    if (location.lat && location.lng) {
      return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
    }
    
    // If we have latitude/longitude properties
    if (location.latitude && location.longitude) {
      return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
    }
    
    return 'Location not available';
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
    
    // Fallback based on waypoint type
    if (waypoint.type === 'origin') {
      return 'Driver';
    } else if (waypoint.type === 'destination') {
      // For destination, try to get a meaningful name from the location
      if (waypoint.location?.address) {
        const address = waypoint.location.address;
        const addressParts = address.split(',');
        return addressParts[0] || 'Destination';
      }
      return 'Destination';
    } else if (waypoint.type === 'pickup') {
      return 'Passenger Pickup';
    }
    
    // Fallback to address or coordinates
    if (waypoint.location?.address) {
      const address = waypoint.location.address;
      const addressParts = address.split(',');
      return addressParts[0] || 'Route point';
    }
    
    return 'Route point';
  };

  // Generate turn-by-turn directions for a waypoint
  const generateRouteSteps = (waypoint, index) => {
    if (!routeInfo?.waypointInfo || !routeInfo.waypointInfo[index]) {
      return [];
    }

    const leg = routeInfo.waypointInfo[index];
    if (!leg.steps) {
      return [];
    }

    return leg.steps.map((step, stepIndex) => {
      // Determine the direction icon based on maneuver type
      const getDirectionIcon = (maneuver) => {
        switch (maneuver?.type) {
          case 'turn':
            return maneuver.modifier === 'right' ? <TurnRightIcon /> : <TurnLeftIcon />;
          case 'straight':
            return <StraightIcon />;
          case 'merge':
            return <MergeIcon />;
          case 'exit':
            return <ExitIcon />;
          case 'arrive':
            return <LocationIcon />;
          default:
            return <NextIcon />;
        }
      };

      // Format the instruction
      const formatInstruction = (step) => {
        if (step.maneuver?.instruction) {
          return step.maneuver.instruction;
        }
        
        // Fallback instruction based on maneuver type
        const maneuver = step.maneuver;
        if (maneuver?.type === 'turn') {
          const direction = maneuver.modifier === 'right' ? 'right' : 'left';
          return `Turn ${direction}${maneuver.name ? ` onto ${maneuver.name}` : ''}`;
        } else if (maneuver?.type === 'straight') {
          return `Continue straight${maneuver.name ? ` on ${maneuver.name}` : ''}`;
        } else if (maneuver?.type === 'merge') {
          return `Merge${maneuver.name ? ` onto ${maneuver.name}` : ''}`;
        } else if (maneuver?.type === 'exit') {
          return `Exit${maneuver.name ? ` onto ${maneuver.name}` : ''}`;
        } else if (maneuver?.type === 'arrive') {
          return 'Arrive at destination';
        }
        
        return 'Continue on route';
      };

      return {
        id: stepIndex,
        instruction: formatInstruction(step),
        distance: step.distance ? `${(step.distance * 0.000621371).toFixed(1)} mi` : null,
        duration: step.duration ? `${Math.round(step.duration / 60)} min` : null,
        icon: getDirectionIcon(step.maneuver),
        streetName: step.maneuver?.name || null
      };
    });
  };

  // Get waypoint summary info
  const getWaypointSummary = (waypoint, index) => {
    if (routeInfo?.waypointInfo && routeInfo.waypointInfo[index]) {
      const leg = routeInfo.waypointInfo[index];
      return {
        distance: `${leg.distance.toFixed(1)} mi`,
        duration: `${Math.round(leg.duration)} min`,
        via: leg.steps?.[0]?.maneuver?.name || null
      };
    }
    
    // Fallback calculation
    const nextWaypoint = waypoints[index + 1];
    if (nextWaypoint) {
      const distanceMeters = calculateDistance(waypoint.location, nextWaypoint.location);
      const distanceMiles = distanceMeters * 0.000621371;
      const timeMinutes = Math.round((distanceMiles / 25) * 60); // 25 mph average
      
      return {
        distance: `${distanceMiles.toFixed(1)} mi`,
        duration: `${timeMinutes} min`,
        via: null
      };
    }
    
    return { distance: null, duration: null, via: null };
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
                  Total: {totalDistance ? `${totalDistance.toFixed(1)} mi` : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ETA: {totalDuration ? `${Math.round(totalDuration)} min` : 'N/A'}
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
          // Enhanced expanded view - Full route with turn-by-turn directions
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
                const isExpanded = expandedWaypoints.has(index);
                const routeSteps = generateRouteSteps(waypoint, index);
                const summary = getWaypointSummary(waypoint, index);
                
                return (
                  <Box key={index}>
                    {/* Waypoint Header */}
                    <ListItem 
                      sx={{ 
                        py: 1,
                        background: isCurrent ? 'rgba(0,0,0,0.05)' : 'transparent',
                        borderLeft: isCurrent ? `3px solid ${vibe.accent}` : 'none',
                        cursor: 'pointer',
                        '&:hover': {
                          background: 'rgba(0,0,0,0.02)'
                        }
                      }}
                      onClick={() => toggleWaypointExpansion(index)}
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
                          <Typography
                            component="span"
                            sx={{ 
                              fontWeight: isCurrent ? 600 : 400,
                              color: isCurrent ? 'text.primary' : 'text.secondary'
                            }}
                          >
                            {getWaypointDisplayName(waypoint)}
                          </Typography>
                        }
                        secondary={
                          <Typography component="div" variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {formatAddress(waypoint.location)}
                            {summary.distance && summary.duration && (
                              <Typography component="span" variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block', mt: 0.5 }}>
                                {summary.duration} ({summary.distance})
                                {summary.via && ` via ${summary.via}`}
                              </Typography>
                            )}
                          </Typography>
                        }
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
                        {waypoint.type === 'pickup' && (
                          <Chip 
                            label="Pickup" 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                            sx={{ fontSize: '0.6rem', height: 20 }}
                          />
                        )}
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWaypointExpansion(index);
                          }}
                          sx={{ 
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}
                        >
                          <ArrowDownIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </ListItem>

                    {/* Expandable Route Steps */}
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ pl: 4, pr: 2, pb: 1 }}>
                        {routeSteps.length > 0 ? (
                          <List dense sx={{ py: 0 }}>
                            {routeSteps.map((step, stepIndex) => (
                              <ListItem key={stepIndex} sx={{ py: 0.5, px: 1 }}>
                                <ListItemIcon sx={{ minWidth: 32, color: 'text.secondary' }}>
                                  {step.icon}
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                      {step.instruction}
                                    </Typography>
                                  }
                                  secondary={
                                    <Typography component="div" variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                      {step.distance && (
                                        <Chip 
                                          label={step.distance} 
                                          size="small" 
                                          variant="outlined"
                                          sx={{ fontSize: '0.6rem', height: 16 }}
                                        />
                                      )}
                                      {step.duration && (
                                        <Chip 
                                          label={step.duration} 
                                          size="small" 
                                          variant="outlined"
                                          sx={{ fontSize: '0.6rem', height: 16 }}
                                        />
                                      )}
                                      {step.streetName && (
                                        <Typography variant="caption" color="text.secondary">
                                          {step.streetName}
                                        </Typography>
                                      )}
                                    </Typography>
                                  }
                                />
                              </ListItem>
                            ))}
                          </List>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ py: 1, fontStyle: 'italic' }}>
                            Detailed directions not available for this route segment
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </Box>
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
