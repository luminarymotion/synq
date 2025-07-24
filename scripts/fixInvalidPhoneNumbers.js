const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

/**
 * Fixes invalid phone numbers in the database
 */
const fixInvalidPhoneNumbers = async () => {
  try {
    console.log('🔍 Scanning for users with invalid phone numbers...');
    
    const usersSnapshot = await db.collection('users').get();
    let totalUsers = 0;
    let usersWithInvalidPhone = 0;
    let usersWithValidPhone = 0;
    let usersWithoutPhone = 0;
    let fixedCount = 0;
    
    console.log(`\n📋 Phone Number Analysis:`);
    console.log(`Total users: ${usersSnapshot.size}\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      totalUsers++;
      const userData = userDoc.data();
      const phoneNumber = userData.profile?.phoneNumber;
      const displayName = userData.profile?.displayName || 'No name';
      
      if (!phoneNumber) {
        console.log(`❌ ${displayName} (${userDoc.id}): No phone number`);
        usersWithoutPhone++;
      } else {
        // Check if phone number is valid
        const digitsOnly = phoneNumber.replace(/\D/g, '');
        
        if (phoneNumber.startsWith('+1') && digitsOnly.length === 11) {
          console.log(`✅ ${displayName} (${userDoc.id}): ${phoneNumber} (valid E.164)`);
          usersWithValidPhone++;
        } else if (digitsOnly.length === 10) {
          // Valid 10-digit number, needs formatting
          const formattedPhone = `+1${digitsOnly}`;
          console.log(`⚠️  ${displayName} (${userDoc.id}): ${phoneNumber} → ${formattedPhone} (needs formatting)`);
          
          try {
            await userDoc.ref.update({
              'profile.phoneNumber': formattedPhone,
              updatedAt: new Date().toISOString()
            });
            console.log(`✅ Fixed: ${displayName} (${userDoc.id})`);
            fixedCount++;
            usersWithValidPhone++;
          } catch (error) {
            console.error(`❌ Failed to fix ${displayName}:`, error.message);
            usersWithInvalidPhone++;
          }
        } else if (digitsOnly.length < 10) {
          console.log(`❌ ${displayName} (${userDoc.id}): ${phoneNumber} (too short - ${digitsOnly.length} digits)`);
          usersWithInvalidPhone++;
        } else if (digitsOnly.length > 11) {
          console.log(`❌ ${displayName} (${userDoc.id}): ${phoneNumber} (too long - ${digitsOnly.length} digits)`);
          usersWithInvalidPhone++;
        } else {
          console.log(`❌ ${displayName} (${userDoc.id}): ${phoneNumber} (invalid format)`);
          usersWithInvalidPhone++;
        }
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with valid phone numbers: ${usersWithValidPhone}`);
    console.log(`Users with invalid phone numbers: ${usersWithInvalidPhone}`);
    console.log(`Users without phone numbers: ${usersWithoutPhone}`);
    console.log(`Phone numbers fixed: ${fixedCount}`);
    
    if (usersWithInvalidPhone > 0) {
      console.log('\n⚠️  Users with invalid phone numbers need to update their profiles manually.');
      console.log('They should enter a valid 10-digit US phone number.');
    }
    
  } catch (error) {
    console.error('❌ Error fixing phone numbers:', error);
  }
};

// Run the fix
fixInvalidPhoneNumbers(); 