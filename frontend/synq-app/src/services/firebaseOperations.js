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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';

// User Operations
export const createUserProfile = async (userId, userData) => {
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

export const updateUserProfile = async (userId, userData) => {
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
export const createGroup = async (groupData) => {
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

export const updateGroup = async (groupId, groupData) => {
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

// Ride Operations
export const createRide = async (rideData) => {
  try {
    const rideRef = doc(collection(db, 'rides'));
    await setDoc(rideRef, {
      ...rideData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, rideId: rideRef.id };
  } catch (error) {
    console.error('Error creating ride:', error);
    return { success: false, error };
  }
};

export const updateRide = async (rideId, rideData) => {
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
export const updateRideParticipation = async (rideId, userId, status) => {
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
export const updateUserLocation = async (userId, location) => {
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
export const sendMessage = async (groupId, messageData) => {
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
export const createNotification = async (userId, notificationData) => {
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
export const sendFriendRequest = async (senderId, receiverId) => {
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

export const updateFriendRequest = async (requestId, status) => {
  try {
    const requestRef = doc(db, 'friendRequests', requestId);
    await updateDoc(requestRef, {
      status,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating friend request:', error);
    return { success: false, error };
  }
};

export const getFriendRequests = async (userId) => {
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

export const getFriendsList = async (userId) => {
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

export const searchUsers = async (searchTerm) => {
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