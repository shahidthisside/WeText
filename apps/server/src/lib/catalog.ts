/** Static catalogs shared with the web client via GET /api/meta. */

export const INTEREST_GROUPS: Record<string, string[]> = {
  Creative: ['Photography', 'Writing', 'Poetry', 'Design', 'Illustration', 'Film', 'Music production', 'Fashion'],
  Tech: ['Programming', 'AI & ML', 'Startups', 'Gaming', 'Gadgets', 'Open source', 'Crypto', 'Science'],
  Lifestyle: ['Fitness', 'Running', 'Yoga', 'Cooking', 'Coffee', 'Travel', 'Hiking', 'Plants'],
  Culture: ['Books', 'Anime', 'Movies', 'TV series', 'History', 'Philosophy', 'Languages', 'Art'],
  Music: ['Hip-hop', 'Indie', 'Rock', 'Electronic', 'Jazz', 'K-pop', 'Classical', 'Live music'],
  Mind: ['Mental health', 'Meditation', 'Psychology', 'Journaling', 'Self-growth', 'Astronomy'],
  Sports: ['Football', 'Cricket', 'Basketball', 'F1', 'Tennis', 'Esports', 'Cycling', 'Martial arts'],
};

export const ALL_INTERESTS = Object.values(INTEREST_GROUPS).flat();

/** Each trait is a 0..100 slider between two poles. */
export const TRAITS = [
  { key: 'social', low: 'Homebody', high: 'Social butterfly', lowBoth: 'Both homebodies', highBoth: 'Both social butterflies' },
  { key: 'rhythm', low: 'Night owl', high: 'Early bird', lowBoth: 'Both night owls', highBoth: 'Both early birds' },
  { key: 'mind', low: 'Practical', high: 'Imaginative', lowBoth: 'Both practical minds', highBoth: 'Both imaginative' },
  { key: 'style', low: 'Planner', high: 'Spontaneous', lowBoth: 'Both planners', highBoth: 'Both spontaneous' },
  { key: 'talk', low: 'Listener', high: 'Talker', lowBoth: 'Both good listeners', highBoth: 'Both talkers' },
] as const;

export type TraitKey = (typeof TRAITS)[number]['key'];
export const TRAIT_KEYS = TRAITS.map((t) => t.key) as TraitKey[];

/** How a post feels. Optional tag shown as a small coloured label. */
export const MOODS = [
  { key: 'glow', label: 'Glowing', emoji: '✨' },
  { key: 'calm', label: 'Calm', emoji: '🌿' },
  { key: 'curious', label: 'Curious', emoji: '🔍' },
  { key: 'fired', label: 'Fired up', emoji: '🔥' },
  { key: 'tender', label: 'Tender', emoji: '🫶' },
  { key: 'heavy', label: 'Heavy', emoji: '🌧️' },
  { key: 'silly', label: 'Silly', emoji: '🙃' },
  { key: 'tired', label: 'Tired', emoji: '🌙' },
] as const;
export type MoodKey = (typeof MOODS)[number]['key'];
export const MOOD_KEYS = MOODS.map((m) => m.key) as [MoodKey, ...MoodKey[]];

/** One prompt per day, rotated by UTC date. */
export const PROMPTS = [
  'What’s a small thing that made today better?',
  'What are you secretly proud of right now?',
  'Describe your perfect slow Sunday.',
  'What’s a song you’ve had on repeat this week?',
  'What’s something you changed your mind about recently?',
  'Which place feels most like home to you?',
  'What’s the best advice you ignored?',
  'What are you learning at the moment?',
  'What’s a tiny habit that actually stuck?',
  'Tell us about a stranger who was kind to you.',
  'What would you do with one extra hour every day?',
  'What’s a book or film that stayed with you?',
  'What does a good friend do that others don’t?',
  'What’s something you wish people asked you about?',
  'Which smell instantly takes you back in time?',
  'What are you looking forward to this month?',
  'What’s a hill you will happily die on?',
  'What did 15-year-old you get right?',
  'What’s the most underrated thing in your city?',
  'Who taught you something without knowing it?',
  'What’s a fear you’ve outgrown?',
];

export function promptForDate(d = new Date()) {
  const key = d.toISOString().slice(0, 10);
  const day = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
  return { key, text: PROMPTS[day % PROMPTS.length]! };
}
