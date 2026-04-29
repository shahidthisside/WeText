import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  HeartIcon, 
  XMarkIcon, 
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  FireIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid'
import { useAuthStore } from '../store/authStore'
import FirestoreService from '../services/firestoreService'
import { generateAvatar } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const Matches = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [matches, setMatches] = useState([])

  useEffect(() => {
    if (user) {
      loadUsers()
    }
  }, [user])

  const loadUsers = async () => {
    if (!user) return
    
    setIsLoading(true)
    try {
      const fetchedUsers = await FirestoreService.getUsers(user._id, 50)
      // Filter out users we've already matched with
      const availableUsers = fetchedUsers.filter(u => !matches.includes(u._id))
      setUsers(availableUsers)
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('Failed to load potential matches')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLike = async () => {
    if (currentIndex >= users.length) return
    
    const currentUser = users[currentIndex]
    try {
      // In a real app, you'd implement a matching algorithm here
      // For now, we'll just add to matches and move to next
      setMatches(prev => [...prev, currentUser._id])
      toast.success(`You liked ${currentUser.username}!`)
      
      // Move to next user
      setCurrentIndex(prev => prev + 1)
    } catch (error) {
      console.error('Error liking user:', error)
      toast.error('Failed to like user')
    }
  }

  const handlePass = () => {
    if (currentIndex >= users.length) return
    setCurrentIndex(prev => prev + 1)
  }

  const handleStartChat = (userId: string) => {
    navigate(`/chat/${userId}`)
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const currentUser = users[currentIndex]
  const hasMoreUsers = currentIndex < users.length

  return (
    <div className="min-h-screen pt-20 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Discover Matches
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Find people who share your interests and personality
          </p>
        </div>

        {/* Match Card */}
        <div className="flex justify-center">
          {!hasMoreUsers ? (
            <div className="glass rounded-3xl p-12 text-center max-w-md">
              <SparklesIcon className="w-16 h-16 text-primary-500 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                No more matches
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                You've seen all available users. Check back later for new people!
              </p>
              <button
                onClick={loadUsers}
                className="btn-primary"
              >
                Refresh
              </button>
            </div>
          ) : (
            <motion.div
              key={currentUser._id}
              initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotateY: -90 }}
              transition={{ duration: 0.5 }}
              className="glass rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              {/* User Info */}
              <div className="text-center mb-6">
                <div className="relative inline-block mb-4">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.username}
                      className="w-32 h-32 rounded-full object-cover mx-auto"
                    />
                  ) : (
                    <div className={`w-32 h-32 rounded-full ${generateAvatar(currentUser.username).color} flex items-center justify-center text-white text-4xl font-bold mx-auto`}>
                      {generateAvatar(currentUser.username).initials}
                    </div>
                  )}
                  {currentUser.isOnline && (
                    <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 rounded-full border-4 border-white dark:border-gray-800"></div>
                  )}
                </div>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {currentUser.username}
                </h2>
                
                <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {currentUser.age && <span>{currentUser.age} years old</span>}
                  {currentUser.location && (
                    <span className="flex items-center space-x-1">
                      <MapPinIcon className="w-3 h-3" />
                      <span>{currentUser.location}</span>
                    </span>
                  )}
                </div>

                {/* Match Percentage */}
                <div className="mb-4">
                  <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-bold ${
                    currentUser.matchPercentage >= 80 ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                    currentUser.matchPercentage >= 60 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    <FireIcon className="w-5 h-5 mr-2" />
                    {currentUser.matchPercentage}% Match
                  </div>
                </div>
              </div>

              {/* Bio */}
              {currentUser.bio && (
                <div className="mb-6">
                  <p className="text-gray-700 dark:text-gray-300 text-center leading-relaxed">
                    {currentUser.bio}
                  </p>
                </div>
              )}

              {/* Interests */}
              {currentUser.interests && currentUser.interests.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 text-center">
                    Interests
                  </h4>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {currentUser.interests.slice(0, 6).map((interest: string, index: number) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm rounded-full"
                      >
                        {interest}
                      </span>
                    ))}
                    {currentUser.interests.length > 6 && (
                      <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm rounded-full">
                        +{currentUser.interests.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Personality Traits */}
              {currentUser.personalityTraits && currentUser.personalityTraits.length > 0 && (
                <div className="mb-8">
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 text-center">
                    Personality
                  </h4>
                  <div className="space-y-2">
                    {currentUser.personalityTraits.slice(0, 3).map((trait: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">
                          {trait.trait}
                        </span>
                        <div className="flex items-center space-x-2">
                          <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full"
                              style={{ width: `${(trait.score / 10) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-500 w-6 text-right">
                            {trait.score}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-center space-x-4">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handlePass}
                  className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                >
                  <XMarkIcon className="w-8 h-8" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleStartChat(currentUser._id)}
                  className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center"
                >
                  <ChatBubbleLeftRightIcon className="w-6 h-6" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleLike}
                  className="w-16 h-16 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center shadow-lg"
                >
                  <HeartIcon className="w-8 h-8" />
                </motion.button>
              </div>

              {/* Progress */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentIndex + 1} of {users.length}
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-2">
                  <div 
                    className="bg-primary-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / users.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Instructions */}
        {hasMoreUsers && (
          <div className="text-center mt-8">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              <span className="inline-flex items-center space-x-1">
                <XMarkIcon className="w-4 h-4" />
                <span>Pass</span>
              </span>
              <span className="mx-2">•</span>
              <span className="inline-flex items-center space-x-1">
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                <span>Chat</span>
              </span>
              <span className="mx-2">•</span>
              <span className="inline-flex items-center space-x-1">
                <HeartIcon className="w-4 h-4" />
                <span>Like</span>
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Matches