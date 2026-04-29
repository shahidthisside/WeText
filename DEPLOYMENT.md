# Deployment Guide

This guide covers deploying Wastext to various platforms for production use.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Frontend Deployment](#frontend-deployment)
  - [Vercel](#vercel)
  - [Netlify](#netlify)
  - [Firebase Hosting](#firebase-hosting)
- [Backend Deployment](#backend-deployment)
  - [Railway](#railway)
  - [Render](#render)
- [Database Setup](#database-setup)
- [Domain Configuration](#domain-configuration)
- [SSL/HTTPS Setup](#sslhttps-setup)

## Prerequisites

- Firebase project with Firestore and Authentication enabled
- Domain name (optional but recommended)
- GitHub repository with your code

## Environment Variables

### Production Environment Variables

Create production versions of your environment files with actual values:

**Frontend (.env.production)**
```env
VITE_FIREBASE_API_KEY=your_production_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_API_URL=https://your-backend-domain.com/api
```

**Backend (.env.production)**
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
NODE_ENV=production
PORT=5002
```

## Frontend Deployment

### Vercel

1. **Connect Repository**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Build Settings**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Set Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all `VITE_*` variables from your production config

4. **Deploy**
   - Click "Deploy"
   - Your app will be available at `https://your-project.vercel.app`

### Netlify

1. **Connect Repository**
   - Go to [Netlify Dashboard](https://app.netlify.com/)
   - Click "New site from Git"
   - Choose your GitHub repository

2. **Configure Build Settings**
   - Build command: `npm run build`
   - Publish directory: `dist`

3. **Set Environment Variables**
   - Go to Site Settings → Environment Variables
   - Add all `VITE_*` variables

4. **Deploy**
   - Click "Deploy site"
   - Your app will be available at `https://your-site-name.netlify.app`

### Firebase Hosting

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login and Initialize**
   ```bash
   firebase login
   firebase init hosting
   ```

3. **Configure firebase.json**
   ```json
   {
     "hosting": {
       "public": "dist",
       "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
       "rewrites": [
         {
           "source": "**",
           "destination": "/index.html"
         }
       ]
     }
   }
   ```

4. **Build and Deploy**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

## Backend Deployment

### Railway

1. **Create New Project**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project"
   - Choose "Deploy from GitHub repo"

2. **Configure Service**
   - Select your repository
   - Set root directory to `server-simple`
   - Railway will auto-detect Node.js

3. **Set Environment Variables**
   - Go to Variables tab
   - Add all backend environment variables

4. **Configure Start Command**
   - Add start command: `node index-firebase.js`

5. **Deploy**
   - Railway will automatically deploy
   - Note the generated URL for your API

### Render

1. **Create Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - Name: `wastext-backend`
   - Environment: `Node`
   - Build Command: `cd server-simple && npm install`
   - Start Command: `cd server-simple && node index-firebase.js`

3. **Set Environment Variables**
   - Add all backend environment variables in the Environment section

4. **Deploy**
   - Click "Create Web Service"
   - Note the generated URL

## Database Setup

### Firestore Configuration

1. **Security Rules**
   - Apply the rules provided in the main README
   - Go to Firebase Console → Firestore → Rules

2. **Indexes**
   - Create composite indexes as specified in the main README
   - Wait for indexes to build (5-10 minutes)

3. **Backup Strategy**
   - Enable automatic backups in Firebase Console
   - Set up export schedules for data protection

## Domain Configuration

### Custom Domain Setup

1. **Frontend Domain**
   - Add custom domain in your hosting provider
   - Configure DNS records (A/CNAME)
   - Enable SSL certificate

2. **Backend Domain**
   - Add custom domain for API
   - Update `VITE_API_URL` in frontend environment variables
   - Configure CORS settings in backend

3. **DNS Configuration**
   ```
   Type    Name    Value
   A       @       your-frontend-ip
   CNAME   api     your-backend-domain
   ```

## SSL/HTTPS Setup

Most modern hosting platforms provide automatic SSL certificates. Ensure:

- Frontend is served over HTTPS
- Backend API uses HTTPS
- Mixed content warnings are resolved
- CORS is configured for HTTPS origins

## Post-Deployment Checklist

- [ ] Frontend loads correctly
- [ ] Backend API responds
- [ ] Authentication works
- [ ] Real-time features function
- [ ] Database operations work
- [ ] SSL certificates are active
- [ ] Custom domains resolve (if applicable)

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Update CORS configuration in backend
   - Ensure frontend URL is whitelisted

2. **Environment Variables**
   - Verify all variables are set correctly
   - Check for typos in variable names

3. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies are installed

4. **Database Connection**
   - Verify Firebase credentials
   - Check Firestore security rules

## Security Considerations

- Use environment variables for all secrets
- Enable HTTPS everywhere
- Configure proper CORS settings
- Set up rate limiting
- Monitor for security vulnerabilities
- Keep dependencies updated

Your Wastext application is now ready for production!