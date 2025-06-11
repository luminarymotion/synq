const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backupDatabase() {
  try {
    console.log('Starting database backup...');
    const backup = {
      timestamp: new Date().toISOString(),
      collections: {}
    };

    // Collections to backup
    const collections = [
      'users',
      'friendRequests',
      'rides',
      'notifications'
    ];

    for (const collectionName of collections) {
      console.log(`Backing up ${collectionName}...`);
      const snapshot = await db.collection(collectionName).get();
      backup.collections[collectionName] = {};

      for (const doc of snapshot.docs) {
        backup.collections[collectionName][doc.id] = {
          data: doc.data(),
          metadata: {
            createdAt: doc.createTime?.toDate().toISOString(),
            updatedAt: doc.updateTime?.toDate().toISOString()
          }
        };
      }
    }

    // Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    // Save backup to file
    const backupPath = path.join(backupDir, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    console.log(`Backup completed and saved to: ${backupPath}`);
    console.log('Backup statistics:', {
      collections: Object.keys(backup.collections),
      totalDocuments: Object.values(backup.collections).reduce(
        (sum, collection) => sum + Object.keys(collection).length,
        0
      )
    });

    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
}

// Run backup
backupDatabase().then(() => {
  console.log('Backup process completed');
  process.exit(0);
}).catch(error => {
  console.error('Backup process failed:', error);
  process.exit(1);
}); 