import Image from "next/image";

interface RoomCardProps {
  name: string;
  price: string;
  image: string;
  description: string;
  perBed?: string;
  onClick: () => void;
  unavailable?: boolean;
  unavailableReason?: 'occupied' | 'maintenance';
}

export default function RoomCard({ name, price, image, description, perBed, onClick, unavailable = false, unavailableReason }: RoomCardProps) {
  return (
    <div className={`group relative bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-md transition-all duration-500 border ${unavailable ? 'border-red-200' : 'border-gray-100 hover:shadow-2xl hover:border-blue-200'}`}>
      <div className="flex flex-col md:flex-row h-full">
        {/* Image Section */}
        <div className="relative h-48 sm:h-56 md:h-auto md:w-80 shrink-0 overflow-hidden">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          {unavailable && (
            <div className="absolute top-2 sm:top-3 left-2 sm:left-3 px-2 sm:px-3 py-1 rounded-full text-xs font-semibold bg-red-600 text-white shadow-md">
              {unavailableReason === 'maintenance' ? 'Under Maintenance' : 'Occupied'}
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="flex flex-col grow p-4 sm:p-6 md:p-8">
          <div className="grow">
            {/* Room Header */}
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <div className="flex-1">
                <h3 className="font-poppins font-bold text-xl sm:text-2xl md:text-3xl text-gray-900 mb-1 sm:mb-2 group-hover:text-blue-900 transition-colors">
                  {name}
                </h3>
                <div className="flex items-center gap-1 sm:gap-2 text-amber-500 mb-2 sm:mb-3">
                  <svg className="w-4 sm:w-5 h-4 sm:h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                  <svg className="w-4 sm:w-5 h-4 sm:h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                  <svg className="w-4 sm:w-5 h-4 sm:h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                  <svg className="w-4 sm:w-5 h-4 sm:h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                  <svg className="w-4 sm:w-5 h-4 sm:h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Amenities Icons */}
            <div className="flex gap-3 sm:gap-4 mb-3 sm:mb-4 text-gray-600">
              <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
                <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>2-4 guests</span>
              </div>
            </div>

            <p className="text-gray-600 text-xs sm:text-sm md:text-base leading-relaxed mb-4 sm:mb-6 line-clamp-2">
              {description}
            </p>
          </div>

          {/* Price and Button Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-4 sm:pt-6 border-t border-gray-100 gap-4 sm:gap-0">
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-gray-500 mb-1">Starting from</span>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-900">₱{price}</span>
                {perBed && (
                  <span className="text-xs sm:text-sm md:text-base text-gray-500 font-medium">{perBed}</span>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-0.5 sm:mt-1">per night</span>
            </div>
            <button
              onClick={onClick}
              className={`px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 rounded-lg md:rounded-xl font-bold text-xs sm:text-sm md:text-base transition-all whitespace-nowrap transform duration-300 text-white shadow-lg hover:shadow-xl active:scale-95 sm:hover:scale-105`}
              style={{ backgroundColor: '#1a3a52' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0f2537'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1a3a52'; }}
            >
              Book Now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}