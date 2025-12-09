/**
 * Utility functions for room management
 * All room creation is done manually through the admin panel
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logError, logInfo } from '@/lib/logger';

/**
 * Check if rooms collection has any rooms
 * This is a utility function to check room status
 * Rooms must be added manually through the admin panel
 * 
 * @returns Promise<boolean> - true if rooms exist, false if empty
 */
export async function checkRoomsExist(): Promise<boolean> {
  try {
    const roomsRef = collection(db, 'rooms');
    const snapshot = await getDocs(roomsRef);

    if (snapshot.empty) {
      logInfo('📦 Rooms collection is empty. Add rooms manually through the admin panel.');
      return false;
    }

    logInfo(`✅ Rooms collection has ${snapshot.docs.length} room(s)`);
    return true;
  } catch (error) {
    logError('Error checking rooms:', error);
    return false;
  }
}
