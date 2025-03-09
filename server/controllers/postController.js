const { posts } = require('../models/post');

exports.getAllPosts = (req, res) => {
  res.json(posts);
};

exports.createPost = (req, res) => {
  const { userId, content, timestamp, type, tags } = req.body;
  const newPost = { id: posts.length + 1, userId, content, timestamp, type, likes: 0, comments: [], tags };
  posts.push(newPost);
  res.status(201).json(newPost);
};