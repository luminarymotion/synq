import React from 'react';
import {
  Box,
  Typography,
  Button,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import {
  DirectionsCar as CarIcon,
  AccessTime as TimeIcon,
  Straighten as DistanceIcon
} from '@mui/icons-material';

/**
 * Reusable RouteInformation component for displaying route data consistently
 * across different parts of the application
 */
const RouteInformation = ({
  calculatedRoute,
  variant = 'compact', // 'compact', 'detailed', 'modal'
  showStartButton = false,
  showAvoidTolls = false,
  onStartClick = null,
  onAvoidTollsChange = null,
  avoidTolls = false,
  destination = null,
  vibe = { accent: '#4caf50' },
  sx = {}
}) => {
  
  // Extract route data with proper fallbacks
  const getRouteData = () => {
    if (!calculatedRoute) {
      return { distance: 0, duration: 0, distanceMiles: '0.0', durationMinutes: '0' };
    }

    let distanceMeters = 0;
    let durationSeconds = 0;

    // Try multiple data structure paths - prioritize features data
    if (calculatedRoute?.features?.[0]?.properties?.distance) {
      distanceMeters = calculatedRoute.features[0].properties.distance;
      console.log('✅ RouteInformation: Using features distance:', distanceMeters);
    } else if (calculatedRoute?.totalDistance && calculatedRoute.totalDistance > 0) {
      distanceMeters = calculatedRoute.totalDistance * 1609.34; // Convert miles to meters
      console.log('✅ RouteInformation: Using totalDistance:', calculatedRoute.totalDistance);
    } else if (calculatedRoute?.routes?.[0]?.distance) {
      distanceMeters = calculatedRoute.routes[0].distance;
      console.log('✅ RouteInformation: Using routes distance:', distanceMeters);
    } else if (calculatedRoute?.routes?.[0]?.legs?.[0]?.distance) {
      distanceMeters = calculatedRoute.routes[0].legs[0].distance;
      console.log('✅ RouteInformation: Using legs distance:', distanceMeters);
    }

    if (calculatedRoute?.features?.[0]?.properties?.duration) {
      durationSeconds = calculatedRoute.features[0].properties.duration;
      console.log('✅ RouteInformation: Using features duration:', durationSeconds);
    } else if (calculatedRoute?.totalDuration && calculatedRoute.totalDuration > 0) {
      durationSeconds = calculatedRoute.totalDuration * 60; // Convert minutes to seconds
      console.log('✅ RouteInformation: Using totalDuration:', calculatedRoute.totalDuration);
    } else if (calculatedRoute?.routes?.[0]?.duration) {
      durationSeconds = calculatedRoute.routes[0].duration;
      console.log('✅ RouteInformation: Using routes duration:', durationSeconds);
    } else if (calculatedRoute?.routes?.[0]?.legs?.[0]?.duration) {
      durationSeconds = calculatedRoute.routes[0].legs[0].duration;
      console.log('✅ RouteInformation: Using legs duration:', durationSeconds);
    }

    const distanceMiles = (distanceMeters / 1609.34).toFixed(1);
    const durationMinutes = Math.round(durationSeconds / 60);

    return {
      distance: distanceMeters,
      duration: durationSeconds,
      distanceMiles,
      durationMinutes
    };
  };

  const routeData = getRouteData();

  // Compact variant - horizontal layout for map overlays
  if (variant === 'compact') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...sx }}>
        <Box>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            Route Information
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {routeData.distanceMiles} miles
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            {routeData.durationMinutes} min
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Estimated Time
          </Typography>
        </Box>
      </Box>
    );
  }

  // Detailed variant - grid layout for main ride summary
  if (variant === 'detailed') {
    return (
      <Box sx={{ ...sx }}>
        <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={3} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ROUTE INFORMATION
        </Typography>
        
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, 
          gap: 3 
        }}>
          {/* Distance */}
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            background: 'white',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.06)'
          }}>
            <Typography variant="h6" fontWeight={700} color={vibe.accent}>
              {routeData.distanceMiles}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Miles
            </Typography>
          </Box>

          {/* Duration */}
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            background: 'white',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.06)'
          }}>
            <Typography variant="h6" fontWeight={700} color={vibe.accent}>
              {routeData.durationMinutes}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Minutes
            </Typography>
          </Box>

          {/* Avoid Tolls */}
          <Box sx={{ 
            textAlign: 'center',
            p: 2,
            background: 'white',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            {showAvoidTolls ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={avoidTolls}
                    onChange={(e) => onAvoidTollsChange?.(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Avoid Tolls
                  </Typography>
                }
                sx={{ margin: 0 }}
              />
            ) : (
              <>
                <Typography variant="h6" fontWeight={700} color={vibe.accent}>
                  {avoidTolls ? 'Yes' : 'No'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Avoid Tolls
                </Typography>
              </>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Modal variant - floating modal with start button
  if (variant === 'modal') {
    return (
      <Box sx={{ ...sx }}>
        {/* Destination Info */}
        {destination && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600} color="text.primary">
              {destination.name || destination.address || 'Destination'}
            </Typography>
          </Box>
        )}

        {/* Distance, Duration, and Avoid Tolls */}
        <Box sx={{ 
          display: 'flex', 
          gap: 2, 
          justifyContent: 'center',
          alignItems: 'flex-end',
          mb: showStartButton ? 2 : 0
        }}>
          {/* Avoid Tolls */}
          {showAvoidTolls && (
            <Box sx={{ 
              textAlign: 'center',
              minWidth: '70px',
              padding: '12px 14px',
              background: avoidTolls ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.95)',
              borderRadius: '10px',
              boxShadow: avoidTolls ? '0 3px 12px rgba(76, 175, 80, 0.2)' : '0 3px 12px rgba(0,0,0,0.08)',
              border: avoidTolls ? '2px solid rgba(76, 175, 80, 0.4)' : '1px solid rgba(76, 175, 80, 0.15)',
              position: 'relative',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: avoidTolls ? '0 4px 15px rgba(76, 175, 80, 0.3)' : '0 4px 15px rgba(0,0,0,0.12)',
                background: avoidTolls ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 1)'
              }
            }}
            onClick={() => onAvoidTollsChange?.(!avoidTolls)}
            >
              <Typography variant="h6" fontWeight={600} color={avoidTolls ? '#2e7d32' : '#2c3e50'} sx={{ lineHeight: 1, fontSize: '1rem', mb: 0.5 }}>
                avoid
              </Typography>
              <Typography variant="caption" color={avoidTolls ? '#2e7d32' : '#7f8c8d'} fontWeight={600} sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                tolls
              </Typography>
              
              {/* Active indicator */}
              {avoidTolls && (
                <Box sx={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#4CAF50',
                  boxShadow: '0 2px 4px rgba(76, 175, 80, 0.3)'
                }} />
              )}
            </Box>
          )}

          {/* Distance Display */}
          <Box sx={{ 
            textAlign: 'center',
            minWidth: '70px',
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '10px',
            boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
            border: '1px solid rgba(76, 175, 80, 0.15)',
            position: 'relative',
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.12)'
            }
          }}>
            <Typography variant="h5" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.5rem', mb: 0.5 }}>
              {routeData.distanceMiles}
            </Typography>
            <Typography variant="caption" color="#7f8c8d" fontWeight={600} sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              miles
            </Typography>
          </Box>

          {/* Time Display */}
          <Box sx={{ 
            textAlign: 'center',
            minWidth: '70px',
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '10px',
            boxShadow: '0 3px 12px rgba(0,0,0,0.08)',
            border: '1px solid rgba(76, 175, 80, 0.15)',
            position: 'relative',
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.12)'
            }
          }}>
            <Typography variant="h5" fontWeight={700} color="#2c3e50" sx={{ lineHeight: 1, fontSize: '1.5rem', mb: 0.5 }}>
              {routeData.durationMinutes}
            </Typography>
            <Typography variant="caption" color="#7f8c8d" fontWeight={600} sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              mins
            </Typography>
            
            {/* Start Button */}
            {showStartButton && (
              <Button
                onClick={onStartClick}
                sx={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 'auto',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4caf50, #45a049)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #45a049, #3d8b40)',
                    transform: 'scale(1.1)',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                <CarIcon sx={{ fontSize: 14 }} />
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Default fallback
  return (
    <Box sx={{ textAlign: 'center', ...sx }}>
      <Typography variant="body2" color="text.secondary">
        Distance: {routeData.distanceMiles} miles
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Duration: {routeData.durationMinutes} minutes
      </Typography>
    </Box>
  );
};

export default RouteInformation;
