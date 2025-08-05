# RecipeGen

RecipeGen is a recipe management app built with React Native, WatermelonDB for offline/local storage, and a Go/Postgres backend for cloud sync and user authentication.

## Features
- Generate and save recipes using AI (Gemini API)
- View, edit, and delete your saved recipes
- Offline-first with WatermelonDB, syncs to backend when online
- User authentication (JWT)
- Hard delete support (recipes are truly removed from backend)
- Modern, consistent blue-themed UI

---

## Tech Stack
- **Frontend:** React Native, WatermelonDB
- **Backend:** Go (Echo), Postgres
- **AI:** Gemini API (for recipe generation)

---

## Getting Started

### Prerequisites
- Node.js (18+ recommended)
- npm or yarn
- Go (1.18+)
- Postgres
- Android Studio/Xcode for mobile development

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd Example/RecipeGen
```

### 2. Install Frontend Dependencies
```bash
npm install
# or
yarn install
```

### 3. Install Backend Dependencies
```bash
cd ../backend
# Set up your Go environment if needed
go mod tidy
```

### 4. Set Up Environment Variables

#### Frontend (`.env` or directly in code)
- Update API URLs in `src/services/api.js` if needed (default: `http://10.0.2.2:8080/api` for Android emulator)

#### Backend (`backend/.env`)
```
DB_HOST=localhost
DB_USER=youruser
DB_PASSWORD=yourpassword
DB_NAME=recipedb
DB_PORT=5432
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
```

### 5. Run the Backend
```bash
cd backend
go run server.go
```

### 6. Run the Frontend (React Native)
```bash
cd ../RecipeGen
npx react-native run-android # or run-ios
```

---

## Usage
- **Sign up or log in** to your account.
- **Add ingredients** and generate recipes using AI.
- **Save recipes** to your account (synced to backend).
- **View, edit, and delete** your saved recipes.
- **All changes sync** between devices when logged in.

---


### Emulator/Device Networking
- Use `10.0.2.2` for Android emulator to access your local backend.
- Use your machine's IP for real devices.

---

## Project Structure
```
RecipeGen/
  src/
    screens/         # All React Native screens
    services/        # API and sync logic
    database/        # WatermelonDB setup
  backend/
    server.go        # Go backend
    ...
```

---

## License
MIT
