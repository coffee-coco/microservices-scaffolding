# Node.js Express Application

This project is a **Node.js** backend application built using the **Express.js** framework. It demonstrates key functionalities such as **token-based authentication** using **JSON Web Tokens (JWT)**, metadata-based configuration caching, and dynamically fetching application and build details.

---

## Table of Contents

1. [Features](#features)
2. [Configuration](#configuration)
3. [Endpoints](#endpoints)
    - [Root Endpoint (`/`)](#root-endpoint)
    - [Status Endpoint (`/status`)](#status-endpoint)
4. [Caching Mechanism](#caching-mechanism)
5. [Authentication](#authentication)
6. [Error Handling](#error-handling)
7. [How to Run](#how-to-run)

---

## Features

- **Express.js Framework**: Simplifies the creation of server routes.
- **JWT Authentication**: Secures endpoints to prevent unauthorized access.
- **Metadata Caching**: Loads and caches application metadata and the latest Git commit SHA for better performance.
- **Dynamic Build Info**: Shows version and build details by combining metadata and Git data.
- **Error Handling**: Ensures clear and consistent error messages for API responses.

---

## Configuration

### Constants

- **`CACHE_DURATION`**: Defines how long the configuration cache remains valid (default: 5 minutes).
- **`JWT_SECRET_KEY`**: The secret key used to sign and validate JSON Web Tokens.

### Environment Variables

- **`PORT`**: Specifies the server port (default: `3000`).
- **`BUILD_NUMBER`**: Optional build number included in metadata responses (default: `0`).

---

## Endpoints

### Root Endpoint

#### **GET `/`**

- **Description**: A public, unauthenticated route returning a simple JSON greeting.
- **Response**:
  ```json
  { "message": "Hello World" }
  ```

---

### Status Endpoint

#### **GET `/status`**

- **Description**: Returns application metadata, build details, and the latest Git commit SHA. This route is **protected** by JWT authentication.
- **Headers**:
  - Requires an `Authorization` header in the form of `Bearer <token>`.
- **Response**:
  - On success:
    ```json
    {
      "my-application": [
        {
          "description": "<description-from-metadata>",
          "version": "<metadata-version>-<build-number>",
          "sha": "<latest-git-sha>"
        }
      ]
    }
    ```
  - On failure (e.g., missing JWT or internal error):
    ```json
    { "error": "<error-message>" }
    ```

---

## Caching Mechanism

### **In-Memory Cache**

The application uses an in-memory cache to improve performance by avoiding repeated file system reads or shell command executions.

- **Cache Structure**:
  ```javascript
  const configCache = {
    metadata: null, // Parsed JSON from `metadata.json`.
    sha: null,      // Latest Git SHA hash.
    lastUpdated: 0  // Timestamp of the last cache update.
  };
  ```
- **Cache Duration**: 5 minutes by default (configurable through `CACHE_DURATION`).

### How Caching Works:

1. The cache is checked to determine if it’s still valid (based on `lastUpdated` and `CACHE_DURATION`).
2. If valid, the cached metadata and Git SHA are returned.
3. If invalid, configuration is reloaded:
   - **Metadata** is read from `metadata.json`.
   - The Git commit **SHA** is retrieved using `git rev-parse HEAD`.
   - Both values are stored in the cache.

---

## Authentication

### **JWT Authentication Middleware**

The **`authenticateToken`** middleware protects the `/status` endpoint by verifying a JSON Web Token (JWT).

- **How It Works**:
  1. The token is extracted from the `Authorization` header (format: `Bearer <token>`).
  2. The token is verified using the `JWT_SECRET_KEY`.
  3. If valid, the decoded user information is attached to the request.
  4. If invalid or missing, the request is rejected.

- **Error Responses**:
  - Missing Token: `401 Unauthorized`
  - Invalid Token: `403 Forbidden`

---

## Error Handling

A centralized error handler is employed to log errors on the server and send user-friendly JSON responses.

### Utility Function: `handleErrorResponse`

**Parameters**:
- `res`: Express `response` object.
- `statusCode`: HTTP status code for response (e.g., 401, 500, etc.).
- `message`: Custom error message.

**Example**:
```javascript
handleErrorResponse(res, 500, 'Internal Server Error');
```

**Client Response**:
```json
{ "error": "Internal Server Error" }
```

---

## How to Run

### Running Locally

1. Install Node.js and npm.
2. Clone the repository.
   ```bash
   git clone $ docker pull ghcr.io/coffee-coco/microservices-scaffolding:latest
   cd microservices-scaffolding
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create the necessary **`metadata.json`** file in the project root. Example:
   ```json
   {
     "description": "My Sample Application",
     "version": "1.0.0"
   }
   ```
5. Start the application:
   ```bash
   node index.js
   ```
### To generate a JWT token, you can create a new file called generateToken.js with the following content:
``` bash
curl -H "Authorization: Bearer $(node generateToken.js)" http://localhost:3000/status
```
   or use a process manager like **npm scripts** or **nodemon** for development.

6. Navigate to [http://localhost:3000](http://localhost:3000).

---

## Example Usage

### Testing Root Route

- Method: **GET**
- URL: `http://localhost:3000/`
- Response:
  ```json
  { "message": "Hello World" }
  ```

---

### Testing Status Route

1. Generate a JWT token manually (or through the configured system).
   Example (using [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)):
   ```javascript
   const jwt = require('jsonwebtoken');
   const token = jwt.sign({ user: 'testUser' }, 'SECRET_TOKEN', { expiresIn: '1h' });
   console.log(token);
   ```

2. Add the token to the `Authorization` header (format: `Bearer <token>`).
3. Call the `/status` endpoint:
   - Method: **GET**
   - URL: `http://localhost:3000/status`
   - Headers:
     ```json
     { "Authorization": "Bearer <your-token>" }
     ```

4. Example Response:
   ```json
   {
     "my-application": [
       {
         "description": "My Sample Application",
         "version": "1.0.0-42",
         "sha": "abcdefgh1234567890"
       }
     ]
   }
   ```
### Versioning and Branches

In this project, versions are primarily built from the `develop` branch. This allows for continuous integration and testing of new features and changes. However, versions can also be built from the `main` branch.

In a real-world scenario, only releases should be done on the `main` branch. This ensures that the `main` branch always contains stable and production-ready code. The `develop` branch is used for ongoing development and integration of new features.

To summarize:
- **`develop` branch**: Used for building and testing new versions.
- **`main` branch**: Used for official releases and stable code.

*** By following a branching strategy, we can maintain a clear separation between development and production-ready code.
---

## Notes

- Ensure `metadata.json` is always present and valid in the root directory. Missing or corrupted metadata will cause the `/status` route to fail.
- Use a secure mechanism to manage the `JWT_SECRET_KEY`.

---

## Dependencies

| Package         | Version |
|-----------------|---------|
| express         | ^4.x.x  |
| jsonwebtoken    | ^9.x.x  |
| child_process   | Node.js built-in  |
| fs.promises     | Node.js built-in  |

---

Happy coding! 🎉