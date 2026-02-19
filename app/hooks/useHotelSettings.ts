"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logError } from '@/lib/logger';
import { DEFAULT_HOTEL_SETTINGS, normalizeHotelSettings, type HotelSettings } from '@/lib/hotelSettings';

export function useHotelSettings(enabled = true) {
  const [settings, setSettings] = useState<HotelSettings>(DEFAULT_HOTEL_SETTINGS);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const settingsRef = doc(db, 'settings', 'hotel');

    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setSettings(DEFAULT_HOTEL_SETTINGS);
      } else {
        setSettings(normalizeHotelSettings(snapshot.data()));
      }
      setHasLoaded(true);
    }, (error) => {
      logError(error, { context: 'Hotel Settings - Listener error' });
      setSettings(DEFAULT_HOTEL_SETTINGS);
      setHasLoaded(true);
    });

    return () => {
      unsubscribe();
    };
  }, [enabled]);

  const loading = enabled && !hasLoaded;

  return {
    settings,
    loading,
  };
}
