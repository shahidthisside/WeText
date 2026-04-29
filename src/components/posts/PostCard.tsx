import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  EllipsisHorizontalIcon,
  ArrowUturnRightIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid'
import { formatDate, generateAvatar } from '../../lib/utils'
import FirestoreService from '../../services/firestoreService'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'

interface PostCardProps {
  post: any
  onLike: () => void
  currentUserId?: string
}

const PostCard = ({ post, onLike, currentUserId }: PostCardProps) => {
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)
  const { user } = useAuthStore()
  
  const isLiked = post.likes?.includes(currentUserId)
  const avatar = generateAvatar(post.author.username)

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !user) return

    setIsSubmittingComment(true)
    try {
      await FirestoreService.addComment(post._id, user._id, newComment.trim())
      setNewComment('')
      toast.success('Comment added!')
      // Refresh the post data
      window.location.reload()
    } catch (error) {
      console.error('Error adding comment:', error)
      toast.error('Failed to add comment')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyContent.trim() || !user || !replyingTo) return

    setIsSubmittingReply(true)
    try {
      await FirestoreService.addCommentReply(post._id, replyingTo, user._id, replyContent.trim())
      setReplyContent('')
      setReplyingTo(null)
      toast.success('Reply added!')
      // Refresh the post data
      window.location.reload()
    } catch (error) {
      console.error('Error adding reply:', error)
      toast.error('Failed to add reply')
    } finally {
      setIsSubmittingReply(false)
    }
  }

  const handleLikeComment = async (commentId: string) => {
    if (!user) return
    
    try {
      await FirestoreService.likeComment(post._id, commentId, user._id)
      // Refresh the post data
      window.location.reload()
    } catch (error) {
      console.error('Error liking comment:', error)
      toast.error('Failed to like comment')
    }
  }

  const handleLikeReply = async (commentId: string, replyId: string) => {
    if (!user) return
    
    try {
      await FirestoreService.likeCommentReply(post._id, commentId, replyId, user._id)
      // Refresh the post data
      window.location.reload()
    } catch (error) {
      console.error('Error liking reply:', error)
      toast.error('Failed to like reply')
    }
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Post by ${post.author.username}`,
          text: post.content,
          url: window.location.href
        })
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(
          `Check out this post by ${post.author.username}: "${post.content}" - ${window.location.href}`
        )
        toast.success('Post link copied to clipboard!')
      }
    } catch (error) {
      console.error('Error sharing post:', error)
      toast.error('Failed to share post')
    }
  }

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="card p-6 hover:shadow-xl transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {post.author.avatar ? (
            <img
              src={post.author.avatar}
              alt={post.author.username}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className={`w-10 h-10 rounded-full ${avatar.color} flex items-center justify-center text-white text-sm font-medium`}>
              {avatar.initials}
            </div>
          )}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              {post.isAnonymous ? 'Anonymous' : post.author.username}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(post.createdAt)}
            </p>
          </div>
        </div>
        <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
          <EllipsisHorizontalIcon className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="mb-4">
        <p className="text-gray-900 dark:text-white leading-relaxed">
          {post.content}
        </p>
        
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {post.tags.map((tag: string, index: number) => (
              <span
                key={index}
                className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Type Badge */}
        {post.type !== 'post' && (
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              post.type === 'thought' 
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
            }`}>
              {post.type === 'thought' ? (
                <span className="flex items-center space-x-1">
                  <ChatBubbleLeftRightIcon className="w-3 h-3" />
                  <span>Thought</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1">
                  <BookOpenIcon className="w-3 h-3" />
                  <span>Story</span>
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-6">
          <button
            onClick={onLike}
            className={`flex items-center space-x-2 transition-colors duration-200 ${
              isLiked 
                ? 'text-red-500' 
                : 'text-gray-500 hover:text-red-500'
            }`}
          >
            {isLiked ? (
              <HeartSolidIcon className="w-5 h-5" />
            ) : (
              <HeartIcon className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">
              {post.likes?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center space-x-2 text-gray-500 hover:text-blue-500 transition-colors duration-200"
          >
            <ChatBubbleLeftIcon className="w-5 h-5" />
            <span className="text-sm font-medium">
              {post.comments?.length || 0}
            </span>
          </button>

          <button 
            onClick={handleShare}
            className="flex items-center space-x-2 text-gray-500 hover:text-green-500 transition-colors duration-200"
          >
            <ShareIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Share</span>
          </button>
        </div>
      </div>

      {/* Comments Section */}
      {showComments && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          {/* Existing Comments */}
          {post.comments && post.comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {post.comments.map((comment: any, index: number) => {
                // Handle both old format (with author object) and new format (with authorId)
                const commentAuthor = comment.author || { username: 'Unknown', avatar: '' }
                const commentAvatar = generateAvatar(commentAuthor.username)
                const isCommentLiked = comment.likes?.includes(user?._id)
                
                return (
                  <div key={comment._id || index} className="space-y-2">
                    <div className="flex space-x-3">
                      {commentAuthor.avatar ? (
                        <img
                          src={commentAuthor.avatar}
                          alt={commentAuthor.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full ${commentAvatar.color} flex items-center justify-center text-white text-xs font-medium`}>
                          {commentAvatar.initials}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
                          <p className="font-medium text-sm text-gray-900 dark:text-white">
                            {commentAuthor.username}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 text-sm">
                            {comment.content}
                          </p>
                        </div>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-xs text-gray-500">
                            {formatDate(comment.createdAt)}
                          </span>
                          <button 
                            onClick={() => handleLikeComment(comment._id)}
                            className={`text-xs transition-colors ${
                              isCommentLiked 
                                ? 'text-red-500' 
                                : 'text-gray-500 hover:text-red-500'
                            }`}
                          >
                            Like {comment.likes?.length > 0 && `(${comment.likes.length})`}
                          </button>
                          <button 
                            onClick={() => setReplyingTo(comment._id)}
                            className="text-xs text-gray-500 hover:text-primary-500"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="ml-11 space-y-2">
                        {comment.replies.map((reply: any, replyIndex: number) => {
                          const replyAuthor = reply.author || { username: 'Unknown', avatar: '' }
                          const replyAvatar = generateAvatar(replyAuthor.username)
                          const isReplyLiked = reply.likes?.includes(user?._id)
                          
                          return (
                            <div key={reply._id || replyIndex} className="flex space-x-3">
                              {replyAuthor.avatar ? (
                                <img
                                  src={replyAuthor.avatar}
                                  alt={replyAuthor.username}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                              ) : (
                                <div className={`w-6 h-6 rounded-full ${replyAvatar.color} flex items-center justify-center text-white text-xs font-medium`}>
                                  {replyAvatar.initials}
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                                  <p className="font-medium text-xs text-gray-900 dark:text-white">
                                    {replyAuthor.username}
                                  </p>
                                  <p className="text-gray-700 dark:text-gray-300 text-xs">
                                    {reply.content}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-4 mt-1">
                                  <span className="text-xs text-gray-500">
                                    {formatDate(reply.createdAt)}
                                  </span>
                                  <button 
                                    onClick={() => handleLikeReply(comment._id, reply._id)}
                                    className={`text-xs transition-colors ${
                                      isReplyLiked 
                                        ? 'text-red-500' 
                                        : 'text-gray-500 hover:text-red-500'
                                    }`}
                                  >
                                    Like {reply.likes?.length > 0 && `(${reply.likes.length})`}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Reply Form */}
                    {replyingTo === comment._id && (
                      <div className="ml-11">
                        <form onSubmit={handleReply} className="flex space-x-2">
                          {user?.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.username}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className={`w-6 h-6 rounded-full ${generateAvatar(user?.username || 'You').color} flex items-center justify-center text-white text-xs font-medium`}>
                              {generateAvatar(user?.username || 'You').initials}
                            </div>
                          )}
                          <div className="flex-1">
                            <input
                              type="text"
                              value={replyContent}
                              onChange={(e) => setReplyContent(e.target.value)}
                              placeholder="Write a reply..."
                              className="w-full px-3 py-1 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={!replyContent.trim() || isSubmittingReply}
                            className="px-3 py-1 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            {isSubmittingReply ? 'Posting...' : 'Reply'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyingTo(null)}
                            className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Comment */}
          <form onSubmit={handleComment} className="flex space-x-3">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className={`w-8 h-8 rounded-full ${generateAvatar(user?.username || 'You').color} flex items-center justify-center text-white text-xs font-medium`}>
                {generateAvatar(user?.username || 'You').initials}
              </div>
            )}
            <div className="flex-1">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!newComment.trim() || isSubmittingComment}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isSubmittingComment ? 'Posting...' : 'Post'}
            </button>
          </form>
        </motion.div>
      )}
    </motion.div>
  )
}

export default PostCard