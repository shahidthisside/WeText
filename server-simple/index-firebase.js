const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const { db, verifyFirebaseToken } = require('./firebase-admin')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 5002

// Security middleware
app.use(helmet())
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})
app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Wastext API',
    version: '2.0.0'
  })
})

// Protected routes (require Firebase authentication)
app.use('/api/posts', verifyFirebaseToken)
app.use('/api/users', verifyFirebaseToken)
app.use('/api/messages', verifyFirebaseToken)

// Posts endpoints
app.get('/api/posts', async (req, res) => {
  try {
    const { type, limit = 20 } = req.query
    let query = db.collection('posts').orderBy('createdAt', 'desc').limit(parseInt(limit))
    
    if (type) {
      query = query.where('type', '==', type)
    }

    const snapshot = await query.get()
    const posts = []

    for (const doc of snapshot.docs) {
      const postData = doc.data()
      const authorDoc = await db.collection('users').doc(postData.authorId).get()
      const authorData = authorDoc.data()

      posts.push({
        _id: doc.id,
        author: {
          _id: postData.authorId,
          username: authorData?.username || 'Unknown',
          avatar: authorData?.avatar || ''
        },
        content: postData.content,
        type: postData.type,
        tags: postData.tags || [],
        likes: postData.likes || [],
        comments: postData.comments || [],
        isAnonymous: postData.isAnonymous || false,
        createdAt: postData.createdAt?.toDate() || new Date(),
        updatedAt: postData.updatedAt?.toDate() || new Date()
      })
    }

    res.json({ success: true, data: posts })
  } catch (error) {
    console.error('Get posts error:', error)
    res.status(500).json({ error: 'Failed to fetch posts' })
  }
})

