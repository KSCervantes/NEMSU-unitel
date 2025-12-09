# GitHub Upload Guide

## ✅ Pre-Upload Security Check

### 1. Verify No Sensitive Files
```bash
# Check for .env files
ls -la | grep .env
# Should only show .env.example (if exists)

# Check git status
git status
# Should NOT show any .env files
```

### 2. Review .gitignore
The `.gitignore` file is already configured to exclude:
- ✅ All `.env*` files
- ✅ `node_modules/`
- ✅ `.next/` build directory
- ✅ Log files
- ✅ OS-specific files

### 3. Check for Hardcoded Secrets
All credentials are properly using environment variables:
- ✅ Firebase config uses `process.env.NEXT_PUBLIC_*`
- ✅ Gmail uses `process.env.GMAIL_USER` and `process.env.GMAIL_APP_PASSWORD`
- ✅ No hardcoded API keys found

## 📝 Files Created for Security

1. **`.env.example`** - Template for environment variables (safe to commit)
2. **`SECURITY_CHECKLIST.md`** - Security review checklist
3. **`DEPLOYMENT.md`** - Deployment instructions
4. **`NETLIFY_SETUP.md`** - Netlify-specific setup guide
5. **`PRE_DEPLOYMENT_CHECKLIST.md`** - Pre-deployment verification

## 🚀 Upload Steps

### Step 1: Initialize Git (if not already)
```bash
git init
git branch -M main
```

### Step 2: Add Files
```bash
# Review what will be added
git status

# Add all files (excluding .gitignore patterns)
git add .
```

### Step 3: Verify No Sensitive Files
```bash
# Double-check no .env files are staged
git diff --cached --name-only | grep env
# Should return nothing

# Check for potential secrets
git diff --cached | grep -i "password\|secret\|key\|token" | grep -v "process.env" | grep -v "NEXT_PUBLIC"
# Should return minimal results (only in comments/docs)
```

### Step 4: Commit
```bash
git commit -m "Initial commit: NEMSU Hotel Management System

- Complete hotel booking and management system
- Admin panel with analytics and reservations
- Firebase integration
- Security improvements implemented
- Ready for Netlify deployment"
```

### Step 5: Create GitHub Repository
1. Go to GitHub.com
2. Click "New repository"
3. Name: `NEMSU-unitel` (or your preferred name)
4. Description: "Hotel Management System for NEMSU University"
5. Set to **Private** (recommended) or Public
6. **DO NOT** initialize with README, .gitignore, or license
7. Click "Create repository"

### Step 6: Push to GitHub
```bash
# Add remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/NEMSU-unitel.git

# Push to GitHub
git push -u origin main
```

## 🔒 Security Reminders

### Before Every Push
- [ ] Run `git status` to review changes
- [ ] Verify no `.env` files are staged
- [ ] Check for accidental credential commits
- [ ] Review sensitive code changes

### If You Accidentally Commit Secrets
```bash
# Remove from git history (use with caution)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (only if necessary and safe)
# git push origin --force --all
```

## 📋 Post-Upload Checklist

- [ ] Repository is created on GitHub
- [ ] All files uploaded successfully
- [ ] `.env.example` is in repository (template only)
- [ ] No `.env` files in repository
- [ ] README.md is clear and helpful
- [ ] Documentation files are included

## 🎯 Next Steps

After uploading to GitHub:
1. Set up Netlify deployment (see `NETLIFY_SETUP.md`)
2. Add environment variables in Netlify Dashboard
3. Configure custom domain (if needed)
4. Test deployed site

## ⚠️ Important Notes

1. **Never commit**:
   - `.env` files
   - `.env.local` files
   - API keys
   - Passwords
   - Firebase service account keys

2. **Always use**:
   - Environment variables for secrets
   - `.env.example` as template
   - Secure storage for credentials

3. **Repository Settings**:
   - Consider making repository **Private** if it contains business logic
   - Enable branch protection rules
   - Set up GitHub Actions for CI/CD (optional)

Your project is now ready for GitHub! 🎉

