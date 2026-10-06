export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
}

export type FollowState = 'none' | 'pending' | 'active';

export interface UserCard extends UserSummary {
  bio: string;
  isOnline?: boolean;
  lastSeenAt?: number | null;
  viewer: { following: FollowState; followedBy: boolean } | null;
}

export interface Profile extends UserSummary {
  bio: string;
  location: string;
  website: string;
  bannerUrl: string | null;
  interests: string[];
  createdAt: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isOnline: boolean;
  lastSeenAt: number | null;
  isSelf: boolean;
  viewer: {
    following: FollowState;
    followedBy: boolean;
    blocking: boolean;
    blockedBy: boolean;
    muting: boolean;
    canMessage: boolean;
    mutualFollowers: UserSummary[];
    mutualCount: number;
  } | null;
}

export interface Me extends Profile {
  email: string;
  traits: Record<string, number>;
  dmPolicy: 'everyone' | 'following' | 'nobody';
  showOnline: boolean;
  onboarded: boolean;
}

export interface Media {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface Poll {
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  endsAt: number;
  closed: boolean;
  myVote: string | null;
}

export interface Post {
  id: string;
  content: string;
  createdAt: number;
  editedAt: number | null;
  isAnonymous: boolean;
  isMine: boolean;
  mood: string | null;
  expiresAt: number | null;
  promptKey: string | null;
  author: UserSummary | null;
  replyTo: { id: string; username: string | null } | null;
  quote: Post | { id: string; unavailable: true } | null;
  media: Media[];
  poll: Poll | null;
  tags: string[];
  counts: { likes: number; reposts: number; replies: number; quotes: number };
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean };
}

export interface FeedItem {
  key: string;
  post: Post;
  repostedBy: UserSummary | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NotificationItem {
  id: string;
  type: 'like' | 'reply' | 'repost' | 'quote' | 'mention' | 'follow' | 'follow_request' | 'follow_accept';
  createdAt: number;
  read: boolean;
  actors: (UserSummary | null)[];
  actorCount: number;
  post: Post | null;
}

export interface Match {
  user: UserSummary & { bio: string; location: string; interests: string[]; isOnline: boolean; lastSeenAt: number | null };
  score: number;
  sharedInterests: string[];
  traitHighlights: string[];
  mutualCount: number;
  vibe: VibeTrait[];
}

export interface VibeTrait {
  key: string;
  low: string;
  high: string;
  closeness: number;
  lean: 'low' | 'high' | 'mid';
}

export interface Vibe {
  score: number;
  sharedInterests: string[];
  highlights: string[];
  traits: VibeTrait[];
}

export interface DailyPrompt {
  key: string;
  text: string;
  answers: number;
  people: number;
  answered: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  image: { url: string; width: number; height: number } | null;
  replyTo: { id: string; senderId: string | null; body: string; hasImage: boolean; deleted: boolean } | null;
  createdAt: number;
  deleted: boolean;
  reactions: { emoji: string; userIds: string[] }[];
  /** Client-only: optimistic message awaiting server ack. */
  pending?: boolean;
  failed?: boolean;
}

export interface Conversation {
  id: string;
  other: UserSummary & { isOnline: boolean; lastSeenAt: number | null };
  lastMessage: Message | null;
  unread: number;
  isRequest: boolean;
  muted: boolean;
  otherLastReadAt: number;
  canSend: boolean;
  blockedByMe: boolean;
  updatedAt: number;
}

export interface Meta {
  interests: Record<string, string[]>;
  traits: { key: string; low: string; high: string }[];
  moods: { key: string; label: string; emoji: string }[];
}

export interface Counts {
  notifications: number;
  messages: number;
  messageRequests: number;
  followRequests: number;
}
