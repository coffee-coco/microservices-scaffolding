import functools
import json
import subprocess
import jwt
import os
from flask import Flask, request, jsonify
from datetime import datetime

# Helper Functions
def generate_secret_key():
    return os.urandom(64).hex()

# State Variables
current_secret_key = generate_secret_key()
current_token = None
token_blacklist = set()

# Constants
CACHE_DURATION_MS = 5 * 60 * 1000  # 5 minutes
TOKEN_EXPIRATION_TIME = '1h'  # 1-hour token expiration
ERROR_MESSAGES = {
    "MISSING_TOKEN": "Unauthorized: Missing token",
    "TOKEN_EXPIRED": "Unauthorized: Token expired",
    "TOKEN_REUSED": "Forbidden: Token has already been used",
    "INVALID_TOKEN": "Forbidden: Invalid token",
}
RESPONSE_STATUS = {
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
}

# Cached Configuration
config_cache = {
    "metadata": None,
    "sha": None,
    "last_updated": 0,
}

# Extract token from request headers
def extract_auth_token(req):
    auth_header = req.headers.get("Authorization")
    return auth_header.split(" ")[1] if auth_header else None

# Send a standardized error response
def send_error_response(res, status_code, message):
    print(message)
    response = jsonify({"error": message})
    response.status_code = status_code
    return response

# Load configuration with cache control
def load_configuration():
    current_timestamp = int(datetime.now().timestamp() * 1000)
    if config_cache["metadata"] and (current_timestamp - config_cache["last_updated"]) < CACHE_DURATION_MS:
        return config_cache
    try:
        with open("./metadata.json", "r") as f:
            metadata_content = f.read()
        metadata = json.loads(metadata_content)
        sha = get_git_sha()
        config_cache.update({"metadata": metadata, "sha": sha, "last_updated": current_timestamp})
        return config_cache
    except Exception as error:
        print("Configuration loading failed:", error)
        raise Exception("Failed to load configuration")

# Use subprocess to fetch the git commit SHA
def get_git_sha():
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as error:
        raise error

# Flask App and Middleware
app = Flask(__name__)
port = int(os.environ.get("PORT", 3000))

# Middleware to authenticate tokens
def authenticate_token(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        token = extract_auth_token(request)
        if not token:
            return send_error_response(request, RESPONSE_STATUS["UNAUTHORIZED"], ERROR_MESSAGES["MISSING_TOKEN"])
        if token in token_blacklist:
            return send_error_response(request, RESPONSE_STATUS["FORBIDDEN"], ERROR_MESSAGES["TOKEN_REUSED"])
        try:
            decoded = jwt.decode(token, current_secret_key, algorithms=["HS256"])
            request.user = decoded
            if request.path != "/protected":
                token_blacklist.add(token)
        except jwt.ExpiredSignatureError:
            return send_error_response(request, RESPONSE_STATUS["UNAUTHORIZED"], ERROR_MESSAGES["TOKEN_EXPIRED"])
        except jwt.InvalidTokenError:
            return send_error_response(request, RESPONSE_STATUS["UNAUTHORIZED"], ERROR_MESSAGES["INVALID_TOKEN"])
        return func(*args, **kwargs)
    return wrapper

# Generate a new JWT token
def generate_token(payload):
    global current_secret_key, current_token
    current_secret_key = generate_secret_key()
    current_token = jwt.encode(payload, current_secret_key, algorithm="HS256")
    return current_token

# Routes
@app.route("/login", methods=["POST"])
def login():
    user = {"id": 1, "username": "exampleuser"}
    token = generate_token(user)
    return jsonify({"token": token})

@app.route("/refresh", methods=["POST"])
def refresh():
    token = extract_auth_token(request)
    if not token:
        return send_error_response(request, RESPONSE_STATUS["UNAUTHORIZED"], ERROR_MESSAGES["MISSING_TOKEN"])
    try:
        decoded = jwt.decode(token, current_secret_key, algorithms=["HS256"], options={"verify_exp": False})
        if not decoded.get("id"):
            return send_error_response(request, 400, "Token is still valid, no need for refresh")
        new_token = generate_token({"id": decoded["id"], "username": decoded["username"]})
        return jsonify({"token": new_token})
    except jwt.InvalidTokenError:
        pass

@app.route("/protected", methods=["GET"])
@authenticate_token
def protected():
    return jsonify({
        "message": "Access granted to protected resource",
        "user": request.user,
    })

@app.route("/", methods=["GET"])
def index():
    return jsonify({"message": "Hello World"})

@app.route("/status", methods=["GET"])
@authenticate_token
def status():
    try:
        config = load_configuration()
        metadata = config["metadata"]
        sha = config["sha"]
        build_number = os.environ.get("BUILD_NUMBER", "0")
        global current_token
        current_token = None
        return jsonify({
            "my-application": [
                {
                    "description": metadata["description"],
                    "version": f"{metadata['version']}-{build_number}",
                    "sha": sha,
                }
            ],
        })
    except Exception as error:
        return send_error_response(request, 500, "Internal Server Error")

if __name__ == "__main__":
    app.run(port=port)