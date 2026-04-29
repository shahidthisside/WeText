import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PencilIcon,
  CameraIcon,
  MapPinIcon,
  CalendarIcon,
  EnvelopeIcon,
  UserIcon,
  CheckIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import FirestoreService from '../services/firestoreService'
import { generateAvatar, formatDate } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { User } from '../types'
import toast from 'react-hot-toast'

const Profile = () => {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user: currentUser, updateUser } = useAuthStore()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [friendRequestStatus, setFriendRequestStatus] = useState<string>('none')
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    username: '',
    bio: '',
    location: '',
    age: '',
    interests: [] as string[],
    avatar: ''
  })
  const [newInterest, setNewInterest] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const isOwnProfile = !userId || userId === currentUser?._id

  useEffect(() => {
    loadUserProfile()
  }, [userId, currentUser])

  const loadUserProfile = async () => {
    setIsLoading(true)
    try {
      if (isOwnProfile && currentUser) {
        setUser(currentUser)
        setEditForm({
          username: currentUser.username || '',
          bio: currentUser.bio || '',
          location: currentUser.location || '',
          age: currentUser.age?.toString() || '',
          interests: currentUser.interests || [],
          avatar: currentUser.avatar || ''
        })
      } else if (userId) {
        const fetchedUser = await FirestoreService.getUserById(userId)
        if (fetchedUser) {
          setUser(fetchedUser)
          // Check friend request status if viewing another user's profile
          if (currentUser) {
            const status = await FirestoreService.getFriendRequestStatus(currentUser._id, userId)
            setFriendRequestStatus(status)
          }
        } else {
          toast.error('User not found')
          navigate('/dashboard')
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error)
      toast.error('Failed to load profile')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!currentUser || !isOwnProfile) return

    setIsUpdating(true)
    try {
      const updates: Partial<User> = {
        username: editForm.username.trim(),
        bio: editForm.bio.trim(),
        location: editForm.location.trim(),
        age: editForm.age ? parseInt(editForm.age) : null,
        interests: editForm.interests,
        avatar: editForm.avatar
      }

      await FirestoreService.updateUserProfile(currentUser._id, updates)
      await updateUser(updates)
      
      setUser({ ...currentUser, ...updates })
      setIsEditing(false)
      toast.success('Profile updated successfully!')
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error(error.message || 'Failed to update profile')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAddInterest = () => {
    if (newInterest.trim() && !editForm.interests.includes(newInterest.trim()) && editForm.interests.length < 10) {
      setEditForm({
        ...editForm,
        interests: [...editForm.interests, newInterest.trim()]
      })
      setNewInterest('')
    }
  }

  const handleRemoveInterest = (interest: string) => {
    setEditForm({
      ...editForm,
      interests: editForm.interests.filter(i => i !== interest)
    })
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // For now, we'll use a placeholder URL
      // In production, you'd upload to Firebase Storage
      const reader = new FileReader()
      reader.onload = (event) => {
        setEditForm({
          ...editForm,
          avatar: event.target?.result as string
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSendFriendRequest = async () => {
    if (!currentUser || !userId) return

    setIsActionLoading(true)
    try {
      await FirestoreService.sendFriendRequest(currentUser._id, userId)
      setFriendRequestStatus('sent')
      toast.success('Friend request sent!')
    } catch (error: any) {
      console.error('Error sending friend request:', error)
      toast.error(error.message || 'Failed to send friend request')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleStartChat = () => {
    if (!userId) return
    navigate(`/chat/${userId}`)
  }

  const renderFriendButton = () => {
    if (!currentUser || isOwnProfile) return null

    switch (friendRequestStatus) {
      case 'friends':
        return (
          <button
            onClick={handleStartChat}
            className="btn-primary flex items-center space-x-2"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
            <span>Send Message</span>
          </button>
        )
      case 'sent':
        return (
          <button
            disabled
            className="btn-ghost flex items-center space-x-2 opacity-50 cursor-not-allowed"
          >
            <UserPlusIcon className="w-4 h-4" />
            <span>Request Sent</span>
          </button>
        )
      case 'received':
        return (
          <button
            onClick={() => navigate('/friends')}
            className="btn-primary flex items-center space-x-2"
          >
            <CheckIcon className="w-4 h-4" />
            <span>Accept Request</span>
          </button>
        )
      default:
        return (
          <button
            onClick={handleSendFriendRequest}
            disabled={isActionLoading}
            className="btn-primary flex items-center space-x-2"
          >
            <UserPlusIcon className="w-4 h-4" />
            <span>{isActionLoading ? 'Sending...' : 'Send Friend Request'}</span>
          </button>
        )
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            User not found
          </h2>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const avatar = generateAvatar(user.username)

  return (
    <div className="min-h-screen pt-20 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-8 mb-8"
        >
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-6 md:space-y-0 md:space-x-8">
            {/* Avatar */}
            <div className="relative">
              {isEditing ? (
                <div className="relative">
                  {editForm.avatar ? (
                    <img
                      src={editForm.avatar}
                      alt={user.username}
                      className="w-32 h-32 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-32 h-32 rounded-full ${avatar.color} flex items-center justify-center text-white text-4xl font-bold`}>
                      {avatar.initials}
                    </div>
                  )}
                  <label className="absolute bottom-0 right-0 p-2 bg-primary-500 text-white rounded-full cursor-pointer hover:bg-primary-600 transition-colors">
                    <CameraIcon className="w-5 h-5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <>
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-32 h-32 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-32 h-32 rounded-full ${avatar.color} flex items-center justify-center text-white text-4xl font-bold`}>
                      {avatar.initials}
                    </div>
                  )}
                  {user.isOnline && (
                    <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 rounded-full border-4 border-white dark:border-gray-800"></div>
                  )}
                </>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Enter username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={editForm.bio}
                      onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Tell us about yourself..."
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Location
                      </label>
                      <input
                        type="text"
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="Your location"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Age
                      </label>
                      <input
                        type="number"
                        value={editForm.age}
                        onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="Your age"
                        min="13"
                        max="120"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {user.username}
                  </h1>
                  {user.bio && (
                    <p className="text-gray-600 dark:text-gray-300 mb-4 max-w-2xl">
                      {user.bio}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-1">
                      <EnvelopeIcon className="w-4 h-4" />
                      <span>{user.email}</span>
                    </div>
                    {user.location && (
                      <div className="flex items-center space-x-1">
                        <MapPinIcon className="w-4 h-4" />
                        <span>{user.location}</span>
                      </div>
                    )}
                    {user.age && (
                      <div className="flex items-center space-x-1">
                        <UserIcon className="w-4 h-4" />
                        <span>{user.age} years old</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <CalendarIcon className="w-4 h-4" />
                      <span>Joined {formatDate(user.createdAt)}</span>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-center md:justify-start space-x-4 mt-6">
                {isOwnProfile ? (
                  isEditing ? (
                    <>
                      <button
                        onClick={handleSaveProfile}
                        disabled={isUpdating}
                        className="btn-primary flex items-center space-x-2"
                      >
                        <CheckIcon className="w-4 h-4" />
                        <span>{isUpdating ? 'Saving...' : 'Save Changes'}</span>
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="btn-ghost flex items-center space-x-2"
                      >
                        <XMarkIcon className="w-4 h-4" />
                        <span>Cancel</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <PencilIcon className="w-4 h-4" />
                      <span>Edit Profile</span>
                    </button>
                  )
                ) : (
                  <div className="flex space-x-3">
                    {renderFriendButton()}
                    {friendRequestStatus === 'friends' && (
                      <button
                        onClick={handleStartChat}
                        className="btn-ghost flex items-center space-x-2"
                      >
                        <ChatBubbleLeftRightIcon className="w-4 h-4" />
                        <span>Message</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Interests Section */}
        {(user.interests?.length > 0 || isEditing) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-6 mb-8"
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Interests
            </h2>
            {isEditing ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {editForm.interests.map((interest, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm rounded-full"
                    >
                      {interest}
                      <button
                        onClick={() => handleRemoveInterest(interest)}
                        className="ml-2 text-primary-400 hover:text-primary-600"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddInterest()}
                    placeholder="Add an interest..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    disabled={editForm.interests.length >= 10}
                  />
                  <button
                    onClick={handleAddInterest}
                    disabled={!newInterest.trim() || editForm.interests.length >= 10}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {editForm.interests.length}/10 interests
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {user.interests?.map((interest: string, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm rounded-full"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Posts</div>
          </div>
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Friends</div>
          </div>
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Matches</div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Profile