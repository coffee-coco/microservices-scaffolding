use actix_web::{web, App, HttpServer, Responder, HttpResponse, Error};
use chrono::Utc;
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::process::Command;
use std::sync::Mutex;

// Constants
const CACHE_DURATION_MS: u64 = 5 * 60 * 1000; // 5 minutes
const JWT_SECRET_KEY: &str = "SECRET_TOKEN";

/**
 * In-memory configuration cache to store application metadata and git SHA.
 */
struct ConfigCache {
    metadata: Option<Value>,
    sha: Option<String>,
    last_updated: u64,
}

lazy_static::lazy_static! {
    static ref CONFIG_CACHE: Mutex<ConfigCache> = Mutex::new(ConfigCache {
        metadata: None,
        sha: None,
        last_updated: 0,
    });
}

/**
 * Utility function to retrieve the latest git commit SHA.
 *
 * @returns {Promise<string>} Git SHA hash
 */
async fn get_git_sha() -> Result<String, std::io::Error> {
    let output = Command::new("git")
        .arg("rev-parse")
        .arg("HEAD")
        .output()?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to get Git SHA",
        ))
    }
}

/**
 * Utility function to handle error responses in the API.
 *
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
fn handle_error_response(status_code: u16, message: &str) -> HttpResponse {
    eprintln!("{}", message);
    HttpResponse::build(actix_web::http::StatusCode::from_u16(status_code).unwrap())
        .json(serde_json::json!({"error": message}))
}

/**
 * Asynchronously loads application configuration with intelligent caching.
 */
async fn load_configuration() -> Result<ConfigCache, String> {
    let current_timestamp = Utc::now().timestamp_millis() as u64;

    let mut cache = CONFIG_CACHE.lock().unwrap();

    if let Some(metadata) = &cache.metadata {
        if (current_timestamp - cache.last_updated) < CACHE_DURATION_MS {
            return Ok(ConfigCache {
                metadata: Some(metadata.clone()),
                sha: cache.sha.clone(),
                last_updated: cache.last_updated,
            });
        }
    }

    // Load metadata
    let metadata_content = fs::read_to_string("./metadata.json")
        .map_err(|_| "Failed to read metadata file")?;
    let metadata: Value =
        serde_json::from_str(&metadata_content).map_err(|_| "Failed to parse metadata content")?;

    // Get Git SHA
    let sha = get_git_sha()
        .await
        .map_err(|_| "Failed to retrieve Git SHA".to_string())?;

    // Update cache
    cache.metadata = Some(metadata.clone());
    cache.sha = Some(sha.clone());
    cache.last_updated = current_timestamp;

    Ok(ConfigCache {
        metadata: Some(metadata),
        sha: Some(sha),
        last_updated: cache.last_updated,
    })
}

/**
 * Middleware to authenticate requests using JSON Web Token (JWT).
 */
async fn authenticate_token(req: actix_web::HttpRequest) -> Result<(), Error> {
    if let Some(auth_header) = req.headers().get("authorization") {
        if let Ok(auth_header) = auth_header.to_str() {
            let token = auth_header.split_whitespace().nth(1);

            if let Some(token) = token {
                let decoding_key = DecodingKey::from_secret(JWT_SECRET_KEY.as_ref());
                if decode::<Value>(token, &decoding_key, &Validation::default()).is_ok() {
                    return Ok(());
                }
            }
        }
    }

    Err(handle_error_response(401, "Unauthorized: Missing or invalid token").into())
}

/**
 * Root endpoint returning a simple greeting.
 */
async fn root() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({"message": "Hello World"}))
}

/**
 * Status endpoint providing application metadata and build information.
 */
async fn status() -> impl Responder {
    match load_configuration().await {
        Ok(config) => {
            if let Some(metadata) = config.metadata {
                let build_number = std::env::var("BUILD_NUMBER").unwrap_or_else(|_| "0".to_string());
                HttpResponse::Ok().json(serde_json::json!({
                    "my-application": [
                        {
                            "description": metadata["description"].clone(),
                            "version": format!("{}-{}", metadata["version"], build_number),
                            "sha": config.sha.unwrap_or_default(),
                        }
                    ]
                }))
            } else {
                handle_error_response(500, "Internal Server Error")
            }
        }
        Err(_) => handle_error_response(500, "Internal Server Error"),
    }
}

/**
 * Start the server.
 */
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(root))
            .route("/status", web::get().to(status))
    })
        .bind(("127.0.0.1", 3000))?
        .run()
        .await
}