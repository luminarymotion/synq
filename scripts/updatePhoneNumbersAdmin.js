const admin = require('firebase-admin');

// Initialize Firebase Admin (uses default credentials)
admin.initializeApp();

const db = admin.firestore();

/**
 * Formats a phone number to E.164 format
 */
const formatPhoneNumberToE164 = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.toString().replace(/\D/g, '');
  
  // If it's a 10-digit US number, add +1 prefix
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  } 
  // If it's 11 digits starting with 1, add + prefix
  else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  } 
  // If it already has a +, use as is
  else if (phoneNumber.toString().startsWith('+')) {
    return phoneNumber;
  } 
  // Default: assume US number and add +1
  else {
    return `+1${digitsOnly}`;
  }
};

/**
 * Updates all phone numbers in the database to E.164 format
 */
const updatePhoneNumbers = async () => {
  try {
    console.log('Starting phone number update...');
    
    const usersSnapshot = await db.collection('users').get();
    let updatedCount = 0;
    let errorCount = 0;
    let noPhoneCount = 0;
    
    console.log(`Found ${usersSnapshot.size} users to process...`);
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const currentPhoneNumber = userData.profile?.phoneNumber;
        
        if (!currentPhoneNumber) {
          console.log(`User ${userDoc.id}: No phone number found, skipping...`);
          noPhoneCount++;
          continue;
        }
        
        // Check if already in E.164 format
        if (currentPhoneNumber.startsWith('+')) {
          console.log(`User ${userDoc.id}: Phone number already formatted (${currentPhoneNumber}), skipping...`);
          continue;
        }
        
        // Format the phone number
        const formattedPhone = formatPhoneNumberToE164(currentPhoneNumber);
        
        if (formattedPhone === currentPhoneNumber) {
          console.log(`User ${userDoc.id}: No formatting needed, skipping...`);
          continue;
        }
        
        // Update the user document
        await userDoc.ref.update({
          'profile.phoneNumber': formattedPhone,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`User ${userDoc.id}: Updated ${currentPhoneNumber} → ${formattedPhone}`);
        updatedCount++;
        
      } catch (error) {
        console.error(`Error updating user ${userDoc.id}:`, error);
        errorCount++;
      }
    }
    
    console.log('\n📊 Update Summary:');
    console.log(`Total users processed: ${usersSnapshot.size}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`No phone number found: ${noPhoneCount}`);
    console.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Error updating phone numbers:', error);
  }
};

// Run the update
updatePhoneNumbers(); 