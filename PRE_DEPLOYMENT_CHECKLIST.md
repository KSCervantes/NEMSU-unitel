# Pre-Deployment Checklist

## 🔒 Security Review

### Environment Variables
- [x] All Firebase credentials use environment variables
- [x] Gmail credentials use environment variables
- [x] No hardcoded API keys in code
- [x] `.env.example` file created
- [x] `.gitignore` properly configured

### Files to Verify
- [ ] Run `git status` - ensure no `.env` files are staged
- [ ] Check `git ls-files | grep env` - should return nothing
- [ ] Verify `.gitignore` includes all sensitive file patterns

## 📦 Code Quality

### Build Test
- [ ] Run `npm run build` - should complete without errors
- [ ] Check for TypeScript errors: `npm run type-check`
- [ ] Run linter: `npm run lint`

### Functionality Test
- [ ] Test admin login
- [ ] Test booking creation
- [ ] Test email sending
- [ ] Test image loading
- [ ] Test all admin pages

## 🚀 GitHub Upload

### Before Committing
```bash
# 1. Check what will be committed
git status

# 2. Verify no sensitive files
git diff --cached | grep -i "password\|secret\|key\|token"

# 3. Review .gitignore
cat .gitignore

# 4. Test build
npm run build
```

### Commit and Push
```bash
git add .
git commit -m "Initial commit: NEMSU Hotel Management System"
git push origin main
```

## 🌐 Netlify Deployment

### Pre-Deployment
- [ ] All environment variables documented in `.env.example`
- [ ] `netlify.toml` configured
- [ ] Build command tested locally
- [ ] Node version specified (18+)

### Environment Variables Setup
Add these in Netlify Dashboard:
- [ ] All Firebase variables (NEXT_PUBLIC_*)
- [ ] Gmail credentials (GMAIL_USER, GMAIL_APP_PASSWORD)
- [ ] NODE_ENV=production

### Post-Deployment
- [ ] Site loads correctly
- [ ] Firebase connection works
- [ ] Admin login works
- [ ] Email sending works
- [ ] Images load properly
- [ ] No console errors

## ✅ Final Verification

### Security
- [ ] No credentials in code
- [ ] Environment variables set in Netlify
- [ ] `.env` files not in repository
- [ ] Admin whitelist configured

### Functionality
- [ ] All features work
- [ ] No build errors
- [ ] No runtime errors
- [ ] Performance is acceptable

### Documentation
- [ ] README.md updated
- [ ] DEPLOYMENT.md created
- [ ] SECURITY_CHECKLIST.md reviewed
- [ ] NETLIFY_SETUP.md created

## 🎯 Ready to Deploy!

Once all items are checked, your project is ready for:
1. ✅ GitHub upload
2. ✅ Netlify deployment

Good luck! 🚀

