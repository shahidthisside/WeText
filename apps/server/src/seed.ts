/**
 * Seeds a demo community. Usage: npm run seed  (wipes the existing dev DB)
 * Every seeded account uses the password "wetext123". Main demo login: demo / wetext123
 */
import fs from 'node:fs';
import { config } from './config.js';
import { openDb } from './db.js';
import { hashPassword, newId } from './lib/crypto.js';
import { extractTags } from './lib/text.js';
import { promptForDate } from './lib/catalog.js';

for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbFile + suffix, { force: true });
const db = openDb(config.dbFile);
const pw = await hashPassword('wetext123');

const HOUR = 3600_000;
const now = Date.now();
let clock = now - 60 * HOUR;
const tick = (maxMinutes = 170) => (clock = Math.min(now - 60_000, clock + Math.floor(Math.random() * maxMinutes * 60_000) + 60_000));

type Seed = { u: string; n: string; bio: string; loc: string; i: string[]; t: [number, number, number, number, number]; priv?: boolean };
const people: Seed[] = [
  { u: 'demo', n: 'Sam Rivera', bio: 'Trying WeText out. Coffee first, opinions later.', loc: 'Lisbon', i: ['Coffee', 'Books', 'Photography', 'Travel', 'Indie'], t: [40, 30, 70, 55, 45] },
  { u: 'maya_k', n: 'Maya Kapoor', bio: 'Product designer. I collect fonts and houseplants.', loc: 'Bengaluru', i: ['Design', 'Plants', 'Coffee', 'Illustration', 'Indie'], t: [35, 20, 80, 30, 40] },
  { u: 'leo_m', n: 'Leo Martins', bio: 'Backend dev by day, film photographer by weekend. 35mm only.', loc: 'Porto', i: ['Programming', 'Photography', 'Film', 'Coffee', 'Open source'], t: [30, 15, 60, 40, 35] },
  { u: 'aisha', n: 'Aisha Bello', bio: 'Running coach · marathon x4 · early mornings are a lifestyle', loc: 'Lagos', i: ['Running', 'Fitness', 'Mental health', 'Yoga', 'Travel'], t: [75, 95, 40, 25, 70] },
  { u: 'noor', n: 'Noor Haddad', bio: 'Writing a novel very slowly. Poetry when it rains.', loc: 'Amman', i: ['Writing', 'Poetry', 'Books', 'Philosophy', 'Journaling'], t: [20, 10, 90, 60, 25] },
  { u: 'kenji', n: 'Kenji Watanabe', bio: 'Anime, synths, and too many keyboards.', loc: 'Osaka', i: ['Anime', 'Electronic', 'Music production', 'Gaming', 'Gadgets'], t: [30, 5, 85, 70, 30] },
  { u: 'sofia_r', n: 'Sofía Ruiz', bio: 'Cook. Feeder of friends. Ask me about sourdough.', loc: 'Valencia', i: ['Cooking', 'Coffee', 'Travel', 'Live music', 'Plants'], t: [85, 60, 55, 75, 80] },
  { u: 'arjun', n: 'Arjun Mehta', bio: 'Cricket > everything. Engineer. Building a startup in public.', loc: 'Mumbai', i: ['Cricket', 'Startups', 'Programming', 'AI & ML', 'F1'], t: [70, 50, 50, 65, 75] },
  { u: 'elena', n: 'Elena Petrova', bio: 'Astronomy nerd. I will tell you what that bright "star" is (it’s Jupiter).', loc: 'Sofia', i: ['Astronomy', 'Science', 'Hiking', 'Photography', 'Classical'], t: [35, 10, 75, 35, 50] },
  { u: 'jules', n: 'Jules Laurent', bio: 'Jazz, bikes, and bad puns.', loc: 'Lyon', i: ['Jazz', 'Cycling', 'Coffee', 'Live music', 'Books'], t: [65, 40, 65, 80, 70] },
  { u: 'zara', n: 'Zara Ahmed', bio: 'Med student surviving on iced coffee. Mental health advocate.', loc: 'Karachi', i: ['Mental health', 'Psychology', 'Coffee', 'K-pop', 'Journaling'], t: [45, 20, 60, 40, 55] },
  { u: 'tomasz', n: 'Tomasz Nowak', bio: 'F1 strategist (from my couch). Lego Technic builder.', loc: 'Kraków', i: ['F1', 'Gadgets', 'Gaming', 'Football', 'Science'], t: [40, 45, 45, 30, 60] },
  { u: 'lina', n: 'Lina Choi', bio: 'Illustrator. Drawing every day of 2026.', loc: 'Seoul', i: ['Illustration', 'Art', 'K-pop', 'Design', 'Anime'], t: [25, 15, 90, 55, 30], priv: true },
  { u: 'marcus', n: 'Marcus Hill', bio: 'Hiking every trail within 200km. Dad jokes on request.', loc: 'Denver', i: ['Hiking', 'Photography', 'Fitness', 'Coffee', 'Rock'], t: [60, 85, 40, 35, 65] },
];

