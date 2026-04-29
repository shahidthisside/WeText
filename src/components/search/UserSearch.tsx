import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MagnifyingGlassIcon, 
  XMarkIcon,
  UserPlusIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../../store/authStore'
import FirestoreService from '../../services/firestoreService'
import { generateAvatar } from '../../lib/utils'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

interface UserSearchProps {
  isOpen: boolean
  onClose: () => void
}

interface SearchUser {
  _id: string
  username: string
  bio?: string
  avatar?: string
  location?: string
  isOnline?: boolean
  friendStatus?: string
}

const UserSearch = ({ isOpen, onClose }: UserSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const { user } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const debounceTimer = setTimeout(() => {
        searchUsers(searchQuery.trim())
      }, 300)

      return () => clearTimeout(debounceTimer)
    } else {
      setSearchResults([])
    }
  }, [searchQuery])

  const searchUsers = async (query: string) => {
    if (!user) return
    
    setIsSearching(true)
    try {
      const users = await FirestoreService.searchUsers(query, user._id)
      
      // Get friend status for each user
      const usersWithStatus = await Promise.all(
        users.map(async (searchUser) => {
          const status = await FirestoreService.getFriendRequestStatus(user._id, searchUser._id)
          return {
            ...searchUser,
            friendStatus: status
          }
        })
      )
      
      setSearchResults(usersWithStatus)
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Failed to search users')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!user) return
    
    try {
      await FirestoreService.sendFriendRequest(user._id, targetUserId)
      toast.success('Friend request sent!')
      
      // Update the search results to reflect the sent request
      setSearchResults(results => 
        results.map(result => 
          result._id === targetUserId 
            ? { ...result, friendStatus: 'sent' }
            : result
        )
      )
    } catch (error: any) {
      console.error('Friend request error:', error)
      toast.error(error.message || 'Failed to send friend request')
    }
  }

  const handleStartChat = (targetUserId: string) => {
    navigate(`/chat/${targetUserId}`)
    onClose()
  }

  const getFriendStatusButton = (searchUser: SearchUser) => {
    switch (searchUser.friendStatus) {
      case 'sent':
        return (
          <div className="flex items-center px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-lg text-sm">
            <ClockIcon className="w-4 h-4 mr-1" />
            Request Sent
          </div>
        )
      case 'received':
        return (
          <div className="flex items-center px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm">
            <CheckIcon className="w-4 h-4 mr-1" />
            Respond in Friends
          </div>
        )
      case 'friends':
        return (
          <div className="flex items-center px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-sm">
            <CheckIcon className="w-4 h-4 mr-1" />
            Friends
          </div>
        )
      default:
        return (
          <button
            onClick={() => handleSendFriendRequest(searchUser._id)}
            className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
            title="Send Friend Request"
          >
            <UserPlusIcon className="w-4 h-4" />
          </button>
        )
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl glass-strong rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Search Users
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users by username..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  autoFocus
                />
              </div>
            </div>

            {/* Search Results */}
            <div className="max-h-96 overflow-y-auto p-6">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8">
                  <MagnifyingGlassIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchQuery ? 'No users found' : 'Start typing to search for users'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {searchResults.map((searchUser) => {
                    const avatar = generateAvatar(searchUser.username)
                    return (
                      <motion.div
                        key={searchUser._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            {searchUser.avatar ? (
                              <img
                                src={searchUser.avatar}
                                alt={searchUser.username}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white font-medium`}>
                                {avatar.initials}
                              </div>
                            )}
                            {searchUser.isOnline && (
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                            )}
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {searchUser.username}
                            </h3>
                            {searchUser.bio && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                                {searchUser.bio}
                              </p>
                            )}
                            {searchUser.location && (
                              <p className="text-xs text-gray-400 flex items-center space-x-1">
                                <MapPinIcon className="w-3 h-3" />
                                <span>{searchUser.location}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleStartChat(searchUser._id)}
                            className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title="Start Chat"
                          >
                            <ChatBubbleLeftRightIcon className="w-4 h-4" />
                          </button>
                          
                          {getFriendStatusButton(searchUser)}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  )
}

export default UserSearch