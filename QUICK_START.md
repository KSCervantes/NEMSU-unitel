# Quick Start Guide - GitHub & Netlify

## 🚀 Fast Track Deployment

### Step 1: Install Netlify Plugin (Optional but Recommended)
```bash
npm install -D @netlify/plugin-nextjs
```
This plugin is already added to `package.json`, so just run:
```bash
npm install
```

### Step 2: Upload to GitHub

```bash
# Initialize git (if not already)
git init
git branch -M main

# Add all files
git add .

# Commit
git commit -m "Initial commit: NEMSU Hotel Management System"

# Create repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### Step 3: Deploy to Netlify

1. **Go to [Netlify](https://app.netlify.com)**
2. **Click "Add new site" > "Import an existing project"**
3. **Connect GitHub** and select your repository
4. **Build settings** (auto-detected):
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: 18
5. **Add Environment Variables** (Site Settings > Environment Variables):
   - Copy all variables from `.env.example`
   - Add each one with its actual value
6. **Deploy!**

## 📋 Required Environment Variables

Add these in Netlify Dashboard:

### Firebase (Required)
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Gmail (Required)
```
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

## ✅ Pre-Upload Checklist

- [x] No `.env` files in repository
- [x] All credentials use environment variables
- [x] `.gitignore` configured
- [x] Build tested locally (`npm run build`)
- [x] Documentation complete

## 🎯 That's It!

Your project is ready for:
- ✅ GitHub upload (secure, no credentials exposed)
- ✅ Netlify deployment (configured and ready)

See detailed guides:
- `GITHUB_UPLOAD_GUIDE.md` - Step-by-step GitHub upload
- `NETLIFY_SETUP.md` - Detailed Netlify setup
- `DEPLOYMENT.md` - General deployment guide

