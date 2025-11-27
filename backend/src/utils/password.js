const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

const hashPassword = async (plain) => {
  if (!plain) {
    throw new Error('Password is required');
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
};

const comparePassword = async (plain, hash) => {
  if (!plain || !hash) {
    return false;
  }
  return bcrypt.compare(plain, hash);
};

module.exports = {
  hashPassword,
  comparePassword,
};

