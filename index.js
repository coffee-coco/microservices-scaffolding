const express = require('express');
const fs = require('fs').promises;
const { exec } = require('child_process');
const jwt = require('jsonwebtoken');

// Constants
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JWT_SECRET_KEY = 'SECRET_TOKEN';

/**
 * In-memory configuration cache to store application metadata and git SHA.
 */
const configCache = {
  metadata: null,
  sha: null,
  lastUpdated: 0,
};

/**
 * Utility function to retrieve the latest git commit SHA.
 *
 * @returns {Promise<string>} Git SHA hash
 */
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

/**
 * Utility function to handle error responses in the API.
 *
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
const handleErrorResponse = (res, statusCode, message) => {
  console.error(message);
  res.status(statusCode).json({ error: message });
};

/**
 * Asynchronously loads application configuration with intelligent caching.
 */
const loadConfiguration = async () => {
  const currentTimestamp = Date.now();

  if (configCache.metadata && (currentTimestamp - configCache.lastUpdated) < CACHE_DURATION) {
    return configCache;
  }

  try {
    // Load metadata
    const metadataContent = await fs.readFile('./metadata.json', 'utf8');
    const metadata = JSON.parse(metadataContent);

    // Get Git SHA
    const sha = await getGitSha();

    // Update cache
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

/**
 * Middleware to authenticate requests using JSON Web Token (JWT).
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return handleErrorResponse(res, 401, 'Unauthorized: Missing token');
  }

  jwt.verify(token, JWT_SECRET_KEY, (err, user) => {
    if (err) {
      return handleErrorResponse(res, 403, 'Forbidden: Invalid token');
    }
    req.user = user;
    next();
  });
};

/**
 * Root endpoint returning a simple greeting.
 */
app.get('/', (req, res) => {
  res.json({ message: 'Hello World' });
});

/**
 * Status endpoint providing application metadata and build information.
 */
app.get('/status', authenticateToken, async (req, res) => {
  try {
    const { metadata, sha } = await loadConfiguration();
    const buildNumber = process.env.BUILD_NUMBER || '0';

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

/**
 * Start the server.
 */
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = { app, server };