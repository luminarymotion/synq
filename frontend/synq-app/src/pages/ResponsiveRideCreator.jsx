import React from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import RouteOptimizer from './RouteOptimizer';
import MobileRideCreator from './MobileRideCreator';

function ResponsiveRideCreator({ mode = 'create' }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Check if we should use mobile version
  const shouldUseMobile = isMobile;

  // Render appropriate component
  return shouldUseMobile ? (
    <MobileRideCreator mode={mode} />
  ) : (
    <RouteOptimizer mode={mode} />
  );
}

export default ResponsiveRideCreator; 