const { friends } = require('../models/friend');

exports.getAllFriends = (req, res) => {
  res.json(friends);
};

exports.addFriend = (req, res) => {
  const { userId, friendId } = req.body;
  const friend = { id: friends.length + 1, userId, friendId };
  friends.push(friend);
  res.status(201).json(friend);
};