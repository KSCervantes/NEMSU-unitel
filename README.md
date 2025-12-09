# UNITEL Hotel Management System

A modern hotel booking and management system built with Next.js 16, Firebase, and Tailwind CSS.

## Features

### Client Side

- **Room Browsing** - View available rooms with images, prices, and capacity
- **Real-time Booking** - Book rooms with date picker and guest selection
- **Smart Calendar** - Only confirmed bookings block dates
- **Address Integration** - Philippine address autocomplete (PSGC API)
- **Booking Validation** - Prevents conflicts with confirmed bookings and maintenance periods

### Admin Panel

- **Dashboard** - Real-time metrics, occupancy rate, today's check-ins/check-outs
- **Analytics** - Visual charts (bar, pie, donut, histogram) for bookings and room distribution
- **Reservations** - Full CRUD operations with pagination, print, status management
- **Completed** - Track check-ins, check-outs, and cancelled bookings
- **Room Management** - Manage rooms, view bookings per room
- **Calendar** - Monthly view of bookings and maintenance
- **Maintenance** - Track room maintenance tasks

## Technology Stack

- **Framework**: Next.js 16.0.6 (App Router, Turbopack)
- **Frontend**: React 19.2.0, TypeScript 5
- **Styling**: Tailwind CSS 4
- **Backend**: Firebase (Firestore, Storage)
- **Date Picker**: react-day-picker 9.3.0

## Installation

1. Clone the repository
   ```bash
   git clone <repository-url>
   cd NEMSU-unitel-main
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   ```bash
   # Copy the example file
   cp .env.example .env.local
   
   # Edit .env.local and add your Firebase and Gmail credentials
   # See .env.example for required variables
   ```

4. Run development server
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

## Environment Variables

Required environment variables (see `.env.example` for details):

### Firebase (Required)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional)

### Gmail (Required for email functionality)
- `GMAIL_USER` - Your Gmail address
- `GMAIL_APP_PASSWORD` - Gmail App Password (not regular password)

**Important**: Never commit `.env.local` or `.env` files. They are already in `.gitignore`.

## Business Logic

**Booking Status Flow:**

1. Guest submits booking → Status: PENDING
2. Admin reviews → Accept/Reject
3. Status: CONFIRMED → Blocks calendar and reduces available rooms
4. Status: CANCELLED → Moves to completed section

**Important:** Only confirmed bookings affect room availability and calendar blocking.

## Admin Access

Admin access is controlled by:
1. **Domain Validation**: Only `@nemsu.edu.ph` emails allowed
2. **Whitelist**: Authorized emails in `lib/adminAuth.ts`
3. **Firebase Authentication**: Required for login

To add authorized admins, update the `AUTHORIZED_ADMIN_EMAILS` array in `lib/adminAuth.ts`.

## Deployment

### Netlify Deployment
See `DEPLOYMENT.md` for detailed Netlify deployment instructions.

Quick steps:
1. Connect GitHub repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `.next`
4. Add all environment variables from `.env.example` in Netlify Dashboard
5. Deploy!

### Security
- All credentials use environment variables
- Never commit `.env` files
- See `SECURITY_CHECKLIST.md` for security review

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── admin/             # Admin panel pages
│   ├── api/               # API routes
│   ├── components/        # React components
│   └── hooks/             # Custom React hooks
├── lib/                   # Utility libraries
│   ├── firebase.ts        # Firebase configuration
│   ├── adminAuth.ts       # Admin authorization
│   └── middleware/        # API middleware
├── public/                # Static assets
└── .env.example           # Environment variables template
```

## License

Private project for NEMSU University Hotel Management.

# NEMSU-unitel
