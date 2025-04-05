\import os
import json
import time
import jwt
import subprocess
import secrets
from flask import Flask, request, jsonify

# Constants
CACHE_DURATION_MS = 5 * 60 * 1000  # 5 minutes
TOKEN_EXPIRATION_TIME = 3600  # 1-hour token expiration in seconds

# Function to generate a random secret key
def generate_secret_key():
    return secrets.token_hex(64)

# Holds configuration information with metadata, SHA value, and last updated timestamp.
config_cache = {
    "metadata": None,
    "sha": None,
    "lastUpdated": 0,
}

# Token blacklist to store used tokens
token_blacklist = set()

# Cached token
cached_token = None
cached_secret_key = generate_secret_key()

def get_git_sha():
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], stdout=subprocess.PIPE, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        raise e

def handle_error_response(res, status_code, message):
    print(message)
    res.status_code = status_code
    return jsonify({"error": message})

def load_configuration():
    current_timestamp = int(time.time() * 1000)

    if config_cache["metadata"] and (current_timestamp - config_cache["lastUpdated"]) < CACHE_DURATION_MS:
        return config_cache

    try:
        with open('./metadata.json', 'r', encoding='utf-8') as f:
            metadata_content = f.read()

        metadata = json.loads(metadata_content)
        sha = get_git_sha()

        config_cache["metadata"] = metadata
        config_cache["sha"] = sha
        config_cache["lastUpdated"] = current_timestamp

        return config_cache
    except Exception as e:
        print("Configuration loading failed:", e)
        raise Exception("Failed to load configuration")

app = Flask(__name__)
port = int(os.getenv("PORT", 3000))

def authenticate_token():
    auth_header = request.headers.get('Authorization')
    token = auth_header.split(' ')[1] if auth_header else None

    if not token:
        return handle_error_response(jsonify({}), 401, 'Unauthorized: Missing token')

    if token in token_blacklist:
        return handle_error_response(jsonify({}), 403, 'Forbidden: Token has already been used')

    try:
        user = jwt.decode(token, cached_secret_key, algorithms=["HS256"])
        request.user = user

        # Add token to blacklist after successful verification, except for /protected endpoint
        if request.path != '/protected':
            token_blacklist.add(token)
    except jwt.ExpiredSignatureError:
        return handle_error_response(jsonify({}), 401, 'Unauthorized: Token expired')
    except jwt.InvalidTokenError:
        return handle_error_response(jsonify({}), 403, 'Forbidden: Invalid token')

    return None
def generate_token(payload):
    global cached_secret_key
    global cached_token
    cached_secret_key = generate_secret_key()  # Generate a new secret key
    cached_token = jwt.encode(payload, cached_secret_key, algorithm="HS256")
    return cached_token

@app.route('/login', methods=['POST'])
def login():
    user = {"id": 1, "username": "exampleuser"}
    token = generate_token(user)
    return jsonify({"token": token})

@app.route('/refresh', methods=['POST'])
def refresh():
    auth_header = request.headers.get('Authorization')
    token = auth_header.split(' ')[1] if auth_header else None

    if not token:
        return handle_error_response(jsonify({}), 401, 'Unauthorized: Missing token')

    try:
        user = jwt.decode(token, cached_secret_key, algorithms=["HS256"], options={"verify_exp": False})

        # if not user.id then Token is still valid, no need for refresh
        if not user or 'id' not in user:
            return handle_error_response(jsonify({}), 400, 'Token is still valid, no need for refresh')

        new_token = generate_token({"id": user["id"], "username": user["username"]})
        return jsonify({"token": new_token})
    except jwt.InvalidTokenError:
        return handle_error_response(jsonify({}), 403, 'Forbidden: Invalid token')

@app.route('/protected', methods=['GET'])
def protected():
    error_response = authenticate_token()
    if error_response:
        return error_response

    return jsonify({
        "message": "Access granted to protected resource",
        "user": request.user,
    })

@app.route('/', methods=['GET'])
def home():
    return jsonify({"message": "Hello World"})

@app.route('/status', methods=['GET'])
def status():
    error_response = authenticate_token()
    if error_response:
        return error_response

    try:
        config = load_configuration()
        metadata = config["metadata"]
        sha = config["sha"]
        build_number = os.getenv("BUILD_NUMBER", "0")

        # Invalidate the cached token after use
        global cached_token
        cached_token = None

        return jsonify({
            "my-application": [
                {
                    "description": metadata["description"],
                    "version": f"{metadata['version']}-{build_number}",
                    "sha": sha,
                },
            ],
        })
    except Exception:
        return handle_error_response(jsonify({}), 500, "Internal Server Error")

if __name__ == '__main__':
    app.run(port=port)