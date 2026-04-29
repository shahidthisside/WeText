import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth'
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { User, RegisterCredentials, LoginCredentials } from '../types'

export class AuthService {
  // Register new user
  static async register(credentials: RegisterCredentials): Promise<{ user: User; token: string }> {
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(
        auth,
        credentials.email,
        credentials.password
      )

      // Update Firebase Auth profile
      await updateProfile(firebaseUser, {
        displayName: credentials.username
      })

      // Create user document in Firestore
      const userData: Omit<User, '_id'> = {
        username: credentials.username,
        email: credentials.email,
        bio: '',
        avatar: '',
        thoughts: [],
        interests: [],
        personalityTraits: [],
        location: '',
        age: null,
        isOnline: true,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await setDoc(doc(db, 'users', firebaseUser.uid), {
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      })

      const token = await firebaseUser.getIdToken()
      
      return {
        user: { ...userData, _id: firebaseUser.uid },
        token
      }
    } catch (error: any) {
      console.error('Registration error:', error)
      throw new Error(this.getErrorMessage(error.code))
    }
  }

  // Login user
  static async login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    try {
      const { user: firebaseUser } = await signInWithEmailAndPassword(
        auth,
        credentials.email,
        credentials.password
      )

      // Update user's online status
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        isOnline: true,
        lastSeen: serverTimestamp()
      })

      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
      const userData = userDoc.data()

      if (!userData) {
        throw new Error('User data not found')
      }

      const token = await firebaseUser.getIdToken()

      return {
        user: {
          _id: firebaseUser.uid,
          username: userData.username,
          email: userData.email,
          bio: userData.bio || '',
          avatar: userData.avatar || '',
          thoughts: userData.thoughts || [],
          interests: userData.interests || [],
          personalityTraits: userData.personalityTraits || [],
          location: userData.location || '',
          age: userData.age || null,
          isOnline: true,
          lastSeen: userData.lastSeen?.toDate() || new Date(),
          createdAt: userData.createdAt?.toDate() || new Date(),
          updatedAt: userData.updatedAt?.toDate() || new Date()
        },
        token
      }
    } catch (error: any) {
      console.error('Login error:', error)
      throw new Error(this.getErrorMessage(error.code))
    }
  }

  // Google Sign In
  static async signInWithGoogle(): Promise<{ user: User; token: string }> {
    try {
      const provider = new GoogleAuthProvider()
      const { user: firebaseUser } = await signInWithPopup(auth, provider)

      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
      
      let userData: User

      if (!userDoc.exists()) {
        // Create new user document
        const newUserData: Omit<User, '_id'> = {
          username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email || '',
          bio: '',
          avatar: firebaseUser.photoURL || '',
          thoughts: [],
          interests: [],
          personalityTraits: [],
          location: '',
          age: null,
          isOnline: true,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }

        await setDoc(doc(db, 'users', firebaseUser.uid), {
          ...newUserData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp()
        })

        userData = { ...newUserData, _id: firebaseUser.uid }
      } else {
        // Update existing user's online status
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          isOnline: true,
          lastSeen: serverTimestamp()
        })

        const existingData = userDoc.data()
        userData = {
          _id: firebaseUser.uid,
          username: existingData.username,
          email: existingData.email,
          bio: existingData.bio || '',
          avatar: existingData.avatar || firebaseUser.photoURL || '',
          thoughts: existingData.thoughts || [],
          interests: existingData.interests || [],
          personalityTraits: existingData.personalityTraits || [],
          location: existingData.location || '',
          age: existingData.age || null,
          isOnline: true,
          lastSeen: existingData.lastSeen?.toDate() || new Date(),
          createdAt: existingData.createdAt?.toDate() || new Date(),
          updatedAt: existingData.updatedAt?.toDate() || new Date()
        }
      }

      const token = await firebaseUser.getIdToken()

      return { user: userData, token }
    } catch (error: any) {
      console.error('Google sign in error:', error)
      throw new Error(this.getErrorMessage(error.code))
    }
  }

  // Logout user
  static async logout(): Promise<void> {
    try {
      const user = auth.currentUser
      if (user) {
        // Update user's offline status
        await updateDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          lastSeen: serverTimestamp()
        })
      }
      
      await signOut(auth)
    } catch (error: any) {
      console.error('Logout error:', error)
      throw new Error('Failed to logout')
    }
  }

  // Get current user
  static async getCurrentUser(): Promise<User | null> {
    try {
      const firebaseUser = auth.currentUser
      if (!firebaseUser) return null

      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
      const userData = userDoc.data()

      if (!userData) return null

      return {
        _id: firebaseUser.uid,
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
      console.error('Get current user error:', error)
      return null
    }
  }

  // Update user profile
  static async updateUserProfile(userId: string, updates: Partial<User>): Promise<void> {
    try {
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      }

      await updateDoc(doc(db, 'users', userId), updateData)

      // Update Firebase Auth profile if username or avatar changed
      if (updates.username || updates.avatar) {
        const user = auth.currentUser
        if (user) {
          await updateProfile(user, {
            displayName: updates.username || user.displayName,
            photoURL: updates.avatar || user.photoURL
          })
        }
      }
    } catch (error) {
      console.error('Update profile error:', error)
      throw new Error('Failed to update profile')
    }
  }

  // Reset password
  static async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (error: any) {
      console.error('Reset password error:', error)
      throw new Error(this.getErrorMessage(error.code))
    }
  }

  // Change password
  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = auth.currentUser
      if (!user || !user.email) {
        throw new Error('No authenticated user')
      }

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)

      // Update password
      await updatePassword(user, newPassword)
    } catch (error: any) {
      console.error('Change password error:', error)
      throw new Error(this.getErrorMessage(error.code))
    }
  }

  // Auth state observer
  static onAuthStateChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          const userData = userDoc.data()

          if (userData) {
            const user: User = {
              _id: firebaseUser.uid,
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
            callback(user)
          } else {
            callback(null)
          }
        } catch (error) {
          console.error('Auth state change error:', error)
          callback(null)
        }
      } else {
        callback(null)
      }
    })
  }

  // Error message helper
  private static getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'No account found with this email address'
      case 'auth/wrong-password':
        return 'Incorrect password'
      case 'auth/email-already-in-use':
        return 'An account with this email already exists'
      case 'auth/weak-password':
        return 'Password should be at least 6 characters'
      case 'auth/invalid-email':
        return 'Invalid email address'
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later'
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection'
      default:
        return 'An error occurred. Please try again'
    }
  }
}

export default AuthService