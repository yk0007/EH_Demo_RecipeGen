import { Database, Q, Model } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import { synchronize } from '@nozbe/watermelondb/sync';

// --- SCHEMA ---
const schema = appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: 'tokens',
      columns: [
        { name: 'jwt', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'users',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'recipes',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'ingredients', type: 'string' },
        { name: 'steps', type: 'string' },
        { name: 'cooking_time', type: 'string' },
        { name: 'remote_id', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'app_state',
      columns: [
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});

// --- MODELS ---
export class Token extends Model {
  static table = 'tokens';
  @field('jwt') jwt;
  @field('created_at') createdAt;
}

export class User extends Model {
  static table = 'users';
  @field('name') name;
  @field('email') email;
  @field('created_at') createdAt;
}

export class Recipe extends Model {
  static table = 'recipes';
  @field('title') title;
  @field('description') description;
  @field('ingredients') ingredients;
  @field('steps') steps;
  @field('cooking_time') cookingTime;
  @field('remote_id') remoteId;
}

export class AppState extends Model {
  static table = 'app_state';
  @field('key') key;
  @field('value') value;
  @field('created_at') createdAt;
}

// --- DB SETUP ---
const adapter = new SQLiteAdapter({
  schema,
  // Optional database name
  dbName: 'recipegenDB',
  // Optional migrations
  migrations: undefined,
  // Optional logging
  onSetUpError: error => {
    console.error('Failed to set up database:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Token, User, Recipe, AppState],
});

// --- TOKEN UTILS ---

// Save JWT (replace any existing)
export async function saveJWT(jwt) {
  await database.write(async () => {
    // Remove old tokens
    const allTokens = await database.get('tokens').query().fetch();
    for (const t of allTokens) await t.markAsDeleted();
    // Add new token
    await database.get('tokens').create(token => {
      token.jwt = jwt;
      token.createdAt = Date.now();
    });
  });
}

// Get JWT (returns string or null)
export async function getJWT() {
  const tokens = await database.get('tokens').query().fetch();
  return tokens.length > 0 ? tokens[0].jwt : null;
}

// Remove JWT
export async function clearJWT() {
  await database.write(async () => {
    const tokens = await database.get('tokens').query().fetch();
    for (const t of tokens) await t.markAsDeleted();
  });
}

// --- USER UTILS ---
export async function saveUser(name, email) {
  await database.write(async () => {
    // Remove old users
    const allUsers = await database.get('users').query().fetch();
    for (const u of allUsers) await u.markAsDeleted();
    // Add new user
    await database.get('users').create(user => {
      user.name = name;
      user.email = email;
      user.createdAt = Date.now();
    });
  });
}

export async function getUser() {
  const users = await database.get('users').query().fetch();
  return users.length > 0 ? users[0] : null;
}

export async function clearUser() {
  await database.write(async () => {
    const users = await database.get('users').query().fetch();
    for (const u of users) await u.markAsDeleted();
  });
}

export async function syncRecipes() {
  try {
    const jwt = await getJWT();
    if (!jwt) {
      console.log('No JWT found, skipping sync.');
      return;
    }
    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt }) => {
        try {
          const response = await fetch('http://10.0.2.2:8080/api/recipes/sync/pull', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({ lastPulledAt }),
          });
          
          if (!response.ok) {
            console.error('Failed to pull changes:', response.status);
            throw new Error('Failed to pull changes');
          }
          
          const data = await response.json();
          console.log('Pulled changes:', data.changes);
          
          // Defensive: guarantee all keys are arrays
          const recipesArr = Array.isArray(data.changes && data.changes.recipes) ? data.changes.recipes : [];
          const usersArr = Array.isArray(data.changes && data.changes.users) ? data.changes.users : [];
          const tokensArr = Array.isArray(data.changes && data.changes.tokens) ? data.changes.tokens : [];
          const appStateArr = Array.isArray(data.changes && data.changes.app_state) ? data.changes.app_state : [];

          // Only include schema fields for recipes, robustly handle id/ID
          const recipes = recipesArr.map(recipe => {
            const backendId = recipe.id || recipe.ID;
            return {
              id: backendId ? String(backendId) : '', // must be a non-empty string
              title: recipe.title || '',
              description: recipe.description || '',
              ingredients: recipe.ingredients || '',
              steps: recipe.steps || '',
              cooking_time: recipe.cooking_time || '',
              remote_id: backendId ? String(backendId) : ''
            };
          }).filter(r => r.id); // filter out any with empty id

          const changes = {
            recipes,
            users: usersArr,
            tokens: tokensArr,
            app_state: appStateArr
          };

          // Log the types and lengths for debugging
          Object.keys(changes).forEach(key => {
            console.log(
              key,
              'isArray:', Array.isArray(changes[key]),
              'type:', typeof changes[key],
              'length:', Array.isArray(changes[key]) ? changes[key].length : 'N/A',
              'value:', changes[key]
            );
          });

          console.log('Returning from pullChanges:', { changes, timestamp: data.timestamp || Date.now() });
          
          return {
            changes,
            timestamp: data.timestamp || Date.now()
          };
        } catch (error) {
          console.error('Error in pullChanges:', error);
          throw error;
        }
      },
      pushChanges: async ({ changes, lastPulledAt }) => {
        try {
          const response = await fetch('http://10.0.2.2:8080/api/recipes/sync/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({ 
              changes,
              lastPulledAt,
              is_logout: false
            }),
          });
          
          if (!response.ok) {
            console.error('Failed to push changes:', response.status);
            throw new Error('Failed to push changes');
          }
          
          console.log('Successfully pushed changes');
        } catch (error) {
          console.error('Error in pushChanges:', error);
          throw error;
        }
      },
      log: (message, level) => {
        if (level === 'error') {
          console.error('Sync error:', message);
        } else {
          console.log('Sync:', message);
        }
      }
    });
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}

// --- APP STATE UTILS ---
export async function setAppState(key, value) {
  await database.write(async () => {
    // Remove old state with same key
    const oldStates = await database.get('app_state').query(Q.where('key', key)).fetch();
    for (const s of oldStates) await s.markAsDeleted();
    // Add new state
    await database.get('app_state').create(state => {
      state.key = key;
      state.value = value;
      state.createdAt = Date.now();
    });
  });
}

export async function getAppState(key) {
  const states = await database.get('app_state').query(Q.where('key', key)).fetch();
  return states.length > 0 ? states[0].value : null;
}

export async function clearAppState(key) {
  await database.write(async () => {
    const states = await database.get('app_state').query(Q.where('key', key)).fetch();
    for (const s of states) await s.markAsDeleted();
  });
} 