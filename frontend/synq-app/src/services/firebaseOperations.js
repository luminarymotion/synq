import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  onSnapshot,
  orderBy,
  writeBatch,
  increment,
  arrayUnion,
  limit
} from 'firebase/firestore';
import { db } from './firebase';

// User Operations
const createUserProfile = async (userId, userData) => {
  try {
    const userRef = doc(db, 'users', userId);
    const profileData = {
      ...userData,
      displayName: userData.displayName || userData.email?.split('@')[0] || 'User',
      email: userData.email,
      photoURL: userData.photoURL || null,
      isOnline: true,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Additional profile fields
      phoneNumber: userData.phoneNumber || null,
      bio: userData.bio || '',
      location: userData.location || null,
      preferences: {
        notifications: true,
        locationSharing: false,
        ...userData.preferences
      }
    };

    await setDoc(userRef, profileData);
    return { success: true, profile: profileData };
  } catch (error) {
    console.error('Error creating user profile:', error);
    return { success: false, error };
  }
};

const updateUserProfile = async (userId, userData) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...userData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return { success: false, error };
  }
};

// Group Operations
const createGroup = async (groupData) => {
  try {
    const groupRef = doc(collection(db, 'groups'));
    await setDoc(groupRef, {
      ...groupData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, groupId: groupRef.id };
  } catch (error) {
    console.error('Error creating group:', error);
    return { success: false, error };
  }
};

const updateGroup = async (groupId, groupData) => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      ...groupData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating group:', error);
    return { success: false, error };
  }
};

