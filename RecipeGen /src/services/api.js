import axios from 'axios';
import { saveJWT, getJWT, clearJWT, saveUser, clearUser, database } from '../database';
import { Q } from '@nozbe/watermelondb';

const API_URL = 'Your_Api_url/api'; // Use /api for all endpoints

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  async config => {
    const token = await getJWT();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// AUTH
export const signup = async (name, email, password) => {
  const response = await api.post('/register', { name, email, password });
  await saveJWT(response.data.token);
  await saveUser(response.data.user.name, response.data.user.email);
  return response.data;
};

export const login = async (email, password) => {
  const response = await api.post('/login', { email, password });
  await saveJWT(response.data.token);
  await saveUser(response.data.user.name, response.data.user.email);
  await syncRecipesFromBackend(); // Sync recipes after login
  return response.data;
};

export const logout = async () => {
  await clearJWT();
  await clearUser();
};

// RECIPES
export const getRecipes = async () => {
  try {
    const response = await api.get('/recipes');
    console.log('API /recipes response:', response.data);
    // Debug: log recipes from WatermelonDB
    const localRecipes = await database.get('recipes').query().fetch();
    console.log('Fetched recipes from DB:', localRecipes);
    return response.data;
  } catch (err) {
    console.log('API /recipes error:', err);
    throw err;
  }
};

// Helper to save a recipe to WatermelonDB
export const saveRecipeToDB = async (r) => {
  console.log('Saving recipe to DB:', r); // Debug log
  const remoteId = r.id ? String(r.id) : (r.ID ? String(r.ID) : null);
  if (!remoteId) return;
  const existing = await database.get('recipes').query(Q.where('remote_id', remoteId)).fetch();
  if (existing.length > 0) {
    console.log('Recipe with remote_id', remoteId, 'already exists, skipping');
    return; // Already exists, skip
  }
  // Ensure ingredients and steps are always strings
  const safeIngredients = (typeof r.ingredients === 'string') ? r.ingredients : Array.isArray(r.ingredients) ? r.ingredients.join(', ') : '';
  const safeSteps = (typeof r.steps === 'string') ? r.steps : Array.isArray(r.steps) ? r.steps.join('\n') : '';
  await database.get('recipes').create(recipe => {
    recipe.title = r.title;
    recipe.description = r.description;
    recipe.ingredients = safeIngredients;
    recipe.steps = safeSteps;
    recipe.cooking_time = r.cooking_time || r.cookingTime || '';
    recipe.remote_id = remoteId;
  });
  console.log('Recipe saved to DB with remote_id:', remoteId);
};

export const createRecipe = async (recipeData) => {
  const response = await api.post('/recipes', recipeData);
  // Only sync from backend, do NOT save locally here
  await syncRecipesFromBackend();
  return response.data;
};

export const updateRecipe = async (id, recipeData) => {
  const response = await api.put(`/recipes/${id}`, recipeData);
  return response.data;
};

export const deleteRecipe = async (id) => {
  // Validate ID
  if (!id || id === 'undefined' || id === 'null') {
    console.error('Invalid recipe ID:', id);
    throw new Error('Invalid recipe ID');
  }

  // Ensure ID is a string
  const recipeId = String(id).trim();
  if (!recipeId || recipeId === 'undefined' || recipeId === 'null') {
    console.error('Invalid recipe ID after conversion:', recipeId);
    throw new Error('Invalid recipe ID');
  }

  try {
    const response = await api.delete(`/recipes/${recipeId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting recipe:', error);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    throw error;
  }
};

export const updateProfile = async (name) => {
  const response = await api.put('/profile', { name });
  await saveUser(response.data.name, null); // Keep existing email
  return response.data;
};

export const generateRecipes = async (ingredients) => {
  const response = await api.post('/generate-recipes', { ingredients });
  return response.data.recipes;
};

export const generateRecipeProcess = async (recipeName) => {
  const response = await api.post('/generate-recipe-process', { recipe_name: recipeName });
  return response.data;
};

// Sync recipes from backend to WatermelonDB
export const syncRecipesFromBackend = async () => {
  const recipes = await getRecipes(); // Fetch from backend
  console.log('syncRecipesFromBackend: recipes from backend:', recipes);
  await database.write(async () => {
    // First, get all existing recipes
    const existingRecipes = await database.get('recipes').query().fetch();
    console.log('Existing recipes before sync:', existingRecipes.map(r => ({
      id: r.id, 
      remote_id: r.remote_id, 
      title: r.title
    })));
    
    // Create a map of remote IDs we're about to sync
    const remoteIds = new Set((recipes || []).map(r => String(r.id || r.ID || '')));
    
    // Delete ALL existing recipes that have remote_ids (they'll be re-added with fresh data)
    for (const r of existingRecipes) {
      if (r.remote_id && remoteIds.has(String(r.remote_id))) {
        console.log('Deleting existing recipe with remote_id:', r.remote_id, 'title:', r.title);
        await r.markAsDeleted();
      }
    }
    
    // Delete any local recipes with the same title as remote recipes to avoid duplicates
    const remoteTitles = new Set((recipes || []).map(r => r.title));
    const localRecipes = await database.get('recipes').query(Q.where('remote_id', null)).fetch();
    
    for (const r of localRecipes) {
      if (remoteTitles.has(r.title)) {
        console.log('Deleting local duplicate of remote recipe:', r.title);
        await r.markAsDeleted();
      }
    }
    
    // Add backend recipes
    for (const r of recipes || []) {
      await saveRecipeToDB(r);
    }
    
    const afterSync = await database.get('recipes').query().fetch();
    console.log('syncRecipesFromBackend: recipes in local DB after sync:', afterSync.map(r => ({
      id: r.id, 
      remote_id: r.remote_id, 
      title: r.title
    })));
  });
};

export const deleteRecipeFromBackend = async (remoteId, jwt) => {
  await fetch(`Your_Api_url/api/recipes/${remoteId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    }
  });
}; 

api.interceptors.response.use(
  response => response,
  error => {
    console.log('AXIOS ERROR:', error.toJSON ? error.toJSON() : error);
    return Promise.reject(error);
  }
); 