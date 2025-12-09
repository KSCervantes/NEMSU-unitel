# Netlify Deployment Setup Guide

## Quick Start

### 1. Connect Repository
1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Click "Add new site" > "Import an existing project"
3. Connect to GitHub and select your repository
4. Netlify will detect Next.js automatically

### 2. Build Settings
Netlify should auto-detect, but verify:
- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Node version**: 18 (or higher)

### 3. Environment Variables
Go to **Site Settings > Environment Variables** and add:

#### Firebase Variables (Required)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID (optional)
```

#### Gmail Variables (Required)
```
GMAIL_USER
GMAIL_APP_PASSWORD
```

#### Optional
```
NODE_ENV=production
```

### 4. Deploy
1. Click "Deploy site"
2. Wait for build to complete
3. Check build logs for any errors
4. Visit your deployed site!

## Common Issues & Solutions

### Issue: Build Fails
**Solution**: 
- Check Node.js version (must be 18+)
- Verify all environment variables are set
- Check build logs for specific errors

### Issue: API Routes Not Working
**Solution**:
- Ensure environment variables are set in Netlify
- Check that API routes are in `app/api/` directory
- Verify Netlify Functions are enabled

### Issue: Images Not Loading
**Solution**:
- Check `next.config.ts` for image domain configuration
- Verify Firebase Storage URLs are correct
- Check image paths in code

### Issue: Firebase Connection Errors
**Solution**:
- Verify all Firebase env vars are set correctly
- Check Firebase project settings
- Ensure Firebase Security Rules allow access

### Issue: Email Not Sending
**Solution**:
- Verify `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set
- Ensure App Password is used (not regular password)
- Check rate limiting isn't blocking requests

## Post-Deployment Checklist

- [ ] Site loads without errors
- [ ] Firebase authentication works
- [ ] Admin login functions correctly
- [ ] Email sending works
- [ ] Images load properly
- [ ] API routes respond correctly
- [ ] No console errors in production
- [ ] HTTPS is enabled (automatic)

## Custom Domain Setup

1. Go to **Site Settings > Domain management**
2. Click "Add custom domain"
3. Enter your domain
4. Follow DNS configuration instructions
5. Wait for DNS propagation (can take up to 48 hours)

## Continuous Deployment

Netlify automatically deploys when you push to:
- `main` branch (production)
- Other branches (preview deployments)

To disable auto-deploy:
- Go to **Site Settings > Build & deploy**
- Configure branch settings

## Environment-Specific Variables

You can set different variables for:
- **Production**: All branches
- **Deploy previews**: Preview deployments
- **Branch deploys**: Specific branches

## Monitoring

- **Build logs**: View in Deploy log
- **Function logs**: View in Functions tab
- **Analytics**: Enable in Site Settings
- **Error tracking**: Consider adding Sentry or similar

## Support

If you encounter issues:
1. Check Netlify build logs
2. Review Firebase Console
3. Check browser console for errors
4. Verify environment variables are set correctly

