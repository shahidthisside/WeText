import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { 
  HeartIcon, 
  ChatBubbleLeftRightIcon, 
  UserGroupIcon,
  PlusIcon,
  SparklesIcon,
  FireIcon,
  EyeIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid'
import { useAuthStore } from '../store/authStore'
import FirestoreService from '../services/firestoreService'
import { formatDate, generateAvatar } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import CreatePostModal from '../components/posts/CreatePostModal'
import PostCard from '../components/posts/PostCard'
import UserCard from '../components/users/UserCard'
import toast from 'react-hot-toast'

const tabs = [
  { id: 'feed', name: 'Feed', icon: FireIcon },
  { id: 'discover', name: 'Discover', icon: SparklesIcon },
  { id: 'thoughts', name: 'Thoughts', icon: EyeIcon },
  { id: 'stories', name: 'Stories', icon: BookOpenIcon },
]

const Dashboard = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('feed')
  const [posts, setPosts] = useState([])
  const [users, setUsers] = useState([])
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [trendingTopics, setTrendingTopics] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreatePost, setShowCreatePost] = useState(false)

  useEffect(() => {
    if (user) {
      loadData()
      loadTrendingTopics()
      loadFriendsData()
    }
  }, [activeTab, user])

  const loadTrendingTopics = async () => {
    if (!user) return
    
    try {
      // Get all posts to analyze trending topics
      const { posts: allPosts } = await FirestoreService.getPosts(undefined, 100)
      const tagCounts = new Map()
      
      // Count tag occurrences
      allPosts.forEach(post => {
        if (post.tags && post.tags.length > 0) {
          post.tags.forEach(tag => {
            const count = tagCounts.get(tag) || 0
            tagCounts.set(tag, count + 1)
          })
        }
      })
      
      // Sort by count and get top 5
      const sortedTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }))
      
      setTrendingTopics(sortedTags)
    } catch (error) {
      console.error('Error loading trending topics:', error)
    }
  }

  const loadFriendsData = async () => {
    if (!user) return
    
    try {
      const [friendsData, requestsData] = await Promise.all([
        FirestoreService.getFriends(user._id),
        FirestoreService.getFriendRequests(user._id)
      ])
      
      setFriends(friendsData)
      setFriendRequests(requestsData)
    } catch (error) {
      console.error('Error loading friends data:', error)
    }
  }

  const loadData = async () => {
    if (!user) return
    
    setIsLoading(true)
    try {
      if (activeTab === 'feed') {
        // Feed shows all types of posts
        const { posts: fetchedPosts } = await FirestoreService.getPosts(undefined, 20)
        setPosts(fetchedPosts)
      } else if (activeTab === 'thoughts') {
        // Thoughts shows only thought type posts
        const { posts: fetchedPosts } = await FirestoreService.getPosts(undefined, 20, 'thought')
        setPosts(fetchedPosts)
      } else if (activeTab === 'stories') {
        // Stories shows only story type posts
        const { posts: fetchedPosts } = await FirestoreService.getPosts(undefined, 20, 'story')
        setPosts(fetchedPosts)
      } else if (activeTab === 'discover') {
        const fetchedUsers = await FirestoreService.getUsers(user._id, 20)
        setUsers(fetchedUsers)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreatePost = async (postData) => {
    if (!user) return
    
    try {
      const newPost = await FirestoreService.createPost(user._id, postData)
      setPosts([newPost, ...posts])
      setShowCreatePost(false)
      toast.success('Post created successfully!')
    } catch (error) {
      console.error('Error creating post:', error)
      toast.error('Failed to create post')
    }
  }

  const handleLikePost = async (postId) => {
    if (!user) return
    
    try {
      await FirestoreService.likePost(postId, user._id)
      
      // Update local state optimistically
      setPosts(posts.map(post => 
        post._id === postId 
          ? { 
              ...post, 
              likes: post.likes.includes(user._id) 
                ? post.likes.filter(id => id !== user._id)
                : [...post.likes, user._id]
            }
          : post
      ))
    } catch (error) {
      console.error('Error liking post:', error)
      toast.error('Failed to like post')
    }
  }

  const handleNavigateToChat = () => {
    navigate('/chat')
  }

  const handleNavigateToMatches = () => {
    navigate('/matches')
  }

  const handleNavigateToFriends = () => {
    navigate('/friends')
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="glass rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-full ${generateAvatar(user?.username || '').color} flex items-center justify-center text-white text-xl font-bold`}>
                      {generateAvatar(user?.username || '').initials}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Welcome back, {user?.username}!
                  </h1>
                  <p className="text-gray-600 dark:text-gray-300">
                    Ready to connect with amazing people today?
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreatePost(true)}
                className="btn-primary flex items-center space-x-2"
              >
                <PlusIcon className="w-5 h-5" />
                <span>Create Post</span>
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              onClick={handleNavigateToMatches}
              className="glass rounded-xl p-4 text-center cursor-pointer hover:shadow-lg transition-all"
            >
              <HeartIcon className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Potential Matches</div>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              onClick={handleNavigateToChat}
              className="glass rounded-xl p-4 text-center cursor-pointer hover:shadow-lg transition-all"
            >
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Active Chats</div>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              onClick={handleNavigateToFriends}
              className="glass rounded-xl p-4 text-center cursor-pointer hover:shadow-lg transition-all"
            >
              <UserGroupIcon className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{friends.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Friends</div>
            </motion.div>
          </div>
        </motion.div>

        {/* Navigation Tabs */}
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
              <tab.icon className="w-5 h-5" />
              <span className="font-medium">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                {activeTab === 'discover' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {users.length === 0 ? (
                      <div className="col-span-2 text-center py-12">
                        <p className="text-gray-500 dark:text-gray-400">
                          No users found. Be the first to join the community!
                        </p>
                      </div>
                    ) : (
                      users.map((user, index) => (
                        <motion.div
                          key={user._id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                          <UserCard user={user} />
                        </motion.div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {posts.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-500 dark:text-gray-400 mb-4">
                          {activeTab === 'thoughts' 
                            ? 'No thoughts yet. Share your first thought!'
                            : activeTab === 'stories'
                            ? 'No stories yet. Tell your first story!'
                            : 'No posts yet. Be the first to share something!'
                          }
                        </p>
                        <button
                          onClick={() => setShowCreatePost(true)}
                          className="btn-primary"
                        >
                          {activeTab === 'thoughts' 
                            ? 'Share a Thought'
                            : activeTab === 'stories'
                            ? 'Tell a Story'
                            : 'Create Your First Post'
                          }
                        </button>
                      </div>
                    ) : (
                      posts.map((post, index) => (
                        <motion.div
                          key={post._id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                          <PostCard 
                            post={post} 
                            onLike={() => handleLikePost(post._id)}
                            currentUserId={user?._id}
                          />
                        </motion.div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Friend Requests */}
            {friendRequests.length > 0 && (
              <div className="glass rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  🤝 Friend Requests ({friendRequests.length})
                </h3>
                <div className="space-y-3">
                  {friendRequests.slice(0, 3).map((request, index) => {
                    const avatar = generateAvatar(request.sender.username)
                    return (
                      <motion.div
                        key={request._id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <div className="flex items-center space-x-2">
                          {request.sender.avatar ? (
                            <img
                              src={request.sender.avatar}
                              alt={request.sender.username}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className={`w-8 h-8 rounded-full ${avatar.color} flex items-center justify-center text-white text-xs font-medium`}>
                              {avatar.initials}
                            </div>
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {request.sender.username}
                          </span>
                        </div>
                      </motion.div>
                    )
                  })}
                  {friendRequests.length > 3 && (
                    <button
                      onClick={handleNavigateToFriends}
                      className="w-full text-center text-sm text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      View all {friendRequests.length} requests
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Trending Topics */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
                <FireIcon className="w-5 h-5 text-orange-500" />
                <span>Trending Topics</span>
              </h3>
              <div className="space-y-3">
                {trendingTopics.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    No trending topics yet. Start posting with hashtags!
                  </p>
                ) : (
                  trendingTopics.map((topic, index) => (
                    <motion.div
                      key={topic.tag}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <span className="text-primary-600 dark:text-primary-400 font-medium">
                        #{topic.tag}
                      </span>
                      <span className="text-sm text-gray-500">{topic.count} posts</span>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                ⚡ Quick Actions
              </h3>
              <div className="space-y-3">
                <button 
                  onClick={handleNavigateToMatches}
                  className="w-full btn-ghost text-left"
                >
                  <HeartIcon className="w-5 h-5 inline mr-3" />
                  Find New Matches
                </button>
                <button 
                  onClick={handleNavigateToChat}
                  className="w-full btn-ghost text-left"
                >
                  <ChatBubbleLeftRightIcon className="w-5 h-5 inline mr-3" />
                  Start a Chat
                </button>
                <button 
                  onClick={handleNavigateToFriends}
                  className="w-full btn-ghost text-left"
                >
                  <UserGroupIcon className="w-5 h-5 inline mr-3" />
                  Manage Friends
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Post Modal */}
      {showCreatePost && (
        <CreatePostModal
          onClose={() => setShowCreatePost(false)}
          onSubmit={handleCreatePost}
        />
      )}
    </div>
  )
}

export default Dashboard