// Generate a unique ride ID
const generateRideId = async () => {
  try {
    // Get the latest ride ID from a counter document
    const counterRef = doc(db, 'counters', 'rideIds');
    const counterDoc = await getDoc(counterRef);
    
    let nextId;
    if (!counterDoc.exists()) {
      // Initialize counter if it doesn't exist
      nextId = 1;
      await setDoc(counterRef, { count: nextId });
    } else {
      // Increment the counter
      nextId = counterDoc.data().count + 1;
      await updateDoc(counterRef, { count: increment(1) });
    }
    
    // Format the ID as RIDE-XXXX
    return `RIDE-${nextId.toString().padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating ride ID:', error);
    throw error;
  }
};

// Update the createRide function to use friendly ride ID as document ID
const createRide = async (rideData) => {
  try {
    // Generate a user-friendly ride ID
    const rideId = await generateRideId();
    
    // Use the friendly ride ID as the document ID
    const rideRef = doc(db, 'rides', rideId);
    
    // Calculate initial route details
    const routeDetails = {
      optimizedRoute: null, // Will be calculated when the ride starts
      pickupOrder: [], // Will be populated with optimized pickup order
      estimatedTimes: {
        totalDuration: null, // Total estimated duration in minutes
        totalDistance: null, // Total distance in kilometers
        pickupTimes: {}, // Map of passenger tempId to estimated pickup time
        arrivalTime: null // Estimated arrival time at destination
      },
      waypoints: [], // Array of waypoints including pickup locations and destination
      lastUpdated: null // Timestamp of last route update
    };

    // Create the ride document with enhanced data structure
    await setDoc(rideRef, {
      ...rideData,
      rideId, // Store the ID as a field for easy access
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      routeDetails,
      // Add passengerUids array for easier querying
      passengerUids: rideData.passengers.map(p => p.uid).filter(Boolean),
      // Add status tracking
      status: 'created', // 'created', 'active', 'completed', 'cancelled'
      statusHistory: [{
        status: 'created',
        timestamp: new Date().toISOString(),
        updatedBy: rideData.driver?.uid || null
      }],
      // Add metadata
      metadata: {
        isOptimized: false,
        optimizationAttempts: 0,
        lastOptimizationAttempt: null,
        optimizationStatus: 'pending', // 'pending', 'in_progress', 'completed', 'failed'
        optimizationError: null
      }
    });

    return { 
      success: true, 
      rideId,
      message: `Ride created successfully! Your ride ID is: ${rideId}`
    };
  } catch (error) {
    console.error('Error creating ride:', error);
    return { success: false, error };
  }
};

const updateRide = async (rideId, rideData) => {
  try {
    const rideRef = doc(db, 'rides', rideId);
    await updateDoc(rideRef, {
      ...rideData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating ride:', error);
    return { success: false, error };
  }
};

// Participant Operations
const updateRideParticipation = async (rideId, userId, status) => {
  try {
    const rideRef = doc(db, 'rides', rideId);
    await updateDoc(rideRef, {
      [`participants.${userId}`]: {
        status,
        updatedAt: serverTimestamp()
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating ride participation:', error);
    return { success: false, error };
  }
};

// Location Operations
const updateUserLocation = async (userId, location) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      location: {
        ...location,
        lastUpdated: serverTimestamp()
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating user location:', error);
    return { success: false, error };
  }
};

// Message Operations
const sendMessage = async (groupId, messageData) => {
  try {
    const messageRef = doc(collection(db, 'messages'));
    await setDoc(messageRef, {
      ...messageData,
      groupId,
      createdAt: serverTimestamp()
    });
    return { success: true, messageId: messageRef.id };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error };
  }
};

// Notification Operations
const createNotification = async (userId, notificationData) => {
  try {
    const notificationRef = doc(collection(db, 'notifications'));
    await setDoc(notificationRef, {
      ...notificationData,
      userId,
      isRead: false,
      createdAt: serverTimestamp()
    });
    return { success: true, notificationId: notificationRef.id };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error };
  }
};

// Friend Operations
const sendFriendRequest = async (senderId, receiverId) => {
  try {
    // Get sender's profile information
    const senderDoc = await getDoc(doc(db, 'users', senderId));
    if (!senderDoc.exists()) {
      throw new Error('Sender profile not found');
    }
    const senderData = senderDoc.data();

    const requestRef = doc(collection(db, 'friendRequests'));
    await setDoc(requestRef, {
      senderId,
      receiverId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Include sender's information
      senderName: senderData.displayName,
      senderEmail: senderData.email,
      senderPhotoURL: senderData.photoURL
    });
    return { success: true, requestId: requestRef.id };
  } catch (error) {
    console.error('Error sending friend request:', error);
    return { success: false, error };
  }
};

const getMutualFriends = async (userId1, userId2) => {
  try {
    const [user1Friends, user2Friends] = await Promise.all([
      getDocs(collection(db, 'users', userId1, 'friends')),
      getDocs(collection(db, 'users', userId2, 'friends'))
    ]);

    const user1FriendIds = new Set(user1Friends.docs.map(doc => doc.id));
    const mutualFriends = user2Friends.docs
      .filter(doc => user1FriendIds.has(doc.id))
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    return { success: true, mutualFriends };
  } catch (error) {
    console.error('Error getting mutual friends:', error);
    return { success: false, error };
  }
};

const updateFriendRequest = async (requestId, status) => {
  try {
    const batch = writeBatch(db);
    const requestRef = doc(db, 'friendRequests', requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error('Friend request not found');
    }

    const requestData = requestDoc.data();
    const { senderId, receiverId } = requestData;

    // Update the friend request status
    batch.update(requestRef, {
      status,
      updatedAt: serverTimestamp()
    });

    // If accepting the request, add to both users' friends subcollections with metadata
    if (status === 'accepted') {
      // Get both users' profiles
      const [senderDoc, receiverDoc] = await Promise.all([
        getDoc(doc(db, 'users', senderId)),
        getDoc(doc(db, 'users', receiverId))
      ]);

      if (!senderDoc.exists() || !receiverDoc.exists()) {
        throw new Error('User profile not found');
      }

      const senderData = senderDoc.data();
      const receiverData = receiverDoc.data();

      // Get mutual friends count
      const { mutualFriends } = await getMutualFriends(senderId, receiverId);

      // Add to sender's friends subcollection with metadata
      const senderFriendsRef = doc(db, 'users', senderId, 'friends', receiverId);
      batch.set(senderFriendsRef, {
        id: receiverId,
        displayName: receiverData.displayName,
        email: receiverData.email,
        photoURL: receiverData.photoURL,
        addedAt: serverTimestamp(),
        // Friendship metadata
        metadata: {
          mutualFriends: mutualFriends.length,
          ridesShared: 0,
          lastInteraction: serverTimestamp(),
          trustScore: 0,
          preferences: {
            preferredMeetingPoints: [],
            communicationPreference: 'app', // 'app', 'phone', 'email'
            ridePreferences: {
              music: true,
              conversation: true,
              carType: 'any'
            }
          },
          groupRideStats: {
            totalRides: 0,
            asDriver: 0,
            asPassenger: 0,
            reliability: 0
          }
        }
      });

      // Add to receiver's friends subcollection with metadata
      const receiverFriendsRef = doc(db, 'users', receiverId, 'friends', senderId);
      batch.set(receiverFriendsRef, {
        id: senderId,
        displayName: senderData.displayName,
        email: senderData.email,
        photoURL: senderData.photoURL,
        addedAt: serverTimestamp(),
        // Friendship metadata
        metadata: {
          mutualFriends: mutualFriends.length,
          ridesShared: 0,
          lastInteraction: serverTimestamp(),
          trustScore: 0,
          preferences: {
            preferredMeetingPoints: [],
            communicationPreference: 'app',
            ridePreferences: {
              music: true,
              conversation: true,
              carType: 'any'
            }
          },
          groupRideStats: {
            totalRides: 0,
            asDriver: 0,
            asPassenger: 0,
            reliability: 0
          }
        }
      });
    }

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error updating friend request:', error);
    return { success: false, error };
  }
};

const getFriendRequests = async (userId) => {
  try {
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', userId),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(requestsQuery);
    return {
      success: true,
      requests: snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    };
  } catch (error) {
    console.error('Error getting friend requests:', error);
    return { success: false, error };
  }
};

const getFriendsList = async (userId) => {
  try {
    // Get accepted friend requests where user is either sender or receiver
    const sentRequestsQuery = query(
      collection(db, 'friendRequests'),
      where('senderId', '==', userId),
      where('status', '==', 'accepted')
    );
    const receivedRequestsQuery = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', userId),
      where('status', '==', 'accepted')
    );

    const [sentSnapshot, receivedSnapshot] = await Promise.all([
      getDocs(sentRequestsQuery),
      getDocs(receivedRequestsQuery)
    ]);

    // Get all friend IDs
    const friendIds = new Set([
      ...sentSnapshot.docs.map(doc => doc.data().receiverId),
      ...receivedSnapshot.docs.map(doc => doc.data().senderId)
    ]);

    // Get friend profiles
    const friendProfiles = await Promise.all(
      Array.from(friendIds).map(async (friendId) => {
        const userDoc = await getDoc(doc(db, 'users', friendId));
        return {
          id: friendId,
          ...userDoc.data()
        };
      })
    );

    return {
      success: true,
      friends: friendProfiles
    };
  } catch (error) {
    console.error('Error getting friends list:', error);
    return { success: false, error };
  }
};

const searchUsers = async (searchTerm) => {
  try {
    if (!searchTerm.trim()) {
      return { success: true, users: [] };
    }

    const usersRef = collection(db, 'users');
    const searchTermLower = searchTerm.toLowerCase().trim();
    
    // Get all users and filter client-side for more flexible matching
    const snapshot = await getDocs(usersRef);
    const users = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(user => {
        const displayName = (user.displayName || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        
        // Check for exact matches first
        if (displayName === searchTermLower || email === searchTermLower) {
          return true;
        }
        
        // Then check for partial matches
        return displayName.includes(searchTermLower) || 
               email.includes(searchTermLower);
      });

    return {
      success: true,
      users
    };
  } catch (error) {
    console.error('Error searching users:', error);
    return { success: false, error };
  }
};

// Real-time Friend Operations
const subscribeToFriendRequests = (userId, callback) => {
  try {
    // First try the optimized query with ordering
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    // Return the unsubscribe function
    const unsubscribe = onSnapshot(requestsQuery, 
      (snapshot) => {
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback({ success: true, requests });
      },
      (error) => {
        // If we get an index error, fall back to a simpler query
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
          console.log('Index not ready, falling back to simple query');
          // Use a simpler query without ordering
          const simpleQuery = query(
            collection(db, 'friendRequests'),
            where('receiverId', '==', userId),
            where('status', '==', 'pending')
          );

          // Set up a new listener with the simple query
          const simpleUnsubscribe = onSnapshot(simpleQuery,
            (snapshot) => {
              const requests = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              // Sort the requests client-side
              requests.sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || new Date(0);
                const dateB = b.createdAt?.toDate?.() || new Date(0);
                return dateB - dateA;
              });
              callback({ success: true, requests });
            },
            (fallbackError) => {
              console.error('Error in fallback friend requests subscription:', fallbackError);
              callback({ success: false, error: fallbackError });
            }
          );

          // Return the new unsubscribe function
          return simpleUnsubscribe;
        }

        // For other errors, just pass them through
        console.error('Error in friend requests subscription:', error);
        callback({ success: false, error });
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up friend requests subscription:', error);
    callback({ success: false, error });
    return () => {}; // Return empty unsubscribe function
  }
};

const subscribeToFriendsList = (userId, callback) => {
  try {
    const friendsRef = collection(db, 'users', userId, 'friends');
    
    return onSnapshot(friendsRef, 
      async (snapshot) => {
        const friends = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback({ success: true, friends });
      },
      (error) => {
        console.error('Error in friends list subscription:', error);
        callback({ success: false, error });
      }
    );
  } catch (error) {
    console.error('Error setting up friends list subscription:', error);
    callback({ success: false, error });
    return () => {}; // Return empty unsubscribe function
  }
};

const subscribeToUserStatus = (userId, callback) => {
  try {
    const userRef = doc(db, 'users', userId);
    
    return onSnapshot(userRef,
      (doc) => {
        if (doc.exists()) {
          const userData = doc.data();
          callback({ 
            success: true, 
            status: {
              isOnline: userData.isOnline,
              lastSeen: userData.lastSeen
            }
          });
        } else {
          callback({ success: false, error: 'User not found' });
        }
      },
      (error) => {
        console.error('Error in user status subscription:', error);
        callback({ success: false, error });
      }
    );
  } catch (error) {
    console.error('Error setting up user status subscription:', error);
    callback({ success: false, error });
    return () => {}; // Return empty unsubscribe function
  }
};

// Update user's online status
const updateUserOnlineStatus = async (userId, isOnline) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isOnline,
      lastSeen: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating user online status:', error);
    return { success: false, error };
  }
};

const removeFriendship = async (currentUserId, friendId) => {
  try {
    const batch = writeBatch(db);

    // Remove from current user's friends subcollection
    const currentUserFriendsRef = doc(db, 'users', currentUserId, 'friends', friendId);
    batch.delete(currentUserFriendsRef);

    // Remove from friend's friends subcollection
    const friendFriendsRef = doc(db, 'users', friendId, 'friends', currentUserId);
    batch.delete(friendFriendsRef);

    // Update any existing friend requests to 'removed' status
    const friendRequestsRef = collection(db, 'friendRequests');
    const q = query(
      friendRequestsRef,
      where('status', '==', 'accepted'),
      where('senderId', 'in', [currentUserId, friendId]),
      where('receiverId', 'in', [currentUserId, friendId])
    );
    
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      batch.update(doc.ref, { status: 'removed' });
    });

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error removing friendship:', error);
    return { success: false, error };
  }
};

// Add function to update friendship metadata
const updateFriendshipMetadata = async (userId, friendId, metadata) => {
  try {
    const friendRef = doc(db, 'users', userId, 'friends', friendId);
    await updateDoc(friendRef, {
      'metadata.lastInteraction': serverTimestamp(),
      ...metadata
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating friendship metadata:', error);
    return { success: false, error };
  }
};

// Add function to update ride statistics
const updateRideStatistics = async (userId, friendId, rideData) => {
  try {
    const batch = writeBatch(db);
    const [userFriendRef, friendUserRef] = [
      doc(db, 'users', userId, 'friends', friendId),
      doc(db, 'users', friendId, 'friends', userId)
    ];

    // Update both users' friendship metadata
    const updates = {
      'metadata.ridesShared': increment(1),
      'metadata.lastInteraction': serverTimestamp(),
      'metadata.groupRideStats.totalRides': increment(1),
      [`metadata.groupRideStats.as${rideData.role}`]: increment(1)
    };

    batch.update(userFriendRef, updates);
    batch.update(friendUserRef, updates);

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error updating ride statistics:', error);
    return { success: false, error };
  }
};

// Add new function to end a ride and record its history
const endRide = async (rideId, userId, reason, type = 'left') => {
  try {
    if (!rideId) {
      throw new Error('Ride ID is required');
    }

    console.log(`Ending ride ${rideId} with reason: ${reason}, type: ${type}`);

    const rideRef = doc(db, 'rides', rideId);
    const rideDoc = await getDoc(rideRef);
    
    if (!rideDoc.exists()) {
      throw new Error('Ride not found');
    }

    const rideData = rideDoc.data();
    const batch = writeBatch(db);

    // Create history entry with current timestamp
    const now = new Date();
    const historyEntry = {
      timestamp: now,
      type, // 'left', 'cancelled', 'completed', etc.
      reason,
      userId,
      previousStatus: rideData.status,
      userRole: rideData.driver?.uid === userId ? 'driver' : 'passenger',
      rideSnapshot: {
        driver: rideData.driver,
        passengers: rideData.passengers,
        destination: rideData.destination,
        createdAt: rideData.createdAt,
        duration: rideData.createdAt ? 
          Math.round((now - rideData.createdAt.toDate()) / 1000 / 60) : null // duration in minutes
      }
    };

    // Update ride status and add to history
    const updates = {
      status: 'ended',
      updatedAt: now,
      endReason: reason,
      endedAt: now,
      endedBy: userId,
      history: arrayUnion(historyEntry)
    };

    // If it was a driver leaving, update all passengers' status
    if (type === 'left' && rideData.driver?.uid === userId) {
      updates.passengers = rideData.passengers.map(passenger => ({
        ...passenger,
        status: 'ride-ended',
        updatedAt: now
      }));
    }

    batch.update(rideRef, updates);

    // If there are any active passengers, notify them
    if (rideData.passengers?.length > 0) {
      const activePassengers = rideData.passengers.filter(p => 
        p.status !== 'left' && p.status !== 'ride-ended'
      );
      
      for (const passenger of activePassengers) {
        if (passenger.uid) {
          const notificationRef = doc(collection(db, 'notifications'));
          batch.set(notificationRef, {
            userId: passenger.uid,
            type: 'ride-ended',
            title: 'Ride Ended',
            message: type === 'left' ? 
              'The driver has ended the ride' : 
              'The ride has been ended',
            rideId,
            createdAt: now,
            isRead: false,
            metadata: {
              reason,
              endedBy: userId
            }
          });
        }
      }
    }

    await batch.commit();
    console.log(`Successfully ended ride ${rideId}`);
    return { success: true };
  } catch (error) {
    console.error('Error ending ride:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to end ride. Please try again.' 
    };
  }
};

// Update leaveRide to use the new endRide function
const leaveRide = async (rideId, userId, isDriver) => {
  try {
    if (!rideId) {
      throw new Error('Ride ID is required');
    }

    console.log('Attempting to leave ride:', rideId);
    
    const reason = isDriver ? 
      'Driver left the ride' : 
      'Passenger left the ride';
    
    return await endRide(rideId, userId, reason, 'left');
  } catch (error) {
    console.error('Error leaving ride:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to leave ride. Please try again.' 
    };
  }
};

// Add function to get ride history
const getRideHistory = async (rideId) => {
  try {
    const rideRef = doc(db, 'rides', rideId);
    const rideDoc = await getDoc(rideRef);
    
    if (!rideDoc.exists()) {
      throw new Error('Ride not found');
    }

    const rideData = rideDoc.data();
    return {
      success: true,
      history: rideData.history || [],
      currentStatus: rideData.status,
      endedAt: rideData.endedAt,
      endReason: rideData.endReason
    };
  } catch (error) {
    console.error('Error getting ride history:', error);
    return { success: false, error };
  }
};

// Add function to get user's ride history
const getUserRideHistory = async (userId, limitCount = 10) => {
  if (!userId) {
    console.error('getUserRideHistory called with undefined userId');
    return { 
      success: false, 
      error: 'User ID is required to fetch ride history' 
    };
  }

  try {
    // Query for rides where user is driver
    const driverQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', userId),
      where('status', 'in', ['ended', 'completed', 'cancelled']),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    // Query for rides where user is passenger
    const passengerQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', userId),
      where('status', 'in', ['ended', 'completed', 'cancelled']),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    try {
      console.log('Fetching ride history for user:', userId);
      const [driverSnapshot, passengerSnapshot] = await Promise.all([
        getDocs(driverQuery),
        getDocs(passengerQuery)
      ]);

      console.log('Driver rides found:', driverSnapshot.docs.length);
      console.log('Passenger rides found:', passengerSnapshot.docs.length);

      // Combine and deduplicate rides
      const allRides = [
        ...driverSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          role: 'driver',
          createdAt: doc.data().createdAt?.toDate() || new Date(0)
        })),
        ...passengerSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          role: 'passenger',
          createdAt: doc.data().createdAt?.toDate() || new Date(0)
        }))
      ];

      // Sort by creation time, most recent first
      const uniqueRides = Array.from(
        new Map(allRides.map(ride => [ride.id, ride])).values()
      ).sort((a, b) => b.createdAt - a.createdAt);

      console.log('Total unique rides:', uniqueRides.length);
      return {
        success: true,
        rides: uniqueRides.slice(0, limitCount)
      };
    } catch (error) {
      console.error('Error in primary query:', error);
      
      if (error.code === 'failed-precondition') {
        console.log('Index not available, trying without ordering');
        
        // Fallback query without ordering
        const basicDriverQuery = query(
          collection(db, 'rides'),
          where('driver.uid', '==', userId),
          where('status', 'in', ['ended', 'completed', 'cancelled']),
          limit(limitCount)
        );

        const basicPassengerQuery = query(
          collection(db, 'rides'),
          where('passengerUids', 'array-contains', userId),
          where('status', 'in', ['ended', 'completed', 'cancelled']),
          limit(limitCount)
        );

        try {
          const [driverSnapshot, passengerSnapshot] = await Promise.all([
            getDocs(basicDriverQuery),
            getDocs(basicPassengerQuery)
          ]);

          const allRides = [
            ...driverSnapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data(), 
              role: 'driver',
              createdAt: doc.data().createdAt?.toDate() || new Date(0)
            })),
            ...passengerSnapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data(), 
              role: 'passenger',
              createdAt: doc.data().createdAt?.toDate() || new Date(0)
            }))
          ];

          // Sort in memory by creation time
          const uniqueRides = Array.from(
            new Map(allRides.map(ride => [ride.id, ride])).values()
          ).sort((a, b) => b.createdAt - a.createdAt);

          return {
            success: true,
            rides: uniqueRides.slice(0, limitCount)
          };
        } catch (fallbackError) {
          console.error('Error in fallback query:', fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error getting user ride history:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to load ride history',
      details: error.code === 'failed-precondition' ? 
        'Please create the required index in Firebase Console' : 
        undefined
    };
  }
};

// Add a function to migrate existing rides to use friendly IDs
const migrateRidesToFriendlyIds = async () => {
  try {
    const ridesRef = collection(db, 'rides');
    const snapshot = await getDocs(ridesRef);
    const batch = writeBatch(db);
    let migratedCount = 0;

    for (const doc of snapshot.docs) {
      const rideData = doc.data();
      // Skip if the document already has a friendly ID as its ID
      if (doc.id.startsWith('RIDE-')) continue;

      // Generate a new friendly ID
      const friendlyId = await generateRideId();
      
      // Create a new document with the friendly ID
      const newRideRef = doc(db, 'rides', friendlyId);
      batch.set(newRideRef, {
        ...rideData,
        rideId: friendlyId,
        originalDocumentId: doc.id, // Keep track of the original ID
        updatedAt: serverTimestamp()
      });

      // Delete the old document
      batch.delete(doc.ref);
      migratedCount++;
    }

    if (migratedCount > 0) {
      await batch.commit();
      console.log(`Successfully migrated ${migratedCount} rides to friendly IDs`);
    }

    return { 
      success: true, 
      migratedCount,
      message: `Successfully migrated ${migratedCount} rides to friendly IDs`
    };
  } catch (error) {
    console.error('Error migrating rides:', error);
    return { success: false, error };
  }
};

// Update clearUserRideHistory to only clear frontend state
const clearUserRideHistory = async (userId) => {
  // This function now just returns success since we're only clearing frontend state
  return { 
    success: true, 
    message: 'Ride history cleared from view' 
  };
};

// Add new function to send ride invitation
const sendRideInvitation = async (rideId, inviterId, inviteeId) => {
  try {
    console.log('Starting sendRideInvitation with:', {
      rideId,
      inviterId,
      inviteeId,
      timestamp: new Date().toISOString()
    });

    const batch = writeBatch(db);
    
    // Get inviter's and invitee's profile information
    console.log('Fetching user profiles...');
    const [inviterDoc, inviteeDoc] = await Promise.all([
      getDoc(doc(db, 'users', inviterId)),
      getDoc(doc(db, 'users', inviteeId))
    ]);

    if (!inviterDoc.exists() || !inviteeDoc.exists()) {
      console.error('User profile not found:', {
        inviterExists: inviterDoc.exists(),
        inviteeExists: inviteeDoc.exists()
      });
      throw new Error('User profile not found');
    }

    const inviterData = inviterDoc.data();
    const inviteeData = inviteeDoc.data();

    console.log('User profiles found:', {
      inviterName: inviterData.displayName,
      inviteeName: inviteeData.displayName
    });

    // Create invitation document
    const invitationRef = doc(collection(db, 'rideInvitations'));
    console.log('Creating invitation document with ID:', invitationRef.id);

    const invitationData = {
      rideId,
      inviterId,
      inviteeId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Include inviter's information
      inviterName: inviterData.displayName,
      inviterPhotoURL: inviterData.photoURL,
      // Include invitee's information
      inviteeName: inviteeData.displayName,
      inviteePhotoURL: inviteeData.photoURL,
      // Add metadata
      metadata: {
        invitationType: 'friend',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        notificationSent: false
      }
    };

    console.log('Setting invitation data:', invitationData);
    batch.set(invitationRef, invitationData);

    // Add invitation reference to the ride document
    const rideRef = doc(db, 'rides', rideId);
    console.log('Updating ride document with invitation reference');
    
    const invitationReference = {
      invitationId: invitationRef.id,
      inviteeId,
      status: 'pending',
      createdAt: serverTimestamp()
    };

    console.log('Adding invitation reference to ride:', invitationReference);
    batch.update(rideRef, {
      invitations: arrayUnion(invitationReference)
    });

    // Create notification for the invitee
    const notificationRef = doc(collection(db, 'notifications'));
    console.log('Creating notification for invitee');
    
    const notificationData = {
      userId: inviteeId,
      type: 'ride-invitation',
      title: 'New Ride Invitation',
      message: `${inviterData.displayName} invited you to join their ride`,
      rideId,
      invitationId: invitationRef.id,
      createdAt: serverTimestamp(),
      isRead: false,
      metadata: {
        inviterId,
        inviterName: inviterData.displayName,
        inviterPhotoURL: inviterData.photoURL
      }
    };

    console.log('Setting notification data:', notificationData);
    batch.set(notificationRef, notificationData);

    console.log('Committing batch write...');
    await batch.commit();
    console.log('Batch write committed successfully');

    return { success: true, invitationId: invitationRef.id };
  } catch (error) {
    console.error('Error in sendRideInvitation:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      rideId,
      inviterId,
      inviteeId,
      timestamp: new Date().toISOString()
    });
    return { success: false, error };
  }
};

// Add function to update ride invitation status
const updateRideInvitation = async (invitationId, status) => {
  try {
    const batch = writeBatch(db);
    const invitationRef = doc(db, 'rideInvitations', invitationId);
    const invitationDoc = await getDoc(invitationRef);
    
    if (!invitationDoc.exists()) {
      throw new Error('Invitation not found');
    }

    const invitationData = invitationDoc.data();
    const { rideId, inviterId, inviteeId } = invitationData;

    // Update invitation status
    batch.update(invitationRef, {
      status,
      updatedAt: serverTimestamp()
    });

    // Update invitation status in the ride document
    const rideRef = doc(db, 'rides', rideId);
    const rideDoc = await getDoc(rideRef);
    
    if (rideDoc.exists()) {
      const rideData = rideDoc.data();
      const updatedInvitations = rideData.invitations?.map(inv => 
        inv.invitationId === invitationId 
          ? { ...inv, status, updatedAt: serverTimestamp() }
          : inv
      ) || [];

      batch.update(rideRef, { invitations: updatedInvitations });

      // If invitation is accepted, add invitee to passengers
      if (status === 'accepted') {
        const inviteeDoc = await getDoc(doc(db, 'users', inviteeId));
        if (inviteeDoc.exists()) {
          const inviteeData = inviteeDoc.data();
          const newPassenger = {
            uid: inviteeId,
            name: inviteeData.displayName,
            photoURL: inviteeData.photoURL,
            status: 'pending',
            addedAt: serverTimestamp()
          };

          batch.update(rideRef, {
            passengers: arrayUnion(newPassenger),
            passengerUids: arrayUnion(inviteeId)
          });
        }
      }
    }

    // Create notification for the inviter
    const notificationRef = doc(collection(db, 'notifications'));
    batch.set(notificationRef, {
      userId: inviterId,
      type: 'invitation-response',
      title: 'Ride Invitation Response',
      message: `${invitationData.inviteeName} ${status === 'accepted' ? 'accepted' : 'declined'} your ride invitation`,
      rideId,
      invitationId,
      createdAt: serverTimestamp(),
      isRead: false,
      metadata: {
        inviteeId,
        inviteeName: invitationData.inviteeName,
        status
      }
    });

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error updating ride invitation:', error);
    return { success: false, error };
  }
};

// Add function to get user's pending ride invitations
const getPendingRideInvitations = async (userId) => {
  try {
    // First try the optimized query with ordering
    const invitationsQuery = query(
      collection(db, 'rideInvitations'),
      where('inviteeId', '==', userId),
      where('status', '==', 'pending'),
      where('metadata.expiresAt', '>', new Date()),
      orderBy('metadata.expiresAt', 'asc')
    );

    try {
      const snapshot = await getDocs(invitationsQuery);
      const invitations = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const invitationData = doc.data();
          // Get ride details
          const rideDoc = await getDoc(doc(db, 'rides', invitationData.rideId));
          return {
            id: doc.id,
            ...invitationData,
            ride: rideDoc.exists() ? rideDoc.data() : null
          };
        })
      );

      return { success: true, invitations };
    } catch (error) {
      // If we get an index error, fall back to a simpler query
      if (error.code === 'failed-precondition') {
        console.log('Index not ready, falling back to simple query');
        
        // Use a simpler query without ordering and expiration check
        const simpleQuery = query(
          collection(db, 'rideInvitations'),
          where('inviteeId', '==', userId),
          where('status', '==', 'pending')
        );

        const snapshot = await getDocs(simpleQuery);
        const invitations = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const invitationData = doc.data();
            // Filter out expired invitations client-side
            if (invitationData.metadata?.expiresAt?.toDate() < new Date()) {
              return null;
            }
            // Get ride details
            const rideDoc = await getDoc(doc(db, 'rides', invitationData.rideId));
            return {
              id: doc.id,
              ...invitationData,
              ride: rideDoc.exists() ? rideDoc.data() : null
            };
          })
        );

        // Filter out null values and sort by expiration date
        const validInvitations = invitations
          .filter(inv => inv !== null)
          .sort((a, b) => {
            const dateA = a.metadata?.expiresAt?.toDate() || new Date(0);
            const dateB = b.metadata?.expiresAt?.toDate() || new Date(0);
            return dateA - dateB;
          });

        return { 
          success: true, 
          invitations: validInvitations,
          usingFallback: true 
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('Error getting pending ride invitations:', error);
    return { 
      success: false, 
      error,
      details: error.code === 'failed-precondition' ? 
        'Please create the required index in Firebase Console' : 
        undefined
    };
  }
};

// Define deleteRideInvitation function
const deleteRideInvitation = async ({ rideId, inviteeId }) => {
  try {
    // Get references to the ride and invitation documents
    const rideRef = doc(db, 'rides', rideId);
    const invitationRef = doc(db, 'invitations', `${rideId}_${inviteeId}`);

    // Start a batch write
    const batch = writeBatch(db);

    // Delete the invitation document
    batch.delete(invitationRef);

    // Update the ride document to remove the invitee from the participants list
    // and update the invitation status metadata
    const rideDoc = await getDoc(rideRef);
    if (rideDoc.exists()) {
      const rideData = rideDoc.data();
      
      // Remove the invitee from passengers array
      const updatedPassengers = rideData.passengers.filter(
        p => p.uid !== inviteeId
      );

      // Update the invitation status metadata
      const updatedMetadata = { ...rideData.metadata };
      if (updatedMetadata.invitationStatus) {
        // Decrement the appropriate counter based on the invitee's status
        const invitee = rideData.passengers.find(p => p.uid === inviteeId);
        if (invitee && invitee.invitationStatus) {
          updatedMetadata.invitationStatus[invitee.invitationStatus]--;
          updatedMetadata.invitationStatus.total--;
        }
      }

      // Update the ride document
      batch.update(rideRef, {
        passengers: updatedPassengers,
        'metadata.invitationStatus': updatedMetadata.invitationStatus,
        updatedAt: serverTimestamp()
      });
    }

    // Commit the batch
    await batch.commit();

    return { success: true };
  } catch (error) {
    console.error('Error deleting invitation:', error);
    return { 
      success: false, 
      error: {
        message: 'Failed to delete invitation',
        details: error.message
      }
    };
  }
};

// At the end of the file, have a single export statement:
export {
  // User Operations
  createUserProfile,
  updateUserProfile,
  updateUserLocation,
  updateUserOnlineStatus,

  // Group Operations
  createGroup,
  updateGroup,

  // Ride Operations
  createRide,
  updateRide,
  updateRideParticipation,
  endRide,
  leaveRide,
  getRideHistory,
  getUserRideHistory,
  migrateRidesToFriendlyIds,
  clearUserRideHistory,

  // Invitation Operations
  sendRideInvitation,
  updateRideInvitation,
  deleteRideInvitation,
  getPendingRideInvitations,

  // Friend Operations
  sendFriendRequest,
  getMutualFriends,
  updateFriendRequest,
  getFriendRequests,
  getFriendsList,
  searchUsers,
  removeFriendship,
  updateFriendshipMetadata,
  updateRideStatistics,

  // Subscription Operations
  subscribeToFriendRequests,
  subscribeToFriendsList,
  subscribeToUserStatus,

  // Message and Notification Operations
  sendMessage,
  createNotification
}; 