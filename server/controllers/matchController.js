const { matches } = require('../models/match');

exports.getAllMatches = (req, res) => {
  res.json(matches);
};

exports.addMatch = (req, res) => {
  const { userId, matchId } = req.body;
  const match = { id: matches.length + 1, userId, matchId };
  matches.push(match);
  res.status(201).json(match);
};