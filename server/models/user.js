const bcrypt = require('bcrypt');

const users = [
  {
    id: 1,
    username: 'QuirkLord42',
    email: 'quirklord42@wastext.com',
    password: bcrypt.hashSync('password123', 10), // Hashing the password
    thought: 'What if cats are alien spies?',
    tags: '#weirdpets #conspiracy',
    match: 89,
    likes: 5,
    comments: 2,
    bio: 'Oddball pondering the universe.',
    avatar: 'https://via.placeholder.com/80/8a4af3/ffffff?text=QL'
  },
  {
    id: 2,
    username: 'CloudLover',
    email: 'cloudlover@wastext.com',
    password: bcrypt.hashSync('password123', 10),
    thought: 'Clouds are just sky hugs.',
    tags: '#weirdweather #deepthoughts',
    match: 92,
    likes: 10,
    comments: 4,
    bio: 'Sky enthusiast with quirky ideas.',
    avatar: 'https://via.placeholder.com/80/4af38a/ffffff?text=CL'
  },
  {
    id: 3,
    username: 'ToastFan',
    email: 'toastfan@wastext.com',
    password: bcrypt.hashSync('password123', 10),
    thought: 'Toast is bread flexing.',
    tags: '#foodthoughts #oddideas',
    match: 85,
    likes: 3,
    comments: 1,
    bio: 'Bread lover with a twist.',
    avatar: 'https://via.placeholder.com/80/f38a4a/ffffff?text=TF'
  }
];

module.exports = { users };