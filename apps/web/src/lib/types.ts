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

/** A note shared into a chat (compact card). Matches the server `sharedPost` field. */
export type SharedPost =
  | { id: string; available: false }
  | {
      id: string;
      available: true;
      content: string;
      createdAt: number;
      author: { username: string; displayName: string; avatarUrl: string | null } | null;
      media: { url: string } | null;
    };

/** The sender of a message in a group conversation (null for 1:1 chats). */
export interface MessageSender {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  image: { url: string; width: number; height: number } | null;
  /** Voice note. */
  audio: { url: string; durationMs: number } | null;
  /** A note shared into the chat. */
  sharedPost: SharedPost | null;
  replyTo: { id: string; senderId: string | null; body: string; hasImage: boolean; deleted: boolean } | null;
  createdAt: number;
  /** When the body was last edited, or null. */
  editedAt: number | null;
  /** This message was forwarded from another conversation. */
  forwarded: boolean;
  deleted: boolean;
  /** When a disappearing message self-destructs, or null. */
  expiresAt: number | null;
  /** Whether the requesting viewer has starred this message. */
  starred: boolean;
  reactions: { emoji: string; userIds: string[] }[];
  /** 'user' for normal messages, 'system' for group event lines ("Ana added Ben"). */
  kind?: 'user' | 'system';
  /** Populated only for messages in group conversations, so group UIs can show the author. */
  sender?: MessageSender | null;
  /** Client-only: optimistic message awaiting server ack. */
  pending?: boolean;
  failed?: boolean;
}

export type MemberRole = 'admin' | 'member';

/** An active member of a group conversation. */
export interface GroupMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
  isOnline: boolean;
}

/** A member's last-read timestamp, used for "seen by" in groups. */
export interface ReadReceipt {
  userId: string;
  at: number;
}

export interface Conversation {
  id: string;
  /** The other participant in a 1:1 chat; always null for groups. */
  other: (UserSummary & { isOnline: boolean; lastSeenAt: number | null }) | null;
  lastMessage: Message | null;
  unread: number;
  isRequest: boolean;
  muted: boolean;
  pinned: boolean;
  pinnedAt: number | null;
  archived: boolean;
  markedUnread: boolean;
  /** Disappearing-message TTL in seconds: 0 | 86400 | 604800 | 7776000. */
  ttlSeconds: number;
  otherLastReadAt: number;
  canSend: boolean;
  blockedByMe: boolean;
  updatedAt: number;
  // --- Group fields (present only when isGroup is true) ---
  /** True for group conversations. Absent/false for 1:1. */
  isGroup?: boolean;
  /** Group name (groups only). */
  title?: string;
  /** Active members (groups only), ordered by join time, max 50. */
  members?: GroupMember[];
  memberCount?: number;
  /** The viewer's role in the group. */
  myRole?: MemberRole;
  /** The group creator's user id, or null if their account was deleted. */
  createdBy?: string | null;
  /** Active members (excluding me) with their last-read timestamp. */
  readBy?: ReadReceipt[];
  /** True if the viewer has left or been removed from the group. */
  left?: boolean;
}

/** An entry on the Starred messages screen. */
export interface StarredEntry {
  message: Message;
  conversation: {
    id: string;
    other: { username: string; displayName: string; avatarUrl: string | null } | null;
    isGroup?: boolean;
    title?: string;
  };
  starredAt: number;
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
