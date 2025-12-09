"use client";
export const dynamic = "force-dynamic";

import Image from "next/image";
import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import RoomCard from "./components/RoomCard";
import BookingModal from "./components/BookingModal";
import { db, storage } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';

interface Room {
  id?: string;
  name: string;
  price: string;
  description: string;
  image: string;
  perBed?: string;
}

export default function Home() {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [roomsUnderMaintenance, setRoomsUnderMaintenance] = useState<string[]>([]);
  const [roomsOccupied, setRoomsOccupied] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const fetchRooms = async () => {
    try {
      const roomsRef = collection(db, 'rooms');
      const snapshot = await getDocs(roomsRef);

      if (snapshot.empty) {
        // Initialize default rooms if collection is empty
        const defaultRoomsData = [
          { name: "Suite Room", price: "1,200.00", description: "Experience luxury in our Suite Room, featuring a spacious layout, modern amenities, and elegant decor for a comfortable stay.", imageName: "Suite Room.png" },
          { name: "Triple Room", price: "1,200.00", description: "Our Triple Room offers ample space for three guests, complete with contemporary furnishings and all the essentials for a pleasant stay.", imageName: "Triple Room.png" },
          { name: "Dorm Room", price: "500.00", perBed: "/ Bed", description: "Our Dorm Room provides a budget-friendly option with shared accommodations, perfect for students and travelers seeking a communal living experience.", imageName: "Dorm Room.png" },
          { name: "Twin Room", price: "1,000.00", description: "Enjoy the comfort of our Twin Room, featuring two separate beds, modern amenities, and a cozy atmosphere for a relaxing stay.", imageName: "Twin Room.png" },
          { name: "Double Room", price: "1,000.00", description: "Our Double Room is designed for comfort and convenience, offering a spacious layout with a plush double bed and all the necessary amenities.", imageName: "Double Room.png" },
        ];

        // Get image URLs from Firebase Storage and add to Firestore
        for (const roomData of defaultRoomsData) {
          try {
            const imageRef = ref(storage, `rooms/${roomData.imageName}`);
            const imageUrl = await getDownloadURL(imageRef);
            const { imageName, ...roomWithoutImageName } = roomData;
            const id = roomData.name.toLowerCase().replace(/\s+/g, '-');
            const docRef = doc(db, 'rooms', id);
            await setDoc(docRef, { ...roomWithoutImageName, image: imageUrl }, { merge: true });
          } catch (error) {
            console.error(`Error getting image URL for ${roomData.name}:`, error);
            // Fallback to local path if Firebase Storage fails
            const { imageName, ...roomWithoutImageName } = roomData;
            const id = roomData.name.toLowerCase().replace(/\s+/g, '-');
            const docRef = doc(db, 'rooms', id);
            await setDoc(docRef, { ...roomWithoutImageName, image: `/img/${imageName}` }, { merge: true });
          }
        }

        // Fetch again after adding
        const newSnapshot = await getDocs(roomsRef);
        const roomsData: Room[] = [];
        newSnapshot.forEach((doc) => {
          roomsData.push({ id: doc.id, ...doc.data() } as Room);
        });
        // Deduplicate by name
        const unique = Array.from(
          new Map(roomsData.map((r) => [r.name, r])).values()
        );
        setRooms(unique);
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
      console.error('Error fetching rooms:', error);
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

    // Real-time listeners for maintenance and bookings
    const maintenanceRef = collection(db, 'maintenance');
    const maintenanceQuery = query(maintenanceRef, where('status', 'in', ['pending', 'in-progress']));
    const unsubscribeMaintenance = onSnapshot(maintenanceQuery, (snapshot) => {
      const underMaintenance: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        if (data.room && !underMaintenance.includes(data.room)) {
          underMaintenance.push(data.room);
        }
      });
      setRoomsUnderMaintenance(underMaintenance);
    }, (error) => {
      console.error('Maintenance listener error:', error);
    });

    const bookingsRef = collection(db, 'bookings');
    const unsubscribeBookings = onSnapshot(bookingsRef, (snapshot) => {
      const occupied: string[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        const checkIn = new Date(data.checkIn);
        const checkOut = new Date(data.checkOut);
        if (data.status === 'confirmed' && checkIn <= today && checkOut > today) {
          const roomType = data.room;
          if (roomType && !occupied.includes(roomType)) {
            occupied.push(roomType);
          }
        }
      });
      setRoomsOccupied(occupied);
    }, (error) => {
      console.error('Bookings listener error:', error);
    });

    return () => {
      unsubscribeMaintenance();
      unsubscribeBookings();
    };
  }, []);

  const handleBookRoom = (roomName: string) => {
    setSelectedRoom(roomName);
    setIsBookingModalOpen(true);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Always show all rooms; we'll indicate unavailable state on the card

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar onBookNowClick={() => setIsBookingModalOpen(true)} />

     {/* Hero Section */}
      <section
        id="home"
        className="relative min-h-screen flex items-center justify-center pt-0 pb-12 sm:pt-28 md:pt-32 lg:pt-0"
        style={{ backgroundColor: '#112240' }}
      >
        <div className="relative z-10 text-center text-white px-4 sm:px-6 max-w-6xl mx-auto w-full">
          <div className="mb-6 sm:mb-8 md:mb-10 animate-fadeIn">
          </div>
          <h1 className="font-poppins font-extrabold text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-8xl mb-4 sm:mb-6 animate-slideDown leading-tight">
            Experience Luxury<br />
            <span className="text-amber-400">&</span> Comfort
          </h1>
          <p
            className="text-sm sm:text-base md:text-lg mb-6 sm:mb-8 md:mb-10 max-w-3xl mx-auto animate-slideUp leading-relaxed p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl border-2 border-white/20 bg-white/5 backdrop-blur-sm"
            style={{ animationDelay: "0.4s", borderColor: 'rgba(255, 255, 255, 0.2)' }}
          >
            Welcome to NEMSU Hotel, where academic excellence meets hospitality. Our doors are open to students, faculty, and valued guests from all walks of life. Experience our high-class accommodations today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center animate-slideUp px-2" style={{ animationDelay: "0.6s" }}>
            <button
              onClick={() => {
                const contactSection = document.getElementById('contact');
                contactSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-amber-400 text-blue-900 px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-sm sm:text-base hover:bg-amber-500 transition-all shadow-lg hover:shadow-amber-400/50 hover:scale-105 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              Contact Us
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
            <button
              onClick={() => {
                const roomsSection = document.getElementById('rooms');
                roomsSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-transparent border-2 border-white text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-sm sm:text-base hover:bg-white/10 transition-all shadow-lg w-full sm:w-auto"
            >
              Explore Our Rooms
            </button>
          </div>
        </div>
      </section>

      {/* Rooms Section */}
      <section id="rooms" className="py-20 px-4 bg-white">
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

          <div className="flex flex-col gap-6 mb-12">
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
              rooms.map((room) => (
                <RoomCard
                  key={room.id || room.name}
                  name={room.name}
                  price={room.price}
                  image={room.image}
                  description={room.description}
                  perBed={room.perBed}
                  onClick={() => handleBookRoom(room.name)}
                  unavailable={roomsUnderMaintenance.includes(room.name)}
                  unavailableReason={roomsUnderMaintenance.includes(room.name) ? 'maintenance' : undefined}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-poppins font-bold text-4xl md:text-5xl text-blue-900 mb-6" style={{ color: '#112240' }}>
                Welcome to UNITEL
              </h2>
              <div className="w-24 h-1 bg-amber-400 mb-6" />
              <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                UNITEL NEMSU University Hotel offers a unique blend of comfort, convenience, and
                affordability right at the heart of NEMSU-Lianga Campus in Poblacion, Lianga, Surigao del Sur.
              </p>
              <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                Whether you're a visiting professor, student's family member, or traveler exploring
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
              <div className="relative h-[500px] rounded-3xl overflow-hidden shadow-2xl">
                <Image
                  src="/img/ROOMS.jpg"
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
      <section id="contact" className="py-20 px-4 text-black">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="font-poppins font-bold text-4xl md:text-5xl mb-4 text-blue-900"style={{ color: '#112240' }}>
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
              <p className="text-black text-xs sm:text-sm md:text-base break-all">jambautista@nemsu.edu.ph</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center hover:bg-white/20 transition-all">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-900" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm sm:text-lg md:text-xl mb-2">Phone</h3>
              <p className="text-black text-xs sm:text-sm md:text-base">+639105794330</p>
            </div>

            <div className="col-span-2 md:col-span-1 bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 text-center hover:bg-white/20 transition-all">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-900" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm sm:text-lg md:text-xl mb-2">Address</h3>
              <p className="text-black text-xs sm:text-sm md:text-base">NEMSU-Lianga Campus<br />P-5, Poblacion, Lianga SDS</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 px-4">
        <div className="container mx-auto max-w-7xl text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Image
              src="/img/LOGO.png"
              alt="UNITEL Logo"
              width={40}
              height={40}
              className="object-contain"
              style={{ width: 'auto', height: '40px' }}
            />
            <div>
              <h3 className="font-poppins font-bold text-xl">UNITEL</h3>
              <p className="text-sm text-gray-400">University Hotel</p>
            </div>
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} UNITEL NEMSU University Hotel. All rights reserved.
          </p>
        </div>
      </footer>

      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        selectedRoom={selectedRoom}
      />

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
