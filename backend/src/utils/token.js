const jwt = require('jsonwebtoken');

const ensureSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return process.env.JWT_SECRET;
};

const generateToken = (payload = {}) => {
  return jwt.sign(payload, ensureSecret(), {
    expiresIn: '7d',
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, ensureSecret());
};

module.exports = {
  generateToken,
  verifyToken,
};

