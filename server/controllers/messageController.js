const { messages } = require('../models/message');

exports.getMessages = (req, res) => {
  const { userId, contactId } = req.params;
  const key = `${userId}-${contactId}`;
  res.json(messages[key] || []);
};

exports.sendMessage = (req, res) => {
  const { userId, contactId, message } = req.body;
  const key = `${userId}-${contactId}`;
  if (!messages[key]) messages[key] = [];
  const newMessage = { id: messages[key].length + 1, userId, message, timestamp: new Date().toLocaleTimeString(), status: 'sent' };
  messages[key].push(newMessage);
  res.status(201).json(newMessage);
};