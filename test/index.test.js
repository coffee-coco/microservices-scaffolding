const request = require('supertest');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

describe('Microservices Application', () => {
  let app, server;
  const secret = 'SECRET_TOKEN'; // Use the same secret as in your application

  beforeAll(() => {
    // Arrange
    const metadataPath = path.join(__dirname, '../metadata.json');

    // Verify metadata file exists and is readable
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Metadata file not found at ${metadataPath}`);
    }
  });

  beforeEach(() => {
    // Reload the app before each test to ensure clean state
    jest.resetModules();
    const indexModule = require('../index');
    app = indexModule.app;
    server = indexModule.server;
  });

  afterEach(() => {
    // Close the server after each test
    if (server) {
      server.close();
    }
  });

  const generateToken = () => {
    return jwt.sign({ user: 'testUser' }, secret, { expiresIn: '1h' });
  };

  test('Root endpoint returns Hello World', async () => {
    // Act
    const response = await request(app).get('/');

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ message: 'Hello World' });
  });

  test('Status endpoint returns correct metadata', async () => {
    // Arrange
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../metadata.json'), 'utf8'));
    process.env.BUILD_NUMBER = '42';
    const token = generateToken();

    // Act
    const response = await request(app)
      .get('/status')
      .set('Authorization', `Bearer ${token}`);

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.body['my-application'][0]).toMatchObject({
      description: metadata.description,
      version: expect.stringContaining(metadata.version),
      sha: expect.any(String)
    });
  });

  test('Status endpoint uses default build number when not set', async () => {
    // Arrange
    delete process.env.BUILD_NUMBER;
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../metadata.json'), 'utf8'));
    const token = generateToken();

    // Act
    const response = await request(app)
      .get('/status')
      .set('Authorization', `Bearer ${token}`);

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.body['my-application'][0].version).toMatch(/^.*-0$/);
  });

  test('Metadata file has required fields', () => {
    // Arrange
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../metadata.json'), 'utf8'));

    // Assert
    expect(metadata).toHaveProperty('description');
    expect(metadata).toHaveProperty('version');
    expect(typeof metadata.description).toBe('string');
    expect(typeof metadata.version).toBe('string');
  });
});