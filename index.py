import json
import os
import time
from flask import Flask, request, jsonify
import jwt
from subprocess import Popen, PIPE
from functools import wraps

# Constants
CACHE_DURATION_MS = 5 * 60 * 1000  # 5 minutes
JWT_SECRET_KEY = 'SECRET_TOKEN'

# In-memory configuration cache to store application metadata and git SHA.
configCache = {
    "metadata": None,
    "sha": None,
    "lastUpdated": 0,
}

# Utility function to retrieve the latest git commit SHA.
def get_git_sha():
    try:
        process = Popen(["git", "rev-parse", "HEAD"], stdout=PIPE, stderr=PIPE)
        stdout, _ = process.communicate()
        return stdout.decode("utf-8").strip()
    except Exception as e:
        raise e

# Utility function to handle error responses in the API.
def handle_error_response(response, status_code, message):
    print(message, flush=True)
    response.status_code = status_code
    return jsonify({"error": message})

# Asynchronously loads application configuration with intelligent caching.
def load_configuration():
    current_timestamp = int(time.time() * 1000)
    if configCache["metadata"] and (current_timestamp - configCache["lastUpdated"]) < CACHE_DURATION_MS:
        return configCache

    try:
        # Load metadata
        with open("./metadata.json", "r", encoding="utf8") as metadata_file:
            metadata = json.load(metadata_file)

        # Get Git SHA
        sha = get_git_sha()

        # Update cache
        configCache["metadata"] = metadata
        configCache["sha"] = sha
        configCache["lastUpdated"] = current_timestamp

        return configCache
    except Exception as e:
        print("Configuration loading failed:", e, flush=True)
        raise RuntimeError("Failed to load configuration")

app = Flask(__name__)
port = int(os.getenv("PORT", 3000))

# Middleware to authenticate requests using JSON Web Token (JWT).
def authenticate_token(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        token = auth_header.split(" ")[1] if auth_header else None

        if not token:
            return handle_error_response(jsonify(), 401, "Unauthorized: Missing token")

        try:
            decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
            request.user = decoded
            return func(*args, **kwargs)
        # generic exception handling
        except jwt.ExpiredSignatureError:
            return handle_error_response(jsonify(), 401, "Unauthorized: Token expired")
        except jwt.InvalidTokenError:
            return handle_error_response(jsonify(), 401, "Unauthorized: Invalid token")
        except Exception as e:
            print("Token authentication failed:", e, flush=True)
            return handle_error_response(jsonify(), 401, "Unauthorized: Token authentication failed")


    return wrapper

# Root endpoint returning a simple greeting.
@app.route("/", methods=["GET"])
def root():
    return jsonify({"message": "Hello World"})

# Status endpoint providing application metadata and build information.
@app.route("/status", methods=["GET"])
@authenticate_token
def status():
    try:
        config = load_configuration()
        metadata = config["metadata"]
        sha = config["sha"]
        build_number = os.getenv("BUILD_NUMBER", "0")

        return jsonify({
            "my-application": [
                {
                    "description": metadata["description"],
                    "version": f"{metadata['version']}-{build_number}",
                    "sha": sha,
                },
            ],
        })
    except RuntimeError:
        return handle_error_response(jsonify(), 500, "Internal Server Error")

# Start the server.
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=port)