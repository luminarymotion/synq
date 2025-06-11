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
    
    // Handle both nested and flat profile data structures
    const email = userData.profile?.email || userData.email;
    const displayName = userData.profile?.displayName || userData.displayName || email?.split('@')[0] || 'User';
    const photoURL = userData.profile?.photoURL || userData.photoURL || null;
    const phoneNumber = userData.profile?.phoneNumber || userData.phoneNumber || null;
    const bio = userData.profile?.bio || userData.bio || '';
    const location = userData.profile?.location || userData.location || null;

    const profileData = {
      profile: {
        email,
        displayName,
        photoURL,
        phoneNumber,
        bio,
        location,
        setupComplete: false,
        social: {
          interests: [],
          preferredRoutes: [],
          availability: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
          }
        }
      },
      
      // Settings and preferences
      settings: {
        privacy: {
          profileVisibility: 'friends',
          showOnlineStatus: true,
          showRideHistory: true,
          allowRideInvites: true,
          allowFriendRequests: true,
          allowCommunityInvites: true
        },
        notifications: {
          friendRequests: true,
          rideInvites: true,
          communityUpdates: true,
          friendActivity: true
        },
        ridePreferences: {
          music: true,
          conversation: true,
          carType: 'any',
          smoking: false,
          pets: false,
          maxPassengers: 4
        }
      },
      
      // Trust and reputation
      reputation: {
        trustScore: 0,
        rideCount: 0,
        rating: 0,
        badges: [],
        verification: {
          email: true,
          phone: false
        }
      },
      
      // Metadata
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
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
const sendFriendRequest = async (senderId, receiverId, message = '') => {
  try {
    // Check if users exist
    const [senderDoc, receiverDoc] = await Promise.all([
      getDoc(doc(db, 'users', senderId)),
      getDoc(doc(db, 'users', receiverId))
    ]);

    if (!senderDoc.exists() || !receiverDoc.exists()) {
      throw new Error('User not found');
    }

    // Check receiver's privacy settings
    const receiverData = receiverDoc.data();
    if (receiverData.settings?.privacy?.allowFriendRequests === false) {
      throw new Error('User is not accepting friend requests');
    }

    // Create friend request
    const requestRef = doc(collection(db, 'friendRequests'));
    const requestData = {
      id: requestRef.id,
      senderId,
      receiverId,
      status: 'pending',
      message: message.trim(),
      senderProfile: {
        displayName: senderDoc.data().profile.displayName,
        photoURL: senderDoc.data().profile.photoURL,
        email: senderDoc.data().profile.email
      },
      metadata: {
      createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    };

    await setDoc(requestRef, requestData);

    // Create notification for receiver
    await createNotification({
      userId: receiverId,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${requestData.senderProfile.displayName} sent you a friend request`,
      data: {
        requestId: requestRef.id,
        senderId,
        senderName: requestData.senderProfile.displayName
      }
    });

    return { success: true, requestId: requestRef.id };
  } catch (error) {
    console.error('Error sending friend request:', error);
    return { success: false, error };
  }
};

const updateFriendRequest = async (requestId, status, userId) => {
  try {
    const requestRef = doc(db, 'friendRequests', requestId);
    const requestDoc = await getDoc(requestRef);
    
    if (!requestDoc.exists()) {
      throw new Error('Friend request not found');
    }

    const requestData = requestDoc.data();
    if (requestData.receiverId !== userId) {
      throw new Error('Not authorized to update this request');
    }

    const updates = {
      status,
      updatedAt: serverTimestamp()
    };

    if (status === 'accepted') {
      // Create friendship relationship
      const relationshipRef = doc(collection(db, 'relationships'));
      const relationshipData = {
        id: relationshipRef.id,
        type: 'friend',
        status: 'active',
        users: [requestData.senderId, requestData.receiverId],
        metadata: {
          createdAt: serverTimestamp(),
          lastInteraction: serverTimestamp(),
          communityId: null, // Will be set when users join a community
          communityRole: null // Will be set when users join a community
        }
      };

      await setDoc(relationshipRef, relationshipData);

      // Create notifications for both users
      await Promise.all([
        createNotification({
          userId: requestData.senderId,
          type: 'friend_request_accepted',
          title: 'Friend Request Accepted',
          message: `${requestData.receiverProfile.displayName} accepted your friend request`,
          data: {
            requestId,
            receiverId: requestData.receiverId,
            receiverName: requestData.receiverProfile.displayName
          }
        }),
        createNotification({
          userId: requestData.receiverId,
          type: 'friend_added',
          title: 'New Friend Added',
          message: `You are now friends with ${requestData.senderProfile.displayName}`,
          data: {
            requestId,
            senderId: requestData.senderId,
            senderName: requestData.senderProfile.displayName
          }
        })
      ]);
    } else if (status === 'rejected') {
      await createNotification({
        userId: requestData.senderId,
        type: 'friend_request_rejected',
        title: 'Friend Request Rejected',
        message: `${requestData.receiverProfile.displayName} declined your friend request`,
        data: {
          requestId,
          receiverId: requestData.receiverId,
          receiverName: requestData.receiverProfile.displayName
        }
      });
    }

    await updateDoc(requestRef, updates);
    return { success: true };
  } catch (error) {
    console.error('Error updating friend request:', error);
    return { success: false, error };
  }
};

const getFriendsList = async (userId) => {
  try {
    // Get active friendships where user is a participant
    const relationshipsQuery = query(
      collection(db, 'relationships'),
      where('users', 'array-contains', userId),
      where('status', '==', 'active'),
      where('type', '==', 'friend')
    );

    const relationshipsSnapshot = await getDocs(relationshipsQuery);
    const friendIds = relationshipsSnapshot.docs.map(doc => {
      const data = doc.data();
      return data.users.find(id => id !== userId);
    });

    // Get friend profiles
    const friendProfiles = await Promise.all(
      friendIds.map(async (friendId) => {
        const userDoc = await getDoc(doc(db, 'users', friendId));
        const userData = userDoc.data();
        const relationship = relationshipsSnapshot.docs.find(doc => 
          doc.data().users.includes(friendId)
        ).data();

        return {
          id: friendId,
          profile: userData.profile,
          relationship: {
            id: relationship.id,
            communityId: relationship.metadata.communityId,
            communityRole: relationship.metadata.communityRole,
            addedAt: relationship.metadata.createdAt,
            lastInteraction: relationship.metadata.lastInteraction
          },
          isOnline: userData.isOnline,
          lastSeen: userData.lastSeen
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

const updateRelationshipCommunity = async (relationshipId, communityId, communityRole, userId) => {
  try {
    const relationshipRef = doc(db, 'relationships', relationshipId);
    const relationshipDoc = await getDoc(relationshipRef);
    
    if (!relationshipDoc.exists()) {
      throw new Error('Relationship not found');
    }

    const relationshipData = relationshipDoc.data();
    
    // Verify user is part of the relationship
    if (!relationshipData.users.includes(userId)) {
      throw new Error('Not authorized to update this relationship');
    }

    // Get the other user's ID for notification
    const otherUserId = relationshipData.users.find(id => id !== userId);
    
    // Update relationship
    await updateDoc(relationshipRef, {
      'metadata.communityId': communityId,
      'metadata.communityRole': communityRole,
      'metadata.lastInteraction': serverTimestamp()
    });

    // Get user profiles for notifications
    const [userDoc, otherUserDoc] = await Promise.all([
      getDoc(doc(db, 'users', userId)),
      getDoc(doc(db, 'users', otherUserId))
    ]);

    // Create notifications for both users
    await Promise.all([
      createNotification({
        userId: otherUserId,
        type: 'community_update',
        title: 'Community Update',
        message: communityId 
          ? `${userDoc.data().profile.displayName} added you to a community`
          : `${userDoc.data().profile.displayName} removed you from a community`,
        data: {
          relationshipId,
          communityId,
          communityRole,
          updatedBy: userId,
          updatedByName: userDoc.data().profile.displayName
        }
      }),
      createNotification({
        userId,
        type: 'community_update',
        title: 'Community Update',
        message: communityId
          ? `You added ${otherUserDoc.data().profile.displayName} to a community`
          : `You removed ${otherUserDoc.data().profile.displayName} from a community`,
        data: {
          relationshipId,
          communityId,
          communityRole,
          otherUserId,
          otherUserName: otherUserDoc.data().profile.displayName
        }
      })
    ]);

    return { success: true };
  } catch (error) {
    console.error('Error updating relationship community:', error);
    return { success: false, error };
  }
};

const removeFriendship = async (userId, friendId) => {
  try {
    const relationshipQuery = query(
      collection(db, 'relationships'),
      where('users', 'array-contains', userId),
      where('status', '==', 'active'),
      where('type', '==', 'friend')
    );

    const relationshipSnapshot = await getDocs(relationshipQuery);
    if (relationshipSnapshot.empty) {
      throw new Error('Friendship not found');
    }

    const relationshipDoc = relationshipSnapshot.docs[0];
    const relationshipData = relationshipDoc.data();

    // Update relationship status
    await updateDoc(relationshipDoc.ref, {
      status: 'removed',
      'metadata.removedAt': serverTimestamp(),
      'metadata.removedBy': userId
    });

    // Get user profiles for notifications
    const [userDoc, friendDoc] = await Promise.all([
      getDoc(doc(db, 'users', userId)),
      getDoc(doc(db, 'users', friendId))
    ]);

    // Create notifications
    await Promise.all([
      createNotification({
        userId: friendId,
        type: 'friend_removed',
        title: 'Friend Removed',
        message: `${userDoc.data().profile.displayName} removed you from their friends`,
        data: {
          userId,
          userName: userDoc.data().profile.displayName
        }
      }),
      createNotification({
        userId,
        type: 'friend_removed',
        title: 'Friend Removed',
        message: `You removed ${friendDoc.data().profile.displayName} from your friends`,
        data: {
          friendId,
          friendName: friendDoc.data().profile.displayName
        }
      })
    ]);

    return { success: true };
  } catch (error) {
    console.error('Error removing friendship:', error);
    return { success: false, error };
  }
};

// Search Operations
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
  if (!userId) {
    console.error('User ID is required for friends list subscription');
    callback({ success: false, error: 'User ID is required' });
    return () => {};
  }

  try {
    console.log('Setting up friends list subscription for user:', userId);
    const relationshipsQuery = query(
      collection(db, 'relationships'),
      where('users', 'array-contains', userId),
      where('status', '==', 'active'),
      where('type', '==', 'friend')
    );
    
    return onSnapshot(relationshipsQuery, 
      async (snapshot) => {
        try {
          console.log('Friends list snapshot received:', {
            size: snapshot.size,
            empty: snapshot.empty,
            metadata: snapshot.metadata
          });

          // Get all friend IDs from relationships
          const friendIds = snapshot.docs.map(doc => {
            const data = doc.data();
            // Validate document structure
            if (!data.users || !Array.isArray(data.users) || data.users.length !== 2) {
              console.error('Invalid relationship document structure:', doc.id);
              return null;
            }
            return data.users.find(id => id !== userId);
          }).filter(Boolean); // Remove any null values

          if (friendIds.length === 0) {
            callback({ success: true, friends: [] });
            return;
          }

          // Get friend profiles
          const friendProfiles = await Promise.all(
            friendIds.map(async (friendId) => {
              try {
                const userDoc = await getDoc(doc(db, 'users', friendId));
                if (!userDoc.exists()) {
                  console.log('Friend profile not found:', friendId);
                  return null;
                }

                const userData = userDoc.data();
                const relationship = snapshot.docs.find(doc => 
                  doc.data().users.includes(friendId)
                );

                if (!relationship) {
                  console.error('Relationship not found for friend:', friendId);
                  return null;
                }

                const relationshipData = relationship.data();
                // Validate relationship metadata
                if (!relationshipData.metadata || 
                    !relationshipData.metadata.createdAt || 
                    !relationshipData.metadata.lastInteraction) {
                  console.error('Invalid relationship metadata:', relationship.id);
                  return null;
                }

                return {
                  id: friendId,
                  profile: userData.profile || {
                    displayName: 'Unknown User',
                    email: null,
                    photoURL: null
                  },
                  relationship: {
                    id: relationship.id,
                    communityId: relationshipData.metadata.communityId || null,
                    communityRole: relationshipData.metadata.communityRole || null,
                    addedAt: relationshipData.metadata.createdAt,
                    lastInteraction: relationshipData.metadata.lastInteraction
                  },
                  isOnline: userData.isOnline || false,
                  lastSeen: userData.lastSeen || null
                };
              } catch (error) {
                console.error('Error fetching friend profile:', friendId, error);
                return null;
              }
            })
          );

          // Filter out any null profiles (deleted users or invalid data)
          const validFriends = friendProfiles.filter(profile => profile !== null);
          console.log('Friends list processed:', {
            total: friendIds.length,
            valid: validFriends.length
          });
          callback({ success: true, friends: validFriends });
        } catch (error) {
          console.error('Error processing friends list:', error);
          callback({ 
            success: false, 
            error: error.message || 'Failed to process friends list'
          });
        }
      },
      (error) => {
        console.error('Error in friends list subscription:', error);
        callback({ 
          success: false, 
          error: error.message || 'Failed to subscribe to friends list'
        });
      }
    );
  } catch (error) {
    console.error('Error setting up friends list subscription:', error);
    callback({ 
      success: false, 
      error: error.message || 'Failed to set up friends list subscription'
    });
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

// Add function to update user settings
const updateUserSettings = async (userId, settings) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'settings': settings,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating user settings:', error);
    return { success: false, error };
  }
};

// Add new function to update user reputation
const updateUserReputation = async (userId, reputationData) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'reputation': reputationData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating user reputation:', error);
    return { success: false, error };
  }
};

const checkFriendshipStatus = async (userId1, userId2) => {
  try {
    const relationshipsQuery = query(
      collection(db, 'relationships'),
      where('users', 'array-contains', userId1),
      where('status', '==', 'active'),
      where('type', '==', 'friend')
    );

    const snapshot = await getDocs(relationshipsQuery);
    const friendship = snapshot.docs.find(doc => {
      const data = doc.data();
      return data.users.includes(userId2);
    });

    return {
      success: true,
      areFriends: !!friendship,
      friendshipId: friendship?.id,
      metadata: friendship ? {
        communityId: friendship.data().metadata.communityId,
        communityRole: friendship.data().metadata.communityRole,
        lastInteraction: friendship.data().metadata.lastInteraction
      } : null
    };
  } catch (error) {
    console.error('Error checking friendship status:', error);
    return { success: false, error };
  }
};

// Add getUserRideHistory function
const getUserRideHistory = async (userId) => {
  try {
    // Calculate timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Query for rides where user is driver
    const driverQuery = query(
      collection(db, 'rides'),
      where('driver.uid', '==', userId),
      where('createdAt', '>=', twentyFourHoursAgo),
      orderBy('createdAt', 'desc')
    );

    // Query for rides where user is passenger
    const passengerQuery = query(
      collection(db, 'rides'),
      where('passengerUids', 'array-contains', userId),
      where('createdAt', '>=', twentyFourHoursAgo),
      orderBy('createdAt', 'desc')
    );

    // Get both driver and passenger rides
      const [driverSnapshot, passengerSnapshot] = await Promise.all([
        getDocs(driverQuery),
        getDocs(passengerQuery)
      ]);

    // Combine and process the results
    const rides = [
        ...driverSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
        role: 'driver'
        })),
        ...passengerSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
        role: 'passenger'
        }))
      ];

    // Sort by creation time (most recent first)
    rides.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

    return { success: true, rides };
    } catch (error) {
    console.error('Error getting user ride history:', error);
    return { success: false, error: error.message };
  }
};

// Add getMutualFriends function
const getMutualFriends = async (userId1, userId2) => {
  try {
    // Get all friends of user1
    const user1FriendsQuery = query(
      collection(db, 'relationships'),
      where('users', 'array-contains', userId1),
      where('status', '==', 'active'),
      where('type', '==', 'friend')
    );

    // Get all friends of user2
    const user2FriendsQuery = query(
      collection(db, 'relationships'),
      where('users', 'array-contains', userId2),
      where('status', '==', 'active'),
      where('type', '==', 'friend')
    );

    // Get both friend lists
    const [user1Snapshot, user2Snapshot] = await Promise.all([
      getDocs(user1FriendsQuery),
      getDocs(user2FriendsQuery)
    ]);

    // Get friend IDs for both users
    const user1FriendIds = user1Snapshot.docs.map(doc => {
      const data = doc.data();
      return data.users.find(id => id !== userId1);
    });

    const user2FriendIds = user2Snapshot.docs.map(doc => {
      const data = doc.data();
      return data.users.find(id => id !== userId2);
    });

    // Find mutual friends (intersection of both friend lists)
    const mutualFriendIds = user1FriendIds.filter(id => user2FriendIds.includes(id));

    // Get profiles for mutual friends
    const mutualFriends = await Promise.all(
      mutualFriendIds.map(async (friendId) => {
        const userDoc = await getDoc(doc(db, 'users', friendId));
        if (!userDoc.exists()) return null;
        
        const userData = userDoc.data();
          return {
          id: friendId,
          displayName: userData.profile.displayName,
          photoURL: userData.profile.photoURL,
          isOnline: userData.isOnline,
          lastSeen: userData.lastSeen
        };
      })
    );

    // Filter out any null profiles (deleted users)
    const validMutualFriends = mutualFriends.filter(friend => friend !== null);

    return { 
      success: true, 
      mutualFriends: validMutualFriends 
    };
  } catch (error) {
    console.error('Error getting mutual friends:', error);
    return { success: false, error: error.message };
  }
};

// At the end of the file, update the export statement:
export {
  // User Operations
  createUserProfile,
  updateUserProfile,
  updateUserLocation,
  updateUserOnlineStatus,
  updateUserSettings,
  updateUserReputation,

  // Group Operations
  createGroup,
  updateGroup,

  // Ride Operations
  createRide,
  updateRide,
  updateRideParticipation,

  // Friend Operations
  sendFriendRequest,
  updateFriendRequest,
  getFriendsList,
  updateRelationshipCommunity,
  removeFriendship,
  checkFriendshipStatus,

  // Subscription Operations
  subscribeToFriendRequests,
  subscribeToFriendsList,
  subscribeToUserStatus,

  // Message and Notification Operations
  sendMessage,
  createNotification,

  // Search Operations
  searchUsers,

  // New function
  getUserRideHistory,

  // New function
  getMutualFriends
}; 