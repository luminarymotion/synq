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
    await setDoc(userRef, {
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true };
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