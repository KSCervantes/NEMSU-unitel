"use client";
export const dynamic = "force-dynamic";

import Image from "next/image";
import { useState, useEffect } from "react";

interface NavbarProps {
  onBookNowClick?: () => void;
}

export default function Navbar({ onBookNowClick }: NavbarProps = {}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Rooms", href: "#rooms" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "py-3" : "py-5"
        } bg-[#112240]`}
    >
      <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 flex items-center justify-between max-w-7xl">
        <div className="flex items-center gap-2 sm:gap-3">
          <Image
            src="/img/LOGO.webp"
            alt="UNITEL Logo"
            width={80}
            height={80}
            className="h-20 w-auto mx-auto object-contain"
            style={{ width: 'auto', height: '80px' }}
            priority
          />
          <div className="text-center">
            <h1 className="font-poppins font-bold text-base sm:text-lg md:text-xl text-white transition-colors">
              UNITEL
            </h1>
            <p className="text-xs text-white/90 transition-colors">
              University Hotel
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="font-medium text-white text-sm lg:text-base transition-colors hover:text-amber-400"
            >
              {link.name}
            </a>
          ))}
          <button
            onClick={onBookNowClick}
            className="bg-amber-400 text-blue-900 px-5 lg:px-6 py-2 lg:py-2.5 rounded-full font-semibold text-sm lg:text-base hover:bg-amber-500 transition-all active:scale-95"
          >
            BOOK NOW
          </button>
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
        <div className="md:hidden bg-white mt-2 py-3 px-3 sm:px-4 space-y-2 sm:space-y-3 rounded-b-lg">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="block text-gray-700 hover:text-blue-900 font-medium py-2 px-2 text-sm sm:text-base rounded-lg hover:bg-gray-50 transition-colors"
            >
              {link.name}
            </a>
          ))}
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              onBookNowClick?.();
            }}
            className="w-full bg-amber-400 text-blue-900 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-semibold text-xs sm:text-sm text-center hover:bg-amber-500 transition-all active:scale-95 mt-2"
          >
            BOOK NOW
          </button>
        </div>
      )}
    </nav>
  );
}
