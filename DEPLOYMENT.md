# Deployment Guide

## Pre-Deployment Checklist

### ✅ Security Review
- [x] All API keys use environment variables
- [x] No hardcoded credentials in code
- [x] `.env` files are in `.gitignore`
- [x] Admin email whitelist is configured
- [x] Firebase security rules are set up

### ✅ Code Quality
- [x] All critical security improvements implemented
- [x] Error boundaries in place
- [x] Input sanitization active
- [x] Rate limiting configured
- [x] CSRF protection enabled

## GitHub Upload

### Steps:
1. **Review sensitive files** - Ensure no `.env` files are committed
2. **Update .gitignore** - Already configured to exclude sensitive files
3. **Create .env.example** - Template for environment variables (already created)
4. **Commit and push**:
   ```bash
   git add .
   git commit -m "Initial commit: NEMSU Hotel Management System"
   git push origin main
   ```

### Files to NEVER commit:
- `.env`
- `.env.local`
- `.env.production`
- `node_modules/`
- `.next/`
- Any file with credentials

## Netlify Deployment

### Step 1: Build Settings
1. Go to Netlify Dashboard
2. Add new site from Git
3. Connect your GitHub repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Node version**: 18 or higher

### Step 2: Environment Variables
Add these in Netlify Dashboard > Site Settings > Environment Variables:

#### Required Firebase Variables:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id (optional)
```

#### Required Email Variables:
```
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

#### Optional:
```
NODE_ENV=production
```

### Step 3: Firebase Configuration
1. Ensure Firebase project is set up
2. Configure Firebase Security Rules for Firestore
3. Set up Firebase Storage rules
4. Enable Firebase Authentication

### Step 4: Domain Configuration
1. In Netlify, go to Domain Settings
2. Add your custom domain (if applicable)
3. Configure DNS settings as instructed

### Step 5: Deploy
1. Netlify will automatically deploy on push to main branch
2. Check build logs for any errors
3. Test the deployed site

## Post-Deployment

### Verify:
- [ ] Site loads correctly
- [ ] Firebase connection works
- [ ] Admin login works
- [ ] Email sending works
- [ ] Images load properly
- [ ] API routes function correctly

### Security Checklist:
- [ ] Environment variables are set in Netlify (not in code)
- [ ] Firebase security rules are configured
- [ ] Admin email whitelist is correct
- [ ] HTTPS is enabled (automatic on Netlify)
- [ ] No console errors in production

## Troubleshooting

### Build Fails:
- Check Node.js version (must be 18+)
- Verify all environment variables are set
- Check build logs for specific errors

### API Routes Not Working:
- Ensure environment variables are set in Netlify
- Check Netlify Functions configuration
- Verify API route paths

### Firebase Errors:
- Verify all Firebase env vars are set
- Check Firebase project settings
- Ensure Firebase Security Rules allow access

### Email Not Sending:
- Verify GMAIL_USER and GMAIL_APP_PASSWORD are set
- Check Gmail App Password is correct (not regular password)
- Verify rate limiting isn't blocking requests

## Important Notes

1. **Never commit `.env` files** - Always use environment variables
2. **Admin emails** - Update `lib/adminAuth.ts` with authorized emails
3. **Firebase Rules** - Configure proper security rules in Firebase Console
4. **Rate Limiting** - Currently uses in-memory store (consider Redis for production scale)
5. **Session Storage** - Uses client-side storage (consider server-side sessions for production)

## Support

For issues or questions:
- Check build logs in Netlify Dashboard
- Review Firebase Console for errors
- Check browser console for client-side errors

