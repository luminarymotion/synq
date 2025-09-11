import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Create a new notification
export const createNotification = async (notificationData) => {
  try {
    console.log('🔔 Creating notification with data:', notificationData);
    
    const notification = {
      ...notificationData,
      createdAt: serverTimestamp(),
      read: false,
      type: notificationData.type || 'general'
    };

    console.log('📝 Final notification object:', notification);

    const docRef = await addDoc(collection(db, 'notifications'), notification);
    console.log('✅ Notification created successfully in Firestore:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating notification in Firestore:', error);
    throw error;
  }
};

// Create ride invitation notification
export const createRideInvitationNotification = async (recipientId, rideData, inviterName) => {
  try {
    console.log('🎯 Creating ride invitation notification:', {
      recipientId,
      inviterName,
      rideId: rideData.id,
      destination: rideData.destination?.address || 'a destination'
    });

    const notification = {
      userId: recipientId,
      type: 'ride_invitation',
      title: 'New Ride Invitation',
      message: `${inviterName} has invited you to join a ride to ${rideData.destination?.address || 'a destination'}`,
      metadata: {
        rideId: rideData.id,
        inviterId: rideData.createdBy || rideData.creatorId,
        inviterName: inviterName,
        destination: rideData.destination
      },
      createdAt: serverTimestamp(),
      read: false
    };

    console.log('📝 Notification data:', notification);

    const result = await createNotification(notification);
    console.log('✅ Ride invitation notification created successfully:', result);
    
    // Additional debugging to verify the notification was actually created
    console.log('🔍 Verifying notification creation:', {
      notificationId: result?.id,
      recipientId: recipientId,
      type: notification.type,
      title: notification.title
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error creating ride invitation notification:', error);
    throw error;
  }
};

// Create ride update notification
export const createRideUpdateNotification = async (recipientId, rideData, updateType, updaterName) => {
  try {
    let title, message;
    
    switch (updateType) {
      case 'status_change':
        title = 'Ride Status Updated';
        message = `${updaterName} has updated the ride status to ${rideData.status}`;
        break;
      case 'route_change':
        title = 'Ride Route Updated';
        message = `${updaterName} has updated the ride route`;
        break;
      case 'time_change':
        title = 'Ride Time Updated';
        message = `${updaterName} has updated the ride time`;
        break;
      case 'cancelled':
        title = 'Ride Cancelled';
        message = `${updaterName} has cancelled the ride`;
        break;
      default:
        title = 'Ride Updated';
        message = `${updaterName} has made changes to the ride`;
    }

    const notification = {
      userId: recipientId,
      type: 'ride_update',
      title,
      message,
      rideId: rideData.id,
      updaterId: rideData.updatedBy || rideData.createdBy,
      updaterName,
      updateType,
      createdAt: serverTimestamp(),
      read: false
    };

    return await createNotification(notification);
  } catch (error) {
    console.error('Error creating ride update notification:', error);
    throw error;
  }
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      read: true,
      readAt: serverTimestamp()
    });
    
    console.log('Notification marked as read:', notificationId);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

// Mark all notifications as read for a user
export const markAllNotificationsAsRead = async (userId) => {
  try {
    // This would require a batch update or multiple individual updates
    // For now, we'll implement this when needed
    console.log('Marking all notifications as read for user:', userId);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

// Delete notification
export const deleteNotification = async (notificationId) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
    
    console.log('Notification deleted:', notificationId);
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};
