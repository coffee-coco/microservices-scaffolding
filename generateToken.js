const jwt = require('jsonwebtoken');

// Replace 'SECRET_KEY' with your actual secret key
const secretKey = 'SECRET_TOKEN';

// Generate a token with a payload and an expiration time
const token = jwt.sign({ username: 'user' }, secretKey, { expiresIn: '1h' });

console.log(token);