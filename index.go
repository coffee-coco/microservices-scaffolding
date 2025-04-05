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

	"github.com/golang-jwt/jwt/v4"
)

// Constants
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const JWT_SECRET_KEY = "SECRET_TOKEN"

// In-memory configuration cache to store application metadata and git SHA.
var configCache = struct {
	metadata    map[string]interface{}
	sha         string
	lastUpdated int64
	mu          sync.Mutex
}{
	metadata:    nil,
	sha:         "",
	lastUpdated: 0,
}

// Utility function to retrieve the latest git commit SHA.
func getGitSha() (string, error) {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// Utility function to handle error responses in the API.
func handleErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	fmt.Println(message)
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// Asynchronously loads application configuration with intelligent caching.
func loadConfiguration() (map[string]interface{}, string, error) {
	currentTimestamp := time.Now().UnixMilli()

	configCache.mu.Lock()
	defer configCache.mu.Unlock()

	if configCache.metadata != nil && (currentTimestamp-configCache.lastUpdated) < CACHE_DURATION_MS {
		return configCache.metadata, configCache.sha, nil
	}

	// Load metadata
	metadataContent, err := ioutil.ReadFile("./metadata.json")
	if err != nil {
		fmt.Println("Configuration loading failed:", err)
		return nil, "", errors.New("failed to load configuration")
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(metadataContent, &metadata); err != nil {
		fmt.Println("Configuration loading failed:", err)
		return nil, "", errors.New("failed to load configuration")
	}

	// Get Git SHA
	sha, err := getGitSha()
	if err != nil {
		fmt.Println("Configuration loading failed:", err)
		return nil, "", errors.New("failed to load configuration")
	}

	// Update cache
	configCache.metadata = metadata
	configCache.sha = sha
	configCache.lastUpdated = currentTimestamp

	return metadata, sha, nil
}

// Middleware to authenticate requests using JSON Web Token (JWT).
func authenticateToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		tokenString := ""

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}

		if tokenString == "" {
			handleErrorResponse(w, http.StatusUnauthorized, "Unauthorized: Missing token")
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(JWT_SECRET_KEY), nil
		})

		if err != nil || !token.Valid {
			handleErrorResponse(w, http.StatusForbidden, "Forbidden: Invalid token")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Hello World"})
	})

	http.Handle("/status", authenticateToken(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metadata, sha, err := loadConfiguration()
		if err != nil {
			handleErrorResponse(w, http.StatusInternalServerError, "Internal Server Error")
			return
		}

		buildNumber := os.Getenv("BUILD_NUMBER")
		if buildNumber == "" {
			buildNumber = "0"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"my-application": []map[string]interface{}{
				{
					"description": metadata["description"],
					"version":     fmt.Sprintf("%s-%s", metadata["version"], buildNumber),
					"sha":         sha,
				},
			},
		})
	})))

	fmt.Printf("Server is running on port %s\n", port)
	http.ListenAndServe(fmt.Sprintf(":%s", port), nil)
}