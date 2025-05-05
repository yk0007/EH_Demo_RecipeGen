# Recipe App Backend

This is the backend server for the Recipe App, built with Echo framework, PostgreSQL, and JWT authentication.

## Prerequisites

- Go 1.16 or higher
- PostgreSQL
- Make sure PostgreSQL is running and accessible

## Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE recipe_app;
```

2. Set up environment variables:
```bash
export DB_HOST=localhost
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=recipe_app
export DB_PORT=5432
export JWT_SECRET=your-secret-key-here
```

3. Install dependencies:
```bash
go mod tidy
```

4. Run the server:
```bash
go run .
```

## API Endpoints

### Authentication
- POST /api/register - Register a new user
- POST /api/login - Login and get JWT token

### Recipes (Protected Routes)
- GET /api/recipes - Get all recipes for the authenticated user
- POST /api/recipes - Create a new recipe
- GET /api/recipes/:id - Get a specific recipe
- PUT /api/recipes/:id - Update a recipe
- DELETE /api/recipes/:id - Delete a recipe

## Request/Response Examples

### Register
```json
POST /api/register
{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
}
```

### Login
```json
POST /api/login
{
    "email": "user@example.com",
    "password": "password123"
}
```

### Create Recipe
```json
POST /api/recipes
{
    "title": "Pasta Carbonara",
    "description": "Classic Italian pasta dish",
    "ingredients": "Spaghetti, eggs, pancetta, parmesan",
    "steps": "1. Cook pasta\n2. Fry pancetta\n3. Mix eggs and cheese\n4. Combine all ingredients",
    "image_url": "https://example.com/carbonara.jpg"
}
``` 