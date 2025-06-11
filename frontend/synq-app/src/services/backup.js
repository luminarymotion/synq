import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

export const backupDatabase = async () => {
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
      const snapshot = await getDocs(collection(db, collectionName));
      backup.collections[collectionName] = {};

      for (const doc of snapshot.docs) {
        backup.collections[collectionName][doc.id] = {
          data: doc.data(),
          metadata: {
            createdAt: doc.metadata.hasPendingWrites ? 'pending' : doc.metadata.fromCache ? 'cache' : 'server',
            lastUpdated: new Date().toISOString()
          }
        };
      }
    }

    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    // Save backup to file
    const backupPath = path.join(backupDir, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    console.log(`Backup completed and saved to: ${backupPath}`);
    return {
      success: true,
      backupPath,
      stats: {
        collections: Object.keys(backup.collections),
        totalDocuments: Object.values(backup.collections).reduce(
          (sum, collection) => sum + Object.keys(collection).length,
          0
        )
      }
    };
  } catch (error) {
    console.error('Backup failed:', error);
    return {
      success: false,
      error
    };
  }
};

// Function to verify backup integrity
export const verifyBackup = async (backupPath) => {
  try {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const stats = {
      collections: Object.keys(backup.collections),
      totalDocuments: Object.values(backup.collections).reduce(
        (sum, collection) => sum + Object.keys(collection).length,
        0
      ),
      integrity: {
        hasTimestamp: !!backup.timestamp,
        hasCollections: Object.keys(backup.collections).length > 0,
        allDocumentsHaveData: true,
        allDocumentsHaveMetadata: true
      }
    };

    // Verify each document
    for (const [collectionName, documents] of Object.entries(backup.collections)) {
      for (const [docId, docData] of Object.entries(documents)) {
        if (!docData.data) {
          stats.integrity.allDocumentsHaveData = false;
          console.error(`Document ${collectionName}/${docId} missing data`);
        }
        if (!docData.metadata) {
          stats.integrity.allDocumentsHaveMetadata = false;
          console.error(`Document ${collectionName}/${docId} missing metadata`);
        }
      }
    }

    return {
      success: true,
      stats,
      backup
    };
  } catch (error) {
    console.error('Backup verification failed:', error);
    return {
      success: false,
      error
    };
  }
}; 