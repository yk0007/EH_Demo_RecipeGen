package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	echojwt "github.com/labstack/echo-jwt/v4"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email    string   `gorm:"uniqueIndex;not null" json:"email"`
	Password string   `gorm:"not null" json:"password"`
	Name     string   `json:"name"`
	Recipes  []Recipe `json:"recipes,omitempty"`
}

type Recipe struct {
	gorm.Model
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Ingredients string    `json:"ingredients"`
	Steps       string    `json:"steps"`
	CookingTime string    `json:"cooking_time"`
	ImageURL    string    `json:"image_url"`
	UserID      uint      `json:"user_id"`
	User        User      `json:"user,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type RecipeChange struct {
	ID          uint      `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Ingredients string    `json:"ingredients"`
	Steps       string    `json:"steps"`
	CookingTime string    `json:"cooking_time"`
	RemoteID    string    `json:"remote_id"`
	UpdatedAt   time.Time `json:"updated_at"`
	SyncStatus  string    `json:"sync_status"` // 'created', 'updated', 'deleted'
	UserID      uint      `json:"user_id"`
}

type Changes struct {
	Recipes  []Recipe      `json:"recipes"`
	Users    []interface{} `json:"users"`
	Tokens   []interface{} `json:"tokens"`
	AppState []interface{} `json:"app_state"`
}

var db *gorm.DB

func initDB() {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)
	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	db.AutoMigrate(&User{}, &Recipe{})
}

func register(c echo.Context) error {
	user := new(User)
	if err := c.Bind(user); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if user.Password == "" || user.Email == "" || user.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "All fields are required")
	}
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error hashing password")
	}
	user.Password = string(hashedPassword)
	if err := db.Create(user).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate key value") {
			return echo.NewHTTPError(http.StatusBadRequest, "Email already registered")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "Error creating user")
	}

	claims := jwt.MapClaims{
		"id":    user.ID,
		"email": user.Email,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	t, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error generating token")
	}
	return c.JSON(http.StatusCreated, echo.Map{
		"token": t,
		"user":  user,
	})
}

func login(c echo.Context) error {
	u := new(User)
	if err := c.Bind(u); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	user := new(User)
	if err := db.Where("email = ?", u.Email).First(user).Error; err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Invalid credentials")
	}
	if u.Password == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "Invalid credentials")
	}
	err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(u.Password))
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Invalid credentials")
	}

	claims := jwt.MapClaims{
		"id":    user.ID,
		"email": user.Email,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	t, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error generating token")
	}
	return c.JSON(http.StatusOK, echo.Map{
		"token": t,
		"user":  user,
	})
}

func getRecipes(c echo.Context) error {
	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	var recipes []Recipe
	if err := db.Where("user_id = ? AND deleted_at IS NULL", userID).Find(&recipes).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error fetching recipes")
	}
	return c.JSON(http.StatusOK, recipes)
}

func createRecipe(c echo.Context) error {
	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	recipe := new(Recipe)
	if err := c.Bind(recipe); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	recipe.UserID = userID
	if err := db.Create(recipe).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error creating recipe")
	}
	return c.JSON(http.StatusCreated, recipe)
}

func getRecipe(c echo.Context) error {
	id := c.Param("id")
	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	var recipe Recipe
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&recipe).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "Recipe not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "Error fetching recipe")
	}
	return c.JSON(http.StatusOK, recipe)
}

func updateRecipe(c echo.Context) error {
	id := c.Param("id")
	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	recipe := new(Recipe)
	if err := c.Bind(recipe); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	result := db.Model(&Recipe{}).Where("id = ? AND user_id = ?", id, userID).Updates(recipe)
	if result.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error updating recipe")
	}
	if result.RowsAffected == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "Recipe not found")
	}
	return c.JSON(http.StatusOK, recipe)
}

func deleteRecipe(c echo.Context) error {
	id := c.Param("id")
	// Validate ID is a valid integer
	recipeID, err := strconv.ParseUint(id, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid recipe ID")
	}

	// Hard delete: permanently remove from DB
	var recipe Recipe
	recipe.ID = uint(recipeID)
	if err := db.Unscoped().Delete(&recipe).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error deleting recipe")
	}
	return c.NoContent(http.StatusNoContent)
}

func updateProfile(c echo.Context) error {
	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Name is required")
	}
	if err := db.Model(&User{}).Where("id = ?", userID).Update("name", req.Name).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Error updating name")
	}
	return c.JSON(http.StatusOK, echo.Map{"name": req.Name})
}

