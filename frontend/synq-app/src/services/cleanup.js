import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  writeBatch,
  query,
  where
} from 'firebase/firestore';

export const cleanupFriendSystem = async () => {
  try {
    console.log('Starting friend system cleanup...');
    const batch = writeBatch(db);
    let deletedCount = 0;
    let errorCount = 0;

    // 1. Clear friend requests
    console.log('Clearing friend requests...');
    const friendRequestsSnapshot = await getDocs(collection(db, 'friendRequests'));
    for (const doc of friendRequestsSnapshot.docs) {
      try {
        batch.delete(doc.ref);
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting friend request ${doc.id}:`, error);
        errorCount++;
      }
    }

    // 2. Clear friends subcollection from all users
    console.log('Clearing friends subcollections...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    for (const userDoc of usersSnapshot.docs) {
      try {
        const friendsSnapshot = await getDocs(collection(db, 'users', userDoc.id, 'friends'));
        for (const friendDoc of friendsSnapshot.docs) {
          batch.delete(friendDoc.ref);
          deletedCount++;
        }
      } catch (error) {
        console.error(`Error clearing friends for user ${userDoc.id}:`, error);
        errorCount++;
      }
    }

    // 3. Update user documents to remove friend-related metadata
    console.log('Updating user documents...');
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const updates = {};
        
        // Remove friend-related fields if they exist
        if (userData.friendCount) updates.friendCount = 0;
        if (userData.pendingFriendRequests) updates.pendingFriendRequests = 0;
        if (userData.friendMetadata) updates.friendMetadata = {};
        
        if (Object.keys(updates).length > 0) {
          batch.update(userDoc.ref, updates);
        }
      } catch (error) {
        console.error(`Error updating user ${userDoc.id}:`, error);
        errorCount++;
      }
    }

    // Commit all changes
    await batch.commit();
    
    console.log('Cleanup completed:', {
      deletedDocuments: deletedCount,
      errors: errorCount
    });

    return {
      success: true,
      stats: {
        deletedDocuments: deletedCount,
        errors: errorCount
      }
    };
  } catch (error) {
    console.error('Cleanup failed:', error);
    return {
      success: false,
      error
    };
  }
};

// Function to verify cleanup
export const verifyCleanup = async () => {
  try {
    const stats = {
      friendRequests: 0,
      friendsSubcollections: 0,
      usersWithFriendMetadata: 0
    };

    // Check friend requests
    const friendRequestsSnapshot = await getDocs(collection(db, 'friendRequests'));
    stats.friendRequests = friendRequestsSnapshot.size;

    // Check friends subcollections
    const usersSnapshot = await getDocs(collection(db, 'users'));
    for (const userDoc of usersSnapshot.docs) {
      const friendsSnapshot = await getDocs(collection(db, 'users', userDoc.id, 'friends'));
      if (friendsSnapshot.size > 0) {
        stats.friendsSubcollections++;
      }

      // Check for friend metadata
      const userData = userDoc.data();
      if (userData.friendCount || userData.pendingFriendRequests || userData.friendMetadata) {
        stats.usersWithFriendMetadata++;
      }
    }

    return {
      success: true,
      stats,
      isClean: stats.friendRequests === 0 && 
               stats.friendsSubcollections === 0 && 
               stats.usersWithFriendMetadata === 0
    };
  } catch (error) {
    console.error('Verification failed:', error);
    return {
      success: false,
      error
    };
  }
}; 