# Wastext - Modern Social Media Platform

**A feature-rich, real-time social media platform built with modern web technologies**

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Security](#security)

## Overview

Wastext is a modern, full-stack social media platform that enables users to connect, share thoughts, and engage in real-time conversations. Built with cutting-edge technologies, it offers a seamless user experience with features comparable to major social platforms.

### Key Highlights

- **Real-time Messaging**: Instant chat system with live updates
- **Smart Matching**: AI-powered user matching based on interests and personality
- **Rich Social Features**: Posts, comments, likes, friend system, and more
- **Modern UI/UX**: Responsive design with dark/light theme support
- **Type-Safe**: Full TypeScript implementation for reliability
- **Scalable Architecture**: Built for performance and growth

## Features

### Core Social Features
- **User Authentication**: Secure signup/login with Firebase Auth
- **Profile Management**: Customizable profiles with interests and bio
- **Real-time Chat**: Instant messaging with friends
- **Friend System**: Send/accept friend requests, manage connections
- **Posts & Feed**: Create, share, like, and comment on posts
- **User Discovery**: Search and find new people to connect with
- **Smart Matching**: Algorithm-based user recommendations

### Technical Features
- **Real-time Updates**: Firebase real-time listeners for instant sync
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Theme Support**: Dark and light mode with smooth transitions
- **Type Safety**: Comprehensive TypeScript implementation
- **Modern Animations**: Smooth interactions with Framer Motion
- **Cross-platform**: Compatible with all major browsers and OS

### Advanced Features
- **Anonymous Posting**: Share thoughts anonymously
- **Trending Topics**: Real-time hashtag analysis
- **Online Status**: See who's online and active
- **Message History**: Persistent chat history
- **Profile Customization**: Rich profile editing capabilities

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS for utility-first styling
- **Animations**: Framer Motion for smooth interactions
- **Routing**: React Router v6 for navigation
- **State Management**: Zustand for lightweight state management
- **Icons**: Heroicons for consistent iconography
- **Notifications**: React Hot Toast for user feedback

### Backend
- **Database**: Firebase Firestore (NoSQL)
- **Authentication**: Firebase Authentication
- **Server**: Express.js with Firebase Admin SDK
- **Real-time**: Firebase real-time listeners
- **Security**: Firestore security rules and input validation

### Development & Deployment
- **Language**: TypeScript for type safety
- **Linting**: ESLint for code quality
- **Version Control**: Git with conventional commits
- **Package Manager**: npm
- **Deployment**: Ready for Vercel, Netlify, or Firebase Hosting

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0 or higher)
- **npm** (v8.0 or higher)
- **Git** for version control
- **Firebase Account** for backend services

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/shahidthisside/wastext.git
   cd wastext
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server-simple
   npm install
   cd ..
   ```

### Configuration

1. **Firebase Setup**
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password provider)
   - Create a Firestore database
   - Generate a service account key

2. **Environment Variables**
   
   **Frontend Configuration** (`.env`):
   ```bash
   cp .env.example .env
   ```
   
   Fill in your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
   VITE_API_URL=http://localhost:5002/api
   ```

   **Backend Configuration** (`server-simple/.env`):
   ```bash
   cd server-simple
   cp .env.example .env
   ```
   
   Fill in your Firebase Admin configuration:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY_ID=your_private_key_id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_CLIENT_ID=your_client_id
   NODE_ENV=development
   PORT=5002
   ```

3. **Firestore Security Rules**
   
   Apply these rules in your Firebase Console (Firestore Database → Rules):
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && request.auth.uid == userId;
       }
       match /posts/{postId} {
         allow read: if request.auth != null;
         allow create: if request.auth != null && request.auth.uid == request.resource.data.authorId;
         allow update: if request.auth != null;
       }
       match /messages/{messageId} {
         allow read, write: if request.auth != null && (
           request.auth.uid == resource.data.senderId ||
           request.auth.uid == resource.data.receiverId
         );
       }
       match /friendRequests/{requestId} {
         allow read, write: if request.auth != null;
       }
       match /friendships/{friendshipId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

4. **Create Required Indexes**
   
   Create these composite indexes in Firebase Console (Firestore → Indexes):
   - **messages**: `senderId` (Ascending), `createdAt` (Ascending)
   - **messages**: `receiverId` (Ascending), `createdAt` (Ascending)
   - **friendRequests**: `receiverId` (Ascending), `status` (Ascending), `createdAt` (Descending)

### Running the Application

1. **Start the backend server**
   ```bash
   cd server-simple
   npm start
   ```

2. **Start the frontend development server** (in a new terminal)
   ```bash
   npm run dev
   ```

3. **Open your browser**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5002

## Usage

### Basic Workflow

1. **Sign Up**: Create a new account with email and password
2. **Complete Profile**: Add your interests, bio, and profile information
3. **Discover Users**: Use the search feature to find interesting people
4. **Connect**: Send friend requests to users you'd like to connect with
5. **Chat**: Start real-time conversations with your friends
6. **Share**: Create posts, thoughts, and stories to share with your network
7. **Engage**: Like, comment, and interact with others' content

### Key Features Usage

- **Real-time Chat**: Click on any friend to start an instant conversation
- **Friend Management**: Use the Friends page to manage your connections
- **Profile Customization**: Edit your profile to showcase your personality
- **Content Creation**: Use the post creation modal to share your thoughts
- **Theme Toggle**: Switch between dark and light modes in settings

## API Documentation

### Authentication Endpoints

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### User Endpoints

```http
GET    /api/users
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
GET    /api/users/search?q=query
```

### Posts Endpoints

```http
GET    /api/posts
POST   /api/posts
GET    /api/posts/:id
PUT    /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/like
POST   /api/posts/:id/comment
```

### Messages Endpoints

```http
GET    /api/messages/:userId
POST   /api/messages
PUT    /api/messages/:id/read
```

## Deployment

For detailed deployment instructions, see the [Deployment Guide](DEPLOYMENT.md).

### Quick Deploy Options

#### Frontend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

#### Backend (Railway)
1. Create a new service on Railway
2. Connect your GitHub repository
3. Set environment variables
4. Deploy the `server-simple` directory

## Security

- **Authentication**: Secure Firebase Authentication
- **Data Protection**: Firestore security rules
- **Input Validation**: Server-side validation for all inputs
- **Environment Variables**: Sensitive data stored securely
- **HTTPS**: All communications encrypted
- **Rate Limiting**: API rate limiting implemented

---

**Developed by [shahidthisside](https://github.com/shahidthisside)**