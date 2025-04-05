const express = require('express');
/**
 *
 */
const fs = require('fs').promises;
const {exec} = require('child_process');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Helper Functions
/**
 *
 */
const generateSecretKey = () => crypto.randomBytes(64).toString('hex');

// State Variables
/**
 *
 */
let currentSecretKey = generateSecretKey();
/**
 *
 */
let currentToken = null;
/**
 * A Set containing blacklisted tokens.
 */
const tokenBlacklist = new Set();

// Constants
/**
 *
 */
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
/**
 *
 */
const TOKEN_EXPIRATION_TIME = '1h'; // 1-hour token expiration
/**
 * Holds a collection of predefined error messages related to token authentication.
 *
 * Key-value pairs represent different error scenarios that can occur in token authentication.
 * The keys define the type of error, while the values provide a detailed error message associated with each error type.
 */
const ERROR_MESSAGES = {
    MISSING_TOKEN: 'Unauthorized: Missing token',
    TOKEN_EXPIRED: 'Unauthorized: Token expired',
    TOKEN_REUSED: 'Forbidden: Token has already been used',
    INVALID_TOKEN: 'Forbidden: Invalid token',
};
/**
 *
 */
const RESPONSE_STATUS = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
};

// Cached Configuration
/**
 *
 */
const configCache = {
    metadata: null,
    sha: null,
    lastUpdated: 0,
};

// Extract token from request headers
/**
 *
 */
const extractAuthToken = (req) => {
    const authHeader = req.headers['authorization'];
    return authHeader && authHeader.split(' ')[1];};

// Send a standardized error response
/**
 *
 */
const sendErrorResponse = (res, statusCode, message) => {
    console.error(message);
    res.status(statusCode).json({error: message});
};

// Load configuration with cache control
const loadConfiguration = async () => {
    const currentTimestamp = Date.now();
    if (configCache.metadata && (currentTimestamp - configCache.lastUpdated) < CACHE_DURATION_MS) {return configCache;}
    try {
        const metadataContent = await fs.readFile('./metadata.json', 'utf8');
        const metadata = JSON.parse(metadataContent);
        const sha = await getGitSha();
        Object.assign(configCache, {metadata, sha, lastUpdated: currentTimestamp});
        return configCache;
    } catch (error) {
        console.error('Configuration loading failed:', error);
        throw new Error('Failed to load configuration');
    }
};

// Use child process to fetch the git commit SHA
/**
 *
 */
const getGitSha = () =>
    new Promise((resolve, reject) =>
        exec('git rev-parse HEAD', (error, stdout) => error ? reject(error) : resolve(stdout.trim()))
    );

// Express App and Middleware
/**
 *
 */
const app = express();
/**
 *
 */
const port = process.env.PORT || 3000;

// Middleware to authenticate tokens
/**
 * Middleware function to authenticate and authorize the user based on the token provided in the request.
 * It extracts the token from the request, checks its validity, and processes the authentication.
 * If the token is missing, expired, invalid, or reused, appropriate error responses are sent.
 * Upon successful authentication, the user information is attached to the request object for further processing.
 * Additionally, if the requested path is not '/protected', the token is added to a blacklist to prevent reuse.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function to be called.
 */
const authenticateToken = (req, res, next) => {
    const token = extractAuthToken(req);
    if (!token) return sendErrorResponse(res, RESPONSE_STATUS.UNAUTHORIZED, ERROR_MESSAGES.MISSING_TOKEN);
    if (tokenBlacklist.has(token)) return sendErrorResponse(res, RESPONSE_STATUS.FORBIDDEN, ERROR_MESSAGES.TOKEN_REUSED);

    jwt.verify(token, currentSecretKey, (err, user) => {
        if (err) {
            const message = err.name === 'TokenExpiredError'
                ? ERROR_MESSAGES.TOKEN_EXPIRED
                : ERROR_MESSAGES.INVALID_TOKEN;
            return sendErrorResponse(res, RESPONSE_STATUS.UNAUTHORIZED, message);
        }
        req.user = user;
        if (req.path !== '/protected') tokenBlacklist.add(token);
        next();
    });
};

// Generate a new JWT token
/**
 *
 */
const generateToken = (payload) => {
    currentSecretKey = generateSecretKey();
    currentToken = jwt.sign(payload, currentSecretKey, {expiresIn: TOKEN_EXPIRATION_TIME});
    return currentToken;
};

// Routes
app.post('/login', (req, res) => {
    const user = {id: 1, username: 'exampleuser'};
    const token = generateToken(user);
    res.json({token});
});

app.post('/refresh', (req, res) => {
    const token = extractAuthToken(req);
    if (!token) return sendErrorResponse(res, RESPONSE_STATUS.UNAUTHORIZED, ERROR_MESSAGES.MISSING_TOKEN);

    jwt.verify(token, currentSecretKey, {ignoreExpiration: true}, (err, user) => {
        if (!user || !user.id) {
            return sendErrorResponse(res, 400, 'Token is still valid, no need for refresh');
        }
        const newToken = generateToken({id: user.id, username: user.username});
        res.json({token: newToken});
    });
});

app.get('/protected', authenticateToken, (req, res) => {
    res.json({
        message: 'Access granted to protected resource',
        user: req.user,
    });
});

app.get('/', (req, res) => res.json({message: 'Hello World'}));

app.get('/status', authenticateToken, async (req, res) => {
    try {
        const {metadata, sha} = await loadConfiguration();
        const buildNumber = process.env.BUILD_NUMBER || '0';
        currentToken = null; // Invalidate the cached token after use
        res.json({
            'my-application': [
                {
                    description: metadata.description,
                    version: `${metadata.version}-${buildNumber}`,
                    sha,
                },
            ],
        });
    } catch (error) {
        sendErrorResponse(res, 500, 'Internal Server Error');
    }
});

/**
 *
 */
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = {app, server};