import { doc, onSnapshot, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { createNotification } from './firebaseOperations';

// Define valid ride statuses and their transitions
export const RIDE_STATUS = {
  CREATED: 'created',
  FORMING: 'forming',
  READY: 'ready',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ENDED: 'ended'
};

// Define valid status transitions
export const STATUS_TRANSITIONS = {
  [RIDE_STATUS.CREATED]: [RIDE_STATUS.FORMING, RIDE_STATUS.CANCELLED],
  [RIDE_STATUS.FORMING]: [RIDE_STATUS.READY, RIDE_STATUS.CANCELLED],
  [RIDE_STATUS.READY]: [RIDE_STATUS.ACTIVE, RIDE_STATUS.CANCELLED],
  [RIDE_STATUS.ACTIVE]: [RIDE_STATUS.COMPLETED, RIDE_STATUS.ENDED],
  [RIDE_STATUS.COMPLETED]: [],
  [RIDE_STATUS.CANCELLED]: [],
  [RIDE_STATUS.ENDED]: []
};

// Define status metadata
export const STATUS_METADATA = {
  [RIDE_STATUS.CREATED]: {
    label: 'Created',
    description: 'Ride has been created',
    icon: 'fa-plus-circle',
    color: 'info'
  },
  [RIDE_STATUS.FORMING]: {
    label: 'Forming',
    description: 'Waiting for participants to join',
    icon: 'fa-users',
    color: 'primary'
  },
  [RIDE_STATUS.READY]: {
    label: 'Ready',
    description: 'All participants have joined, ready to start',
    icon: 'fa-check-circle',
    color: 'success'
  },
  [RIDE_STATUS.ACTIVE]: {
    label: 'Active',
    description: 'Ride is in progress',
    icon: 'fa-car',
    color: 'success'
  },
  [RIDE_STATUS.COMPLETED]: {
    label: 'Completed',
    description: 'Ride has been completed successfully',
    icon: 'fa-flag-checkered',
    color: 'success'
  },
  [RIDE_STATUS.CANCELLED]: {
    label: 'Cancelled',
    description: 'Ride has been cancelled',
    icon: 'fa-times-circle',
    color: 'danger'
  },
  [RIDE_STATUS.ENDED]: {
    label: 'Ended',
    description: 'Ride has ended',
    icon: 'fa-stop-circle',
    color: 'warning'
  }
};

class RideStatusService {
  constructor() {
    this.statusListeners = new Map();
  }

  // Validate if a status transition is allowed
  isValidTransition(currentStatus, newStatus) {
    if (!STATUS_TRANSITIONS[currentStatus]) {
      console.error(`Invalid current status: ${currentStatus}`);
      return false;
    }
    return STATUS_TRANSITIONS[currentStatus].includes(newStatus);
  }

  // Get status metadata
  getStatusMetadata(status) {
    return STATUS_METADATA[status] || {
      label: 'Unknown',
      description: 'Unknown status',
      icon: 'fa-question-circle',
      color: 'secondary'
    };
  }

  // Update ride status with validation and notifications
  async updateRideStatus(rideId, newStatus, userId, reason = null) {
    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideDoc = await rideRef.get();
      
      if (!rideDoc.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = rideDoc.data();
      const currentStatus = rideData.status;

      // Validate status transition
      if (!this.isValidTransition(currentStatus, newStatus)) {
        throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
      }

      // Create status history entry
      const statusHistoryEntry = {
        status: newStatus,
        timestamp: new Date().toISOString(),
        updatedBy: userId,
        reason: reason || `Status changed to ${newStatus}`,
        previousStatus: currentStatus
      };

      // Update ride document
      await updateDoc(rideRef, {
        status: newStatus,
        statusHistory: arrayUnion(statusHistoryEntry),
        updatedAt: serverTimestamp(),
        lastStatusUpdate: serverTimestamp()
      });

      // Send notifications based on status change
      await this.sendStatusNotifications(rideId, rideData, newStatus, userId, reason);

      return { success: true, status: newStatus };
    } catch (error) {
      console.error('Error updating ride status:', error);
      return { success: false, error: error.message };
    }
  }

  // Send notifications for status changes
  async sendStatusNotifications(rideId, rideData, newStatus, userId, reason) {
    const statusMeta = this.getStatusMetadata(newStatus);
    const notifications = [];

    // Create notification for driver
    if (rideData.driver?.uid && rideData.driver.uid !== userId) {
      notifications.push({
        userId: rideData.driver.uid,
        type: 'ride-status',
        title: `Ride ${statusMeta.label}`,
        message: `Your ride has been ${statusMeta.label.toLowerCase()}`,
        rideId,
        createdAt: new Date(),
        isRead: false,
        metadata: {
          status: newStatus,
          reason,
          updatedBy: userId
        }
      });
    }

    // Create notifications for passengers
    if (rideData.passengers) {
      rideData.passengers.forEach(passenger => {
        if (passenger.uid && passenger.uid !== userId) {
          notifications.push({
            userId: passenger.uid,
            type: 'ride-status',
            title: `Ride ${statusMeta.label}`,
            message: `Your ride has been ${statusMeta.label.toLowerCase()}`,
            rideId,
            createdAt: new Date(),
            isRead: false,
            metadata: {
              status: newStatus,
              reason,
              updatedBy: userId
            }
          });
        }
      });
    }

    // Send all notifications
    await Promise.all(notifications.map(notification => 
      createNotification(notification)
    ));
  }

  // Subscribe to ride status changes
  subscribeToRideStatus(rideId, callback) {
    if (this.statusListeners.has(rideId)) {
      // Unsubscribe from existing listener
      this.statusListeners.get(rideId)();
    }

    const rideRef = doc(db, 'rides', rideId);
    const unsubscribe = onSnapshot(rideRef, (doc) => {
      if (doc.exists()) {
        const rideData = doc.data();
        callback({
          status: rideData.status,
          statusHistory: rideData.statusHistory || [],
          lastUpdate: rideData.lastStatusUpdate,
          metadata: this.getStatusMetadata(rideData.status)
        });
      }
    }, (error) => {
      console.error('Error in ride status subscription:', error);
      callback({ error: error.message });
    });

    this.statusListeners.set(rideId, unsubscribe);
    return unsubscribe;
  }

  // Unsubscribe from ride status changes
  unsubscribeFromRideStatus(rideId) {
    if (this.statusListeners.has(rideId)) {
      this.statusListeners.get(rideId)();
      this.statusListeners.delete(rideId);
    }
  }

  // Get ride status history
  async getRideStatusHistory(rideId) {
    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideDoc = await rideRef.get();
      
      if (!rideDoc.exists()) {
        throw new Error('Ride not found');
      }

      const rideData = rideDoc.data();
      return {
        success: true,
        history: rideData.statusHistory || [],
        currentStatus: rideData.status,
        metadata: this.getStatusMetadata(rideData.status)
      };
    } catch (error) {
      console.error('Error getting ride status history:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const rideStatusService = new RideStatusService();

// Export the service as default
export default rideStatusService; 