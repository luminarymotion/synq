import React from 'react';
import RideCreator from './RideCreator';

function ResponsiveRideCreator({ mode = 'create' }) {
  // Simplified - RideCreator handles responsive behavior internally
  return <RideCreator mode={mode} />;
}

export default ResponsiveRideCreator; 