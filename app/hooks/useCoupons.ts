"use client";

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  CouponConfig,
  getCouponAvailability,
  parseCouponDoc,
  setCouponRegistry,
  sortCouponsByPriority,
} from '@/lib/coupons';
import { logError } from '@/lib/logger';

type UseCouponsResult = {
  coupons: CouponConfig[];
  couponMap: Record<string, CouponConfig>;
  availabilityMap: Record<string, { active: boolean; reason?: string; availabilityText: string }>;
  loading: boolean;
};

export function useCoupons(enabled: boolean = true): UseCouponsResult {
  const [coupons, setCoupons] = useState<CouponConfig[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'coupons'),
      (snapshot) => {
        const parsedCoupons = snapshot.docs.map((docSnap) =>
          parseCouponDoc(docSnap.id, docSnap.data() as Record<string, unknown>)
        );
        const sortedCoupons = sortCouponsByPriority(parsedCoupons);
        setCoupons(sortedCoupons);
        setCouponRegistry(sortedCoupons);
        setHasLoaded(true);
      },
      (error) => {
        logError(error, { context: 'useCoupons - listener error' });
        setCoupons([]);
        setCouponRegistry([]);
        setHasLoaded(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled]);

  const couponMap = useMemo(() => {
    const map: Record<string, CouponConfig> = {};
    coupons.forEach((coupon) => {
      map[coupon.id] = coupon;
    });
    return map;
  }, [coupons]);

  const availabilityMap = useMemo(() => {
    const map: Record<string, { active: boolean; reason?: string; availabilityText: string }> = {};
    coupons.forEach((coupon) => {
      map[coupon.id] = getCouponAvailability(coupon);
    });
    return map;
  }, [coupons]);

  const loading = enabled && !hasLoaded;

  return { coupons, couponMap, availabilityMap, loading };
}
