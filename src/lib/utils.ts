import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string) {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return d.toLocaleDateString()
}

export function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function generateAvatar(name: string) {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ]
  
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  
  const colorIndex = name.length % colors.length
  
  return {
    initials,
    color: colors[colorIndex],
  }
}

export function calculateMatchPercentage(
  user1Interests: string[],
  user2Interests: string[],
  user1Traits: any[],
  user2Traits: any[]
) {
  // Simple matching algorithm based on common interests and traits
  const commonInterests = user1Interests.filter((interest) =>
    user2Interests.includes(interest)
  )
  
  const interestScore = (commonInterests.length / Math.max(user1Interests.length, user2Interests.length)) * 50
  
  // Calculate trait compatibility (simplified)
  let traitScore = 0
  if (user1Traits.length > 0 && user2Traits.length > 0) {
    const traitMap1 = new Map(user1Traits.map(t => [t.trait, t.score]))
    const traitMap2 = new Map(user2Traits.map(t => [t.trait, t.score]))
    
    let totalDiff = 0
    let commonTraits = 0
    
    for (const [trait, score1] of traitMap1) {
      const score2 = traitMap2.get(trait)
      if (score2 !== undefined) {
        totalDiff += Math.abs(score1 - score2)
        commonTraits++
      }
    }
    
    if (commonTraits > 0) {
      traitScore = Math.max(0, 50 - (totalDiff / commonTraits) * 5)
    }
  }
  
  return Math.min(100, Math.round(interestScore + traitScore))
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}