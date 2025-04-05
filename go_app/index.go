package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// Constants
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const TOKEN_EXPIRATION_TIME = time.Hour // 1-hour token expiration

// Function to generate a random secret key
func generateSecretKey() string {
	secret := make([]byte, 64)
	_, err := rand.Read(secret)
	if err != nil {
		log.Fatal(err)
	}
	return hex.EncodeToString(secret)
}

// Holds configuration information with metadata, SHA value, and last updated timestamp.
type ConfigCache struct {
	Metadata    map[string]interface{}
	SHA         string
	LastUpdated int64
	Mutex       sync.Mutex
}

var configCache = ConfigCache{
	Metadata:    nil,
	SHA:         "",
	LastUpdated: 0,
}

// Token blacklist to store used tokens
var tokenBlacklist = struct {
	Set   map[string]struct{}
	Mutex sync.Mutex
}{
	Set: make(map[string]struct{}),
}

// Cached token and secret key
var cachedToken string
var cachedSecretKey = generateSecretKey()

func getGitSha() (string, error) {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func handleErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	log.Println(message)
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func loadConfiguration() (ConfigCache, error) {
	currentTimestamp := time.Now().UnixNano() / int64(time.Millisecond)

	configCache.Mutex.Lock()
	defer configCache.Mutex.Unlock()

	if configCache.Metadata != nil && (currentTimestamp-configCache.LastUpdated) < CACHE_DURATION_MS {
		return configCache, nil
	}

	metadataContent, err := ioutil.ReadFile("./metadata.json")
	if err != nil {
		log.Println("Configuration loading failed:", err)
		return ConfigCache{}, errors.New("failed to load configuration")
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(metadataContent, &metadata); err != nil {
		log.Println("Configuration loading failed:", err)
		return ConfigCache{}, errors.New("failed to parse configuration")
	}

	sha, err := getGitSha()
	if err != nil {
		log.Println("Configuration loading failed:", err)
		return ConfigCache{}, errors.New("failed to get git SHA")
	}

	configCache.Metadata = metadata
	configCache.SHA = sha
	configCache.LastUpdated = currentTimestamp

	return configCache, nil
}

func authenticateToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")

		if token == "" {
			handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Missing token")
			return
		}

		tokenBlacklist.Mutex.Lock()
		_, exists := tokenBlacklist.Set[token]
		tokenBlacklist.Mutex.Unlock()

		if exists {
			handleErrorResponse(w, http.StatusForbidden, "Forbidden: Token has already been used")
			return
		}

		claims := jwt.MapClaims{}
		parsedToken, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(cachedSecretKey), nil
		})

		if err != nil || !parsedToken.Valid {
			if errors.Is(err, jwt.ErrTokenExpired) {
				handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Token expired")
			} else {
				handleErrorResponse(w, http.StatusForbidden, "Forbidden: Invalid token")
			}
			return
		}

		if r.URL.Path != "/protected" {
			tokenBlacklist.Mutex.Lock()
			tokenBlacklist.Set[token] = struct{}{}
			tokenBlacklist.Mutex.Unlock()
		}

		next(w, r)
	}
}

func generateToken(payload map[string]interface{}) (string, error) {
	cachedSecretKey = generateSecretKey() // Generate a new secret key

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims(payload))
	signedToken, err := token.SignedString([]byte(cachedSecretKey))
	if err != nil {
		return "", err
	}
	cachedToken = signedToken
	return cachedToken, nil
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	user := map[string]interface{}{"id": 1, "username": "exampleuser"}
	token, err := generateToken(user)
	if err != nil {
		handleErrorResponse(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func refreshHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")

	if token == "" {
		handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Missing token")
		return
	}

	claims := jwt.MapClaims{}
	parsedToken, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(cachedSecretKey), nil
	})

	if err != nil || !parsedToken.Valid || claims["id"] == nil {
		handleErrorResponse(w, http.StatusBadRequest, "Token is still valid, no need for refresh")
		return
	}

	newToken, err := generateToken(claims)
	if err != nil {
		handleErrorResponse(w, http.StatusInternalServerError, "Failed to refresh token")
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"token": newToken})
}

func protectedHandler(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Access granted to protected resource",
	})
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"message": "Hello World"})
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

	// Invalidate the cached token after use
	cachedToken = ""

	response := map[string][]map[string]string{
		"my-application": {
			{
				"description": config.Metadata["description"].(string),
				"version":     fmt.Sprintf("%s-%s", config.Metadata["version"].(string), buildNumber),
				"sha":         config.SHA,
			},
		},
	}
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

	log.Printf("Server is running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
