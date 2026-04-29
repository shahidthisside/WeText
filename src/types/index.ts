export interface User {
  _id: string
  username: string
  email: string
  bio?: string
  avatar?: string
  thoughts: string[]
  interests: string[]
  personalityTraits: PersonalityTrait[]
  location?: string
  age?: number | null
  matchPercentage?: number
  isOnline: boolean
  lastSeen: Date
  createdAt: Date
  updatedAt: Date
}

export interface PersonalityTrait {
  trait: string
  score: number // 1-10
}

export interface Post {
  _id: string
  author: User
  content: string
  type: 'post' | 'thought' | 'story'
  images?: string[]
  tags: string[]
  likes: string[] // user IDs
  comments: Comment[]
  isAnonymous: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Comment {
  _id: string
  author: User
  content: string
  likes: string[]
  replies: Comment[]
  createdAt: Date
}

export interface Message {
  _id: string
  sender: User
  receiver: User
  content: string
  type: 'text' | 'image' | 'file' | 'voice'
  fileUrl?: string
  fileName?: string
  isRead: boolean
  replyTo?: Message
  createdAt: Date
}

export interface Match {
  _id: string
  users: [User, User]
  matchPercentage: number
  commonInterests: string[]
  commonTraits: PersonalityTrait[]
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: Date
}

export interface Friendship {
  _id: string
  users: [User, User]
  status: 'pending' | 'accepted' | 'blocked'
  createdAt: Date
}

export interface Notification {
  _id: string
  recipient: string
  sender?: User
  type: 'like' | 'comment' | 'match' | 'friend_request' | 'message'
  title: string
  message: string
  data?: any
  isRead: boolean
  createdAt: Date
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export interface ChatRoom {
  _id: string
  participants: User[]
  lastMessage?: Message
  unreadCount: number
  updatedAt: Date
}

export interface MatchingPreferences {
  ageRange: [number, number]
  maxDistance: number
  interests: string[]
  personalityTraits: string[]
}