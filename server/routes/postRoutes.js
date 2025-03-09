const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getAllPosts, createPost } = require('../controllers/postController');

router.get('/', getAllPosts);
router.post('/', authMiddleware, createPost);

module.exports = router;