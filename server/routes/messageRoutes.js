const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getMessages, sendMessage } = require('../controllers/messageController');

router.get('/:userId/:contactId', authMiddleware, getMessages);
router.post('/', authMiddleware, sendMessage);

module.exports = router;