import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, LoginCredentials, RegisterCredentials } from '../types'
import AuthService from '../services/authService'
import toast from 'react-hot-toast'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  register: (credentials: RegisterCredentials) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  updateUser: (userData: Partial<User>) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (credentials: LoginCredentials) => {
        try {
          set({ isLoading: true })
          console.log('Login attempt:', credentials.email)
          
          const { user, token } = await AuthService.login(credentials)
          console.log('Login successful:', user)
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
          
          toast.success(`Welcome back, ${user.username}!`)
        } catch (error: any) {
          console.error('Login error:', error)
          set({ isLoading: false })
          toast.error(error.message || 'Login failed')
          throw error
        }
      },

      register: async (credentials: RegisterCredentials) => {
        try {
          set({ isLoading: true })
          console.log('Register attempt:', credentials.email, credentials.username)
          
          const { user, token } = await AuthService.register(credentials)
          console.log('Registration successful:', user)
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
          
          toast.success(`Welcome to Wastext, ${user.username}!`)
        } catch (error: any) {
          console.error('Registration error:', error)
          set({ isLoading: false })
          toast.error(error.message || 'Registration failed')
          throw error
        }
      },

      loginWithGoogle: async () => {
        try {
          set({ isLoading: true })
          console.log('Google login attempt')
          
          const { user, token } = await AuthService.signInWithGoogle()
          console.log('Google login successful:', user)
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          })
          
          toast.success(`Welcome, ${user.username}!`)
        } catch (error: any) {
          console.error('Google login error:', error)
          set({ isLoading: false })
          toast.error(error.message || 'Google sign in failed')
          throw error
        }
      },

      logout: async () => {
        try {
          await AuthService.logout()
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          })
          toast.success('Logged out successfully')
        } catch (error: any) {
          console.error('Logout error:', error)
          toast.error('Logout failed')
        }
      },

      checkAuth: async () => {
        try {
          set({ isLoading: true })
          console.log('Checking auth state...')
          
          const user = await AuthService.getCurrentUser()
          console.log('Auth check result:', user)
          
          if (user) {
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
            })
          } else {
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            })
          }
        } catch (error) {
          console.error('Auth check error:', error)
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },

      updateUser: async (userData: Partial<User>) => {
        try {
          const { user } = get()
          if (!user) return

          await AuthService.updateUserProfile(user._id, userData)
          
          set({
            user: { ...user, ...userData },
          })
          
          toast.success('Profile updated successfully')
        } catch (error: any) {
          console.error('Update user error:', error)
          toast.error(error.message || 'Failed to update profile')
          throw error
        }
      },

      resetPassword: async (email: string) => {
        try {
          await AuthService.resetPassword(email)
          toast.success('Password reset email sent')
        } catch (error: any) {
          console.error('Reset password error:', error)
          toast.error(error.message || 'Failed to send reset email')
          throw error
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        try {
          await AuthService.changePassword(currentPassword, newPassword)
          toast.success('Password changed successfully')
        } catch (error: any) {
          console.error('Change password error:', error)
          toast.error(error.message || 'Failed to change password')
          throw error
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Set up auth state listener with better error handling
try {
  AuthService.onAuthStateChange((user) => {
    console.log('Auth state listener triggered:', user)
    useAuthStore.setState({
      user,
      isAuthenticated: !!user,
      token: user ? 'firebase-token' : null,
    })
  })
} catch (error) {
  console.error('Auth state listener error:', error)
}