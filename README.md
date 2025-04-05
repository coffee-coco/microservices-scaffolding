# Node.js Express Application

This project is a **Node.js** backend application built using the **Express.js** framework. It demonstrates key functionalities such as **token-based authentication** using **JSON Web Tokens (JWT)**, metadata-based configuration caching, and dynamically fetching application and build details.
The endpoints are defined in the `index.js` file and are documented below with examples of how to call them.

---

## Table of Contents

1. [Features](#features)
2. [Endpoints](#endpoints)
    - [Login (`/login`)](#login-endpoint-post-login)
    - [Refresh Token (`/refresh`)](#refresh-token-endpoint-post-refresh)
    - [Protected Route (`/protected`)](#protected-route-endpoint-get-protected)
3. [How to Run](#how-to-run)

---

## Features

- **Express.js Framework**: Implements fast and simple HTTP routing with middlewares.
- **JWT Authentication**: Secures endpoints using JSON Web Tokens with an expiration time.
- **Caching**: Implements in-memory caching for application metadata and Git commit SHA.
- **Protected Routes**: Demonstrates secure data access using JWT token authorization.
- **Error Handling**: Handles missing or invalid tokens with clear JSON error messages.
- **Token Refresh**: Implements token refresh functionality for expired tokens.

---

## Endpoints

### Login Endpoint (**POST `/login`**)

- **Description**: Generates a new JSON Web Token (JWT) for the user.
- **Path**: `/login`  
- **Method**: `POST`  
- **Request Body**: None (a default user is pre-configured in the code with username `exampleuser`).  
- **Response**:
  - On success:
    ```json
    {
      "token": "<jwt-token>"
    }
    ```
  - On failure:
    ```json
    {
      "error": "<error-message>"
    }
    ```

- **Example Usage**:
  ```bash
  curl -X POST http://localhost:3000/login
  ```

---

### Refresh Token Endpoint (**POST `/refresh`**)

- **Description**: Generates a new JWT based on an expired token. The expired token is passed via the `Authorization` header.
- **Path**: `/refresh`  
- **Method**: `POST`  
- **Headers**:
  - `Authorization: Bearer <your-expired-token>`
- **Response**:
  - On success:
    ```json
    {
      "token": "<new-jwt-token>"
    }
    ```
  - On failure:
    ```json
    {
      "error": "<error-message>"
    }
    ```

- **Example Usage**:
  ```bash
TOKEN=$(curl -s -X POST http://localhost:3000/login | jq -r '.token')
curl -X GET http://localhost:3000/status -H "Authorization: Bearer $TOKEN"
EXPIRED_TOKEN=$TOKEN
TOKEN=$(curl -s -X POST http://localhost:3000/refresh -H "Authorization: Bearer $EXPIRED_TOKEN" | jq -r '.token')
curl -X GET http://localhost:3000/status -H "Authorization: Bearer $TOKEN"
  ```

---

### Protected Route Endpoint (**GET `/protected`**)

- **Description**: A protected endpoint accessible only with a valid JWT. If the provided token is valid, it returns a success message.
- **Path**: `/protected`  
- **Method**: `GET`  
- **Headers**:
  - `Authorization: Bearer <your-valid-token>`
- **Response**:
  - On success:
    ```json
    {
      "message": "You have access to this protected data!"
    }
    ```
  - On failure:
    ```json
    {
      "error": "Unauthorized"
    }
    ```

- **Example Usage**:
  ```bash
  curl -X GET http://localhost:3000/protected \
       -H "Authorization: Bearer <valid-token>"
  ```
- **Example status**:
## Get a token from the /login endpoint

  ```bash
TOKEN=$(curl -s -X POST http://localhost:3000/login | jq -r '.token')
curl -X GET http://localhost:3000/status -H "Authorization: Bearer $TOKEN"
  ```
---
- **Example protected**:
## Get a token from the /login endpoint

  ```bash
TOKEN=$(curl -s -X POST http://localhost:3000/login | jq -r '.token')
curl -X GET http://localhost:3000/protected -H "Authorization: Bearer $TOKEN"
  ```
---


## How to Run

### Steps to Start the Application

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-repo.git
   cd your-repo
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Server**:
   ```bash
   npm start
   ```

4. The server should now be running on `http://localhost:3000`.

To summarize:
- **`develop` branch**: Used for building and testing new versions.
- **`main` branch**: Used for official releases and stable code.

*** By following a branching strategy, we can maintain a clear separation between development and production-ready code.
---

## Notes

- **Authentication Secret**: The application uses `JWT_SECRET_KEY` to sign and verify JWTs. Ensure this is securely set as an environment variable in production.
- **Default User**: The `/login` endpoint currently returns a token for a hardcoded user object. Update this logic to integrate with your user authentication logic in production.
- **Ensure `metadata.json` is always present and valid in the root directory. Missing or corrupted metadata will cause the `/status` route to fail.
- **Use a secure mechanism to manage the `JWT_SECRET_KEY`.
- **Note: In this example, we have chosen to use OS commands for Git subprocesses. However, using specific libraries for the language would be best to call git, to avoid potential security issues.

---

Happy coding! 🎉