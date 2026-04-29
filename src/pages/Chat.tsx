import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  PaperAirplaneIcon,
  FaceSmileIcon,
  PhotoIcon,
  ArrowLeftIcon,
  PhoneIcon,
  VideoCameraIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import FirestoreService from '../services/firestoreService'
import { formatTime, generateAvatar } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import toast from 'react-hot-toast'

const Chat = () => {
  const { contactId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [contacts, setContacts] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const unsubscribeRef = useRef(null)

  useEffect(() => {
    if (user) {
      loadContacts()
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
    }
  }, [user])

  useEffect(() => {
    if (contactId && contacts.length > 0) {
      const contact = contacts.find(c => c.contact._id === contactId)
      if (contact) {
        setSelectedContact(contact.contact)
        loadMessages(contactId)
      }
    }
  }, [contactId, contacts])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadContacts = async () => {
    if (!user) return
    
    try {
      const fetchedContacts = await FirestoreService.getContacts(user._id)
      setContacts(fetchedContacts)
    } catch (error) {
      console.error('Error loading contacts:', error)
      toast.error('Failed to load contacts')
    } finally {
      setIsLoading(false)
    }
  }

  const loadMessages = async (contactId) => {
    if (!user) return
    
    try {
      console.log('Setting up real-time listener for messages between:', user._id, 'and', contactId)
      
      // Unsubscribe from previous listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }

      // Set up real-time listener for messages with debounced updates
      let updateTimeout: NodeJS.Timeout
      
      unsubscribeRef.current = FirestoreService.subscribeToMessages(
        user._id,
        contactId,
        (fetchedMessages) => {
          console.log('Received messages update:', fetchedMessages.length, 'messages')
          
          // Debounce updates to prevent rapid-fire renders
          clearTimeout(updateTimeout)
          updateTimeout = setTimeout(() => {
            setMessages(fetchedMessages)
          }, 100)
        }
      )
    } catch (error) {
      console.error('Error loading messages:', error)
      toast.error('Failed to load messages')
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedContact || !user) return

    const messageContent = newMessage.trim()
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Create optimistic message for immediate UI update
    const optimisticMessage = {
      _id: tempId,
      sender: {
        _id: user._id,
        username: user.username,
        avatar: user.avatar || ''
      },
      receiver: {
        _id: selectedContact._id,
        username: selectedContact.username,
        avatar: selectedContact.avatar || ''
      },
      content: messageContent,
      type: 'text',
      isRead: false,
      createdAt: new Date()
    }

    // Add optimistic message to UI immediately
    setMessages(prev => [...prev, optimisticMessage])
    setNewMessage('')

    try {
      console.log('Sending message:', {
        from: user._id,
        to: selectedContact._id,
        content: messageContent
      })
      
      await FirestoreService.sendMessage(
        user._id,
        selectedContact._id,
        messageContent,
        'text'
      )
      
      console.log('Message sent successfully')
      
      // Remove the optimistic message since real-time listener will add the real one
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg._id !== tempId))
      }, 1000)
      
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('Failed to send message')
      
      // Remove optimistic message and restore input
      setMessages(prev => prev.filter(msg => msg._id !== tempId))
      setNewMessage(messageContent)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-16 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto h-[calc(100vh-4rem)] flex">
        {/* Contacts Sidebar */}
        <div className={`w-full md:w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col ${
          selectedContact ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Messages
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {contacts.length} conversations
            </p>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto">
            {contacts.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400">
                  No conversations yet. Start chatting with someone!
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {contacts.map((contact) => {
                  const avatar = generateAvatar(contact.contact.username)
                  return (
                    <motion.button
                      key={contact.contact._id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => {
                        setSelectedContact(contact.contact)
                        navigate(`/chat/${contact.contact._id}`)
                      }}
                      className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                        selectedContact?._id === contact.contact._id
                          ? 'bg-primary-100 dark:bg-primary-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          {contact.contact.avatar ? (
                            <img
                              src={contact.contact.avatar}
                              alt={contact.contact.username}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white font-medium`}>
                              {avatar.initials}
                            </div>
                          )}
                          {contact.contact.isOnline && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-gray-900 dark:text-white truncate">
                              {contact.contact.username}
                            </h3>
                            {contact.lastMessage && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatTime(contact.lastMessage.createdAt)}
                              </span>
                            )}
                          </div>
                          {contact.lastMessage && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {contact.lastMessage.content}
                            </p>
                          )}
                          {contact.unreadCount > 0 && (
                            <div className="mt-1">
                              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-primary-500 rounded-full">
                                {contact.unreadCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${selectedContact ? 'flex' : 'hidden md:flex'}`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      setSelectedContact(null)
                      navigate('/chat')
                    }}
                    className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowLeftIcon className="w-5 h-5" />
                  </button>
                  <div className="relative">
                    {selectedContact.avatar ? (
                      <img
                        src={selectedContact.avatar}
                        alt={selectedContact.username}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full ${generateAvatar(selectedContact.username).color} flex items-center justify-center text-white font-medium`}>
                        {generateAvatar(selectedContact.username).initials}
                      </div>
                    )}
                    {selectedContact.isOnline && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {selectedContact.username}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedContact.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <PhoneIcon className="w-5 h-5" />
                  </button>
                  <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <VideoCameraIcon className="w-5 h-5" />
                  </button>
                  <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <EllipsisVerticalIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                {messages.map((message, index) => {
                  const isOwn = message.sender._id === user._id
                  const showAvatar = index === 0 || messages[index - 1].sender._id !== message.sender._id
                  
                  return (
                    <motion.div
                      key={`${message._id}-${message.createdAt.getTime()}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex items-end space-x-2 max-w-xs lg:max-w-md ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                        {!isOwn && showAvatar && (
                          <div className={`w-8 h-8 rounded-full ${generateAvatar(message.sender.username).color} flex items-center justify-center text-white text-xs font-medium`}>
                            {generateAvatar(message.sender.username).initials}
                          </div>
                        )}
                        {!isOwn && !showAvatar && <div className="w-8" />}
                        
                        <div className={`px-4 py-2 rounded-2xl ${
                          isOwn 
                            ? 'bg-primary-500 text-white' 
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                        }`}>
                          <p className="text-sm">{message.content}</p>
                          <p className={`text-xs mt-1 ${
                            isOwn ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <form onSubmit={sendMessage} className="flex items-center space-x-3">
                  <button
                    type="button"
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <PhotoIcon className="w-5 h-5" />
                  </button>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="w-full px-4 py-2 pr-12 bg-gray-100 dark:bg-gray-700 border-0 rounded-full focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <FaceSmileIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="p-2 rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <PaperAirplaneIcon className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                  Select a conversation
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Choose from your existing conversations or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Chat