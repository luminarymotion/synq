import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, 'serviceAccountKey.json'), 'utf8')
);

// Log service account info (without sensitive data)
console.log('Initializing with service account:', {
  projectId: serviceAccount.project_id,
  clientEmail: serviceAccount.client_email,
  hasPrivateKey: !!serviceAccount.private_key
});

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function deployIndexes() {
  try {
    console.log('Starting index deployment...');
    
    // Read the indexes configuration
    const indexesConfig = JSON.parse(
      readFileSync(join(__dirname, 'firestore.indexes.json'), 'utf8')
    );

    // Get the Firestore instance
    const db = admin.firestore();
    
    // Test the connection
    console.log('Testing Firestore connection...');
    try {
      await db.collection('rides').limit(1).get();
      console.log('Firestore connection successful');
    } catch (error) {
      console.error('Firestore connection test failed:', error);
      throw new Error('Failed to connect to Firestore. Please check your service account permissions.');
    }

    // Get the current indexes using the Admin SDK
    console.log('Fetching current indexes...');
    const indexes = await db.listCollections();
    console.log('Available collections:', indexes.map(col => col.id));

    // Create indexes using the Firebase CLI command
    console.log('Creating indexes using Firebase CLI...');
    const { execSync } = await import('child_process');
    
    try {
      // First, ensure we're logged in
      console.log('Checking Firebase CLI login status...');
      execSync('firebase login:list', { stdio: 'inherit' });
      
      // Deploy the indexes
      console.log('Deploying indexes...');
      execSync('firebase deploy --only firestore:indexes', { 
        stdio: 'inherit',
        cwd: __dirname
      });
      
      console.log('Index deployment completed successfully!');
    } catch (error) {
      console.error('Error deploying indexes with Firebase CLI:', error);
      throw new Error('Failed to deploy indexes. Please ensure you are logged in to Firebase CLI and have the necessary permissions.');
    }

  } catch (error) {
    console.error('Error deploying indexes:', error);
    process.exit(1);
  } finally {
    // Clean up
    await app.delete();
  }
}

// Run the deployment
deployIndexes(); 