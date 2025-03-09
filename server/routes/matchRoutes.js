const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getAllMatches, addMatch } = require('../controllers/matchController');

router.get('/', getAllMatches);
router.post('/', authMiddleware, addMatch);

module.exports = router;