const express = require('express');
const router = express.Router();
const { getAllUsers, getUserById, register, login, updateLikes } = require('../controllers/userController');

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.post('/register', register);
router.post('/login', login);
router.patch('/:id', updateLikes);

module.exports = router;