const ids: Record<string, string> = {};
const insUser = db.prepare(
  `INSERT INTO users (id, username, email, password_hash, display_name, bio, location, interests, traits, is_private, onboarded, created_at, last_seen_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
);
const keys = ['social', 'rhythm', 'mind', 'style', 'talk'];
for (const p of people) {
  const id = newId();
  ids[p.u] = id;
  const traits = Object.fromEntries(keys.map((k, i) => [k, p.t[i]]));
  insUser.run(id, p.u, `${p.u}@wetext.dev`, pw, p.n, p.bio, p.loc, JSON.stringify(p.i), JSON.stringify(traits), p.priv ? 1 : 0, clock - 30 * 24 * HOUR, now - Math.floor(Math.random() * 48 * HOUR));
}

// Follow graph: everyone follows a handful; demo follows a few (leaves room for Connect suggestions).
const follow = db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, status, created_at) VALUES (?, ?, 'active', ?)");
const graph: Record<string, string[]> = {
  demo: ['maya_k', 'leo_m', 'noor', 'jules'],
  maya_k: ['demo', 'leo_m', 'lina', 'noor', 'sofia_r', 'kenji'],
  leo_m: ['maya_k', 'elena', 'marcus', 'demo', 'kenji'],
  aisha: ['marcus', 'zara', 'sofia_r', 'arjun'],
  noor: ['maya_k', 'zara', 'demo', 'elena', 'jules'],
  kenji: ['lina', 'maya_k', 'tomasz', 'leo_m'],
  sofia_r: ['jules', 'aisha', 'maya_k', 'marcus'],
  arjun: ['tomasz', 'aisha', 'kenji', 'leo_m', 'zara'],
  elena: ['leo_m', 'marcus', 'noor'],
  jules: ['sofia_r', 'noor', 'demo', 'marcus'],
  zara: ['noor', 'aisha', 'lina', 'demo'],
  tomasz: ['arjun', 'kenji'],
  lina: ['maya_k', 'kenji', 'zara'],
  marcus: ['elena', 'aisha', 'leo_m', 'jules', 'demo'],
};
for (const [a, list] of Object.entries(graph)) for (const b of list) follow.run(ids[a], ids[b], clock - Math.random() * 20 * 24 * HOUR);

const insPost = db.prepare(
  'INSERT INTO posts (id, author_id, content, is_anonymous, reply_to_id, quote_of_id, created_at, mood, expires_at, prompt_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
const insTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag, created_at) VALUES (?, ?, ?)');
function post(author: string, content: string, o: { anon?: boolean; reply?: string; quote?: string; at?: number; mood?: string; fade?: boolean; prompt?: string } = {}) {
  const id = newId();
  const at = o.at ?? tick();
  insPost.run(id, ids[author], content, o.anon ? 1 : 0, o.reply ?? null, o.quote ?? null, at, o.mood ?? null, o.fade ? at + 24 * HOUR : null, o.prompt ?? null);
  for (const t of extractTags(content)) insTag.run(id, t, at);
  return id;
}
const likeStmt = db.prepare('INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)');
const repostStmt = db.prepare('INSERT OR IGNORE INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)');
const notif = db.prepare('INSERT INTO notifications (id, user_id, actor_id, type, post_id, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const authorOf = (pid: string) => (db.prepare('SELECT author_id FROM posts WHERE id = ?').get(pid) as { author_id: string }).author_id;
const createdOf = (pid: string) => (db.prepare('SELECT created_at FROM posts WHERE id = ?').get(pid) as { created_at: number }).created_at;
function like(users: string[], pid: string) {
  for (const u of users) {
    const at = Math.min(now - 1000, createdOf(pid) + Math.random() * 6 * HOUR);
    likeStmt.run(ids[u], pid, at);
    const a = authorOf(pid);
    if (a !== ids[u]) notif.run(newId(), a, ids[u], 'like', pid, at, a === ids.demo && at > now - 24 * HOUR ? null : at);
  }
}
function repost(u: string, pid: string) {
  const at = Math.min(now - 1000, createdOf(pid) + Math.random() * 8 * HOUR);
  repostStmt.run(ids[u], pid, at);
  const a = authorOf(pid);
  notif.run(newId(), a, ids[u], 'repost', pid, at, a === ids.demo ? null : at);
}
function reply(author: string, parent: string, content: string, anon = false) {
  const at = Math.min(now - 1000, createdOf(parent) + Math.random() * 3 * HOUR + 60_000);
  const id = post(author, content, { reply: parent, at, anon });
  const a = authorOf(parent);
  if (a !== ids[author]) notif.run(newId(), a, ids[author], 'reply', id, at, a === ids.demo ? null : at);
  return id;
}

const p1 = post('maya_k', 'Hot take: the best design tool is still a pencil and a cheap notebook. Everything else is just faster erasing. #design', { mood: 'fired' });
like(['leo_m', 'lina', 'noor', 'demo', 'kenji', 'sofia_r'], p1);
reply('lina', p1, 'Agree, my thumbnails are always better than my "final" sketches');
reply('leo_m', p1, 'Same energy as "the best camera is the one you have with you"');

const p2 = post('leo_m', 'Shot a whole roll of Portra 400 at the harbour this morning. Fog rolled in at exactly the right moment. Developing tonight 🤞 #filmphotography #photography', { mood: 'glow' });
like(['maya_k', 'elena', 'marcus', 'demo'], p2);

const p3 = post('aisha', 'Reminder that rest days are training days. Your muscles don’t grow during the run, they grow after it. #running #fitness', { mood: 'calm' });
like(['marcus', 'zara', 'sofia_r', 'arjun', 'jules'], p3);
repost('marcus', p3);

const p4 = post('noor', 'Wrote 400 words today. Deleted 350. Kept the 50 that matter. That’s a good day. #writing', { mood: 'tender' });
like(['maya_k', 'zara', 'demo', 'jules', 'elena'], p4);
reply('demo', p4, 'Fifty honest words beat a thousand filler ones. Keep going!');

const p5 = post('kenji', 'Finally finished the custom split keyboard build. Lubed switches, thocky as anything. My wrists are thanking me already. #gadgets', { mood: 'glow' });
like(['tomasz', 'leo_m', 'arjun'], p5);

const p6 = post('sofia_r', 'Day 3 of feeding my new sourdough starter. I named him Bread Pitt. He is thriving. #cooking', { mood: 'silly' });
like(['jules', 'aisha', 'maya_k', 'demo', 'marcus', 'zara', 'noor'], p6);
reply('jules', p6, 'Bread Pitt 😂 I need updates daily');
reply('aisha', p6, 'Mine was called Clint Yeastwood, may he rest in peace');
repost('jules', p6);

const p7 = post('arjun', 'Building in public, week 12: 140 users, $0 MRR, 1 very loyal user who emails me daily with feature requests. Love you Ravi. #startups #buildinpublic', { mood: 'curious' });
like(['tomasz', 'kenji', 'leo_m'], p7);

const p8 = post('elena', 'If you’re up early tomorrow, look east before sunrise — Venus and the crescent Moon will be almost touching. No telescope needed. #astronomy', { mood: 'curious' });
like(['leo_m', 'marcus', 'noor', 'demo', 'aisha'], p8);
repost('leo_m', p8);
reply('marcus', p8, 'Setting an alarm. Will report back from the ridge.');

post('jules', 'Accidentally ended up at a jazz jam session tonight and a 70-year-old saxophonist just played the most heartbreaking solo I’ve ever heard. #jazz #livemusic');

const p10 = post('zara', 'Exam season PSA: you are more than your grades. Drink water, sleep 7 hours, call your mum. #mentalhealth', { mood: 'tender' });
like(['noor', 'aisha', 'lina', 'demo', 'sofia_r', 'maya_k'], p10);

const p11 = post('tomasz', 'That pit stop strategy was a crime. Two-stopping on hards when everyone else one-stopped?? Who approved this #F1', { mood: 'fired' });
like(['arjun', 'kenji'], p11);
reply('arjun', p11, 'The undercut was RIGHT THERE');

post('marcus', 'Summit at 6:40am. Clouds below, sun above, cold coffee in hand. 10/10 would suffer again. #hiking', { mood: 'glow' });

const poll = post('demo', 'Settling a debate with my flatmate. Best way to drink coffee?');
db.prepare('INSERT INTO polls (post_id, ends_at) VALUES (?, ?)').run(poll, now + 20 * HOUR);
const opts = ['Espresso', 'Filter / pour over', 'Iced, always', 'With lots of milk'].map((label, i) => {
  const id = newId();
  db.prepare('INSERT INTO poll_options (id, post_id, label, position) VALUES (?, ?, ?, ?)').run(id, poll, label, i);
  return id;
});
const vote = db.prepare('INSERT INTO poll_votes (post_id, user_id, option_id) VALUES (?, ?, ?)');
[['maya_k', 1], ['leo_m', 0], ['zara', 2], ['sofia_r', 3], ['jules', 0], ['noor', 1], ['marcus', 1]].forEach(([u, o]) =>
  vote.run(poll, ids[u as string], opts[o as number]),
);
like(['maya_k', 'jules'], poll);

// Anonymous thoughts
const a1 = post('zara', 'Sometimes I feel like everyone else got a manual for adulthood and I’m just improvising. Anyone else?', { anon: true, mood: 'heavy' });
like(['noor', 'demo', 'aisha', 'lina', 'jules', 'kenji', 'maya_k', 'elena'], a1);
reply('noor', a1, 'Everyone is improvising. Some people are just better at hiding it.');
reply('aisha', a1, 'The manual is fake. We all read the same blank pages.', true);
const a2 = post('kenji', 'I moved cities a year ago and still haven’t made a single close friend. It’s lonelier than I expected.', { anon: true, mood: 'heavy' });
like(['zara', 'sofia_r', 'demo', 'marcus'], a2);
reply('sofia_r', a2, 'Come to a cooking class, a climbing gym, anything weekly. Repetition is how strangers become friends. You’ve got this.');
post('noor', 'I still reread the letters my grandmother wrote me. Her handwriting is the only thing that makes me feel 8 again.', { anon: true, mood: 'tender' });

const p20 = post('maya_k', 'Redesigned my portfolio for the 4th time this year. This time it’s just text. Black on white. Nothing else. It feels freeing. #design #webdev', { mood: 'calm' });
like(['leo_m', 'demo', 'lina'], p20);
post('demo', 'New here 👋 Looking for people who are into film cameras, slow mornings and good books. What are you all reading? #books');
const p22 = post('noor', 'Currently reading: "The Remains of the Day". Every sentence is so restrained it hurts. #books');
like(['demo', 'jules', 'elena'], p22);
post('lina', 'Day 279 of drawing every day. Today: a cat that judged me from a window. #illustration #art');
post('leo_m', 'Small open source win: my first PR to a library I use daily got merged. Tiny fix, big smile. #opensource #programming');
post('arjun', 'Unpopular opinion: Test cricket is the most dramatic sport on earth and T20 is just the trailer. #cricket');
post('aisha', '5am. 12km. City still asleep. This is my meditation. #running', { mood: 'calm' });
const q = post('jules', 'This is the most wholesome thing on my feed today', { quote: p6 });
like(['sofia_r'], q);
post('elena', 'Spent the night under the darkest sky I’ve seen in years. The Milky Way casts shadows out there, I swear. #astronomy #photography', { mood: 'glow' });
post('sofia_r', 'Made 40 empanadas for a friend’s birthday. Ate 6 while cooking. Quality control. #cooking');
post('zara', 'Started journaling again. Just three lines a night: one good thing, one hard thing, one thing for tomorrow. #journaling #mentalhealth', { mood: 'calm' });


// More whispers
post('marcus', 'I tell everyone I love hiking alone. Truth is I just haven’t found anyone to go with.', { anon: true, mood: 'tender', at: now - 7 * HOUR });
post('arjun', 'Quit my job three months ago to build my startup. My parents still think I’m on “leave”.', { anon: true, mood: 'heavy', at: now - 5 * HOUR });
post('sofia_r', 'Cooked dinner for myself tonight with candles and everything. 10/10 date, would go again.', { anon: true, mood: 'silly', at: now - 2 * HOUR });

// Today's prompt answers
const today = promptForDate().key;
const pa = post('jules', 'Honestly? The guy at the bakery remembered my order. Small thing, big smile.', { prompt: today, mood: 'glow', at: now - 3 * HOUR });
like(['sofia_r', 'demo', 'noor'], pa);
post('elena', 'Clear skies at 2am and I saw a meteor. Made a wish I won’t tell you.', { prompt: today, mood: 'curious', at: now - 90 * 60_000 });
post('zara', 'Passed the anatomy practical I was dreading. Celebrated with a nap.', { prompt: today, mood: 'tired', at: now - 40 * 60_000 });

// Fading posts (gone after 24h)
post('kenji', 'Live from the arcade, about to lose all my coins. Fading this one because it’s embarrassing.', { fade: true, mood: 'silly', at: now - 4 * HOUR });
post('maya_k', 'Coffee meetup Thursday 9am at Third Wave, anyone in Bengaluru want to join? (fades tomorrow)', { fade: true, mood: 'glow', at: now - 60 * 60_000 });

// Mentions
const m1 = post('maya_k', '@demo welcome! You’ll love it here. Check out @leo_m’s film photos, they’re unreal.');
notif.run(newId(), ids.demo, ids.maya_k, 'mention', m1, createdOf(m1), null);
notif.run(newId(), ids.demo, ids.marcus, 'follow', null, now - 3 * HOUR, null);
notif.run(newId(), ids.demo, ids.zara, 'follow', null, now - 5 * HOUR, null);

// Pending follow request to the private account
db.prepare("INSERT INTO follows (follower_id, followee_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(ids.demo, ids.lina, now - 2 * HOUR);

// Conversations
function conversation(a: string, b: string, lines: [string, string][], startAgoH: number) {
  const id = newId();
  let at = now - startAgoH * HOUR;
  db.prepare('INSERT INTO conversations (id, pair_key, created_at, last_message_at) VALUES (?, ?, ?, ?)').run(id, [ids[a], ids[b]].sort().join(':'), at, at);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id, last_read_at) VALUES (?, ?, 0), (?, ?, 0)').run(id, ids[a], id, ids[b]);
  const msg = db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const [who, body] of lines) {
    at += Math.floor(Math.random() * 20 * 60_000) + 30_000;
    msg.run(newId(), id, ids[who], body, at);
  }
  db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(at, id);
  return { id, at };
}
const c1 = conversation('demo', 'maya_k', [
  ['maya_k', 'Hey Sam! Saw your coffee poll, I’m team pour over obviously ☕'],
  ['demo', 'Haha I knew it. Leo voted espresso, the traitor'],
  ['maya_k', 'He’s Portuguese, it’s genetic'],
  ['demo', 'Fair. Are you going to the design meetup on Thursday?'],
  ['maya_k', 'Yes! Want to grab coffee before?'],
], 6);
db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(c1.at, c1.id, ids.maya_k);

const c2 = conversation('leo_m', 'demo', [
  ['leo_m', 'Which film stock did you end up buying?'],
  ['demo', 'Ektar 100! Recommended by you, so if it’s bad it’s on you'],
  ['leo_m', 'It’s gorgeous in daylight. Overexpose by a stop and you’ll be happy'],
], 26);
db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ?').run(c2.at, c2.id);

conversation('arjun', 'demo', [['arjun', 'Hey! Saw you’re into startups-adjacent stuff. Would love feedback on my app sometime 🙏']], 2);

const counts = db.prepare('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM posts) p, (SELECT COUNT(*) FROM messages) m').get();
console.log('Seeded', counts, '\nLogin: demo / wetext123');
db.close();
