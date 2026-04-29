import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  DocumentSnapshot,
  QuerySnapshot
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { User, Post, Message, Match, Friendship } from '../types'

export class FirestoreService {
  // POSTS OPERATIONS
  static async createPost(authorId: string, postData: Omit<Post, '_id' | 'author' | 'createdAt' | 'updatedAt' | 'likes' | 'comments'>): Promise<Post> {
    try {
      const docRef = await addDoc(collection(db, 'posts'), {
        ...postData,
        authorId,
        likes: [],
        comments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // Get the created post with author data
      const postDoc = await getDoc(docRef)
      const authorDoc = await getDoc(doc(db, 'users', authorId))
      
      const postData_result = postDoc.data()
      const authorData = authorDoc.data()

      return {
        _id: docRef.id,
        author: {
          _id: authorId,
          username: authorData?.username || 'Unknown',
          avatar: authorData?.avatar || ''
        },
        content: postData_result?.content || '',
        type: postData_result?.type || 'post',
        tags: postData_result?.tags || [],
        likes: [],
        comments: [],
        isAnonymous: postData_result?.isAnonymous || false,
        createdAt: postData_result?.createdAt?.toDate() || new Date(),
        updatedAt: postData_result?.updatedAt?.toDate() || new Date()
      }
    } catch (error) {
      console.error('Create post error:', error)
      throw new Error('Failed to create post')
    }
  }

  static async getPosts(lastDoc?: DocumentSnapshot, limitCount: number = 20, type?: string): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    try {
      let q = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )

      if (type) {
        q = query(
          collection(db, 'posts'),
          where('type', '==', type),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        )
      }

      if (lastDoc) {
        q = query(q, startAfter(lastDoc))
      }

      const snapshot = await getDocs(q)
      const posts: Post[] = []

      for (const docSnap of snapshot.docs) {
        const postData = docSnap.data()
        const authorDoc = await getDoc(doc(db, 'users', postData.authorId))
        const authorData = authorDoc.data()

        posts.push({
          _id: docSnap.id,
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

      const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null

      return { posts, lastDoc: lastVisible }
    } catch (error) {
      console.error('Get posts error:', error)
      throw new Error('Failed to get posts')
    }
  }

  static async likePost(postId: string, userId: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId)
      const postDoc = await getDoc(postRef)
      
      if (!postDoc.exists()) {
        throw new Error('Post not found')
      }

      const postData = postDoc.data()
      const likes = postData.likes || []

      if (likes.includes(userId)) {
        // Unlike
        await updateDoc(postRef, {
          likes: arrayRemove(userId),
          updatedAt: serverTimestamp()
        })
      } else {
        // Like
        await updateDoc(postRef, {
          likes: arrayUnion(userId),
          updatedAt: serverTimestamp()
        })
      }
    } catch (error) {
      console.error('Like post error:', error)
      throw new Error('Failed to like post')
    }
  }

  static async addComment(postId: string, userId: string, content: string): Promise<void> {
    try {
      // Get user data for the comment
      const userDoc = await getDoc(doc(db, 'users', userId))
      const userData = userDoc.data()

      const comment = {
        _id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorId: userId,
        author: {
          _id: userId,
          username: userData?.username || 'Unknown',
          avatar: userData?.avatar || ''
        },
        content,
        likes: [],
        replies: [],
        createdAt: new Date()
      }

      await updateDoc(doc(db, 'posts', postId), {
        comments: arrayUnion(comment),
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Add comment error:', error)
      throw new Error('Failed to add comment')
    }
  }

  // USERS OPERATIONS
  static async getUsers(excludeUserId?: string, limitCount: number = 20): Promise<User[]> {
    try {
      let q = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )

      const snapshot = await getDocs(q)
      const users: User[] = []

      snapshot.docs.forEach(doc => {
        if (excludeUserId && doc.id === excludeUserId) return

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
          updatedAt: userData.updatedAt?.toDate() || new Date()
        })
      })

      // Add mock match percentages for demo
      return users.map(user => ({
        ...user,
        matchPercentage: Math.floor(Math.random() * 40) + 60 // 60-100%
      }))
    } catch (error) {
      console.error('Get users error:', error)
      throw new Error('Failed to get users')
    }
  }

