import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  UserGroupIcon, 
  UserPlusIcon, 
  CheckIcon, 
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  UserMinusIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import FirestoreService from '../services/firestoreService'
import { generateAvatar, formatDate } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import UserSearch from '../components/search/UserSearch'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const Friends = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [removingFriend, setRemovingFriend] = useState<string | null>(null)

  const tabs = [
    { id: 'friends', name: 'Friends', count: friends.length },
    { id: 'requests', name: 'Requests', count: friendRequests.length },
  ]

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    if (!user) return
    
    setIsLoading(true)
    try {
      const [friendsData, requestsData] = await Promise.all([
        FirestoreService.getFriends(user._id),
        FirestoreService.getFriendRequests(user._id)
      ])
      
      setFriends(friendsData)
      setFriendRequests(requestsData)
    } catch (error) {
      console.error('Error loading friends data:', error)
      toast.error('Failed to load friends data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAcceptRequest = async (requestId: string, senderId: string) => {
    if (!user) return
    
    try {
      await FirestoreService.acceptFriendRequest(requestId, senderId, user._id)
      toast.success('Friend request accepted!')
      loadData() // Reload data
    } catch (error) {
      console.error('Error accepting friend request:', error)
      toast.error('Failed to accept friend request')
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      await FirestoreService.rejectFriendRequest(requestId)
      toast.success('Friend request rejected')
      loadData() // Reload data
    } catch (error) {
      console.error('Error rejecting friend request:', error)
      toast.error('Failed to reject friend request')
    }
  }

  const handleStartChat = (friendId: string) => {
    navigate(`/chat/${friendId}`)
  }

  const handleViewProfile = (friendId: string) => {
    navigate(`/profile/${friendId}`)
  }

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (!user) return

    const confirmed = window.confirm(
      `Are you sure you want to remove ${friendName} from your friends?`
    )

    if (!confirmed) return

    setRemovingFriend(friendId)
    try {
      await FirestoreService.removeFriend(user._id, friendId)
      toast.success(`${friendName} removed from friends`)
      loadData() // Reload data
    } catch (error) {
      console.error('Error removing friend:', error)
      toast.error('Failed to remove friend')
    } finally {
      setRemovingFriend(null)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-20 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Friends
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Manage your connections and friend requests
            </p>
          </div>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
            <span>Find Friends</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 glass rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white shadow-lg'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="font-medium">{tab.name}</span>
              {tab.count > 0 && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {activeTab === 'friends' ? (
              // Friends List
              friends.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                  <UserGroupIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                    No friends yet
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    Start connecting with people by searching for users and sending friend requests
                  </p>
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="btn-primary"
                  >
                    Find Friends
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {friends.map((friend, index) => {
                    const avatar = generateAvatar(friend.username)
                    const isRemoving = removingFriend === friend._id
                    
                    return (
                      <motion.div
                        key={friend._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="glass rounded-2xl p-6 hover:shadow-xl transition-all duration-300"
                      >
                        <div className="flex items-center space-x-4 mb-4">
                          <div className="relative">
                            {friend.avatar ? (
                              <img
                                src={friend.avatar}
                                alt={friend.username}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white font-medium`}>
                                {avatar.initials}
                              </div>
                            )}
                            {friend.isOnline && (
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                            )}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {friend.username}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {friend.isOnline ? 'Online' : 'Offline'}
                            </p>
                          </div>
                        </div>

                        {friend.bio && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">
                            {friend.bio}
                          </p>
                        )}

                        <div className="flex items-center space-x-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleStartChat(friend._id)}
                            className="flex-1 btn-primary text-sm py-2"
                          >
                            <ChatBubbleLeftRightIcon className="w-4 h-4 mr-2" />
                            Chat
                          </motion.button>
                          
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleViewProfile(friend._id)}
                            className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title="View Profile"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleRemoveFriend(friend._id, friend.username)}
                            disabled={isRemoving}
                            className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                            title="Remove Friend"
                          >
                            {isRemoving ? (
                              <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                            ) : (
                              <UserMinusIcon className="w-4 h-4" />
                            )}
                          </motion.button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )
            ) : (
              // Friend Requests
              friendRequests.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                  <UserPlusIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                    No friend requests
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    When someone sends you a friend request, it will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {friendRequests.map((request, index) => {
                    const avatar = generateAvatar(request.sender.username)
                    return (
                      <motion.div
                        key={request._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="glass rounded-2xl p-6"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="relative">
                              {request.sender.avatar ? (
                                <img
                                  src={request.sender.avatar}
                                  alt={request.sender.username}
                                  className="w-12 h-12 rounded-full object-cover"
                                />
                              ) : (
                                <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white font-medium`}>
                                  {avatar.initials}
                                </div>
                              )}
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 dark:text-white">
                                {request.sender.username}
                              </h3>
                              {request.sender.bio && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                                  {request.sender.bio}
                                </p>
                              )}
                              <p className="text-xs text-gray-400">
                                {formatDate(request.createdAt)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleViewProfile(request.sender._id)}
                              className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                              title="View Profile"
                            >
                              <EyeIcon className="w-5 h-5" />
                            </button>
                            
                            <button
                              onClick={() => handleAcceptRequest(request._id, request.sender._id)}
                              className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                              title="Accept"
                            >
                              <CheckIcon className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleRejectRequest(request._id)}
                              className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                              title="Reject"
                            >
                              <XMarkIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* User Search Modal */}
      <UserSearch 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />
    </div>
  )
}

export default Friends