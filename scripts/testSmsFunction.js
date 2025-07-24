const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

/**
 * Test the SMS function by creating a test notification
 */
const testSmsFunction = async () => {
  try {
    console.log('🧪 Testing SMS Function...');
    
    // First, let's check if we have any users with phone numbers
    const usersSnapshot = await db.collection('users').get();
    let testUser = null;
    
    console.log(`\n📋 Checking ${usersSnapshot.size} users for phone numbers...`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const phoneNumber = userData.profile?.phoneNumber;
      const displayName = userData.profile?.displayName || 'Test User';
      
      if (phoneNumber && phoneNumber.startsWith('+')) {
        testUser = {
          id: userDoc.id,
          displayName,
          phoneNumber
        };
        console.log(`✅ Found test user: ${displayName} (${phoneNumber})`);
        break;
      }
    }
    
    if (!testUser) {
      console.log('❌ No users with properly formatted phone numbers found.');
      console.log('Please ensure at least one user has a phone number in E.164 format (+1XXXXXXXXXX)');
      return;
    }
    
    // Create a test ride
    console.log('\n🚗 Creating test ride...');
    const testRide = {
      destination: {
        address: '123 Test Street, Test City, TC 12345'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: testUser.id,
      status: 'active'
    };
    
    const rideRef = await db.collection('rides').add(testRide);
    console.log(`✅ Test ride created: ${rideRef.id}`);
    
    // Create a test notification that will trigger SMS
    console.log('\n📱 Creating test notification...');
    const testNotification = {
      type: 'ride-invitation',
      userId: testUser.id,
      rideId: rideRef.id,
      metadata: {
        inviterName: 'Test Inviter',
        smsSent: false
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    };
    
    const notificationRef = await db.collection('notifications').add(testNotification);
    console.log(`✅ Test notification created: ${notificationRef.id}`);
    
    console.log('\n🎯 SMS Function Test Complete!');
    console.log('The sendSmsNotification function should now be triggered.');
    console.log('Check the Firebase Functions logs to see the SMS sending process:');
    console.log('firebase functions:log --only sendSmsNotification');
    
    // Clean up test data after a delay
    setTimeout(async () => {
      try {
        await rideRef.delete();
        await notificationRef.delete();
        console.log('\n🧹 Test data cleaned up');
      } catch (error) {
        console.log('Cleanup error (this is normal):', error.message);
      }
    }, 30000); // 30 seconds
    
  } catch (error) {
    console.error('❌ Error testing SMS function:', error);
  }
};

// Run the test
testSmsFunction(); 