  static async searchUsers(searchQuery: string, excludeUserId?: string): Promise<User[]> {
    try {
      // Firestore doesn't support full-text search, so we'll get all users and filter client-side
      // In production, you'd want to use Algolia or similar for better search
      const q = query(
        collection(db, 'users'),
        orderBy('username'),
        limit(50)
      )

      const snapshot = await getDocs(q)
      const users: User[] = []

      snapshot.docs.forEach(doc => {
        if (excludeUserId && doc.id === excludeUserId) return

        const userData = doc.data()
        const username = userData.username?.toLowerCase() || ''
        const bio = userData.bio?.toLowerCase() || ''
        const query = searchQuery.toLowerCase()

        // Simple text matching - in production use proper search service
        if (username.includes(query) || bio.includes(query)) {
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
            updatedAt: userData.updatedAt?.toDate() || new Date()
          })
        }
      })

      return users
    } catch (error) {
      console.error('Search users error:', error)
      throw new Error('Failed to search users')
    }
  }

  static async getUserById(userId: string): Promise<User | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId))
      
      if (!userDoc.exists()) {
        return null
      }

      const userData = userDoc.data()
      return {
        _id: userDoc.id,
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
        updatedAt: userData.updatedAt?.toDate() || new Date()
      }
    } catch (error) {
      console.error('Get user by ID error:', error)
      return null
    }
  }

  // FRIENDS OPERATIONS
  static async sendFriendRequest(senderId: string, receiverId: string): Promise<void> {
    try {
      // Check if request already exists
      const existingRequestQuery = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', senderId),
        where('receiverId', '==', receiverId),
        where('status', '==', 'pending')
      )
      const existingRequest = await getDocs(existingRequestQuery)

      if (!existingRequest.empty) {
        throw new Error('Friend request already sent')
      }

      // Check reverse request
      const reverseRequestQuery = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', receiverId),
        where('receiverId', '==', senderId),
        where('status', '==', 'pending')
      )
      const reverseRequest = await getDocs(reverseRequestQuery)

      if (!reverseRequest.empty) {
        throw new Error('This user has already sent you a friend request')
      }

      // Check if they're already friends
      const friendshipQuery = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', senderId)
      )
      const friendshipSnapshot = await getDocs(friendshipQuery)

      const alreadyFriends = friendshipSnapshot.docs.some(doc => {
        const data = doc.data()
        return data.users.includes(receiverId)
      })

      if (alreadyFriends) {
        throw new Error('Already friends')
      }

      // Create friend request
      await addDoc(collection(db, 'friendRequests'), {
        senderId,
        receiverId,
        status: 'pending',
        createdAt: serverTimestamp()
      })

      console.log('Friend request sent successfully')
    } catch (error) {
      console.error('Send friend request error:', error)
      throw error
    }
  }

  static async acceptFriendRequest(requestId: string, senderId: string, receiverId: string): Promise<void> {
    try {
      // Update request status
      await updateDoc(doc(db, 'friendRequests', requestId), {
        status: 'accepted',
        updatedAt: serverTimestamp()
      })

      // Create friendship
      await addDoc(collection(db, 'friendships'), {
        users: [senderId, receiverId],
        createdAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Accept friend request error:', error)
      throw new Error('Failed to accept friend request')
    }
  }

  static async rejectFriendRequest(requestId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'friendRequests', requestId), {
        status: 'rejected',
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Reject friend request error:', error)
      throw new Error('Failed to reject friend request')
    }
  }

  static async getFriendRequests(userId: string): Promise<any[]> {
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('receiverId', '==', userId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(q)
      const requests = []

      for (const docSnap of snapshot.docs) {
        const requestData = docSnap.data()
        const senderDoc = await getDoc(doc(db, 'users', requestData.senderId))
        const senderData = senderDoc.data()

        requests.push({
          _id: docSnap.id,
          sender: {
            _id: requestData.senderId,
            username: senderData?.username || 'Unknown',
            avatar: senderData?.avatar || '',
            bio: senderData?.bio || ''
          },
          createdAt: requestData.createdAt?.toDate() || new Date()
        })
      }

      return requests
    } catch (error) {
      console.error('Get friend requests error:', error)
      throw new Error('Failed to get friend requests')
    }
  }

  static async getFriendRequestStatus(senderId: string, receiverId: string): Promise<string> {
    try {
      // Check if there's a pending request from sender to receiver
      const sentRequestQuery = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', senderId),
        where('receiverId', '==', receiverId),
        where('status', '==', 'pending')
      )
      const sentRequest = await getDocs(sentRequestQuery)

      if (!sentRequest.empty) {
        return 'sent'
      }

      // Check if there's a pending request from receiver to sender
      const receivedRequestQuery = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', receiverId),
        where('receiverId', '==', senderId),
        where('status', '==', 'pending')
      )
      const receivedRequest = await getDocs(receivedRequestQuery)

      if (!receivedRequest.empty) {
        return 'received'
      }

      // Check if they're already friends
      const friendshipQuery = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', senderId)
      )
      const friendshipSnapshot = await getDocs(friendshipQuery)

      const alreadyFriends = friendshipSnapshot.docs.some(doc => {
        const data = doc.data()
        return data.users.includes(receiverId)
      })

      if (alreadyFriends) {
        return 'friends'
      }

      return 'none'
    } catch (error) {
      console.error('Get friend request status error:', error)
      return 'none'
    }
  }

  static async updateUserProfile(userId: string, updates: Partial<User>): Promise<void> {
    try {
      // Check if username is being updated and if it's unique
      if (updates.username) {
        const usernameQuery = query(
          collection(db, 'users'),
          where('username', '==', updates.username)
        )
        const usernameSnapshot = await getDocs(usernameQuery)
        
        // Check if username exists and belongs to a different user
        const existingUser = usernameSnapshot.docs.find(doc => doc.id !== userId)
        if (existingUser) {
          throw new Error('Username already taken')
        }
      }

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      }

      await updateDoc(doc(db, 'users', userId), updateData)
    } catch (error) {
      console.error('Update user profile error:', error)
      throw error
    }
  }

  static async removeFriend(userId: string, friendId: string): Promise<void> {
    try {
      // Find the friendship document
      const friendshipQuery = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', userId)
      )
      const friendshipSnapshot = await getDocs(friendshipQuery)

      const friendshipDoc = friendshipSnapshot.docs.find(doc => {
        const data = doc.data()
        return data.users.includes(friendId)
      })

      if (friendshipDoc) {
        await deleteDoc(doc(db, 'friendships', friendshipDoc.id))
        console.log('Friendship removed successfully')
      } else {
        throw new Error('Friendship not found')
      }
    } catch (error) {
      console.error('Remove friend error:', error)
      throw new Error('Failed to remove friend')
    }
  }

  static async getFriends(userId: string): Promise<User[]> {
    try {
      const q = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', userId)
      )

      const snapshot = await getDocs(q)
      const friends = []

      for (const docSnap of snapshot.docs) {
        const friendshipData = docSnap.data()
        const friendId = friendshipData.users.find(id => id !== userId)
        
        if (friendId) {
          const friendDoc = await getDoc(doc(db, 'users', friendId))
          const friendData = friendDoc.data()

          if (friendData) {
            friends.push({
              _id: friendId,
              username: friendData.username,
              email: friendData.email,
              bio: friendData.bio || '',
              avatar: friendData.avatar || '',
              thoughts: friendData.thoughts || [],
              interests: friendData.interests || [],
              personalityTraits: friendData.personalityTraits || [],
              location: friendData.location || '',
              age: friendData.age || null,
              isOnline: friendData.isOnline || false,
              lastSeen: friendData.lastSeen?.toDate() || new Date(),
              createdAt: friendData.createdAt?.toDate() || new Date(),
              updatedAt: friendData.updatedAt?.toDate() || new Date()
            })
          }
        }
      }

      return friends
    } catch (error) {
      console.error('Get friends error:', error)
      throw new Error('Failed to get friends')
    }
  }

  static async addCommentReply(postId: string, commentId: string, userId: string, content: string): Promise<void> {
    try {
      // Get the post
      const postRef = doc(db, 'posts', postId)
      const postDoc = await getDoc(postRef)
      
      if (!postDoc.exists()) {
        throw new Error('Post not found')
      }

      const postData = postDoc.data()
      const comments = postData.comments || []
      
      // Find the comment to reply to
      const commentIndex = comments.findIndex(c => c._id === commentId)
      if (commentIndex === -1) {
        throw new Error('Comment not found')
      }

      // Get user data for the reply
      const userDoc = await getDoc(doc(db, 'users', userId))
      const userData = userDoc.data()

      const reply = {
        _id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        authorId: userId,
        author: {
          _id: userId,
          username: userData?.username || 'Unknown',
          avatar: userData?.avatar || ''
        },
        content,
        likes: [],
        createdAt: new Date()
      }

      // Add reply to the comment
      if (!comments[commentIndex].replies) {
        comments[commentIndex].replies = []
      }
      comments[commentIndex].replies.push(reply)

      // Update the post
      await updateDoc(postRef, {
        comments,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Add comment reply error:', error)
      throw new Error('Failed to add reply')
    }
  }

  static async likeComment(postId: string, commentId: string, userId: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId)
      const postDoc = await getDoc(postRef)
      
      if (!postDoc.exists()) {
        throw new Error('Post not found')
      }

      const postData = postDoc.data()
      const comments = postData.comments || []
      
      // Find the comment
      const commentIndex = comments.findIndex(c => c._id === commentId)
      if (commentIndex === -1) {
        throw new Error('Comment not found')
      }

      const comment = comments[commentIndex]
      const likes = comment.likes || []

      if (likes.includes(userId)) {
        // Unlike
        comment.likes = likes.filter(id => id !== userId)
      } else {
        // Like
        comment.likes = [...likes, userId]
      }

      comments[commentIndex] = comment

      await updateDoc(postRef, {
        comments,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Like comment error:', error)
      throw new Error('Failed to like comment')
    }
  }

  static async likeCommentReply(postId: string, commentId: string, replyId: string, userId: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId)
      const postDoc = await getDoc(postRef)
      
      if (!postDoc.exists()) {
        throw new Error('Post not found')
      }

      const postData = postDoc.data()
      const comments = postData.comments || []
      
      // Find the comment
      const commentIndex = comments.findIndex(c => c._id === commentId)
      if (commentIndex === -1) {
        throw new Error('Comment not found')
      }

      const comment = comments[commentIndex]
      const replies = comment.replies || []
      
      // Find the reply
      const replyIndex = replies.findIndex(r => r._id === replyId)
      if (replyIndex === -1) {
        throw new Error('Reply not found')
      }

      const reply = replies[replyIndex]
      const likes = reply.likes || []

      if (likes.includes(userId)) {
        // Unlike
        reply.likes = likes.filter(id => id !== userId)
      } else {
        // Like
        reply.likes = [...likes, userId]
      }

      replies[replyIndex] = reply
      comments[commentIndex].replies = replies

      await updateDoc(postRef, {
        comments,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Like reply error:', error)
      throw new Error('Failed to like reply')
    }
  }
  static async sendMessage(senderId: string, receiverId: string, content: string, type: string = 'text'): Promise<Message> {
    try {
      console.log('FirestoreService.sendMessage called:', { senderId, receiverId, content, type })
      
      const messageData = {
        senderId,
        receiverId,
        content,
        type,
        isRead: false,
        createdAt: serverTimestamp()
      }

      console.log('Creating message document with data:', messageData)
      const docRef = await addDoc(collection(db, 'messages'), messageData)
      console.log('Message document created with ID:', docRef.id)
      
      // Get sender data
      const senderDoc = await getDoc(doc(db, 'users', senderId))
      const senderData = senderDoc.data()

      const result = {
        _id: docRef.id,
        sender: {
          _id: senderId,
          username: senderData?.username || 'Unknown',
          avatar: senderData?.avatar || ''
        },
        receiver: {
          _id: receiverId,
          username: 'Unknown',
          avatar: ''
        },
        content,
        type,
        isRead: false,
        createdAt: new Date()
      }
      
      console.log('Message sent successfully, returning:', result)
      return result
    } catch (error) {
      console.error('Send message error:', error)
      throw new Error('Failed to send message')
    }
  }

  static async getMessages(userId1: string, userId2: string, limitCount: number = 50): Promise<Message[]> {
    try {
      // Query messages from userId1 to userId2
      const q1 = query(
        collection(db, 'messages'),
        where('senderId', '==', userId1),
        where('receiverId', '==', userId2),
        orderBy('createdAt', 'asc'),
        limit(limitCount)
      )

      // Query messages from userId2 to userId1
      const q2 = query(
        collection(db, 'messages'),
        where('senderId', '==', userId2),
        where('receiverId', '==', userId1),
        orderBy('createdAt', 'asc'),
        limit(limitCount)
      )

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ])

      const messages: Message[] = []

      // Process messages from first query
      for (const docSnap of snapshot1.docs) {
        const messageData = docSnap.data()
        
        // Get sender and receiver data
        const senderDoc = await getDoc(doc(db, 'users', messageData.senderId))
        const receiverDoc = await getDoc(doc(db, 'users', messageData.receiverId))
        
        const senderData = senderDoc.data()
        const receiverData = receiverDoc.data()

        messages.push({
          _id: docSnap.id,
          sender: {
            _id: messageData.senderId,
            username: senderData?.username || 'Unknown',
            avatar: senderData?.avatar || ''
          },
          receiver: {
            _id: messageData.receiverId,
            username: receiverData?.username || 'Unknown',
            avatar: receiverData?.avatar || ''
          },
          content: messageData.content,
          type: messageData.type,
          isRead: messageData.isRead,
          createdAt: messageData.createdAt?.toDate() || new Date()
        })
      }

      // Process messages from second query
      for (const docSnap of snapshot2.docs) {
        const messageData = docSnap.data()
        
        // Get sender and receiver data
        const senderDoc = await getDoc(doc(db, 'users', messageData.senderId))
        const receiverDoc = await getDoc(doc(db, 'users', messageData.receiverId))
        
        const senderData = senderDoc.data()
        const receiverData = receiverDoc.data()

        messages.push({
          _id: docSnap.id,
          sender: {
            _id: messageData.senderId,
            username: senderData?.username || 'Unknown',
            avatar: senderData?.avatar || ''
          },
          receiver: {
            _id: messageData.receiverId,
            username: receiverData?.username || 'Unknown',
            avatar: receiverData?.avatar || ''
          },
          content: messageData.content,
          type: messageData.type,
          isRead: messageData.isRead,
          createdAt: messageData.createdAt?.toDate() || new Date()
        })
      }

      // Sort all messages by creation time
      messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

      return messages
    } catch (error) {
      console.error('Get messages error:', error)
      throw new Error('Failed to get messages')
    }
  }

  static async getContacts(userId: string): Promise<any[]> {
    try {
      // Get friends first
      const friends = await this.getFriends(userId)
      const contactsMap = new Map()

      // Add all friends as potential contacts
      for (const friend of friends) {
        contactsMap.set(friend._id, {
          contact: {
            _id: friend._id,
            username: friend.username,
            avatar: friend.avatar || '',
            isOnline: friend.isOnline || false
          },
          lastMessage: null,
          unreadCount: 0
        })
      }

      // Get messages sent by user
      const sentQuery = query(
        collection(db, 'messages'),
        where('senderId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      )

      // Get messages received by user
      const receivedQuery = query(
        collection(db, 'messages'),
        where('receiverId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      )

      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(sentQuery),
        getDocs(receivedQuery)
      ])

      // Process sent messages
      for (const doc of sentSnapshot.docs) {
        const data = doc.data()
        const contactId = data.receiverId
        
        if (contactsMap.has(contactId)) {
          const existing = contactsMap.get(contactId)
          if (!existing.lastMessage || data.createdAt?.toDate() > existing.lastMessage.createdAt) {
            existing.lastMessage = {
              content: data.content,
              createdAt: data.createdAt?.toDate() || new Date()
            }
          }
        } else {
          // Add non-friend contacts who have message history
          const contactDoc = await getDoc(doc(db, 'users', contactId))
          const contactData = contactDoc.data()
          
          if (contactData) {
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
      }

      // Process received messages
      for (const doc of receivedSnapshot.docs) {
        const data = doc.data()
        const contactId = data.senderId
        
        if (contactsMap.has(contactId)) {
          const existing = contactsMap.get(contactId)
          if (!existing.lastMessage || data.createdAt?.toDate() > existing.lastMessage.createdAt) {
            existing.lastMessage = {
              content: data.content,
              createdAt: data.createdAt?.toDate() || new Date()
            }
            existing.unreadCount = data.isRead ? 0 : 1
          }
        } else {
          // Add non-friend contacts who have message history
          const contactDoc = await getDoc(doc(db, 'users', contactId))
          const contactData = contactDoc.data()
          
          if (contactData) {
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
      }

      // Sort by last message date, with friends without messages at the top
      return Array.from(contactsMap.values()).sort((a, b) => {
        if (!a.lastMessage && !b.lastMessage) return 0
        if (!a.lastMessage) return -1
        if (!b.lastMessage) return 1
        return b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
      })
    } catch (error) {
      console.error('Get contacts error:', error)
      throw new Error('Failed to get contacts')
    }
  }

  // REAL-TIME LISTENERS
  static subscribeToMessages(userId1: string, userId2: string, callback: (messages: Message[]) => void): () => void {
    console.log('Setting up message subscription between:', userId1, 'and', userId2)
    
    // Use a Map to track messages and avoid duplicates
    const messagesMap = new Map<string, Message>()
    let isInitialized = false
    
    const updateMessages = () => {
      const allMessages = Array.from(messagesMap.values())
      allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      console.log('Updating messages, total count:', allMessages.length)
      callback(allMessages)
    }
    
    const processSnapshot = async (snapshot: QuerySnapshot, queryType: string) => {
      console.log(`Processing ${queryType} snapshot with ${snapshot.docs.length} docs`)
      
      for (const docSnap of snapshot.docs) {
        const messageData = docSnap.data()
        const messageId = docSnap.id
        
        // Skip if we already have this message
        if (messagesMap.has(messageId)) {
          continue
        }
        
        // Verify this message is between the two users
        const isValidMessage = (
          (messageData.senderId === userId1 && messageData.receiverId === userId2) ||
          (messageData.senderId === userId2 && messageData.receiverId === userId1)
        )
        
        if (!isValidMessage) {
          continue
        }
        
        try {
          // Get sender and receiver data
          const [senderDoc, receiverDoc] = await Promise.all([
            getDoc(doc(db, 'users', messageData.senderId)),
            getDoc(doc(db, 'users', messageData.receiverId))
          ])
          
          const senderData = senderDoc.data()
          const receiverData = receiverDoc.data()

          const message: Message = {
            _id: messageId,
            sender: {
              _id: messageData.senderId,
              username: senderData?.username || 'Unknown',
              avatar: senderData?.avatar || ''
            },
            receiver: {
              _id: messageData.receiverId,
              username: receiverData?.username || 'Unknown',
              avatar: receiverData?.avatar || ''
            },
            content: messageData.content,
            type: messageData.type,
            isRead: messageData.isRead,
            createdAt: messageData.createdAt?.toDate() || new Date()
          }
          
          messagesMap.set(messageId, message)
        } catch (error) {
          console.error('Error processing message:', messageId, error)
        }
      }
      
      // Only update UI after processing all messages
      if (isInitialized) {
        updateMessages()
      }
    }

    // Query 1: Messages from userId1 to userId2
    const q1 = query(
      collection(db, 'messages'),
      where('senderId', '==', userId1),
      where('receiverId', '==', userId2),
      orderBy('createdAt', 'asc')
    )
    
    // Query 2: Messages from userId2 to userId1
    const q2 = query(
      collection(db, 'messages'),
      where('senderId', '==', userId2),
      where('receiverId', '==', userId1),
      orderBy('createdAt', 'asc')
    )
    
    let completedQueries = 0
    
    const checkInitialization = () => {
      completedQueries++
      if (completedQueries >= 2 && !isInitialized) {
        isInitialized = true
        updateMessages()
        console.log('Initial message loading completed')
      }
    }

    // Subscribe to first query
    const unsubscribe1 = onSnapshot(q1, async (snapshot) => {
      await processSnapshot(snapshot, 'Q1 (user1->user2)')
      checkInitialization()
    }, (error) => {
      console.error('Q1 subscription error:', error)
      checkInitialization()
    })
    
    // Subscribe to second query
    const unsubscribe2 = onSnapshot(q2, async (snapshot) => {
      await processSnapshot(snapshot, 'Q2 (user2->user1)')
      checkInitialization()
    }, (error) => {
      console.error('Q2 subscription error:', error)
      checkInitialization()
    })

    // Return cleanup function
    return () => {
      console.log('Unsubscribing from message listeners')
      unsubscribe1()
      unsubscribe2()
    }
  }

  static subscribeToPosts(callback: (posts: Post[]) => void, type?: string): () => void {
    let q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(20)
    )

    if (type) {
      q = query(
        collection(db, 'posts'),
        where('type', '==', type),
        orderBy('createdAt', 'desc'),
        limit(20)
      )
    }

    return onSnapshot(q, async (snapshot) => {
      const posts: Post[] = []

      for (const docSnap of snapshot.docs) {
        const postData = docSnap.data()
        const authorDoc = await getDoc(doc(db, 'users', postData.authorId))
        const authorData = authorDoc.data()

        posts.push({
          _id: docSnap.id,
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

      callback(posts)
    })
  }
}

export default FirestoreService