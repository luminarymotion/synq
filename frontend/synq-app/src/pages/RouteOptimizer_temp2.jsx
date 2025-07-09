  // Define calculateAndDisplayRoute function before it's used in useEffect
  const calculateAndDisplayRoute = useCallback(async (startLocation, endLocation) => {
    if (!startLocation || !endLocation) {
      console.warn('Cannot calculate route: missing start or end location');
      return;
    }

    setIsCalculatingRoute(true);
    setError(null);

    try {
      console.log('Starting route calculation:', {
        startLocation,
        endLocation,
        creatorRole,
        userCount: users.length
      });

      // Build waypoints array including all passengers
      const waypoints = [
        {
          location: startLocation,
          type: 'origin',
          name: 'Driver Location'
        }
      ];

      // Add passenger pickup points if any
      const passengers = users.filter(u => u.role === 'passenger' && u.userLocationCoords);
      passengers.forEach((passenger, index) => {
        waypoints.push({
          location: passenger.userLocationCoords,
          type: 'pickup',
          name: passenger.name || `Passenger ${index + 1}`
        });
      });

      // Add destination
      waypoints.push({
          location: endLocation,
          type: 'destination',
          name: 'Destination'
      });

      console.log('Calculating optimized route with waypoints:', {
        totalWaypoints: waypoints.length,
        waypoints: waypoints.map(w => ({ type: w.type, name: w.name }))
      });

      // Test VRP algorithm with real data
      console.log('=== ROUTE CALCULATION START ===');
      console.log('Calling calculateOptimizedRoute with waypoints:', waypoints);
      console.log('Waypoint details:', waypoints.map(wp => ({
        type: wp.type,
        name: wp.name,
        location: wp.location,
        lat: wp.lat,
        lng: wp.lng
      })));
      
      const route = await calculateOptimizedRoute(waypoints, {
        maxPassengers: passengers.length,
        timeWindows: null, // Can be enhanced later
        maxDistance: 100 // km
      });
      
      console.log('=== ROUTE CALCULATION COMPLETED ===');
      console.log('Route result:', {
        routeType: route?.type,
        hasRoutes: !!route?.routes,
        routesCount: route?.routes?.length || 0,
        totalDistance: route?.totalDistance,
        totalDuration: route?.totalDuration,
        firstRoute: route?.routes?.[0] ? {
          type: route.routes[0].type,
          waypointsCount: route.routes[0].waypoints?.length || 0,
          totalDistance: route.routes[0].totalDistance,
          totalDuration: route.routes[0].totalDuration
        } : null
      });

      setCalculatedRoute(route);
      
      // Update route details for display
      if (route && route.properties && route.properties.summary) {
        const summary = route.properties.summary;
        setRouteDetails({
          distance: summary.distance,
          duration: summary.duration,
          waypoints: summary.waypoints
        });

        // Show success notification with route details
        const distanceMi = (summary.distance / 1609.34).toFixed(1);
        const durationMin = Math.round(summary.duration / 60);
        showLocalNotification(`Route optimized: ${distanceMi}mi, ${durationMin}min`, 'success');
      }

    } catch (error) {
      console.error('Error calculating route:', error);
      setError(`Failed to calculate route: ${error.message}`);
      setCalculatedRoute(null);
      setRouteDetails(null);
      
      // Show user-friendly error
      showLocalNotification('Route calculation failed. Using fallback route.', 'error');
    } finally {
      setIsCalculatingRoute(false);
    }
  }, [creatorRole, users, showLocalNotification]);

  // Add effect to automatically calculate route when both location and destination are available
  useEffect(() => {
    const calculateRouteForDriver = async () => {
      // Only calculate route if user is driver and has both location and destination
      if (creatorRole === 'driver' && userLocation && destination && !isCalculatingRoute) {
        // Create a unique key for this route calculation
        const routeKey = `${userLocation.lat},${userLocation.lng}-${destination.lat},${destination.lng}`;
        
        // Check if we've already calculated this exact route recently
        if (lastRouteCalculationRef.current === routeKey) {
          console.log('Route already calculated recently, skipping...');
          return;
        }
        
        console.log('Auto-calculating route for driver:', {
          userLocation,
          destination,
          creatorRole
        });
        
        // Add rate limiting to prevent API flooding
        await rateLimiter.wait();
        
        try {
        await calculateAndDisplayRoute(userLocation, destination);
          // Mark this route as calculated
          lastRouteCalculationRef.current = routeKey;
        } catch (error) {
          console.warn('Route calculation failed, will retry later:', error.message);
          // Don't set error state for automatic route calculations to avoid UI disruption
        }
      }
    };

    // Add debounce to prevent rapid successive calls
    const timeoutId = setTimeout(calculateRouteForDriver, 500);
    
    return () => clearTimeout(timeoutId);
  }, [userLocation, destination, creatorRole, isCalculatingRoute]); // Removed calculateAndDisplayRoute from dependencies

  // Add back friends-related useEffect
  useEffect(() => {
    const loadFriends = async () => {
      if (!user) return;
      
      setIsLoadingFriends(true);
      setFriendError(null);
      
      try {
        const result = await getFriendsList(user.uid);
        if (result.success) {
          setFriends(result.friends);
        } else {
          setFriendError('Failed to load friends list');
        }
      } catch (error) {
        console.error('Error loading friends:', error);
        setFriendError('Error loading friends list');
      } finally {
        setIsLoadingFriends(false);
      }
    };

    loadFriends();
  }, [user]);

  // Add back handleAddFriend function
  const handleAddFriend = async (friendId) => {
    if (!user) return;

    try {
      // Check if already friends
      const statusResult = await checkFriendshipStatus(user.uid, friendId);
      if (statusResult.success && statusResult.areFriends) {
        showLocalNotification('Already friends with this user');
        return;
      }

      // Send friend request
      const result = await sendFriendRequest(user.uid, friendId, "Let's be friends!");
      if (result.success) {
        showLocalNotification('Friend request sent successfully');
      } else {
        showLocalNotification('Failed to send friend request', 'error');
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      showLocalNotification('Error sending friend request', 'error');
    }
  };

  // Add hasDriver check
  const hasDriver = users.some(user => user.role === 'driver');

  // Initialize component
  useEffect(() => {
    if (authError) {
      console.error('Auth error in RouteOptimizer:', authError);
      setError(authError);
      setIsLoading(false);
      return;
    }

    if (!user) {
      console.log('No user found, redirecting to login...');
      navigate('/login');
      return;
    }

    // Initialize component
    const initialize = async () => {
      try {
        console.log('Initializing RouteOptimizer for user:', user.uid);
        
        // Check if MapQuest API key is configured and show notification if not
        const apiKey = import.meta.env.VITE_MAPQUEST_API_KEY;
        console.log('Environment API key:', apiKey ? 'Present' : 'Missing');
        console.log('Using fallback API key:', 'rbGFNBHwHoNH00Ev02kfYtTCw2PZHcNU');
        
        if (!apiKey || apiKey === 'undefined' || apiKey === 'your_actual_api_key_here') {
          showLocalNotification(
            'MapQuest API key not configured. Location suggestions will be limited. Check API_SETUP.md for setup instructions.',
            'warning'
          );
        }
        
        // Test MapQuest API directly
        try {
          console.log('Testing MapQuest API directly...');
          const testResults = await MAPQUEST_SERVICE.searchDestinations('DFW Airport', { limit: 3 });
          console.log('Direct API test results:', testResults);
        } catch (error) {
          console.error('Direct API test failed:', error);
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing RouteOptimizer:', err);
        setError(err);
        setIsLoading(false);
      }
    };

    initialize();
  }, [user, authError]); // Removed navigate from dependencies

  // Clean up notification timeouts
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  // Clean up location tracking
  useEffect(() => {
    return () => {
      locationTrackingService.stopTracking();
    };
  }, []);

  // Clean up the timeout on unmount
  useEffect(() => {
    return () => {
      if (destinationTimeoutRef.current) {
        clearTimeout(destinationTimeoutRef.current);
      }
    };
  }, []);

  // Clean up suggestion timeout
  useEffect(() => {
    return () => {
      if (suggestionTimeout) {
        clearTimeout(suggestionTimeout);
      }
    };
  }, [suggestionTimeout]);

  // Prevent multiple initializations
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      if (!isMounted) return;
      
      try {
        setIsLoading(false);
      } catch (err) {
        if (isMounted) {
          console.error('Error initializing RouteOptimizer:', err);
          setError(err);
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, []); // Removed dependencies to prevent re-initialization

  // Show loading state
  if (isLoading) {
    return (
      <SimpleLoading 
        message="Loading route optimizer..."
        size="large"
      />
    );
  }

  // Debug panel for geolocation issues - temporarily removed to fix hooks issue
  // const DebugPanel = () => {
  //   // ... component code removed
  // };

  // Show error state
  if (error) {
    return (
      <div className="route-optimizer-error">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Error</h4>
          <p>{error.message}</p>
          <button 
            className="btn btn-outline-danger mt-2"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'role') {
      // Update both form state and creator role if this is the creator
      setForm(prev => ({
        ...prev,
        role: value
      }));
      
      // If this is the creator's form, update creatorRole
      if (form.isCreator) {
        setCreatorRole(value);
        
        // If changing from driver to passenger, stop location tracking
        if (creatorRole === 'driver' && value === 'passenger') {
          locationTrackingService.stopTracking();
          setIsTracking(false);
          setUserLocation(null);
        }
      }
    } else if (name === 'destination') {
      // For destination input, just update the form state
      setForm(prev => ({
        ...prev,
        destination: value
      }));
    } else {
      // For all other fields, update form state normally
      setForm(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const getAddressFromCoords = async (lat, lng) => {
    try {
      return await MAPQUEST_SERVICE.getAddressFromCoords(lat, lng);
    } catch (error) {
      console.error('Error getting address from coordinates:', error);
      return `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }
  };

  const geocodeAddress = async (address) => {
    if (!address) return null;
    try {
      const result = await MAPQUEST_SERVICE.getCoordsFromAddress(address);
      return { lat: result.lat, lng: result.lng, address: result.address };
    } catch (error) {
      console.error('Error geocoding address:', error);
    return null;
    }
  };

  const addUser = async (userData) => {
    try {
      console.log('Adding user with data:', {
        userData,
        creatorRole,
        isCreator: userData.isCreator,
        currentDestination: destination
      });

      // Validate required fields with more descriptive error messages
      if (!userData.destination && !destination) {
        throw new Error('Please set a destination for the ride before adding participants');
      }

      // Use the destination from userData if provided, otherwise use the global destination
      const destinationToUse = userData.destination || destination;
      if (!destinationToUse) {
        throw new Error('Destination is required');
      }

      // If this is the creator being added as a driver, use their current location
      if (userData.isCreator && userData.role === 'driver' && userLocation) {
        console.log('Adding creator as driver with current location:', userLocation);
        userData.userLocationCoords = userLocation;
      }

      // If destinationToUse is a string, geocode it
      let destinationCoords;
      if (typeof destinationToUse === 'string') {
        destinationCoords = await geocodeAddress(destinationToUse);
        if (!destinationCoords) {
          throw new Error('Could not find the destination address');
        }
      } else {
        // If it's already an object with coordinates, use it directly
        destinationCoords = destinationToUse;
      }

      // If user is a passenger, geocode their location too
      let userLocationCoords = null;
      if (userData.isCreator && userData.role === 'passenger') {
        userLocationCoords = await geocodeAddress(userData.userLocation);
        if (!userLocationCoords) {
          throw new Error('Could not find the pickup location address');
        }
      }

      // If creator is driver, use their current location
      if (userData.isCreator && userData.role === 'driver' && userLocation) {
        userLocationCoords = userLocation;
      } else if (userData.isCreator && userData.role === 'passenger' && !userData.userLocation) {
        throw new Error('Pickup location is required for passengers');
      }

      // Generate a random color for the user
      const color = `#${Math.floor(Math.random()*16777215).toString(16)}`;

      // Create the new user entry with location
      const newUser = {
        id: userData.id || `temp-${Date.now()}`,
        name: userData.name || userData.profile?.displayName || userData.displayName || 'Unknown User',
        displayName: userData.profile?.displayName || userData.displayName || userData.name || 'Unknown User',
        role: userData.role || 'passenger',
        destination: destinationCoords.address || destinationCoords,
        destinationCoords,
        color,
        photoURL: userData.profile?.photoURL || userData.photoURL || '',
        email: userData.profile?.email || userData.email || '',
        isCreator: userData.isCreator,
        invitationStatus: userData.invitationStatus || 'pending',
        ...(userLocationCoords && {
          userLocation: userData.userLocation || 'Current Location',
          userLocationCoords
        })
      };

      // Update users state
      setUsers(prevUsers => [...prevUsers, newUser]);

      // If this is the first user (creator), update the destination in state
      if (users.length === 0) {
        setDestination(destinationCoords);
      }

      // If this is a friend being added, log it
      if (userData.id) {
        console.log('Friend added:', userData);
        // Note: Invitations will be sent when the group is created, not when users are added
      }

    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
    }
  };

  const handleDelete = async (userId) => {
    try {
      const userIndex = users.findIndex(u => (u.id || u.tempId) === userId);
      if (userIndex !== -1) {
        const removedUser = users[userIndex];
        
        // If this is a real user (not a temporary ID) and we have a ride ID,
        // delete their invitation from Firebase
        if (removedUser.id && createdRideId) {
          try {
            // Delete the invitation from Firebase
            await deleteRideInvitation({
              rideId: createdRideId,
              inviteeId: removedUser.id
            });
            console.log('Invitation deleted for user:', removedUser.id);
          } catch (error) {
            console.error('Error deleting invitation:', error);
            // Continue with local state update even if Firebase update fails
          }
        }

        // Update local state
        const newUsers = [...users];
        newUsers.splice(userIndex, 1);
    setUsers(newUsers);
        
        showLocalNotification(`${removedUser.name} removed from the group`);
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      showLocalNotification('Failed to remove participant', 'error');
    }
  };

  const handleDestinationChange = async (coords) => {
    console.log('handleDestinationChange called with:', coords);
    
    // Set processing state to show feedback
    setIsProcessingDestination(true);
    
    // Ensure coordinates are numbers
    let lat = coords.lat;
    let lng = coords.lng;
    
    // Convert string coordinates to numbers if needed
    if (typeof lat === 'string') lat = parseFloat(lat);
    if (typeof lng === 'string') lng = parseFloat(lng);
    
    // Validate coordinates
    if (!coords || typeof lat !== 'number' || typeof lng !== 'number' ||
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error('Invalid coordinates received:', coords);
      showLocalNotification('Invalid destination location. Please try selecting the location again.', 'error');
      setIsProcessingDestination(false);
      return;
    }

    try {
      // Get the address for the coordinates
      const address = await getAddressFromCoords(lat, lng);
      
      console.log('Destination coordinates and address:', {
        coords: { lat, lng },
        address
      });

      // Store both coordinates and address
      const destinationData = {
        lat: lat,
        lng: lng,
        address: address
      };
      
      // Update both the destination state and form state
      setDestination(destinationData);
      setForm(prev => ({
        ...prev,
        destination: address
      }));
      
      console.log('Destination set successfully:', destinationData);
      
      // Show success feedback
      showLocalNotification(`Destination set: ${address}`, 'success');
      
      // Calculate route immediately when destination is set (for preview)
      if (userLocation) {
        console.log('Calculating route preview for destination selection');
        try {
          await calculateAndDisplayRoute(userLocation, destinationData);
        } catch (error) {
          console.warn('Route preview calculation failed:', error.message);
          // Don't show error to user for preview calculations
        }
      }
    } catch (error) {
      console.error('Error setting destination:', error);
      showLocalNotification('Failed to set destination. Please try again in a few seconds.', 'error');
    } finally {
      // Clear processing state
      setIsProcessingDestination(false);
    }
  };

  const handleUserLocationChange = async (locationData) => {
    // Handle both string addresses and coordinate objects
    if (typeof locationData === 'string') {
      // String address - geocode it
      const coords = await geocodeAddress(locationData);
    if (coords) {
      setUserLocation(coords);
        setHasValidLocation(true);
        setHasLocationError(false); // Clear error flag
        setLocationError(null);
        
        // Clear error message if we had one
        if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
          setLocationStatusMessage('Location set manually');
          console.log('✅ Manual location setting successful:', { address: locationData, coordinates: coords });
        }
        
        // Update form state based on role
        if (creatorRole === 'driver') {
          setForm(prev => ({
            ...prev,
            startingLocation: locationData
          }));
    } else {
          setForm(prev => ({
            ...prev,
            userLocation: locationData
          }));
        }
      } else {
        console.log('❌ Manual location setting failed: Could not geocode address:', locationData);
      alert('Location not found!');
      }
    } else if (locationData && typeof locationData === 'object' && locationData.lat && locationData.lng) {
      // Coordinate object - use directly
      setUserLocation(locationData);
      setHasValidLocation(true);
      setHasLocationError(false); // Clear error flag
      setLocationError(null);
      
      // Clear error message if we had one
      if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
        setLocationStatusMessage('Location set manually');
        console.log('✅ Manual location setting successful:', { coordinates: locationData });
      }
      
      // Update form state based on role
      if (creatorRole === 'driver') {
        setForm(prev => ({
          ...prev,
          startingLocation: locationData.address || `Location (${locationData.lat.toFixed(6)}, ${locationData.lng.toFixed(6)})`
        }));
      } else {
        setForm(prev => ({
          ...prev,
          userLocation: locationData.address || `Location (${locationData.lat.toFixed(6)}, ${locationData.lng.toFixed(6)})`
        }));
      }
    }
  };

  // Add this function to handle role changes
  const handleRoleChange = (tempId, newRole) => {
    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.tempId === tempId 
          ? { ...user, role: newRole }
          : user
      )
    );
  };

  const handleCreateGroup = async () => {
    console.log('handleCreateGroup called with state:', {
      destination,
      users,
      creatorRole,
      hasDriver: users.some(user => user.role === 'driver'),
      isCreatingGroup,
      invitationStatus,
      groupCreated,
      currentUser: user?.uid
    });

    // Validate destination coordinates
    if (!destination || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') {
      console.error('Invalid destination coordinates:', destination);
      showLocalNotification('Please set a valid destination location on the map', 'error');
      return;
    }

    // Log the full users array to see what we're working with
    console.log('Current users array:', users.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      isCreator: u.isCreator,
      tempId: u.tempId,
      location: u.userLocationCoords
    })));

    if (!destination || users.length === 0) {
      console.log('Group creation blocked: Missing requirements', {
        hasDestination: !!destination,
        userCount: users.length
      });
      showLocalNotification('Please add at least one participant and set the destination location', 'error');
      return;
    }

    // Modified driver check to include creator if they are a driver
    const driver = users.find(u => u.role === 'driver') || 
                  (creatorRole === 'driver' ? {
                    id: user.uid,
                    name: user.displayName || 'You',
                    role: 'driver',
                    isCreator: true,
                    userLocationCoords: userLocation
                  } : null);

    console.log('Driver check details:', {
      driverFound: !!driver,
      creatorRole,
      driverDetails: driver ? {
        id: driver.id,
        name: driver.name,
        isCreator: driver.isCreator,
        role: driver.role,
        hasLocation: !!driver.userLocationCoords
      } : null,
      userLocation: userLocation
    });

    if (!driver) {
      console.log('Group creation blocked: No driver assigned', {
        creatorRole,
        usersWithRoles: users.map(u => ({ name: u.name, role: u.role }))
      });
      showLocalNotification('Please assign a driver for the ride', 'error');
      return;
    }

    // Validate driver location
    if (!driver.userLocationCoords || !driver.userLocationCoords.lat || !driver.userLocationCoords.lng) {
      console.error('Invalid driver location:', driver.userLocationCoords);
      showLocalNotification('Driver location is required. Please start location tracking.', 'error');
      return;
    }

    try {
      console.log('Starting group creation process...');
      setIsCreatingGroup(true);
      setInvitationStatus({
        isSending: false,
        sentCount: 0,
        totalCount: 0,
        errors: []
      });
      
      // Get full addresses for all locations
      console.log('Fetching addresses for locations:', {
        driverLocation: driver.userLocationCoords,
        destination: destination
      });

      const [driverAddress, destinationAddress] = await Promise.all([
        getAddressFromCoords(driver.userLocationCoords.lat, driver.userLocationCoords.lng),
        getAddressFromCoords(destination.lat, destination.lng)
      ]);

      // Clean and validate the data before creating the group
      const cleanGroupData = {
        driver: {
          uid: driver.isCreator ? user.uid : driver.id,
          name: driver.name || 'Unknown Driver',
          location: {
            lat: driver.userLocationCoords.lat,
            lng: driver.userLocationCoords.lng
          },
          address: driverAddress || 'Location not found',
          isCreator: driver.isCreator || false,
          status: 'confirmed',
          joinedAt: new Date().toISOString()
        },
        passengers: users
          .filter(u => u.role === 'passenger')
          .map(passenger => ({
            name: passenger.name || 'Unknown Passenger',
            location: passenger.userLocationCoords ? {
              lat: passenger.userLocationCoords.lat,
              lng: passenger.userLocationCoords.lng
            } : null,
            address: passenger.userLocation || 'Location pending',
          status: 'pending',
            tempId: passenger.tempId || null,
            isCreator: passenger.isCreator || false,
            uid: passenger.id || null,
            invitationStatus: 'pending',
            invitedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        })),
        destination: {
          location: {
            lat: destination.lat,
            lng: destination.lng
          },
          address: destinationAddress || 'Destination not found'
        },
        status: 'forming',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.uid,
        metadata: {
          isOptimized: false,
          optimizationAttempts: 0,
          lastOptimizationAttempt: null,
          optimizationStatus: 'pending',
          optimizationError: null,
          groupStatus: 'forming',
          invitationStatus: {
            total: users.length,
            pending: users.filter(u => !u.invitationStatus || u.invitationStatus === 'pending').length,
            accepted: users.filter(u => u.invitationStatus === 'accepted').length,
            declined: users.filter(u => u.invitationStatus === 'declined').length,
            maybe: users.filter(u => u.invitationStatus === 'maybe').length,
            lastUpdated: new Date().toISOString()
          }
        }
      };

      // Log the cleaned data
      console.log('Attempting to create group with cleaned data:', {
        groupData: cleanGroupData,
        currentUser: user.uid,
        timestamp: new Date().toISOString()
      });

      const result = await createRide(cleanGroupData);
      console.log('createRide result:', result);
      
      if (result.success) {
        console.log('Group created successfully:', {
          rideId: result.rideId,
          timestamp: new Date().toISOString()
        });
        
        setCreatedRideId(result.rideId);
        
        // Get pending participants (excluding the creator if they're a passenger)
        const pendingParticipants = users.filter(u => 
          u.role === 'passenger' && 
          u.id && 
          !u.isCreator
        );

        console.log('Processing pending participants:', {
          count: pendingParticipants.length,
          participants: pendingParticipants.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role
          }))
        });

        if (pendingParticipants.length > 0) {
          setInvitationStatus(prev => ({
            ...prev,
            isSending: true,
            totalCount: pendingParticipants.length
          }));

          // Send invitations one by one to handle errors properly
          for (const participant of pendingParticipants) {
            try {
              console.log('Starting invitation process for participant:', {
                participantId: participant.id,
                participantName: participant.name,
                rideId: result.rideId,
                currentUser: user.uid,
                timestamp: new Date().toISOString()
              });

              // Get current user's profile data to ensure we have display name
              const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
              const currentUserData = currentUserDoc.exists() ? currentUserDoc.data() : {};
              const currentUserDisplayName = currentUserData.profile?.displayName || currentUserData.displayName || user.displayName || 'Unknown User';

              console.log('Calling sendRideInvitation with:', {
                rideId: result.rideId,
                inviterId: user.uid,
                inviteeId: participant.id,
                inviterName: currentUserDisplayName,
                inviterPhotoURL: currentUserData.profile?.photoURL || currentUserData.photoURL || ''
              });

              const invitationResult = await sendRideInvitation(
                result.rideId,
                user.uid,
                participant.id
              );

              console.log('Invitation creation result:', {
                success: invitationResult.success,
                invitationId: invitationResult.invitationId,
                error: invitationResult.error,
                timestamp: new Date().toISOString()
              });

              if (invitationResult.success) {
                setInvitationStatus(prev => ({
                  ...prev,
                  sentCount: prev.sentCount + 1
                }));
                showLocalNotification(`Invitation sent to ${participant.name}`);
              } else {
                throw new Error(invitationResult.error?.message || 'Failed to send invitation');
              }
            } catch (error) {
              console.error('Error in invitation process:', {
                error: error.message,
                stack: error.stack,
                participant: {
                  id: participant.id,
                  name: participant.name
                },
                rideId: result.rideId,
                currentUser: user.uid,
                timestamp: new Date().toISOString()
              });
              
              setInvitationStatus(prev => ({
                ...prev,
                errors: [...prev.errors, { 
                  participant: participant.name, 
                  error: error.message,
                  details: error.stack
                }]
              }));
              showLocalNotification(`Failed to send invitation to ${participant.name}`, 'error');
            }
          }
        }

        setGroupCreated(true);
        setShowSuccessModal(true);
        
        // Show summary of invitation status
        const { sentCount, totalCount, errors } = invitationStatus;
        console.log('Group creation completed:', {
          sentCount,
          totalCount,
          errorCount: errors.length,
          timestamp: new Date().toISOString()
        });

        if (errors.length > 0) {
          showLocalNotification(`${sentCount}/${totalCount} invitations sent. ${errors.length} failed.`, 'warning');
      } else {
          showLocalNotification(`Successfully sent ${sentCount} invitations`, 'success');
        }
      } else {
        console.error('Group creation failed:', {
          error: result.error,
          timestamp: new Date().toISOString()
        });
        throw new Error(result.error?.message || 'Failed to create group');
      }
    } catch (error) {
      console.error('Error in handleCreateGroup:', {
        error,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      showLocalNotification(`Failed to create group: ${error.message || 'Please try again.'}`, 'error');
    } finally {
      console.log('Cleaning up group creation state');
      setIsCreatingGroup(false);
      setInvitationStatus(prev => ({ ...prev, isSending: false }));
    }
  };

  // Add click handler for sidebar toggle
  const handleSidebarClick = (e) => {
    // Only toggle if clicking the sidebar itself, not its children
    if (e.target === e.currentTarget) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  // Add a helper function to diagnose geolocation issues
  const diagnoseGeolocation = () => {
    const diagnostics = {
      supported: 'geolocation' in navigator,
      protocol: location.protocol,
      hostname: location.hostname,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      // Add more detailed diagnostics
      locationObject: {
        href: location.href,
        origin: location.origin,
        pathname: location.pathname,
        search: location.search
      },
      navigatorObject: {
        geolocation: !!navigator.geolocation,
        permissions: !!navigator.permissions,
        userAgent: navigator.userAgent.substring(0, 100) + '...'
      }
    };
    
    console.log('Geolocation diagnostics:', diagnostics);
    
    if (!diagnostics.supported) {
      console.error('Geolocation not supported in this browser');
      return 'Geolocation is not supported in this browser';
    }
    
    console.log('Geolocation is supported, checking security requirements...');
    
    // Check if we're on a secure connection or localhost
    // Be more lenient for development environments
    const isSecure = diagnostics.protocol === 'https:' || 
                    diagnostics.hostname === 'localhost' || 
                    diagnostics.hostname === '127.0.0.1' ||
                    diagnostics.hostname === '0.0.0.0' ||
                    (diagnostics.hostname && diagnostics.hostname.includes('.web.app')) || // Firebase hosting
                    (diagnostics.hostname && diagnostics.hostname.includes('.firebaseapp.com')) || // Firebase hosting
                    // Allow development servers (common ports)
                    (diagnostics.hostname && diagnostics.hostname.includes(':5173')) || // Vite dev server
                    (diagnostics.hostname && diagnostics.hostname.includes(':3000')) || // React dev server
                    (diagnostics.hostname && diagnostics.hostname.includes(':8080')) || // Common dev port
                    // Allow if protocol/hostname are undefined (development environment)
                    (!diagnostics.protocol && !diagnostics.hostname) ||
                    // Allow file:// protocol for local development
                    diagnostics.protocol === 'file:';
    
    console.log('Security check result:', {
      protocol: diagnostics.protocol,
      hostname: diagnostics.hostname,
      isSecure,
      isDevelopment: process.env.NODE_ENV === 'development'
    });
    
    if (!isSecure) {
      console.warn('Geolocation security check failed:', {
        protocol: diagnostics.protocol,
        hostname: diagnostics.hostname,
        isSecure
      });
      // Don't block geolocation in development - just warn
      if (process.env.NODE_ENV === 'development' || !diagnostics.protocol) {
        console.log('Allowing geolocation in development environment despite security check');
        return null; // Allow it to proceed
      }
      return 'Geolocation requires HTTPS (except on localhost)';
    }
    
    console.log('Geolocation diagnostics passed - no issues detected');
    return null; // No issues detected
  };

  const handleStartTracking = async () => {
    if (creatorRole === 'driver') {
      try {
        console.log('Starting location tracking process...', {
          userId: user?.uid,
          creatorRole,
          currentStatus: locationStatus
        });

        setIsLocationLoading(true);
        setLocationError(null);
        setHasValidLocation(false); // Reset valid location state
        setLocationStatusMessage('Initializing location services...');

        // Clear any existing location data
        setUserLocation(null);
        
        if (!user?.uid) {
          throw new Error('User ID is required to start location tracking');
        }

        // Run diagnostics first
        const diagnosticError = diagnoseGeolocation();
        if (diagnosticError) {
          throw new Error(diagnosticError);
        }

        // Start tracking with user ID
        console.log('About to call startTracking...');
        const success = await startTracking(user.uid);
        console.log('startTracking returned:', success);
        
        if (!success) {
          throw new Error('Location tracking service failed to start');
        }

        console.log('Location tracking started successfully');
        
        // Don't throw an error if startTracking returns true
        // The location tracking is working as evidenced by the logs
        // The error handling should be done by the location service callbacks
      } catch (error) {
        console.error('Location service error:', {
          error: error.message,
          code: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          user: user?.uid,
          status: locationStatus
        });
        
        console.log('Setting hasLocationError to true');
        setHasLocationError(true);
        
        let errorMessage = 'Failed to start location tracking. ';
        const errorMsg = error.message || error.toString() || 'Unknown error';
        
        if (errorMsg.includes('permission denied')) {
          errorMessage += 'Please enable location access in your browser settings.';
        } else if (errorMsg.includes('not supported')) {
          errorMessage += 'Your browser does not support location services.';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('network') || errorMsg.includes('blocked')) {
          errorMessage = 'Location tracking failed. Please enter your location manually';
        } else if (errorMsg.includes('position unavailable')) {
          errorMessage += 'Location information is unavailable. Please check your device\'s location services.';
        } else {
          errorMessage += errorMsg;
        }
        
        // Reset tracking state when there's an error
        setHasLocationError(true);
        setLocationError(errorMessage);
        setLocationStatusMessage(errorMessage);
        
        // Force stop tracking to reset the button state
        stopTracking(true);
        
        console.log('Set locationStatusMessage to:', errorMessage);
      } finally {
        setIsLocationLoading(false);
      }
    }
  };

  // Update the handleCreateRide function to handle both modes
  const handleCreateRide = async () => {
    if (mode === 'join') {
      // Handle joining existing ride
      // ... existing join ride logic ...
    } else {
      // Handle creating new ride
      if (!destination || users.length === 0) {
        console.log('Group creation blocked: Missing requirements', {
          hasDestination: !!destination,
          userCount: users.length
        });
        showLocalNotification('Please add at least one participant and set the destination location', 'error');
        return;0
      }

      // ... rest of the existing create ride logic ...
    }
  };

  const handleSetDestinationFromMap = () => {
    setMapClickMode('destination');
    showLocalNotification('Click on the map to set the destination location');
  };

  const handleSetManualLocationFromMap = () => {
    setMapClickMode('manual-location');
    showLocalNotification('Click on the map to set your location manually');
  };

  const handleMapClick = async (event) => {
    if (!mapClickMode) return;

    const { lat, lng } = event.latlng;
    
    if (mapClickMode === 'destination') {
      await handleDestinationChange({ lat, lng });
      setMapClickMode(null);
      showLocalNotification('Destination set from map');
    } else if (mapClickMode === 'manual-location') {
      try {
        // Get address for the clicked location
        const address = await getAddressFromCoords(lat, lng);
        
        // Set manual location using the location tracking service
        setManualLocation(lat, lng, address);
        
        // Clear error state
        setHasValidLocation(true);
        setHasLocationError(false);
        setLocationError(null);
        
        // Clear error message if we had one
        if (locationStatusMessage && (locationStatusMessage.includes('failed') || locationStatusMessage.includes('blocked'))) {
          setLocationStatusMessage('Location set from map');
          console.log('✅ Map location setting successful:', { coordinates: { lat, lng }, address });
        }
        
        // Update form state
        setForm(prev => ({
          ...prev,
          userLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
          startingLocation: address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`
        }));
        
        setMapClickMode(null);
        showLocalNotification('Location set manually from map');
      } catch (error) {
        console.error('Error setting manual location:', error);
        showLocalNotification('Failed to set location from map', 'error');
      }
    }
  };

  // Add a test function for debugging geolocation
  const testGeolocation = () => {
    console.log('=== Testing Geolocation ===');
    
    // Test 1: Check if geolocation is supported
    console.log('1. Geolocation supported:', 'geolocation' in navigator);
    
    // Test 2: Run diagnostics
    const diagnosticError = diagnoseGeolocation();
    console.log('2. Diagnostics result:', diagnosticError || 'PASSED');
    
    // Test 3: Try to get current position
    if ('geolocation' in navigator) {
      console.log('3. Testing getCurrentPosition...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('✅ Geolocation SUCCESS:', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString()
          });
        },
        (error) => {
          console.error('❌ Geolocation FAILED:', {
            code: error.code,
            message: error.message
          });
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    } else {
      console.error('❌ Geolocation not supported');
    }
  };

  // Make the test function available globally for debugging
  if (typeof window !== 'undefined') {
    window.testGeolocation = testGeolocation;
  }

  // Debug function to test specific searches
  const testSpecificSearch = async (query) => {
    console.log('=== TESTING SPECIFIC SEARCH ===');
    console.log('Query:', query);
    console.log('User Location:', userLocation);
    
    try {
      const results = await MAPQUEST_SERVICE.searchDestinations(query, {
        userLocation: userLocation,
        limit: 5
      });
      
      console.log('Search results:', results);
      
      if (results && results.length > 0) {
        const realResults = results.filter(result => !result.isError);
        console.log('Real results:', realResults);
        
        if (realResults.length > 0) {
          const bestResult = realResults[0];
          console.log('Best result:', {
            display_name: bestResult.display_name,
            lat: bestResult.lat,
            lon: bestResult.lon,
            distance: bestResult.distance,
            quality: bestResult.quality,
            type: bestResult.type
          });
        }
      }
    } catch (error) {
      console.error('Test failed:', error);
    }
  };

  // Add debug functions to global scope for testing
  if (typeof window !== 'undefined') {
    window.testGeolocation = testGeolocation;
    window.testSpecificSearch = testSpecificSearch;
  }

  return (
    <Box 
      className="route-optimizer-page"
      sx={{ 
        height: 'calc(100vh - 80px)', 
        display: 'flex', 
        position: 'fixed', 
        top: '80px', 
        left: 0, 
        right: 0, 
        bottom: 0,
        // Override global CSS padding
        '&.route-optimizer-page': {
          paddingTop: 0
        },
        // Ensure no background color shows through
        background: 'transparent'
      }}
    >
      {/* DebugPanel removed to fix hooks issue */}
      {/* Sidebar */}
      <Paper 
        elevation={0}
        sx={{ 
          width: isSidebarOpen ? 420 : 0, 
          background: '#fff',
          borderRight: '1px solid #e0c9b3',
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1000
        }}
      >
        <Box sx={{ 
          height: '100vh', 
          overflow: 'auto', 
          background: '#f9f6f2',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2
        }}>
          {/* Header */}
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
            <Box>
              <Typography variant="h5" fontWeight={700} color="#4e342e" mb={0.25}>
                {mode === 'create' ? 'Create a Ride' : 'Join a Ride'}
              </Typography>
              <Typography variant="caption" color="#7c5e48" sx={{ fontStyle: 'italic' }}>
                Plan your journey with friends
              </Typography>
            </Box>
            <IconButton 
              onClick={() => setIsSidebarOpen(false)}
              size="small"
              sx={{ 
                color: '#b08968',
                background: '#fff',
                boxShadow: '0 2px 8px rgba(176, 137, 104, 0.15)',
                '&:hover': {
                  background: '#f9f6ef',
                  transform: 'scale(1.05)'
                }
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Location Tracking Section */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3'
          }}>
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" mb={1.5}>
                <Avatar sx={{ 
                  width: 32, 
                  height: 32, 
                  background: '#b08968',
                  mr: 1.5
                }}>
                  <LocationIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                    Your Location
                  </Typography>
                  <Typography variant="caption" color="#7c5e48">
                    {isTracking ? 'Tracking active' : 'Location not set'}
                  </Typography>
                </Box>
              </Box>

              {userLocation ? (
                <Box>
                  <Chip 
                    label={userLocation.address || `Location (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`}
                    color="primary" 
                    variant="outlined"
                    size="small"
                    sx={{ 
                      mb: 1.5, 
                      background: '#fff', 
                      borderColor: '#4caf50', 
                      color: '#4caf50',
                      fontWeight: 500
                    }}
                    icon={<CheckIcon fontSize="small" />}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={() => {
                        stopTracking();
                        setUserLocation(null);
                      }}
                      sx={{ 
                        color: '#f44336', 
                        borderColor: '#ffcdd2',
                        borderRadius: 1.5,
                        px: 1.5,
                        py: 0.5
                      }}
                    >
                      Clear
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="#7c5e48" mb={1.5}>
                    Set your location to start planning your ride
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    name="userLocation"
                    placeholder="Enter your location or click on map"
                    value={form.userLocation || ''}
                    onChange={handleChange}
                    onBlur={async (e) => {
                      if (e.target.value.trim()) {
                        await handleUserLocationChange(e.target.value);
                      }
                    }}
                    sx={{ 
                      mb: 1.5,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 1.5,
                        background: '#fff',
                        '& fieldset': {
                          borderColor: '#e0c9b3'
                        },
                        '&:hover fieldset': {
                          borderColor: '#b08968'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#b08968'
                        }
                      }
                    }}
                  />
                  <Button 
                    variant="contained"
                    size="small"
                    startIcon={<LocationIcon fontSize="small" />}
                    onClick={handleStartTracking}
                    disabled={isLocationLoading}
                    fullWidth
                    sx={{ 
                      background: '#b08968', 
                      color: '#fff', 
                      borderRadius: 1.5,
                      py: 0.75,
                      '&:hover': {
                        background: '#a47551'
                      }
                    }}
                  >
                    {isLocationLoading ? 'Starting...' : 'Auto Detect'}
                  </Button>
                </Box>
              )}

              {locationStatusMessage && (
                <Alert 
                  severity={hasLocationError ? 'error' : 'info'} 
                  size="small"
                  sx={{ 
                    mt: 1.5,
                    background: hasLocationError ? '#ffebee' : '#e3f2fd',
                    color: hasLocationError ? '#c62828' : '#1565c0',
                    borderRadius: 1.5,
                    py: 0.5
                  }}
                >
                  <Typography variant="caption">
                    {locationStatusMessage}
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Destination Section */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3'
          }}>
            <CardContent sx={{ p: 2 }}>
              <Box display="flex" alignItems="center" mb={1.5}>
                <Avatar sx={{ 
                  width: 32, 
                  height: 32, 
                  background: '#b08968',
                  mr: 1.5
                }}>
                  <RouteIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                    Destination
                  </Typography>
                  <Typography variant="caption" color="#7c5e48">
                    Where are you heading?
                  </Typography>
                </Box>
              </Box>
              
              {destination ? (
                <Box>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                    <Box display="flex" alignItems="center">
                      <Avatar sx={{ 
                        width: 32, 
                        height: 32, 
                        background: isProcessingDestination ? '#ff9800' : '#4caf50',
                        mr: 1.5
                      }}>
                        {isProcessingDestination ? (
                          <SimpleLoading size="small" sx={{ color: '#fff' }} />
                        ) : (
                          <LocationIcon fontSize="small" sx={{ color: '#fff' }} />
                        )}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                          {isProcessingDestination ? 'Setting Destination...' : 'Destination Set'}
                        </Typography>
                        <Typography variant="caption" color="#7c5e48">
                          {isProcessingDestination ? 'Please wait while we set your destination' : 'Click to change location'}
                        </Typography>
                      </Box>
                    </Box>
                    {!isProcessingDestination && (
                      <IconButton 
                        size="small"
                        onClick={() => {
                          setDestination(null);
                          setForm(prev => ({ ...prev, destination: '' }));
                        }}
                        sx={{ 
                          color: '#b08968',
                          '&:hover': {
                            background: '#ffebee',
                            color: '#f44336'
                          }
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                  
                  <Paper sx={{ 
                    p: 1.5, 
                    background: '#f1f8e9', 
                    border: '1px solid #c8e6c9',
                    borderRadius: 2,
                    mb: 1.5
                  }}>
                    <Typography variant="body2" color="#2e7d32" fontWeight={500} sx={{ mb: 0.5 }}>
                      📍 {destination.address}
                    </Typography>
                    <Typography variant="caption" color="#388e3c">
                      Lat: {destination.lat.toFixed(6)}, Lng: {destination.lng.toFixed(6)}
                    </Typography>
                  </Paper>
                  
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LocationIcon fontSize="small" />}
                    onClick={() => {
                      // Focus on destination on map
                      if (mapRef.current) {
                        // This would need to be implemented in MapView
                        console.log('Focus on destination');
                      }
                    }}
                    sx={{ 
                      color: '#4caf50', 
                      borderColor: '#c8e6c9', 
                      borderRadius: 1.5,
                      width: '100%',
                      '&:hover': {
                        background: '#f1f8e9'
                      }
                    }}
                  >
                    View on Map
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="#7c5e48" mb={1.5}>
                    Set your destination to start planning
                  </Typography>
                  <Autocomplete
                    freeSolo
                    options={destinationSuggestions}
                    getOptionLabel={(option) => {
                      if (typeof option === 'string') return option;
                      return option.display_name || '';
                    }}
                    loading={isLoadingSuggestions}
                    open={destinationSuggestions.length > 0 || isLoadingSuggestions}
                    onInputChange={(event, newInputValue, reason) => {
                      console.log('Destination input changed:', newInputValue, 'reason:', reason);
                      setForm(prev => ({ ...prev, destination: newInputValue }));
                      
                      // Only fetch suggestions if user is typing (not selecting)
                      if (reason === 'input') {
                        fetchDestinationSuggestions(newInputValue);
                      }
                    }}
                    onChange={async (event, newValue) => {
                      console.log('Destination selected:', newValue);
                      if (newValue && typeof newValue === 'object') {
                        // Handle suggestion selection
                        if (newValue.isAlternative && newValue.alternativeQuery) {
                          // Handle alternative suggestion - update the input and search
                          setForm(prev => ({ ...prev, destination: newValue.alternativeQuery }));
                          fetchDestinationSuggestions(newValue.alternativeQuery);
                        } else if (newValue.lat && newValue.lon && !newValue.isHelpMessage) {
                          // Handle real location selection
                          const coords = {
                            lat: parseFloat(newValue.lat),
                            lng: parseFloat(newValue.lon),
                            address: newValue.display_name
                          };
                          await handleDestinationChange(coords);
                          setForm(prev => ({ ...prev, destination: newValue.display_name }));
                          setDestinationSuggestions([]); // Clear suggestions after selection
                        }
                      } else if (newValue && typeof newValue === 'string') {
                        // Handle manual entry
                        try {
                          const coords = await MAPQUEST_SERVICE.getCoordsFromAddress(newValue, {
                            userLocation: userLocation
                          });
                          if (coords) {
                            await handleDestinationChange(coords);
                            setForm(prev => ({ ...prev, destination: coords.address }));
                          }
                        } catch (error) {
                          console.warn('Could not geocode address:', error);
                          setForm(prev => ({ ...prev, destination: newValue }));
                        }
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Enter destination (e.g., DFW Airport, American Airlines Center)"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {isLoadingSuggestions ? <SimpleLoading size="small" /> : null}
                              {isProcessingDestination ? (
                                <Box sx={{ color: '#4caf50', fontSize: '0.75rem', mr: 1, display: 'flex', alignItems: 'center' }}>
                                  <SimpleLoading size="small" />
                                  <span style={{ marginLeft: '4px' }}>Setting destination...</span>
                                </Box>
                              ) : null}
                              {destinationSuggestions.length > 0 && !isLoadingSuggestions && !isProcessingDestination ? (
                                <Box sx={{ color: '#b08968', fontSize: '0.75rem', mr: 1 }}>
                                  {destinationSuggestions.length} suggestions
                                </Box>
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                        sx={{ 
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 1.5,
                            background: '#fff',
                            '& fieldset': {
                              borderColor: isProcessingDestination ? '#4caf50' : destinationSuggestions.length > 0 ? '#b08968' : '#e0c9b3'
                            },
                            '&:hover fieldset': {
                              borderColor: isProcessingDestination ? '#4caf50' : '#b08968'
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: isProcessingDestination ? '#4caf50' : '#b08968'
                            }
                          }
                        }}
                      />
                    )}
                    renderOption={(props, option) => {
                      const { key, ...otherProps } = props;
                      return (
                        <Box component="li" key={key} {...otherProps} sx={{ py: 1 }}>
                          <Box>
                            <Typography 
                              variant="body2" 
                              color={option.isHelpMessage ? '#b08968' : option.isAlternative ? '#7c5e48' : '#4e342e'} 
                              fontWeight={500} 
                              sx={{ mb: 0.5 }}
                            >
                              {option.isHelpMessage ? '💡' : option.isAlternative ? '🔄' : '📍'} {option.display_name}
                            </Typography>
                            {option.distance && option.distance > 0 && (
                              <Typography variant="caption" color="#b08968" sx={{ fontWeight: 500, mr: 1 }}>
                                {option.distance < 1 ? `${(option.distance * 1000).toFixed(0)}m` : `${option.distance.toFixed(1)}km`} away
                              </Typography>
                            )}
                            {option.type && option.type !== 'business' && (
                              <Typography variant="caption" color="#4caf50" sx={{ fontWeight: 500, mr: 1 }}>
                                {option.type.charAt(0).toUpperCase() + option.type.slice(1)}
                              </Typography>
                            )}
                            {option.isRealBusiness && !option.isHelpMessage && !option.isAlternative && (
                              <Typography variant="caption" color="#2196f3" sx={{ fontWeight: 500 }}>
                                ✓ Verified
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      );
                    }}
                    PopperComponent={(props) => (
                      <Popper
                        {...props}
                        placement="bottom-start"
                        sx={{
                          '& .MuiAutocomplete-paper': {
                            background: '#fff',
                            border: '1px solid #e0c9b3',
                            borderRadius: 2,
                            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.15)',
                            mt: 0.5
                          }
                        }}
                      />
                    )}
                    sx={{
                      '& .MuiAutocomplete-inputRoot': {
                        padding: '8px 12px'
                      }
                    }}
                  />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Participants Section */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3',
            flex: 0.8,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 200
          }}>
            <CardContent sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Box display="flex" alignItems="center">
                  <Avatar sx={{ 
                    width: 32, 
                    height: 32, 
                    background: '#b08968',
                    mr: 1.5
                  }}>
                    <GroupIcon fontSize="small" />
                  </Avatar>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} color="#4e342e">
                      Participants
                    </Typography>
                    <Typography variant="caption" color="#7c5e48">
                      {users.length} {users.length === 1 ? 'person' : 'people'} in your ride
                    </Typography>
                  </Box>
                </Box>
                <Button 
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={() => setShowFriendModal(true)}
                  sx={{ 
                    color: '#b08968', 
                    borderColor: '#e0c9b3', 
                    borderRadius: 1.5,
                    px: 1.5,
                    py: 0.5,
                    '&:hover': {
                      background: '#f9f6ef'
                    }
                  }}
                >
                  Add Friends
                </Button>
              </Box>

              {users.length === 0 ? (
                <Box textAlign="center" py={2.5} sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Avatar sx={{ 
                    width: 48, 
                    height: 48, 
                    mb: 1.5, 
                    background: '#e0c9b3',
                    mx: 'auto'
                  }}>
                    <GroupIcon sx={{ color: '#7c5e48', fontSize: 24 }} />
                  </Avatar>
                  <Typography color="#7c5e48" mb={0.5} fontWeight={500} variant="body2">
                    No participants yet
                  </Typography>
                  <Typography variant="caption" color="#b08968" sx={{ fontStyle: 'italic' }}>
                    Add friends to start your adventure
                  </Typography>
                </Box>
              ) : (
                <List sx={{ p: 0, flex: 1, overflow: 'auto' }}>
                  {users.map((user, index) => (
                    <ListItem 
                      key={user.tempId || user.id} 
                      sx={{ 
                        background: '#fff', 
                        borderRadius: 2, 
                        mb: 1,
                        border: '1px solid #e0c9b3',
                        boxShadow: '0 2px 8px rgba(176, 137, 104, 0.08)',
                        '&:hover': {
                          boxShadow: '0 4px 12px rgba(176, 137, 104, 0.15)',
                          transform: 'translateY(-1px)'
                        },
                        transition: 'all 0.2s ease',
                        py: 1,
                        px: 1.5
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar 
                          src={user.photoURL} 
                          sx={{ 
                            background: '#b08968',
                            width: 36,
                            height: 36
                          }}
                        >
                          {user.name?.charAt(0) || 'U'}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography fontWeight={600} color="#4e342e" variant="body2">
                            {user.name || 'Unknown User'}
                          </Typography>
                        }
                        secondary={
                          <FormControl size="small" sx={{ minWidth: 100, mt: 0.5 }}>
                            <Select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.tempId, e.target.value)}
                              sx={{ 
                                background: '#fff',
                                borderRadius: 1.5,
                                height: 32,
                                '& .MuiOutlinedInput-notchedOutline': {
                                  borderColor: '#e0c9b3'
                                },
                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                  borderColor: '#b08968'
                                }
                              }}
                            >
                              <MenuItem value="driver">
                                <CarIcon sx={{ mr: 1, fontSize: 14 }} />
                                Driver
                              </MenuItem>
                              <MenuItem value="passenger">
                                <PersonIcon sx={{ mr: 1, fontSize: 14 }} />
                                Passenger
                              </MenuItem>
                            </Select>
                          </FormControl>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          size="small"
                          onClick={() => handleDelete(user.tempId || user.id)}
                          sx={{ 
                            color: '#b08968',
                            '&:hover': {
                              background: '#ffebee',
                              color: '#f44336'
                            }
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          {/* Create Group Button */}
          <Card sx={{ 
            borderRadius: 3, 
            boxShadow: '0 4px 20px rgba(176, 137, 104, 0.1)', 
            background: 'linear-gradient(135deg, #fff 0%, #f9f6ef 100%)',
            border: '1px solid #e0c9b3',
            mt: 1
          }}>
            <CardContent sx={{ p: 2 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={isCreatingGroup ? <SimpleLoading size="small" /> : <CheckIcon />}
                onClick={handleCreateGroup}
                disabled={
                  isCreatingGroup ||
                  !destination ||
                  users.length === 0 ||
                  (!users.some(u => u.role === 'driver') && creatorRole !== 'driver') ||
                  groupCreated
                }
                sx={{ 
                  background: groupCreated ? '#4caf50' : '#a47551', 
                  color: '#fff', 
                  borderRadius: 2, 
                  py: 1.5,
                  fontWeight: 600,
                  fontSize: '1rem',
                  boxShadow: '0 4px 12px rgba(164, 117, 81, 0.3)',
                  '&:hover': {
                    background: groupCreated ? '#45a049' : '#8b6b4a',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(164, 117, 81, 0.4)'
                  },
                  '&:disabled': {
                    background: '#e0c9b3',
                    color: '#b08968',
                    transform: 'none',
                    boxShadow: 'none'
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                {isCreatingGroup ? 'Creating Ride...' : groupCreated ? 'Ride Created!' : 'Create Ride'}
              </Button>

              {!groupCreated && (
                <Stack spacing={0.75} mt={1.5}>
                  {!destination && (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      p: 1,
                      background: '#fff8e1',
                      borderRadius: 1.5,
                      border: '1px solid #ffcc02',
                      opacity: 0.8
                    }}>
                      <Typography variant="caption" sx={{ color: '#f57c00', fontWeight: 500 }}>
                        📍
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#e65100', fontSize: '0.75rem' }}>
                        Set a destination to continue
                      </Typography>
                    </Box>
                  )}
                  {users.length === 0 && (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      p: 1,
                      background: '#fff8e1',
                      borderRadius: 1.5,
                      border: '1px solid #ffcc02',
                      opacity: 0.8
                    }}>
                      <Typography variant="caption" sx={{ color: '#f57c00', fontWeight: 500 }}>
                        👥
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#e65100', fontSize: '0.75rem' }}>
                        Add at least one participant
                      </Typography>
                    </Box>
                  )}
                  {creatorRole === 'passenger' && !users.some(user => user.role === 'driver') && (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1,
                      p: 1,
                      background: '#fff8e1',
                      borderRadius: 1.5,
                      border: '1px solid #ffcc02',
                      opacity: 0.8
                    }}>
                      <Typography variant="caption" sx={{ color: '#f57c00', fontWeight: 500 }}>
                        🚗
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#e65100', fontSize: '0.75rem' }}>
                        Assign a driver for the ride
                      </Typography>
                    </Box>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Box>
      </Paper>

      {/* Map Container */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
          <Fab
            color="primary"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            sx={{ 
              background: '#fff',
              color: '#b08968',
              boxShadow: 2,
              '&:hover': {
                background: '#f9f6ef'
              }
            }}
          >
            <MenuIcon />
          </Fab>
        </Box>

        <Box sx={{ height: '100vh', width: '100%' }}>
          <MapView 
            ref={mapRef}
            users={users} 
            destination={destination}
            userLocation={userLocation}
            calculatedRoute={calculatedRoute}
            onSetDestinationFromMap={(coords) => handleDestinationChange(coords)}
            onRouteUpdate={(route) => {
              console.log('Route updated:', route);
              setCalculatedRoute(route);
            }}
            onMapClick={handleMapClick}
          />
        </Box>
      </Box>

      {/* Friend Selection Modal */}
      <Dialog 
        open={showFriendModal} 
        onClose={() => setShowFriendModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ background: '#f9f6ef', color: '#4e342e' }}>
          Add Friends to Ride
        </DialogTitle>
        <DialogContent sx={{ background: '#fff' }}>
          <UserSearch 
            onSelectFriend={(friend) => {
              console.log('Friend selected from UserSearch:', friend);
              
              const friendData = {
                id: friend.id,
                name: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
                displayName: friend.profile?.displayName || friend.displayName || friend.name || 'Unknown User',
                role: 'passenger',
                isCreator: false,
                photoURL: friend.profile?.photoURL || friend.photoURL || '',
                email: friend.profile?.email || friend.email || ''
              };
              
              const isAlreadyAdded = users.some(user => user.id === friend.id);
              if (isAlreadyAdded) {
                showLocalNotification(`${friendData.displayName} is already in the ride`, 'warning');
                return;
              }
              
              addUser(friendData);
              setShowFriendModal(false);
              showLocalNotification(`${friendData.displayName} added to the ride`, 'success');
            }} 
          />
        </DialogContent>
        <DialogActions sx={{ background: '#f9f6ef' }}>
          <Button 
            onClick={() => setShowFriendModal(false)}
            sx={{ color: '#b08968' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Modal */}
      <Dialog 
        open={showSuccessModal} 
        onClose={() => {
          setShowSuccessModal(false);
          navigate('/dashboard');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ background: '#f9f6ef', color: '#4e342e', textAlign: 'center' }}>
          Ride Created Successfully!
        </DialogTitle>
        <DialogContent sx={{ background: '#fff', textAlign: 'center', py: 3 }}>
          <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, background: '#4caf50' }}>
            <CheckIcon sx={{ fontSize: 40 }} />
          </Avatar>
          <Typography variant="h6" color="#4e342e" mb={1}>
            Your ride has been created!
          </Typography>
          <Typography variant="body2" color="#7c5e48" mb={2}>
            Once participants provide their locations, you can optimize and start the ride.
          </Typography>
          <Paper sx={{ p: 2, background: '#f9f6ef', display: 'inline-block' }}>
            <Typography variant="caption" color="#b08968">Ride ID:</Typography>
            <Typography variant="body2" fontWeight={600} color="#4e342e">{createdRideId}</Typography>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ background: '#f9f6ef', justifyContent: 'center', pb: 3 }}>
          <Button 
            variant="contained"
            onClick={() => {
              setShowSuccessModal(false);
              navigate('/dashboard');
            }}
            sx={{ background: '#a47551', color: '#fff', borderRadius: 2, px: 4 }}
          >
            Go to Dashboard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default RouteOptimizer;
