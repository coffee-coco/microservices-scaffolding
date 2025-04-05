const express = require('express');
const fs = require('fs').promises;
const { exec } = require('child_process');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Constants
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_EXPIRATION_TIME = '1h'; // 1-hour token expiration

// Function to generate a random secret key
const generateSecretKey = () => {
  return crypto.randomBytes(64).toString('hex');
};

// Holds configuration information with metadata, SHA value, and last updated timestamp.
const configCache = {
  metadata: null,
  sha: null,
  lastUpdated: 0,
};

// Token blacklist to store used tokens
const tokenBlacklist = new Set();

// Cached token
let cachedToken = null;
let cachedSecretKey = generateSecretKey();

const getGitSha = () => {
  return new Promise((resolve, reject) => {
    exec('git rev-parse HEAD', (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
};

const handleErrorResponse = (res, statusCode, message) => {
  console.error(message);
  res.status(statusCode).json({ error: message });
};

const loadConfiguration = async () => {
  const currentTimestamp = Date.now();

  if (configCache.metadata && (currentTimestamp - configCache.lastUpdated) < CACHE_DURATION_MS) {
    return configCache;
  }

  try {
    const metadataContent = await fs.readFile('./metadata.json', 'utf8');
    const metadata = JSON.parse(metadataContent);
    const sha = await getGitSha();

    configCache.metadata = metadata;
    configCache.sha = sha;
    configCache.lastUpdated = currentTimestamp;

    return configCache;
  } catch (error) {
    console.error('Configuration loading failed:', error);
    throw new Error('Failed to load configuration');
  }
};

const app = express();
const port = process.env.PORT || 3000;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return handleErrorResponse(res, 401, 'Unauthorized: Missing token');
  }

  if (tokenBlacklist.has(token)) {
    return handleErrorResponse(res, 403, 'Forbidden: Token has already been used');
  }

  jwt.verify(token, cachedSecretKey, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return handleErrorResponse(res, 401, 'Unauthorized: Token expired');
      }
      return handleErrorResponse(res, 403, 'Forbidden: Invalid token');
    }

    req.user = user;

    // Add token to blacklist after successful verification, except for /protected endpoint
    if (req.path !== '/protected') {
      tokenBlacklist.add(token);
    }

    next();
  });
};
const generateToken = (payload) => {
  cachedSecretKey = generateSecretKey(); // Generate a new secret key
  cachedToken = jwt.sign(payload, cachedSecretKey, { expiresIn: TOKEN_EXPIRATION_TIME });
  return cachedToken;
};

app.post('/login', (req, res) => {
  const user = { id: 1, username: 'exampleuser' };
  const token = generateToken(user);
  res.json({ token });
});

app.post('/refresh', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return handleErrorResponse(res, 401, 'Unauthorized: Missing token');
  }

  jwt.verify(token, cachedSecretKey, { ignoreExpiration: true }, (err, user) => {
    if (!user || !user.id) {
      return handleErrorResponse(res, 400, 'Token is still valid, no need for refresh');
    }
    const newToken = generateToken({ id: user.id, username: user.username });
    res.json({ token: newToken });
  });
});

app.get('/protected', authenticateToken, (req, res) => {
  res.json({
    message: 'Access granted to protected resource',
    user: req.user,
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Hello World' });
});

app.get('/status', authenticateToken, async (req, res) => {
  try {
    const { metadata, sha } = await loadConfiguration();
    const buildNumber = process.env.BUILD_NUMBER || '0';

    // Invalidate the cached token after use
    cachedToken = null;

    res.json({
      'my-application': [
        {
          description: metadata.description,
          version: `${metadata.version}-${buildNumber}`,
          sha: sha,
        },
      ],
    });
  } catch (error) {
    handleErrorResponse(res, 500, 'Internal Server Error');
  }
});

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = { app, server };