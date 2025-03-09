const { users } = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Get all users
exports.getAllUsers = (req, res) => {
  res.json(users);
};

// Get user by ID
exports.getUserById = (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (user) res.json(user);
  else res.status(404).json({ message: 'User not found' });
};

// Register a new user
exports.register = async (req, res) => {
  const { username, email, password, thought, tags, bio } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  // Check if user already exists
  if (users.some(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: users.length + 1,
    username,
    email,
    password: hashedPassword,
    thought: thought || '',
    tags: tags || '',
    match: Math.floor(Math.random() * (100 - 80 + 1)) + 80, // Random match % between 80-100
    likes: 0,
    comments: 0,
    bio: bio || '',
    avatar: `https://via.placeholder.com/80/cccccc/ffffff?text=${username.charAt(0)}`
  };
  users.push(newUser);

  const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({ token, user: newUser });
};

// Login a user
exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(400).json({ message: 'Invalid email or password' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user });
};

// Update user likes (for liking profiles)
exports.updateLikes = (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  user.likes = req.body.likes;
  res.json(user);
};