func generateRecipes(c echo.Context) error {
	var req struct {
		Ingredients []string `json:"ingredients"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return echo.NewHTTPError(http.StatusInternalServerError, "Gemini API key not set")
	}

	// Prepare Gemini API request
	geminiURL := "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=" + apiKey
	prompt := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]interface{}{
				{"text": fmt.Sprintf(`
What are the names of recipes that can be made using some or all of these ingredients? Given the following list of ingredients: %s, provide the recipe names and a short description (approximately 1-2 sentences) for each.  Return the results in JSON format, using the structure shown in the example below:

[
  {
    "recipe_name": "Recipe Name 1",
    "description": "Description of Recipe 1, including key characteristics, flavor profile, and main ingredients."
  },
  {
    "recipe_name": "Recipe Name 2",
    "description": "Description of Recipe 2, including key characteristics, flavor profile, and main ingredients."
  }
]`, strings.Join(req.Ingredients, ", "))},
			}},
		},
	}
	body, _ := json.Marshal(prompt)
	resp, err := http.Post(geminiURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to call Gemini API")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var geminiResp map[string]interface{}
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to parse Gemini response")
	}

	// Extract and parse the recipe JSON from Gemini response
	var recipes []map[string]string
	if candidates, ok := geminiResp["candidates"].([]interface{}); ok && len(candidates) > 0 {
		if candMap, ok := candidates[0].(map[string]interface{}); ok {
			if content, ok := candMap["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
					if partMap, ok := parts[0].(map[string]interface{}); ok {
						if text, ok := partMap["text"].(string); ok {
							// Find the JSON array in the response
							startIdx := strings.Index(text, "[")
							endIdx := strings.LastIndex(text, "]") + 1
							if startIdx != -1 && endIdx != -1 {
								jsonStr := text[startIdx:endIdx]
								if err := json.Unmarshal([]byte(jsonStr), &recipes); err != nil {
									return echo.NewHTTPError(http.StatusInternalServerError, "Failed to parse recipe JSON")
								}
							}
						}
					}
				}
			}
		}
	}

	// Always return an array, never null
	if recipes == nil {
		recipes = []map[string]string{}
	}
	return c.JSON(http.StatusOK, echo.Map{"recipes": recipes})
}

func generateRecipeProcess(c echo.Context) error {
	var req struct {
		RecipeName string `json:"recipe_name"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return echo.NewHTTPError(http.StatusInternalServerError, "Gemini API key not set")
	}

	// Prepare Gemini API request
	geminiURL := "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=" + apiKey
	prompt := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]interface{}{
				{"text": fmt.Sprintf(`Provide the detailed recipe for %s. Include the following sections:

**Ingredients:** (A bulleted list of all necessary ingredients with quantities)

**Steps:** (A numbered list of sequential instructions for preparing the recipe)

**Description:** (Description of Recipe 1, including key characteristics, flavor profile, and main ingredients.)

**Cooking Time:** (The estimated total time required to prepare and cook the recipe, e.g., "30 minutes", "1 hour 15 minutes")

Return the response in JSON format with the following structure:
{
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "steps": ["step 1", "step 2", ...],
  "description": "Description of Recipe 1, including key characteristics, flavor profile, and main ingredients.",
  "cooking_time": "total cooking time"
}`, req.RecipeName)},
			}},
		},
	}
	body, _ := json.Marshal(prompt)
	resp, err := http.Post(geminiURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to call Gemini API")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var geminiResp map[string]interface{}
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to parse Gemini response")
	}

	// Extract and parse the recipe JSON from Gemini response
	var recipeProcess map[string]interface{}
	if candidates, ok := geminiResp["candidates"].([]interface{}); ok && len(candidates) > 0 {
		if candMap, ok := candidates[0].(map[string]interface{}); ok {
			if content, ok := candMap["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
					if partMap, ok := parts[0].(map[string]interface{}); ok {
						if text, ok := partMap["text"].(string); ok {
							// Find the JSON object in the response
							startIdx := strings.Index(text, "{")
							endIdx := strings.LastIndex(text, "}") + 1
							if startIdx != -1 && endIdx != -1 {
								jsonStr := text[startIdx:endIdx]
								if err := json.Unmarshal([]byte(jsonStr), &recipeProcess); err != nil {
									return echo.NewHTTPError(http.StatusInternalServerError, "Failed to parse recipe process JSON")
								}
							}
						}
					}
				}
			}
		}
	}

	// Always return an object, never null
	if recipeProcess == nil {
		recipeProcess = map[string]interface{}{
			"ingredients":  []string{},
			"steps":        []string{},
			"description":  "",
			"cooking_time": "",
		}
	}
	return c.JSON(http.StatusOK, recipeProcess)
}

