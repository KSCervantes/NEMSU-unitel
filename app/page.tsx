"use client";
export const dynamic = "force-dynamic";

import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
import Navbar from "./components/Navbar";
import RoomCard from "./components/RoomCard";
import BookingModal from "./components/BookingModal";
import { useCoupons } from '@/app/hooks/useCoupons';
import { useHotelSettings } from '@/app/hooks/useHotelSettings';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { logError } from '@/lib/logger';
import { CouponId, formatCouponDate, getCouponAvailability, getCouponNowLabel, isCouponId } from '@/lib/coupons';
import { getCouponIconMeta } from '@/lib/couponIcons';

interface Room {
  id?: string;
  name: string;
  price: string;
  description: string;
  image: string;
  perBed?: string;
  maxGuests?: number;
}

export default function Home() {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [roomsUnderMaintenance, setRoomsUnderMaintenance] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponId | "">("");
  const [selectedBookingCoupon, setSelectedBookingCoupon] = useState<CouponId | "">("");
  const [activeCouponIndex, setActiveCouponIndex] = useState(0);
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);
  const couponCarouselRef = useRef<HTMLDivElement | null>(null);
  const roomCarouselRef = useRef<HTMLDivElement | null>(null);
  const { settings: hotelSettings } = useHotelSettings(true);

  const fetchRooms = async () => {
    try {
      const roomsRef = collection(db, 'rooms');
      const snapshot = await getDocs(roomsRef);

      if (snapshot.empty) {
        // Rooms collection is empty - no rooms available yet
        // Admin should add rooms manually through the admin panel
        setRooms([]);
      } else {
        const roomsData: Room[] = [];
        snapshot.forEach((doc) => {
          roomsData.push({ id: doc.id, ...doc.data() } as Room);
        });
        // Deduplicate by name
        const unique = Array.from(
          new Map(roomsData.map((r) => [r.name, r])).values()
        );
        setRooms(unique);
      }
    } catch (error) {
      logError(error, { context: 'Home - Error fetching rooms' });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchRooms();
      setLoading(false);
    };
    fetchData();

    // Real-time listener for maintenance
    const maintenanceRef = collection(db, 'maintenance');
    type MaintenanceDoc = { room?: string; status?: string };
    const maintenanceQuery = query(maintenanceRef, where('status', 'in', ['pending', 'in-progress']));
    const unsubscribeMaintenance = onSnapshot(maintenanceQuery, (snapshot) => {
      const underMaintenance: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as MaintenanceDoc;
        if (data.room && !underMaintenance.includes(data.room)) {
          underMaintenance.push(data.room);
        }
      });
      setRoomsUnderMaintenance(underMaintenance);
    }, (error) => {
      logError(error, { context: 'Home - Maintenance listener error' });
    });

    return () => {
      unsubscribeMaintenance();
    };
  }, []);

  const handleBookRoom = (roomName: string) => {
    setSelectedRoom(roomName);
    setSelectedBookingCoupon("");
    setIsBookingModalOpen(true);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { coupons, couponMap, availabilityMap, loading: couponsLoading } = useCoupons(true);

  const getCouponAvailabilityById = (couponId: CouponId) => {
    const coupon = couponMap[couponId];
    if (!coupon) return getCouponAvailability(null);
    return availabilityMap[couponId] || getCouponAvailability(coupon);
  };

  const handleClaimCoupon = (couponId: CouponId) => {
    const coupon = couponMap[couponId];
    if (!coupon) {
      return;
    }

    const availability = getCouponAvailabilityById(couponId);
    if (!availability.active) {
      return;
    }

    setSelectedRoom("");
    setSelectedBookingCoupon(couponId);
    setIsBookingModalOpen(true);
  };

  const handleCouponAbout = (couponId: CouponId) => {
    if (!couponMap[couponId]) {
      return;
    }
    setSelectedCoupon(couponId);
    setIsCouponModalOpen(true);
  };

  const selectedCouponId = selectedCoupon && couponMap[selectedCoupon] ? selectedCoupon : "";
  const selectedBookingCouponId = selectedBookingCoupon && couponMap[selectedBookingCoupon] ? selectedBookingCoupon : "";
  const selectedCouponData = selectedCouponId ? couponMap[selectedCouponId] || null : null;
  const selectedCouponAvailability = selectedCouponId ? getCouponAvailabilityById(selectedCouponId) : null;
  const couponCards = useMemo(() => {
    return coupons.map((coupon, index) => {
      const iconMeta = getCouponIconMeta(coupon.iconKey, index);
      const availability = availabilityMap[coupon.id] || getCouponAvailability(coupon);
      return {
        id: coupon.id,
        discount: `${coupon.discountPercent}% OFF`,
        title: coupon.title,
        subtitle: coupon.shortDescription || coupon.description || availability.availabilityText,
        discountClass: iconMeta.discountClass,
        iconClass: iconMeta.iconClass,
        iconPath: iconMeta.path,
      };
    });
  }, [availabilityMap, coupons]);
  const selectedCouponCard = selectedCouponId ? couponCards.find((coupon) => coupon.id === selectedCouponId) || null : null;

  const handleCouponCarouselScroll = () => {
    const container = couponCarouselRef.current;
    if (!container) {
      return;
    }

    const cards = Array.from(container.children) as HTMLElement[];
    if (cards.length === 0) {
      return;
    }

    const viewportCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== activeCouponIndex) {
      setActiveCouponIndex(closestIndex);
    }
  };

  const scrollToCouponCard = (index: number) => {
    const container = couponCarouselRef.current;
    if (!container) {
      return;
    }

    const target = container.children[index] as HTMLElement | undefined;
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
    setActiveCouponIndex(index);
  };

  const handleRoomCarouselScroll = () => {
    const container = roomCarouselRef.current;
    if (!container) {
      return;
    }

    const cards = Array.from(container.children) as HTMLElement[];
    if (cards.length === 0) {
      return;
    }

    const viewportCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== activeRoomIndex) {
      setActiveRoomIndex(closestIndex);
    }
  };

  const scrollToRoomCard = (index: number) => {
    const container = roomCarouselRef.current;
    if (!container) {
      return;
    }

    const target = container.children[index] as HTMLElement | undefined;
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
    setActiveRoomIndex(index);
  };

  const renderCouponCard = (
    coupon: (typeof couponCards)[number],
    extraClassName = ''
  ) => {
    const availability = getCouponAvailabilityById(coupon.id);
    return (
      <div
        key={coupon.id}
        className={`relative bg-white/60 backdrop-blur-lg rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300 shadow-sm p-0 border-0 ${extraClassName}`}
      >
        <div className="p-4 pr-24">
          <div className={`text-2xl font-bold mb-1 ${coupon.discountClass}`}>{coupon.discount}</div>
          <h3 className="font-poppins font-semibold text-base mb-1 text-gray-800">{coupon.title}</h3>
          <p className="text-gray-500 text-xs mb-2">{coupon.subtitle}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleClaimCoupon(coupon.id)}
              disabled={!availability.active}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold px-3 py-2 rounded-lg transition-colors text-xs flex-1"
            >
              {availability.active ? 'Claim Coupon' : 'Unavailable'}
            </button>
            <button
              onClick={() => handleCouponAbout(coupon.id)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-3 py-2 rounded-lg transition-colors text-xs flex items-center justify-center"
              title="About this offer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="absolute top-0 right-0 h-full w-20 border-l-2 border-dashed border-gray-300 bg-white flex items-center justify-center">
          <div className="absolute -top-3 -left-3 w-6 h-6 bg-gray-50 rounded-full border border-gray-200"></div>
          <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-gray-50 rounded-full border border-gray-200"></div>
          <div className={coupon.iconClass}>
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={coupon.iconPath} />
            </svg>
          </div>
        </div>
      </div>
    );
  };

  // Always show all rooms; we'll indicate unavailable state on the card

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar hotelName={hotelSettings.hotelName} />

      {/* Hero Section */}
      <section
        id="home"
        className="relative min-h-[56vh] md:min-h-[62vh] lg:min-h-[78vh] flex items-center justify-center pt-16 sm:pt-20 md:pt-24 pb-12 bg-blend-overlay bg-gradient-to-b from-[#112240]/70 via-[#1a2a4f]/45 to-[#e0e7ef]/80 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(17, 34, 64, 0.62) 0%, rgba(26, 42, 79, 0.40) 60%, rgba(224, 231, 239, 0.82) 100%), url("/img/hero-bg.webp")',
          backgroundColor: '#1a2f55'
        }}
      >
        {/* Minimal overlay so the image stays bright and visible */}
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10 text-center text-white px-4 sm:px-6 max-w-6xl mx-auto w-full">
          <h1 className="font-poppins font-bold mb-4 leading-[1.05]">
            <span className="block text-[0.68rem] sm:text-sm md:text-base lg:text-xl font-medium uppercase tracking-[0.24em] sm:tracking-[0.26em] lg:tracking-[0.28em] text-white/85 mb-1.5 sm:mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
              Welcome to
            </span>
            <span className="hero-hotel-wordmark block text-[2.2rem] sm:text-5xl md:text-6xl lg:text-[5.2rem] xl:text-[5.8rem] tracking-[0.02em] sm:tracking-[0.024em] lg:tracking-[0.03em]">
              <span className="hero-hotel-wordmark-accent">NEMSU</span> UNIVERSITY HOTEL
            </span>
            <span className="mx-auto mt-3 sm:mt-4 block h-[2px] w-24 sm:w-32 lg:w-36 bg-gradient-to-r from-transparent via-amber-300/90 to-transparent" />
          </h1>
        </div>
      </section>

      {/* Discounts Section */}
      <section className="relative py-12 px-4 dotted-bg shadow-xl border-t border-[#b6c3d6]/40">
        <div className="container mx-auto max-w-7xl">
          <div className="text-left mb-8">
            <h2 className="font-poppins font-bold text-2xl md:text-2xl mb-3" style={{ color: '#112240' }}>
              Special Offers & Discounts
            </h2>
          </div>

          {couponsLoading ? (
            <div className="rounded-2xl border border-gray-200 bg-white/60 p-6 text-sm text-gray-600">
              Loading offers...
            </div>
          ) : couponCards.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              No coupons are configured right now. Please check back later.
            </div>
          ) : (
            <>
              <div className="md:hidden">
                <div
                  ref={couponCarouselRef}
                  onScroll={handleCouponCarouselScroll}
                  className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {couponCards.map((coupon) => renderCouponCard(coupon, 'shrink-0 basis-[86%] snap-center'))}
                </div>
                {couponCards.length > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => scrollToCouponCard((activeCouponIndex - 1 + couponCards.length) % couponCards.length)}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Prev
                    </button>
                    <div className="flex items-center gap-2">
                      {couponCards.map((coupon, index) => (
                        <button
                          key={coupon.id}
                          type="button"
                          onClick={() => scrollToCouponCard(index)}
                          aria-label={`Go to ${coupon.title} coupon`}
                          className={`h-2.5 rounded-full transition-all ${activeCouponIndex === index ? 'w-6 bg-blue-700' : 'w-2.5 bg-gray-300'}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => scrollToCouponCard((activeCouponIndex + 1) % couponCards.length)}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {couponCards.map((coupon) => renderCouponCard(coupon))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Rooms Section */}
      <section id="rooms" className="py-20 px-4 dotted-bg">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="font-poppins font-bold text-4xl md:text-5xl mb-4" style={{ color: '#112240' }}>
              Our Rooms
            </h2>
            <div className="w-24 h-1 bg-amber-400 mx-auto mb-6" />
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Choose from our variety of comfortable and modern rooms designed for your perfect stay
            </p>
          </div>

          <div className="mb-12">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-900 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading rooms...</p>
                </div>
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-12 bg-amber-50 rounded-xl border-2 border-amber-200">
                <svg className="w-16 h-16 mx-auto text-amber-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-gray-700 text-lg font-semibold mb-2">No rooms found</p>
                <p className="text-gray-600">Please check back later.</p>
              </div>
            ) : (
              <>
                <div className="md:hidden">
                  <div
                    ref={roomCarouselRef}
                    onScroll={handleRoomCarouselScroll}
                    className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {rooms.map((room) => (
                      <div key={room.id || room.name} className="shrink-0 basis-[88%] snap-center">
                        <RoomCard
                          name={room.name}
                          price={room.price}
                          currency={hotelSettings.currency}
                          image={room.image}
                          description={room.description}
                          perBed={room.perBed}
                          onClick={() => handleBookRoom(room.name)}
                          unavailable={roomsUnderMaintenance.includes(room.name)}
                          unavailableReason={roomsUnderMaintenance.includes(room.name) ? 'maintenance' : undefined}
                          mobileVertical
                        />
                      </div>
                    ))}
                  </div>

                  {rooms.length > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => scrollToRoomCard((activeRoomIndex - 1 + rooms.length) % rooms.length)}
                        className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Prev
                      </button>
                      <div className="flex items-center gap-2">
                        {rooms.map((room, index) => (
                          <button
                            key={room.id || room.name}
                            type="button"
                            onClick={() => scrollToRoomCard(index)}
                            aria-label={`Go to ${room.name}`}
                            className={`h-2.5 rounded-full transition-all ${activeRoomIndex === index ? 'w-6 bg-blue-700' : 'w-2.5 bg-gray-300'}`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => scrollToRoomCard((activeRoomIndex + 1) % rooms.length)}
                        className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>

                <div className="hidden md:flex md:flex-col gap-6">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id || room.name}
                      name={room.name}
                      price={room.price}
                      currency={hotelSettings.currency}
                      image={room.image}
                      description={room.description}
                      perBed={room.perBed}
                      onClick={() => handleBookRoom(room.name)}
                      unavailable={roomsUnderMaintenance.includes(room.name)}
                      unavailableReason={roomsUnderMaintenance.includes(room.name) ? 'maintenance' : undefined}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 px-4 dotted-bg">
        <div className="container mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-poppins font-bold text-4xl md:text-5xl text-blue-900 mb-6" style={{ color: '#112240' }}>
                Welcome to {hotelSettings.hotelName}
              </h2>
              <div className="w-24 h-1 bg-amber-400 mb-6" />
              <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                {hotelSettings.hotelName} offers a unique blend of comfort, convenience, and
                affordability at the heart of {hotelSettings.address}.
              </p>
              <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                Whether you&apos;re a visiting professor, student&apos;s family member, or traveler exploring
                the beautiful region, our modern facilities and warm hospitality ensure a memorable stay.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-900 rounded-full flex items-center justify-center text-amber-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">24/7 Service</p>
                    <p className="text-sm text-gray-600">Always Available</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-900 rounded-full flex items-center justify-center text-amber-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">Prime Location</p>
                    <p className="text-sm text-gray-600">NEMSU Campus</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-900 rounded-full flex items-center justify-center text-amber-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">Clean & Cozy</p>
                    <p className="text-sm text-gray-600">Comfortable Stay</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-900 rounded-full flex items-center justify-center text-amber-400">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900">Affordable</p>
                    <p className="text-sm text-gray-600">Best Rates</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative h-[500px] rounded-3xl overflow-hidden shadow-2xl" suppressHydrationWarning>
                <Image
                  src="/img/ROOMS.webp"
                  alt="Hotel Interior"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw"
                  className="object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-amber-400 rounded-2xl p-6 shadow-xl">
                <p className="text-blue-900 font-bold text-4xl">5+</p>
                <p className="text-blue-900 font-semibold">Room Types</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-4 text-black dotted-bg">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="font-poppins font-bold text-4xl md:text-5xl mb-4 text-blue-900" style={{ color: '#112240' }}>
              Contact Us
            </h2>
            <div className="w-24 h-1 bg-amber-400 mx-auto mb-6" />
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Ready to book your stay? Contact us today!
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-12">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center hover:bg-white/20 transition-all">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-900" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm sm:text-lg md:text-xl mb-2">Email</h3>
              <a href={`mailto:${hotelSettings.contactEmail}`} className="text-black text-xs sm:text-sm md:text-base break-all hover:underline">
                {hotelSettings.contactEmail}
              </a>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center hover:bg-white/20 transition-all">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-900" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm sm:text-lg md:text-xl mb-2">Phone</h3>
              <a href={`tel:${hotelSettings.contactPhone.replace(/\s+/g, '')}`} className="text-black text-xs sm:text-sm md:text-base hover:underline">
                {hotelSettings.contactPhone}
              </a>
            </div>

            <div className="col-span-2 md:col-span-1 bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center hover:bg-white/20 transition-all">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-900" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm sm:text-lg md:text-xl mb-2">Address</h3>
              <p className="text-black text-xs sm:text-sm md:text-base whitespace-pre-line">{hotelSettings.address}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 px-4">
        <div className="container mx-auto max-w-7xl text-center">
          <div className="flex items-center justify-center gap-3 mb-4" suppressHydrationWarning>
            <Image
              src="/img/NEMSU_LOGOO.webp"
              alt={`${hotelSettings.hotelName} Logo`}
              width={40}
              height={40}
              className="object-contain"
              style={{ width: 'auto', height: '40px' }}
              loading="eager"
            />
            <div>
              <h3 className="font-poppins font-bold text-xl">{hotelSettings.hotelName}</h3>
            </div>
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} {hotelSettings.hotelName}. All rights reserved.
          </p>
        </div>
      </footer>

      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setSelectedRoom("");
          setSelectedBookingCoupon("");
        }}
        selectedRoom={selectedRoom}
        selectedCouponId={selectedBookingCouponId}
        hotelName={hotelSettings.hotelName}
        currency={hotelSettings.currency}
        contactEmail={hotelSettings.contactEmail}
        contactPhone={hotelSettings.contactPhone}
        defaultCheckInTime={hotelSettings.checkInTime}
        defaultCheckOutTime={hotelSettings.checkOutTime}
      />

      {/* Coupon Details Modal */}
      {isCouponModalOpen && selectedCouponId && selectedCouponData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-xl max-w-xs sm:max-w-sm w-full max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="p-4 sm:p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-poppins font-bold text-gray-800 mb-1">
                    {selectedCouponData.title}
                  </h2>
                  <div className={`text-xl sm:text-2xl font-bold ${selectedCouponCard?.discountClass || 'text-blue-600'}`}>
                    {selectedCouponData.discountPercent}% OFF
                  </div>
                </div>
                <button
                  onClick={() => setIsCouponModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                  aria-label="Close coupon details"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <p className="text-gray-600 text-sm leading-relaxed">
                  {selectedCouponData.description || selectedCouponData.shortDescription}
                </p>
              </div>

              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-800 mb-2">Terms & Conditions</h3>
                <ul className="space-y-1">
                  {(selectedCouponData.terms.length > 0 ? selectedCouponData.terms : [
                    'One coupon redemption per guest identity only.',
                    'Cannot be combined with other offers.',
                    'Subject to room availability.',
                  ]).map((term, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-600 text-xs">
                      <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{term}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-blue-800 text-xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">
                    {selectedCouponData.validTo
                      ? `Valid Until: ${formatCouponDate(selectedCouponData.validTo)}`
                      : selectedCouponData.validFrom
                      ? `Valid From: ${formatCouponDate(selectedCouponData.validFrom)}`
                      : 'Validity: Ongoing'}
                  </span>
                </div>
              </div>

              <div className={`mb-4 p-2 rounded-lg ${selectedCouponAvailability?.active ? 'bg-green-50' : 'bg-amber-50'}`}>
                <p className={`text-xs font-semibold ${selectedCouponAvailability?.active ? 'text-green-700' : 'text-amber-800'}`}>
                  {selectedCouponAvailability?.active
                    ? 'This coupon is active now.'
                    : `This coupon cannot be used now. ${selectedCouponAvailability?.reason || ''}`}
                </p>
                <p className={`text-xs mt-1 ${selectedCouponAvailability?.active ? 'text-green-600' : 'text-amber-700'}`}>
                  Time reference: Asia/Manila ({getCouponNowLabel()}).
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsCouponModalOpen(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-3 rounded-lg transition-colors text-xs"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    if (!selectedCouponId || !isCouponId(selectedCouponId) || !getCouponAvailabilityById(selectedCouponId).active) {
                      return;
                    }
                    setIsCouponModalOpen(false);
                    setSelectedRoom("");
                    setSelectedBookingCoupon(selectedCouponId);
                    setIsBookingModalOpen(true);
                  }}
                  disabled={!selectedCouponId || !selectedCouponAvailability?.active}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-lg transition-colors text-xs"
                >
                  Book Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 bg-blue-900 hover:bg-blue-800 text-white p-3 sm:p-4 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 animate-fadeIn z-40"
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7m0 0L5 14m7-7v12" />
          </svg>
        </button>
      )}
    </div>
  );
}
