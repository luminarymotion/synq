const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function deployIndexes() {
  try {
    console.log('Starting index deployment...');
    
    // Read the indexes configuration
    const indexesConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'firestore.indexes.json'), 'utf8')
    );

    // Get the Firestore instance
    const db = admin.firestore();
    
    // Get the current indexes
    const currentIndexes = await db.listIndexes();
    console.log('Current indexes:', currentIndexes);

    // Deploy the indexes
    const result = await db.deployIndexes(indexesConfig);
    console.log('Index deployment result:', result);

    console.log('Index deployment completed successfully!');
  } catch (error) {
    console.error('Error deploying indexes:', error);
    process.exit(1);
  } finally {
    // Clean up
    await admin.app().delete();
  }
}

// Run the deployment
deployIndexes(); 