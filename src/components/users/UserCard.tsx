import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  HeartIcon,
  ChatBubbleLeftRightIcon,
  UserPlusIcon,
  MapPinIcon,
  SparklesIcon,
  CheckIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid'
import { generateAvatar, formatDate } from '../../lib/utils'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import FirestoreService from '../../services/firestoreService'
import toast from 'react-hot-toast'

interface UserCardProps {
  user: any
}

const UserCard = ({ user }: UserCardProps) => {
  const [isLiked, setIsLiked] = useState(false)
  const [friendStatus, setFriendStatus] = useState('none')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { user: currentUser } = useAuthStore()
  const avatar = generateAvatar(user.username)

  useEffect(() => {
    if (currentUser && user._id) {
      loadFriendStatus()
    }
  }, [currentUser, user._id])

  const loadFriendStatus = async () => {
    if (!currentUser) return
    
    try {
      const status = await FirestoreService.getFriendRequestStatus(currentUser._id, user._id)
      setFriendStatus(status)
    } catch (error) {
      console.error('Error loading friend status:', error)
    }
  }

  const handleMatch = () => {
    setIsLiked(!isLiked)
    // Handle match logic - could integrate with a matching system
    toast.success(isLiked ? 'Match removed' : `You matched with ${user.username}!`)
  }

  const handleChat = () => {
    navigate(`/chat/${user._id}`)
  }

  const handleFriendAction = async () => {
    if (!currentUser || isLoading) return
    
    setIsLoading(true)
    try {
      if (friendStatus === 'none') {
        await FirestoreService.sendFriendRequest(currentUser._id, user._id)
        setFriendStatus('sent')
        toast.success(`Friend request sent to ${user.username}!`)
      }
    } catch (error: any) {
      console.error('Error with friend action:', error)
      toast.error(error.message || 'Failed to send friend request')
    } finally {
      setIsLoading(false)
    }
  }

  const getMatchColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-500'
    if (percentage >= 60) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getFriendButton = () => {
    switch (friendStatus) {
      case 'sent':
        return (
          <div className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-lg">
            <ClockIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Sent</span>
          </div>
        )
      case 'received':
        return (
          <div className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <CheckIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Respond</span>
          </div>
        )
      case 'friends':
        return (
          <div className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
            <CheckIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Friends</span>
          </div>
        )
      default:
        return (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleFriendAction}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-all duration-200 disabled:opacity-50"
          >
            <UserPlusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">
              {isLoading ? 'Sending...' : 'Friend'}
            </span>
          </motion.button>
        )
    }
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      className="card p-6 hover:shadow-2xl transition-all duration-300 relative overflow-hidden"
    >
      {/* Background Pattern */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
        <SparklesIcon className="w-full h-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white text-lg font-bold`}>
                {avatar.initials}
              </div>
            )}
            {user.isOnline && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {user.username}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user.isOnline ? 'Online now' : `Last seen ${formatDate(user.lastSeen)}`}
            </p>
          </div>
        </div>

        {/* Match Percentage */}
        {user.matchPercentage && (
          <div className="text-center">
            <div className={`text-2xl font-bold ${getMatchColor(user.matchPercentage)}`}>
              {user.matchPercentage}%
            </div>
            <div className="text-xs text-gray-500">match</div>
          </div>
        )}
      </div>

      {/* Bio */}
      {user.bio && (
        <p className="text-gray-700 dark:text-gray-300 text-sm mb-4 line-clamp-2">
          {user.bio}
        </p>
      )}

      {/* Location & Age */}
      <div className="flex items-center space-x-4 mb-4 text-sm text-gray-500 dark:text-gray-400">
        {user.location && (
          <div className="flex items-center space-x-1">
            <MapPinIcon className="w-4 h-4" />
            <span>{user.location}</span>
          </div>
        )}
        {user.age && (
          <span>{user.age} years old</span>
        )}
      </div>

      {/* Interests */}
      {user.interests && user.interests.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {user.interests.slice(0, 4).map((interest: string, index: number) => (
              <span
                key={index}
                className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs rounded-full"
              >
                {interest}
              </span>
            ))}
            {user.interests.length > 4 && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full">
                +{user.interests.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Personality Traits */}
      {user.personalityTraits && user.personalityTraits.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Personality Traits
          </h4>
          <div className="space-y-1">
            {user.personalityTraits.slice(0, 3).map((trait: any, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-300 capitalize">
                  {trait.trait}
                </span>
                <div className="flex items-center space-x-1">
                  <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full"
                      style={{ width: `${(trait.score / 10) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-gray-500 w-6 text-right">
                    {trait.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Thoughts */}
      {user.thoughts && user.thoughts.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Recent Thought
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 italic line-clamp-2">
            "{user.thoughts[0]}"
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleMatch}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg transition-all duration-200 ${
            isLiked
              ? 'bg-red-500 text-white'
              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
          }`}
        >
          {isLiked ? (
            <HeartSolidIcon className="w-4 h-4" />
          ) : (
            <HeartIcon className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {isLiked ? 'Matched' : 'Match'}
          </span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleChat}
          className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-200"
        >
          <ChatBubbleLeftRightIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Chat</span>
        </motion.button>

        {getFriendButton()}
      </div>
    </motion.div>
  )
}

export default UserCard