// PULL endpoint: send all changes since lastPulledAt
func syncPullRecipes(c echo.Context) error {
	var req struct {
		LastPulledAt int64 `json:"lastPulledAt"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(400, err.Error())
	}

	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	var recipes []Recipe
	since := time.UnixMilli(req.LastPulledAt)
	if err := db.Where("updated_at > ? AND user_id = ? AND deleted_at IS NULL", since, userID).Find(&recipes).Error; err != nil {
		return echo.NewHTTPError(500, err.Error())
	}

	response := map[string]interface{}{
		"changes": Changes{
			Recipes:  recipes,
			Users:    []interface{}{},
			Tokens:   []interface{}{},
			AppState: []interface{}{},
		},
		"timestamp": time.Now().UnixMilli(),
	}
	jsonBytes, _ := json.MarshalIndent(response, "", "  ")
	fmt.Println("Sync /pull response:", string(jsonBytes))

	return c.JSON(200, response)
}

// PUSH endpoint: receive new/updated/deleted recipes from client
func syncPushRecipes(c echo.Context) error {
	var req struct {
		Changes      map[string][]RecipeChange `json:"changes"`
		LastPulledAt int64                     `json:"lastPulledAt"`
		IsLogout     bool                      `json:"is_logout"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(400, err.Error())
	}

	// Get the user ID from the JWT token
	token := c.Get("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	userID := uint(claims["id"].(float64))

	// If this is a logout request, soft delete all recipes for this user
	if req.IsLogout {
		if err := db.Model(&Recipe{}).
			Where("user_id = ? AND deleted_at IS NULL", userID).
			Update("deleted_at", time.Now()).Error; err != nil {
			return echo.NewHTTPError(500, "Error clearing user recipes")
		}
		return c.NoContent(204)
	}

	// Handle normal sync operations
	for _, recipe := range req.Changes["recipes"] {
		// Ensure the recipe belongs to the current user
		recipe.UserID = userID
		switch recipe.SyncStatus {
		case "created":
			// Create new recipe
			newRecipe := Recipe{
				Title:       recipe.Title,
				Description: recipe.Description,
				Ingredients: recipe.Ingredients,
				Steps:       recipe.Steps,
				CookingTime: recipe.CookingTime,
				UserID:      userID,
			}
			if err := db.Create(&newRecipe).Error; err != nil {
				return echo.NewHTTPError(500, "Error creating recipe")
			}
		case "updated":
			// Update existing recipe
			if err := db.Model(&Recipe{}).
				Where("id = ? AND user_id = ? AND deleted_at IS NULL", recipe.ID, userID).
				Updates(map[string]interface{}{
					"title":        recipe.Title,
					"description":  recipe.Description,
					"ingredients":  recipe.Ingredients,
					"steps":        recipe.Steps,
					"cooking_time": recipe.CookingTime,
					"updated_at":   time.Now(),
				}).Error; err != nil {
				return echo.NewHTTPError(500, "Error updating recipe")
			}
		case "deleted":
			// Soft delete recipe
			if err := db.Model(&Recipe{}).
				Where("id = ? AND user_id = ? AND deleted_at IS NULL", recipe.ID, userID).
				Update("deleted_at", time.Now()).Error; err != nil {
				return echo.NewHTTPError(500, "Error deleting recipe")
			}
		}
	}
	return c.NoContent(204)
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables.")
	}
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())
	initDB()
	api := e.Group("/api")
	api.POST("/register", register)
	api.POST("/login", login)
	protected := api.Group("")
	protected.Use(echojwt.WithConfig(echojwt.Config{
		SigningKey: []byte(os.Getenv("JWT_SECRET")),
		NewClaimsFunc: func(c echo.Context) jwt.Claims {
			return jwt.MapClaims{}
		},
	}))
	protected.GET("/recipes", getRecipes)
	protected.POST("/recipes", createRecipe)
	protected.GET("/recipes/:id", getRecipe)
	protected.PUT("/recipes/:id", updateRecipe)
	protected.DELETE("/recipes/:id", deleteRecipe)
	protected.PUT("/profile", updateProfile)
	protected.POST("/generate-recipes", generateRecipes)
	protected.POST("/generate-recipe-process", generateRecipeProcess)
	protected.POST("/recipes/sync/pull", syncPullRecipes)
	protected.POST("/recipes/sync/push", syncPushRecipes)
	port := os.Getenv("PORT")
	if port == "" {
  	  port = "8080"
	}
	e.Logger.Fatal(e.Start(":" + port))
}