app.post('/api/posts', async (req, res) => {
  try {
    const { content, type = 'post', tags = [], isAnonymous = false } = req.body
    const userId = req.user.uid

    const postData = {
      authorId: userId,
      content,
      type,
      tags,
      isAnonymous,
      likes: [],
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const docRef = await db.collection('posts').add(postData)
    
    // Get the created post with author data
    const authorDoc = await db.collection('users').doc(userId).get()
    const authorData = authorDoc.data()

    const newPost = {
      _id: docRef.id,
      author: {
        _id: userId,
        username: authorData?.username || 'Unknown',
        avatar: authorData?.avatar || ''
      },
      content,
      type,
      tags,
      likes: [],
      comments: [],
      isAnonymous,
      createdAt: postData.createdAt,
      updatedAt: postData.updatedAt
    }

    res.status(201).json({ success: true, data: newPost })
  } catch (error) {
    console.error('Create post error:', error)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

// Users endpoints
app.get('/api/users', async (req, res) => {
  try {
    const { limit = 20 } = req.query
    const currentUserId = req.user.uid

    const snapshot = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get()

    const users = []
    snapshot.docs.forEach(doc => {
      if (doc.id === currentUserId) return // Exclude current user

      const userData = doc.data()
      users.push({
        _id: doc.id,
        username: userData.username,
        email: userData.email,
        bio: userData.bio || '',
        avatar: userData.avatar || '',
        thoughts: userData.thoughts || [],
        interests: userData.interests || [],
        personalityTraits: userData.personalityTraits || [],
        location: userData.location || '',
        age: userData.age || null,
        isOnline: userData.isOnline || false,
        lastSeen: userData.lastSeen?.toDate() || new Date(),
        createdAt: userData.createdAt?.toDate() || new Date(),
        updatedAt: userData.updatedAt?.toDate() || new Date(),
        matchPercentage: Math.floor(Math.random() * 40) + 60 // Mock match percentage
      })
    })

    res.json({ success: true, data: users })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Messages endpoints
app.get('/api/messages/contacts', async (req, res) => {
  try {
    const userId = req.user.uid

    // Get all messages where user is sender or receiver
    const sentQuery = db.collection('messages')
      .where('senderId', '==', userId)
      .orderBy('createdAt', 'desc')

    const receivedQuery = db.collection('messages')
      .where('receiverId', '==', userId)
      .orderBy('createdAt', 'desc')

    const [sentSnapshot, receivedSnapshot] = await Promise.all([
      sentQuery.get(),
      receivedQuery.get()
    ])

    const contactsMap = new Map()

    // Process sent messages
    for (const doc of sentSnapshot.docs) {
      const data = doc.data()
      const contactId = data.receiverId
      
      if (!contactsMap.has(contactId)) {
        const contactDoc = await db.collection('users').doc(contactId).get()
        const contactData = contactDoc.data()
        
        contactsMap.set(contactId, {
          contact: {
            _id: contactId,
            username: contactData?.username || 'Unknown',
            avatar: contactData?.avatar || '',
            isOnline: contactData?.isOnline || false
          },
          lastMessage: {
            content: data.content,
            createdAt: data.createdAt?.toDate() || new Date()
          },
          unreadCount: 0
        })
      }
    }

    // Process received messages
    for (const doc of receivedSnapshot.docs) {
      const data = doc.data()
      const contactId = data.senderId
      
      if (!contactsMap.has(contactId)) {
        const contactDoc = await db.collection('users').doc(contactId).get()
        const contactData = contactDoc.data()
        
        contactsMap.set(contactId, {
          contact: {
            _id: contactId,
            username: contactData?.username || 'Unknown',
            avatar: contactData?.avatar || '',
            isOnline: contactData?.isOnline || false
          },
          lastMessage: {
            content: data.content,
            createdAt: data.createdAt?.toDate() || new Date()
          },
          unreadCount: data.isRead ? 0 : 1
        })
      }
    }

    const contacts = Array.from(contactsMap.values())
    res.json({ success: true, data: contacts })
  } catch (error) {
    console.error('Get contacts error:', error)
    res.status(500).json({ error: 'Failed to fetch contacts' })
  }
})

// Friend requests endpoints
app.post('/api/friends/request', async (req, res) => {
  try {
    const { receiverId } = req.body
    const senderId = req.user.uid

    // Check if request already exists
    const existingRequest = await db.collection('friendRequests')
      .where('senderId', '==', senderId)
      .where('receiverId', '==', receiverId)
      .get()

    if (!existingRequest.empty) {
      return res.status(400).json({ error: 'Friend request already sent' })
    }

    // Create friend request
    const docRef = await db.collection('friendRequests').add({
      senderId,
      receiverId,
      status: 'pending',
      createdAt: new Date()
    })

    res.status(201).json({ success: true, data: { _id: docRef.id } })
  } catch (error) {
    console.error('Send friend request error:', error)
    res.status(500).json({ error: 'Failed to send friend request' })
  }
})

app.get('/api/friends/requests', async (req, res) => {
  try {
    const userId = req.user.uid

    const snapshot = await db.collection('friendRequests')
      .where('receiverId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get()

    const requests = []
    for (const doc of snapshot.docs) {
      const requestData = doc.data()
      const senderDoc = await db.collection('users').doc(requestData.senderId).get()
      const senderData = senderDoc.data()

      requests.push({
        _id: doc.id,
        sender: {
          _id: requestData.senderId,
          username: senderData?.username || 'Unknown',
          avatar: senderData?.avatar || '',
          bio: senderData?.bio || ''
        },
        createdAt: requestData.createdAt?.toDate() || new Date()
      })
    }

    res.json({ success: true, data: requests })
  } catch (error) {
    console.error('Get friend requests error:', error)
    res.status(500).json({ error: 'Failed to get friend requests' })
  }
})

app.post('/api/friends/accept/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params
    const userId = req.user.uid

    // Get the request
    const requestDoc = await db.collection('friendRequests').doc(requestId).get()
    if (!requestDoc.exists) {
      return res.status(404).json({ error: 'Friend request not found' })
    }

    const requestData = requestDoc.data()
    
    // Update request status
    await db.collection('friendRequests').doc(requestId).update({
      status: 'accepted',
      updatedAt: new Date()
    })

    // Create friendship
    await db.collection('friendships').add({
      users: [requestData.senderId, userId],
      createdAt: new Date()
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Accept friend request error:', error)
    res.status(500).json({ error: 'Failed to accept friend request' })
  }
})

app.get('/api/friends', async (req, res) => {
  try {
    const userId = req.user.uid

    const snapshot = await db.collection('friendships')
      .where('users', 'array-contains', userId)
      .get()

    const friends = []
    for (const doc of snapshot.docs) {
      const friendshipData = doc.data()
      const friendId = friendshipData.users.find(id => id !== userId)
      
      if (friendId) {
        const friendDoc = await db.collection('users').doc(friendId).get()
        const friendData = friendDoc.data()

        if (friendData) {
          friends.push({
            _id: friendId,
            username: friendData.username,
            email: friendData.email,
            bio: friendData.bio || '',
            avatar: friendData.avatar || '',
            isOnline: friendData.isOnline || false,
            lastSeen: friendData.lastSeen?.toDate() || new Date(),
            createdAt: friendData.createdAt?.toDate() || new Date()
          })
        }
      }
    }

    res.json({ success: true, data: friends })
  } catch (error) {
    console.error('Get friends error:', error)
    res.status(500).json({ error: 'Failed to get friends' })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.listen(PORT, () => {
  console.log(`[SERVER] Wastext API Server running on port ${PORT}`)
  console.log(`[FIREBASE] Firebase Admin SDK initialized`)
  console.log(`[ENV] Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`[CORS] CORS enabled for: http://localhost:3000, http://localhost:3001`)
})