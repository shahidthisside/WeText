# Firestore Security Rules & Indexes Setup

## 🔥 CRITICAL: You must complete BOTH steps below to fix all errors!

## Step 1: Update Firestore Security Rules

Go to Firebase Console → Firestore Database → Rules tab and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
    }
    
    // Posts collection
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.authorId;
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.authorId ||
        // Allow liking/commenting by any authenticated user
        request.writeFields.hasOnly(['likes', 'comments', 'updatedAt'])
      );
      allow delete: if request.auth != null && request.auth.uid == resource.data.authorId;
    }
    
    // Messages collection - UPDATED FOR BETTER PERMISSIONS
    match /messages/{messageId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.senderId ||
        request.auth.uid == resource.data.receiverId
      );
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.senderId &&
        request.resource.data.keys().hasAll(['senderId', 'receiverId', 'content', 'type', 'isRead', 'createdAt']);
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.senderId ||
        request.auth.uid == resource.data.receiverId
      ) && request.writeFields.hasOnly(['isRead']);
      allow delete: if request.auth != null && request.auth.uid == resource.data.senderId;
    }
    
    // Friend requests collection
    match /friendRequests/{requestId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.senderId ||
        request.auth.uid == resource.data.receiverId
      );
      allow create: if request.auth != null && request.auth.uid == request.resource.data.senderId;
      allow update: if request.auth != null && request.auth.uid == resource.data.receiverId;
      allow delete: if request.auth != null && (
        request.auth.uid == resource.data.senderId ||
        request.auth.uid == resource.data.receiverId
      );
    }
    
    // Friendships collection
    match /friendships/{friendshipId} {
      allow read: if request.auth != null && request.auth.uid in resource.data.users;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.users;
      allow delete: if request.auth != null && request.auth.uid in resource.data.users;
    }
    
    // Matches collection
    match /matches/{matchId} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.users;
    }
    
    // Notifications collection
    match /notifications/{notificationId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.recipient;
    }
  }
}
```

## Step 2: Create Required Firestore Indexes

**IMPORTANT**: You need to create these indexes manually in Firebase Console:

### Manual Index Creation Steps:

1. Go to Firebase Console → Your Project → Firestore Database → Indexes
2. Click "Create Index" for each of the following:

### Index 1: Messages (Sender + CreatedAt)
- **Collection ID**: `messages`
- **Fields**: 
  - `senderId` (Ascending)
  - `createdAt` (Ascending)
- **Query scope**: Collection

### Index 2: Messages (Receiver + CreatedAt)  
- **Collection ID**: `messages`
- **Fields**:
  - `receiverId` (Ascending) 
  - `createdAt` (Ascending)
- **Query scope**: Collection

### Index 3: Friend Requests
- **Collection ID**: `friendRequests`
- **Fields**:
  - `receiverId` (Ascending)
  - `status` (Ascending)
  - `createdAt` (Descending)
- **Query scope**: Collection

### Index 4: Posts with Type Filter
- **Collection ID**: `posts`
- **Fields**:
  - `type` (Ascending)
  - `createdAt` (Descending)
- **Query scope**: Collection

### Index 5: Friendships
- **Collection ID**: `friendships`
- **Fields**:
  - `users` (Array)
- **Query scope**: Collection

## Step 3: Test the Indexes

After creating the indexes, wait 5-10 minutes for them to build, then test:

1. Try sending a message in chat
2. Check if messages appear in real-time
3. Verify friend requests work
4. Test posts loading

## How to Update Rules:

1. Go to Firebase Console
2. Select your project: `wastext-social-platform`
3. Go to Firestore Database
4. Click on "Rules" tab
5. Replace the existing rules with the above rules
6. Click "Publish"

## Troubleshooting:

If you still see permission errors:
1. Make sure you're logged in to the app
2. Check that the user ID matches in the database
3. Verify the indexes are built (green checkmark in Firebase Console)
4. Clear browser cache and refresh

These updated rules provide:
- Proper message permissions for real-time chat
- Better security for all collections
- Support for the new query structure
- Proper friend management permissions