import { useState, useEffect } from 'react';

/**
 * Custom hook for detecting proximity between two locations
 * @param {Object} driverLocation - Driver's current location {lat, lng}
 * @param {Object} pickupLocation - Passenger's pickup location {lat, lng}
 * @param {number} threshold - Distance threshold in meters (default: 100)
 * @returns {Object} - {isWithinProximity, distance, proximityPercentage}
 */
export const useProximityDetection = (driverLocation, pickupLocation, threshold = 100) => {
  const [isWithinProximity, setIsWithinProximity] = useState(false);
  const [distance, setDistance] = useState(null);
  const [proximityPercentage, setProximityPercentage] = useState(0);

  useEffect(() => {
    if (!driverLocation || !pickupLocation) {
      setIsWithinProximity(false);
      setDistance(null);
      setProximityPercentage(0);
      return;
    }

    // Validate location data
    const driverLat = driverLocation.lat || driverLocation.latitude;
    const driverLng = driverLocation.lng || driverLocation.longitude;
    const pickupLat = pickupLocation.lat || pickupLocation.latitude;
    const pickupLng = pickupLocation.lng || pickupLocation.longitude;

    if (!driverLat || !driverLng || !pickupLat || !pickupLng) {
      // Only log if we have partial data (not completely missing)
      if ((driverLat || driverLng) || (pickupLat || pickupLng)) {
        console.warn('Invalid location data for proximity detection:', {
          driverLocation,
          pickupLocation
        });
      }
      setIsWithinProximity(false);
      setDistance(null);
      setProximityPercentage(0);
      return;
    }

    // Calculate distance using Haversine formula
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371000; // Earth's radius in meters
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; // Distance in meters
    };

    const dist = calculateDistance(driverLat, driverLng, pickupLat, pickupLng);
    
    setDistance(dist);
    setIsWithinProximity(dist <= threshold);
    
    // Calculate proximity percentage (closer = higher percentage)
    const maxDistance = threshold * 2; // Use 2x threshold as max distance for percentage calculation
    const percentage = Math.max(0, Math.min(100, (1 - (dist / maxDistance)) * 100));
    setProximityPercentage(percentage);

    // Only log when proximity status changes or when within threshold
    const wasWithinProximity = isWithinProximity;
    const nowWithinProximity = dist <= threshold;
    
    if (nowWithinProximity !== wasWithinProximity || nowWithinProximity) {
      console.log('📍 Proximity update:', {
        distance: `${dist.toFixed(0)}m`,
        threshold: `${threshold}m`,
        isWithinProximity: nowWithinProximity,
        proximityPercentage: `${percentage.toFixed(1)}%`
      });
    }

  }, [driverLocation, pickupLocation, threshold]);

  return { 
    isWithinProximity, 
    distance, 
    proximityPercentage 
  };
};

export default useProximityDetection;
