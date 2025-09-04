import React, { useState, useEffect } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import RouteOptimizer from './RouteOptimizer';
import MobileRideCreator from './MobileRideCreator';
import { Box } from '@mui/material';

function ResponsiveRideCreator({ mode = 'create' }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Force mobile view for testing (remove this in production)
  const [forceMobile, setForceMobile] = useState(false);
  
  // Check if we should use mobile version
  const shouldUseMobile = isMobile || forceMobile;

  // Add a small debug indicator in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🚀 ResponsiveRideCreator:', {
        isMobile,
        forceMobile,
        shouldUseMobile,
        screenWidth: window.innerWidth
      });
      
      // Debug Mapbox API key configuration
      const apiKey = import.meta.env.VITE_MAPBOX_API_KEY;
      const publicToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
      console.log('🗺️ Mapbox API Configuration:', {
        hasApiKey: !!apiKey,
        hasPublicToken: !!publicToken,
        apiKeyStartsWith: apiKey?.substring(0, 10) + '...',
        publicTokenStartsWith: publicToken?.substring(0, 10) + '...'
      });
    }
  }, [isMobile, forceMobile, shouldUseMobile]);

  // Add a hidden toggle for testing (only in development)
  if (import.meta.env.DEV) {
    return (
      <>
        {/* Debug toggle - only visible in development */}
        <Box
          sx={{
            position: 'fixed',
            top: 80,
            right: 10,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            p: 0.5,
            borderRadius: 0.5,
            fontSize: '10px',
            cursor: 'pointer',
            minWidth: 'auto',
            minHeight: 'auto'
          }}
          onClick={() => setForceMobile(!forceMobile)}
        >
          {shouldUseMobile ? '📱' : '🖥️'}
        </Box>
        
        {/* Render appropriate component */}
        {shouldUseMobile ? (
          <MobileRideCreator mode={mode} />
        ) : (
          <RouteOptimizer mode={mode} />
        )}
      </>
    );
  }

  // Production render
  return shouldUseMobile ? (
    <MobileRideCreator mode={mode} />
  ) : (
    <RouteOptimizer mode={mode} />
  );
}

export default ResponsiveRideCreator; 