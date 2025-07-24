const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

/**
 * Check phone numbers for all users
 */
const checkPhoneNumbers = async () => {
  try {
    console.log('Checking phone numbers for all users...');
    
    const usersSnapshot = await db.collection('users').get();
    let totalUsers = 0;
    let usersWithPhone = 0;
    let usersWithFormattedPhone = 0;
    let usersWithoutPhone = 0;
    
    console.log(`\n📋 User Phone Number Status:`);
    console.log(`Total users: ${usersSnapshot.size}\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      totalUsers++;
      const userData = userDoc.data();
      const phoneNumber = userData.profile?.phoneNumber;
      const displayName = userData.profile?.displayName || 'No name';
      
      if (!phoneNumber) {
        console.log(`❌ ${displayName} (${userDoc.id}): No phone number`);
        usersWithoutPhone++;
      } else if (phoneNumber.startsWith('+')) {
        console.log(`✅ ${displayName} (${userDoc.id}): ${phoneNumber} (E.164 formatted)`);
        usersWithFormattedPhone++;
        usersWithPhone++;
      } else {
        console.log(`⚠️  ${displayName} (${userDoc.id}): ${phoneNumber} (needs formatting)`);
        usersWithPhone++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with phone numbers: ${usersWithPhone}`);
    console.log(`Users with E.164 formatted phones: ${usersWithFormattedPhone}`);
    console.log(`Users without phone numbers: ${usersWithoutPhone}`);
    
  } catch (error) {
    console.error('Error checking phone numbers:', error);
  }
};

// Run the check
checkPhoneNumbers(); 