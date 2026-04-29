# Wastext - Modern Social Media Platform

<div align="center">

![Wastext Logo](https://via.placeholder.com/200x80/4F46E5/FFFFFF?text=WASTEXT)

**A feature-rich, real-time social media platform built with modern web technologies**

[![React](https://img.shields.io/badge/React-18.0+-61DAFB?style=flat&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-9.0+-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.0+-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Live Demo](https://your-demo-url.com) • [Documentation](https://github.com/yourusername/wastext-v2/wiki) • [Report Bug](https://github.com/yourusername/wastext-v2/issues) • [Request Feature](https://github.com/yourusername/wastext-v2/issues)

</div>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Performance](#performance)
- [Roadmap](#roadmap)
- [License](#license)
- [Support](#support)
- [Acknowledgments](#acknowledgments)

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

## Screenshots

<div align="center">

### Landing Page
![Landing Page](https://via.placeholder.com/800x400/4F46E5/FFFFFF?text=Landing+Page)

### Dashboard
![Dashboard](https://via.placeholder.com/800x400/10B981/FFFFFF?text=Dashboard)

### Real-time Chat
![Chat Interface](https://via.placeholder.com/800x400/F59E0B/FFFFFF?text=Chat+Interface)

### User Profiles
![User Profile](https://via.placeholder.com/800x400/EF4444/FFFFFF?text=User+Profile)

</div>

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
   git clone https://github.com/yourusername/wastext-v2.git
   cd wastext-v2
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
   
   Copy the rules from `FIRESTORE-RULES.md` and apply them in your Firebase Console:
   - Go to Firestore Database → Rules
   - Replace the default rules with the provided rules
   - Publish the changes

4. **Create Required Indexes**
   
   Follow the index creation guide in `FIRESTORE-RULES.md` to create the necessary composite indexes.

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

For detailed API documentation, visit our [API Documentation](https://github.com/yourusername/wastext-v2/wiki/API-Documentation).

## Contributing

We welcome contributions from the community! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

### Development Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Follow TypeScript best practices
- Use ESLint configuration provided
- Write meaningful commit messages
- Add comments for complex logic
- Ensure responsive design principles

## Testing

```bash
# Run frontend tests
npm test

# Run backend tests
cd server-simple
npm test

# Run end-to-end tests
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

## Deployment

### Frontend Deployment (Vercel)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Backend Deployment (Railway/Render)

1. Create a new service on Railway or Render
2. Connect your GitHub repository
3. Set environment variables
4. Deploy the `server-simple` directory

### Full Stack Deployment

For detailed deployment instructions, see our [Deployment Guide](DEPLOYMENT.md).

## Security

- **Authentication**: Secure Firebase Authentication
- **Data Protection**: Firestore security rules
- **Input Validation**: Server-side validation for all inputs
- **Environment Variables**: Sensitive data stored securely
- **HTTPS**: All communications encrypted
- **Rate Limiting**: API rate limiting implemented

For security concerns, please email security@wastext.com

## Performance

- **Lighthouse Score**: 95+ (Performance, Accessibility, Best Practices, SEO)
- **Bundle Size**: Optimized with Vite and code splitting
- **Real-time Updates**: Efficient Firebase listeners
- **Caching**: Intelligent caching strategies
- **Image Optimization**: Lazy loading and compression

## Roadmap

### Version 2.1 (Q2 2024)
- [ ] Voice messages in chat
- [ ] Group chat functionality
- [ ] Advanced search filters
- [ ] Push notifications

### Version 2.2 (Q3 2024)
- [ ] Video calling integration
- [ ] Story features
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)

### Version 3.0 (Q4 2024)
- [ ] AI-powered content recommendations
- [ ] Advanced matching algorithms
- [ ] Monetization features
- [ ] Multi-language support

See the [open issues](https://github.com/yourusername/wastext-v2/issues) for a full list of proposed features and known issues.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

### Getting Help

- **Documentation**: Check our [Wiki](https://github.com/yourusername/wastext-v2/wiki)
- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/yourusername/wastext-v2/issues)
- **Discussions**: Join community discussions in [GitHub Discussions](https://github.com/yourusername/wastext-v2/discussions)
- **Email**: Contact us at support@wastext.com

### Community

- **Discord**: [Join our Discord server](https://discord.gg/wastext)
- **Twitter**: [@WastextApp](https://twitter.com/wastextapp)
- **LinkedIn**: [Wastext Company Page](https://linkedin.com/company/wastext)

## Acknowledgments

- **Firebase** for providing excellent backend services
- **React Team** for the amazing frontend framework
- **Tailwind CSS** for the utility-first CSS framework
- **Heroicons** for beautiful icons
- **Framer Motion** for smooth animations
- **Open Source Community** for inspiration and contributions

---

<div align="center">

**Built with ❤️ by the Wastext Team**

[Website](https://wastext.com) • [Blog](https://blog.wastext.com) • [Twitter](https://twitter.com/wastextapp) • [LinkedIn](https://linkedin.com/company/wastext)

</div>