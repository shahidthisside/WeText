import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  UserIcon,
  LockClosedIcon,
  BellIcon,
  EyeIcon,
  ShieldCheckIcon,
  TrashIcon,
  MoonIcon,
  SunIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import AuthService from '../services/authService'
import FirestoreService from '../services/firestoreService'
import { generateAvatar } from '../lib/utils'
import toast from 'react-hot-toast'

const Settings = () => {
  const { user, logout, updateUser } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [activeTab, setActiveTab] = useState('account')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    bio: '',
    location: '',
    age: ''
  })
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    friendRequests: true,
    messages: true,
    posts: false,
    marketing: false
  })
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: 'public',
    showOnlineStatus: true,
    showLastSeen: true,
    allowFriendRequests: true,
    allowMessages: 'friends'
  })

  const tabs = [
    { id: 'account', name: 'Account', icon: UserIcon },
    { id: 'security', name: 'Security', icon: LockClosedIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'privacy', name: 'Privacy', icon: EyeIcon },
    { id: 'appearance', name: 'Appearance', icon: SunIcon },
    { id: 'data', name: 'Data & Storage', icon: ShieldCheckIcon },
  ]

  useEffect(() => {
    if (user) {
      setProfileForm({
        username: user.username || '',
        email: user.email || '',
        bio: user.bio || '',
        location: user.location || '',
        age: user.age?.toString() || ''
      })
    }
  }, [user])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsChangingPassword(true)
    try {
      await AuthService.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Password changed successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsUpdatingProfile(true)
    try {
      const updates = {
        username: profileForm.username.trim(),
        bio: profileForm.bio.trim(),
        location: profileForm.location.trim(),
        age: profileForm.age ? parseInt(profileForm.age) : null,
      }

      await FirestoreService.updateUserProfile(user._id, updates)
      await updateUser(updates)
      toast.success('Profile updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleResetPassword = async () => {
    if (!user?.email) return
    
    try {
      await AuthService.resetPassword(user.email)
      toast.success('Password reset email sent')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email')
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action cannot be undone.'
    )
    
    if (confirmed) {
      const doubleConfirm = window.prompt(
        'Type "DELETE" to confirm account deletion:'
      )
      
      if (doubleConfirm === 'DELETE') {
        try {
          // In a real app, you'd call a delete account API
          toast.success('Account deletion request submitted. Please contact support to complete the process.')
        } catch (error) {
          toast.error('Failed to delete account')
        }
      }
    }
  }

  const renderAccountSettings = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Profile Information
          </h3>
          <button
            onClick={() => setActiveTab('profile-edit')}
            className="btn-ghost text-sm"
          >
            <PencilIcon className="w-4 h-4 mr-1" />
            Edit Profile
          </button>
        </div>
        
        <div className="flex items-center space-x-4 mb-6">
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
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              {user?.username}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user?.email}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              Email cannot be changed. Contact support if needed.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              value={user?.username || ''}
              disabled
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              Change username by editing your profile.
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Account Actions
        </h3>
        <div className="space-y-3">
          <button
            onClick={logout}
            className="w-full btn-ghost text-left justify-start"
          >
            Sign Out
          </button>
          <button
            onClick={handleDeleteAccount}
            className="w-full btn-ghost text-left justify-start text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <TrashIcon className="w-4 h-4 mr-2" />
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )

  const renderProfileEdit = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Edit Profile
          </h3>
          <button
            onClick={() => setActiveTab('account')}
            className="btn-ghost text-sm"
          >
            Back to Account
          </button>
        </div>
        
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              value={profileForm.username}
              onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Username must be unique across the platform.
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bio
            </label>
            <textarea
              value={profileForm.bio}
              onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
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
                value={profileForm.location}
                onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })}
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
                value={profileForm.age}
                onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="Your age"
                min="13"
                max="120"
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isUpdatingProfile}
            className="btn-primary"
          >
            {isUpdatingProfile ? 'Updating...' : 'Update Profile'}
          </button>
        </form>
      </div>
    </div>
  )

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Change Password
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={isChangingPassword}
            className="btn-primary"
          >
            {isChangingPassword ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Password Reset
        </h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Forgot your password? Send a reset link to your email.
        </p>
        <button
          onClick={handleResetPassword}
          className="btn-ghost"
        >
          Send Reset Email
        </button>
      </div>
    </div>
  )

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Notification Preferences
        </h3>
        <div className="space-y-4">
          {Object.entries(notificationSettings).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {getNotificationDescription(key)}
                </div>
              </div>
              <button
                onClick={() => setNotificationSettings({ ...notificationSettings, [key]: !value })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  value ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    value ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderPrivacySettings = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Privacy Controls
        </h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Profile Visibility
            </label>
            <select
              value={privacySettings.profileVisibility}
              onChange={(e) => setPrivacySettings({ ...privacySettings, profileVisibility: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="public">Public</option>
              <option value="friends">Friends Only</option>
              <option value="private">Private</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Who can send you messages?
            </label>
            <select
              value={privacySettings.allowMessages}
              onChange={(e) => setPrivacySettings({ ...privacySettings, allowMessages: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="everyone">Everyone</option>
              <option value="friends">Friends Only</option>
              <option value="none">No One</option>
            </select>
          </div>

          {Object.entries(privacySettings)
            .filter(([key]) => typeof privacySettings[key as keyof typeof privacySettings] === 'boolean')
            .map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {getPrivacyDescription(key)}
                  </div>
                </div>
                <button
                  onClick={() => setPrivacySettings({ ...privacySettings, [key]: !value })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    value ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  )

  const renderAppearanceSettings = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Theme
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              Dark Mode
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Switch between light and dark themes
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {theme === 'light' ? (
              <MoonIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            ) : (
              <SunIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Language & Region
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Language
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Zone
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <option value="auto">Auto-detect</option>
              <option value="utc">UTC</option>
              <option value="est">Eastern Time</option>
              <option value="pst">Pacific Time</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )

  const renderDataSettings = () => (
    <div className="space-y-6">
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Data Management
        </h3>
        <div className="space-y-4">
          <button className="w-full btn-ghost text-left justify-start">
            <GlobeAltIcon className="w-4 h-4 mr-2" />
            Download Your Data
          </button>
          <button className="w-full btn-ghost text-left justify-start">
            <DevicePhoneMobileIcon className="w-4 h-4 mr-2" />
            Clear Cache
          </button>
          <button className="w-full btn-ghost text-left justify-start text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
            <TrashIcon className="w-4 h-4 mr-2" />
            Clear All Data
          </button>
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Storage Usage
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Messages</span>
            <span className="text-gray-900 dark:text-white">2.3 MB</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Media</span>
            <span className="text-gray-900 dark:text-white">15.7 MB</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Cache</span>
            <span className="text-gray-900 dark:text-white">8.1 MB</span>
          </div>
          <hr className="border-gray-200 dark:border-gray-700" />
          <div className="flex justify-between text-sm font-medium">
            <span className="text-gray-900 dark:text-white">Total</span>
            <span className="text-gray-900 dark:text-white">26.1 MB</span>
          </div>
        </div>
      </div>
    </div>
  )

  const getNotificationDescription = (key: string) => {
    const descriptions: Record<string, string> = {
      emailNotifications: 'Receive notifications via email',
      pushNotifications: 'Receive push notifications on your device',
      friendRequests: 'Get notified when someone sends you a friend request',
      messages: 'Get notified when you receive new messages',
      posts: 'Get notified when friends post new content',
      marketing: 'Receive updates about new features and promotions'
    }
    return descriptions[key] || ''
  }

  const getPrivacyDescription = (key: string) => {
    const descriptions: Record<string, string> = {
      showOnlineStatus: 'Let others see when you\'re online',
      showLastSeen: 'Show when you were last active',
      allowFriendRequests: 'Allow others to send you friend requests'
    }
    return descriptions[key] || ''
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return renderAccountSettings()
      case 'profile-edit':
        return renderProfileEdit()
      case 'security':
        return renderSecuritySettings()
      case 'notifications':
        return renderNotificationSettings()
      case 'privacy':
        return renderPrivacySettings()
      case 'appearance':
        return renderAppearanceSettings()
      case 'data':
        return renderDataSettings()
      default:
        return renderAccountSettings()
    }
  }

  return (
    <div className="min-h-screen pt-20 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass rounded-xl p-4 sticky top-24">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {renderContent()}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings