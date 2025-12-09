/**
 * Room interface for the hotel management system
 * All room data should be stored in Firestore and fetched dynamically
 */
export interface Room {
  id?: string;
  name: string;
  price: string; // Formatted price string (e.g., "1,200.00")
  priceNumber?: number; // Numeric price for calculations
  description: string;
  image: string; // Firebase Storage URL or local path
  perBed?: string; // Optional per-bed indicator (e.g., "/ Bed")
  maxGuests: number; // Maximum number of guests allowed
  slug?: string; // URL-friendly identifier
}

/**
 * Room data structure for internal use
 */
export interface RoomData {
  [key: string]: {
    image: string;
    price: number;
    maxGuests: number;
    perBed?: string;
  };
}

