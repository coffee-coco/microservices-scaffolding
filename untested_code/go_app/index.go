package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/dgrijalva/jwt-go"
)

// Constants
/**
 *
 */
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes
/**
 *
 */
var JWT_SECRET_KEY = "your_secret_key" // Use a secure environment variable in production
/**
 *
 */
const TOKEN_EXPIRATION_TIME = time.Hour // 1-hour token expiration

/**
 * Holds configuration information with metadata, SHA value, and last updated timestamp.
 */
type ConfigCache struct {
	Metadata    map[string]interface{}
	SHA         string
	LastUpdated time.Time
}

var configCache = &ConfigCache{
	Metadata:    nil,
	SHA:         "",
	LastUpdated: time.Time{},
}
var cacheMutex sync.Mutex

/**
 *
 */
func getGitSha() (string, error) {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

/**
 *
 */
func handleErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	fmt.Println(message)
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

/**
 * Asynchronously loads the configuration settings.
 * Checks if cache is valid based on last update timestamp and CACHE_DURATION_MS.
 * If cache is valid, returns the cached configuration.
 * If cache is invalid or if an error occurs during loading, an error is thrown.
 *
 * @returns {Promise<Object>} A promise that resolves with the loaded configuration settings.
 */
func loadConfiguration() (*ConfigCache, error) {
	currentTimestamp := time.Now()

	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	if configCache.Metadata != nil && currentTimestamp.Sub(configCache.LastUpdated).Milliseconds() < CACHE_DURATION_MS {
		return configCache, nil
	}

	metadataContent, err := ioutil.ReadFile("./metadata.json")
	if err != nil {
		fmt.Println("Configuration loading failed:", err)
		return nil, errors.New("failed to load configuration")
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(metadataContent, &metadata); err != nil {
		fmt.Println("Configuration loading failed:", err)
		return nil, errors.New("failed to load configuration")
	}

	sha, err := getGitSha()
	if err != nil {
		fmt.Println("Configuration loading failed:", err)
		return nil, errors.New("failed to load configuration")
	}

	configCache.Metadata = metadata
	configCache.SHA = sha
	configCache.LastUpdated = currentTimestamp

	return configCache, nil
}

/**
 * Middleware function to authenticate a user token
 *
 * @param {Object} req - The request object containing headers
 * @param {Object} res - The response object
 * @param {Function} next - The next middleware function in the chain
 */
func authenticateToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")

		if token == "" {
			handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Missing token")
			return
		}

		parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
			return []byte(JWT_SECRET_KEY), nil
		})

		if err != nil {
			if err == jwt.ErrSignatureInvalid {
				handleErrorResponse(w, http.StatusForbidden, "Forbidden: Invalid token")
				return
			}
			handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Token expired")
			return
		}

		if claims, ok := parsedToken.Claims.(jwt.MapClaims); ok && parsedToken.Valid {
			r.Header.Set("User", fmt.Sprintf("%v", claims["id"]))
			next(w, r)
		} else {
			handleErrorResponse(w, http.StatusForbidden, "Forbidden: Invalid token")
		}
	}
}

/**
 *
 */
func generateToken(payload map[string]interface{}) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims(payload))
	tokenString, err := token.SignedString([]byte(JWT_SECRET_KEY))
	if err != nil {
		return "", err
	}
	return tokenString, nil
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	user := map[string]interface{}{"id": 11, "username": "exampleuser"}
	token, err := generateToken(user)
	if err != nil {
		handleErrorResponse(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func refreshHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")

	if token == "" {
		handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Missing token")
		return
	}

	parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
		return []byte(JWT_SECRET_KEY), nil
	})

	if err != nil {
		handleErrorResponse(w, http.StatusForbidden, "Forbidden: Invalid token")
		return
	}

	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	if !ok || !parsedToken.Valid {
		handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Invalid token")
		return
	}

	expiration, ok := claims["exp"].(float64)
	if ok && time.Now().Unix() < int64(expiration) {
		handleErrorResponse(w, http.StatusBadRequest, "Token is still valid, no need for refresh")
		return
	}

	user := map[string]interface{}{"id": claims["id"], "username": claims["username"]}
	newToken, err := generateToken(user)
	if err != nil {
		handleErrorResponse(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": newToken})
}

func protectedHandler(w http.ResponseWriter, r *http.Request) {
	user := r.Header.Get("User")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Access granted to protected resource",
		"user":    user,
	})
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Hello World",
	})
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	config, err := loadConfiguration()
	if err != nil {
		handleErrorResponse(w, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	buildNumber := os.Getenv("BUILD_NUMBER")
	if buildNumber == "" {
		buildNumber = "0"
	}

	response := map[string]interface{}{
		"my-application": []map[string]interface{}{
			{
				"description": config.Metadata["description"],
				"version":     fmt.Sprintf("%s-%s", config.Metadata["version"], buildNumber),
				"sha":         config.SHA,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	http.HandleFunc("/login", loginHandler)
	http.HandleFunc("/refresh", refreshHandler)
	http.HandleFunc("/protected", authenticateToken(protectedHandler))
	http.HandleFunc("/", rootHandler)
	http.HandleFunc("/status", authenticateToken(statusHandler))

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	fmt.Printf("Server is running on port %s\n", port)
	http.ListenAndServe(":"+port, nil)
}
