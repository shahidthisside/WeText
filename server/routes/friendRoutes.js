const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getAllFriends, addFriend } = require('../controllers/friendController');

router.get('/', getAllFriends);
router.post('/', authMiddleware, addFriend);

module.exports = router;