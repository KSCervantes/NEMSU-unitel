"use client";
export const dynamic = "force-dynamic";

import Image from "next/image";
import { useState, useEffect } from "react";

interface NavbarProps {
  hotelName?: string;
}

export default function Navbar({ hotelName = 'UNITEL Hotel' }: NavbarProps = {}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const normalizedHotelName = hotelName.trim() || 'UNITEL Hotel';
  const hotelNameParts = normalizedHotelName.split(' ').filter(Boolean);
  const primaryLabel = hotelNameParts[0] || 'UNITEL';
  const secondaryLabel = hotelNameParts.slice(1).join(' ') || 'Hotel';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeDisplay = currentTime
    ? currentTime.toLocaleTimeString('en-PH', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    : '--:--:-- --';

  const dateDisplay = currentTime
    ? currentTime.toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
    : '--- --- --';

  const navLinks = [
    {
      name: "Home",
      href: "https://www.nemsu-hm-operation.devworkstudios.net/"
    },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "py-2 sm:py-3" : "py-4 sm:py-5"
        } bg-[#112240] shadow-lg`}
    >
      {/* Consistent gradient background */}
      <div className="absolute inset-0 bg-linear-to-b from-[#0b1433]/50 via-[#112240]/80 to-[#112240] pointer-events-none" />

      <div className="relative container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 flex items-center justify-between max-w-7xl">
        <div className="flex items-center gap-2 sm:gap-3" suppressHydrationWarning>
          <Image
            src="/img/NEMSU_LOGOO.webp"
            alt={`${normalizedHotelName} Logo`}
            width={80}
            height={80}
            className={`object-contain transition-all duration-300 ${isScrolled ? 'h-14 sm:h-16' : 'h-20'}`}
            style={{ width: 'auto' }}
            priority
          />
          <div className="text-center">
            <h1 className="font-poppins font-bold text-base sm:text-lg md:text-xl text-white transition-colors">
              {primaryLabel}
            </h1>
            <p className="text-xs text-white/90 transition-colors">
              {secondaryLabel}
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {/* Philippine Flag and Time */}
          <div className="flex items-center gap-3 text-white text-sm">
            {/* Philippine Flag */}
            <div className="flex items-center gap-1">
              <svg width="24" height="18" viewBox="0 0 24 18" className="rounded-sm">
                <rect width="24" height="9" fill="#0038A8" />
                <rect y="9" width="24" height="9" fill="#CE1126" />
                <polygon points="0,0 10,9 0,18" fill="#FFFFFF" />
              </svg>
              <span className="text-xs font-medium">PH</span>
            </div>
            {/* Time and Day */}
            <div className="text-right" suppressHydrationWarning>
              <div className="font-mono text-xs">
                {timeDisplay}
              </div>
              <div className="text-xs opacity-90">
                {dateDisplay}
              </div>
            </div>
          </div>

          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="btn-book-now"
            >
              {link.name}
            </a>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden text-white p-1"
        >
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {isMobileMenuOpen ? (
              <path d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden mt-2 py-3 px-3 sm:px-4 space-y-2 sm:space-y-3 rounded-b-lg bg-[#112240] text-white border-t border-white/10 backdrop-blur-sm">
          {/* Mobile Philippine Flag and Time */}
          <div className="flex items-center justify-center gap-3 py-2 border-b border-white/10 mb-3">
            <div className="flex items-center gap-1">
              <svg width="20" height="15" viewBox="0 0 24 18" className="rounded-sm">
                <rect width="24" height="9" fill="#0038A8" />
                <rect y="9" width="24" height="9" fill="#CE1126" />
                <polygon points="0,0 10,9 0,18" fill="#FFFFFF" />
              </svg>
              <span className="text-xs font-medium">PH</span>
            </div>
            <div className="text-center" suppressHydrationWarning>
              <div className="font-mono text-xs">
                {timeDisplay}
              </div>
              <div className="text-xs opacity-90">
                {dateDisplay}
              </div>
            </div>
          </div>

          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => {
                setIsMobileMenuOpen(false);
              }}
              className="w-full btn-book-now text-center justify-center"
            >
              {link.name}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
