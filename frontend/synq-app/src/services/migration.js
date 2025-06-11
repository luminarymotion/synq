import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';

export const migrateUserProfiles = async () => {
  try {
    console.log('Starting user profile migration...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const batch = writeBatch(db);
    let migratedCount = 0;
    let errorCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        
        // Skip if already migrated
        if (userData.profile && userData.settings && userData.reputation) {
          console.log(`User ${userDoc.id} already migrated, skipping...`);
          continue;
        }

        // Create new profile structure
        const newProfileData = {
          // Core profile
          profile: {
            displayName: userData.displayName || userData.email?.split('@')[0] || 'User',
            email: userData.email,
            photoURL: userData.photoURL || null,
            phoneNumber: userData.phoneNumber || null,
            bio: userData.bio || '',
            location: userData.location || null,
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
            rideCount: userData.rideCount || 0,
            rating: userData.rating || 0,
            badges: [],
            verification: {
              email: true,
              phone: !!userData.phoneNumber
            }
          }
        };

        // Update user document
        batch.update(doc(db, 'users', userDoc.id), newProfileData);
        migratedCount++;
        
        console.log(`Migrated user ${userDoc.id}`);
      } catch (error) {
        console.error(`Error migrating user ${userDoc.id}:`, error);
        errorCount++;
      }
    }

    // Commit all updates
    await batch.commit();
    
    console.log('Migration completed:', {
      total: usersSnapshot.size,
      migrated: migratedCount,
      errors: errorCount
    });

    return {
      success: true,
      stats: {
        total: usersSnapshot.size,
        migrated: migratedCount,
        errors: errorCount
      }
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      success: false,
      error
    };
  }
};

// Function to check if a user needs migration
export const checkUserMigrationStatus = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { needsMigration: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const needsMigration = !(userData.profile && userData.settings && userData.reputation);

    return {
      needsMigration,
      currentStructure: {
        hasProfile: !!userData.profile,
        hasSettings: !!userData.settings,
        hasReputation: !!userData.reputation
      }
    };
  } catch (error) {
    console.error('Error checking migration status:', error);
    return {
      needsMigration: false,
      error
    };
  }
}; 