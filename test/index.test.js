const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs'); // Import the fs module


describe('Microservices Application Error Scenarios', () => {
    let app, server;
    const secret = 'your_secret_key';

    beforeEach(() => {
        jest.resetModules();
        const indexModule = require('../index');
        app = indexModule.app;
        server = indexModule.server;
    });

    afterEach(() => {
        if (server) {
            server.close();
        }
    });

    const generateToken = () => {
        return jwt.sign({id: 1, user: 'exampleuser'}, secret, {expiresIn: '1h'});
    };

    test('Status endpoint accepts request with valid token', async () => {
        // Login to get the token
        const loginResponse = await request(app).post('/login');
        expect(loginResponse.statusCode).toBe(200);
        expect(loginResponse.body).toHaveProperty('token');
        const token = loginResponse.body.token;

        // Use the token to access the /status endpoint
        const response = await request(app)
            .get('/status')
            .set('Authorization', `Bearer ${token}`);
        expect(response.statusCode).toBe(200);
    });

    test('Status endpoint rejects request without token', async () => {
        const response = await request(app).get('/status');
        expect(response.statusCode).toBe(401);
    });

    test('Status endpoint rejects expired token', async () => {
        const expiredToken = jwt.sign({user: 'testUser'}, secret, {expiresIn: '1ms'});
        await new Promise(resolve => setTimeout(resolve, 10));
        const response = await request(app)
            .get('/status')
            .set('Authorization', `Bearer ${expiredToken}`);
        expect(response.statusCode).toBe(401);
    });

    test('Status endpoint handles invalid token', async () => {
        const response = await request(app)
            .get('/status')
            .set('Authorization', 'Bearer INVALID_TOKEN');
        expect(response.statusCode).toBe(401);
    });

    test('Root endpoint handles non-existent route', async () => {
        const response = await request(app).get('/nonexistent');
        expect(response.statusCode).toBe(404);
    });

    test('Login endpoint returns a token', async () => {
        const response = await request(app).post('/login');
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('token');
    });

    test('Login, use token on status, and refresh token', async () => {
        const loginResponse = await request(app).post('/login');
        expect(loginResponse.statusCode).toBe(200);
        expect(loginResponse.body).toHaveProperty('token');
        const token = loginResponse.body.token;

        const statusResponse = await request(app)
            .get('/status')
            .set('Authorization', `Bearer ${token}`);
        expect(statusResponse.statusCode).toBe(200);

        const refreshResponse = await request(app)
            .post('/refresh')
            .set('Authorization', `Bearer ${token}`);
        expect(refreshResponse.statusCode).toBe(200);
        expect(refreshResponse.body).toHaveProperty('token');
    });

    test('Protected endpoint requires authentication', async () => {
        const response = await request(app).get('/protected');
        expect(response.statusCode).toBe(401);
    });

    test('Login, then call protected endpoint', async () => {
        const loginResponse = await request(app).post('/login');
        expect(loginResponse.statusCode).toBe(200);
        expect(loginResponse.body).toHaveProperty('token');
        const token = loginResponse.body.token;

        const protectedResponse = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);
        expect(protectedResponse.statusCode).toBe(200);
        expect(protectedResponse.body).toHaveProperty('message', 'Access granted to protected resource');
    });

    test('Status endpoint handles configuration loading errors', async () => {
        // Login to get the token
        const loginResponse = await request(app).post('/login');
        expect(loginResponse.statusCode).toBe(200);
        expect(loginResponse.body).toHaveProperty('token');
        const token = loginResponse.body.token;

        // Mock the readFile method to throw an error
        jest.spyOn(fs.promises, 'readFile').mockImplementation(() => {
            throw new Error('Failed to load configuration');
        });

        // Use the token to access the /status endpoint
        const response = await request(app)
            .get('/status')
            .set('Authorization', `Bearer ${token}`);
        expect(response.statusCode).toBe(500);
    });

    test('Login endpoint rejects invalid token', async () => {
        const response = await request(app)
            .post('/refresh')
            .set('Authorization', 'Bearer INVALID_TOKEN');
        expect(response.statusCode).toBe(400);
    });

    test('Refresh endpoint rejects invalid token', async () => {
        const response = await request(app)
            .post('/refresh')
            .set('Authorization', 'Bearer INVALID_TOKEN');
        expect(response.statusCode).toBe(400);
    });

    test('Protected endpoint rejects expired token', async () => {
        const expiredToken = jwt.sign({user: 'testUser'}, secret, {expiresIn: '1ms'});
        await new Promise(resolve => setTimeout(resolve, 10));
        const response = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${expiredToken}`);
        expect(response.statusCode).toBe(401);
    });

    test('Protected endpoint rejects invalid token', async () => {
        const response = await request(app)
            .get('/protected')
            .set('Authorization', 'Bearer INVALID_TOKEN');
        expect(response.statusCode).toBe(401);
    });
    test('Protected endpoint rejects request without token', async () => {
        const response = await request(app).get('/protected');
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized: Missing token');
    });
    test('Protected endpoint rejects request without token', async () => {
        const response = await request(app).get('/protected');
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized: Missing token');
    });
    test('Protected endpoint rejects request without token', async () => {
        const response = await request(app).get('/protected');
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error', 'Unauthorized: Missing token');
    });
    test('Root endpoint returns Hello World message', async () => {
        const response = await request(app).get('/');
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('message', 'Hello World');
    });
});