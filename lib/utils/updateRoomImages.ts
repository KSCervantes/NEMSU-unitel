/**
 * Utility to update existing room documents with Firebase Storage URLs
 * This fixes rooms that were created with local paths instead of Storage URLs
 */

import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';
import { logError, logInfo } from '@/lib/logger';

/**
 * Extract room name from filename
 */
function extractRoomName(filename: string): string {
    return filename.replace(/\.(webp|png|jpg|jpeg)$/i, '');
}

/**
 * Update all room documents to use Firebase Storage URLs instead of local paths
 */
export async function updateRoomImagesToStorageUrls(): Promise<void> {
    try {
        logInfo('🔄 Updating room images to Firebase Storage URLs...');

        // Get all rooms from Firestore
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);

        if (snapshot.empty) {
            logInfo('⚠️ No rooms found in Firestore');
            return;
        }

        // List all files in Storage
        const roomsFolderRef = ref(storage, 'rooms/');
        const listResult = await listAll(roomsFolderRef);

        // Create a map of room names to Storage URLs
        const storageUrlMap = new Map<string, string>();

        for (const itemRef of listResult.items) {
            try {
                const fileName = itemRef.name;
                const roomName = extractRoomName(fileName);
                const imageUrl = await getDownloadURL(itemRef);
                storageUrlMap.set(roomName.toLowerCase(), imageUrl);
                logInfo(`📸 Found Storage URL for "${roomName}": ${imageUrl.substring(0, 50)}...`);
            } catch (error) {
                logError(`Error getting URL for ${itemRef.name}:`, error);
            }
        }

        // Update each room document
        let updatedCount = 0;
        let skippedCount = 0;

        snapshot.forEach(async (docSnapshot) => {
            const data = docSnapshot.data();
            const roomName = data.name;
            const currentImage = data.image;

            // Check if image is a local path (starts with /img/)
            if (currentImage && currentImage.startsWith('/img/')) {
                const roomNameLower = roomName?.toLowerCase();
                const storageUrl = storageUrlMap.get(roomNameLower || '');

                if (storageUrl) {
                    try {
                        const docRef = doc(db, 'rooms', docSnapshot.id);
                        await updateDoc(docRef, {
                            image: storageUrl,
                            updatedAt: new Date().toISOString(),
                        });
                        logInfo(`✅ Updated "${roomName}" image to Storage URL`);
                        updatedCount++;
                    } catch (error) {
                        logError(`Error updating "${roomName}":`, error);
                    }
                } else {
                    logInfo(`⚠️ No Storage URL found for "${roomName}", skipping`);
                    skippedCount++;
                }
            } else {
                logInfo(`ℹ️ "${roomName}" already has Storage URL, skipping`);
                skippedCount++;
            }
        });

        logInfo(`✅ Update complete: ${updatedCount} updated, ${skippedCount} skipped`);
    } catch (error) {
        logError('Error updating room images:', error);
        throw error;
    }
}

