import { Database, Q, Model } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import { synchronize } from '@nozbe/watermelondb/sync';

// Add at the top if not already present
const API_URL = 'Your_Api_url/api';

// --- SCHEMA ---
const schema = appSchema({
  version: 5,
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
  @field('cooking_time') cooking_time;
  @field('remote_id') remote_id;
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
  dbName: 'recipegenDB',
  migrations: undefined,
  onSetUpError: error => {
    console.error('Failed to set up database:', error);
  },
});

console.log('Initializing WatermelonDB with schema version:', schema.version);
console.log('Database tables:', ['tokens', 'users', 'recipes', 'app_state'].join(', '));

export const database = new Database({
  adapter,
  modelClasses: [Token, User, Recipe, AppState],
});

// Add database ready listener with simplified logging
database.withChangesForTables(['tokens']).subscribe(changes => {
  console.log('Database changes detected for tables:', 
    (changes || []).map(change => `${change.table} (${change.type})`).join(', ')
  );
});

// --- TOKEN UTILS ---

// Save JWT (replace any existing)
export async function saveJWT(jwt) {
  console.log('Saving JWT to DB:', jwt ? 'Token exists' : 'No token');
  await database.write(async () => {
    // Remove old tokens
    const allTokens = await database.get('tokens').query().fetch();
    console.log('Found existing tokens:', allTokens.length);
    for (const t of allTokens) await t.markAsDeleted();
    // Add new token
    await database.get('tokens').create(token => {
      token.jwt = jwt;
      token.createdAt = Date.now();
    });
    console.log('New token saved successfully');
  });
}

// Get JWT (returns string or null)
export async function getJWT() {
  const tokens = await database.get('tokens').query().fetch();
  console.log('Retrieved tokens from DB:', tokens.length);
  const token = tokens.length > 0 ? tokens[0].jwt : null;
  console.log('Returning token:', token ? 'Token exists' : 'No token');
  return token;
}

// Remove JWT
export async function clearJWT() {
  console.log('Clearing JWT from DB');
  await database.write(async () => {
    const tokens = await database.get('tokens').query().fetch();
    console.log('Found tokens to clear:', tokens.length);
    for (const t of tokens) await t.markAsDeleted();
    console.log('All tokens cleared');
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

let isSyncing = false;

export async function syncRecipes() {
  if (isSyncing) {
    console.log('Sync already in progress, skipping.');
    return;
  }
  isSyncing = true;
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
          let response;
          try {
            response = await fetch(`${API_URL}/recipes/sync/pull`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({ lastPulledAt }),
          });
          } catch (networkError) {
            console.error('Network error in pullChanges:', networkError);
            // Return empty changes and timestamp if network fails
            return { changes: { recipes: { created: [], updated: [], deleted: [] }, users: { created: [], updated: [], deleted: [] }, tokens: { created: [], updated: [], deleted: [] }, app_state: { created: [], updated: [], deleted: [] } }, timestamp: Date.now() };
          }
          
          if (!response.ok) {
            console.error('Failed to pull changes:', response.status);
            // Return empty changes and timestamp if server returns error
            return { changes: { recipes: { created: [], updated: [], deleted: [] }, users: { created: [], updated: [], deleted: [] }, tokens: { created: [], updated: [], deleted: [] }, app_state: { created: [], updated: [], deleted: [] } }, timestamp: Date.now() };
          }
          
          const data = await response.json();
          console.log('Pulled changes (raw):', data.changes, 'type:', typeof data.changes);
          // Defensive: if data.changes is not an object, use empty object
          const safeChanges = (data && typeof data.changes === 'object' && data.changes !== null) ? data.changes : {};
          // Transform to WatermelonDB sync format
          const toSyncTable = arr => ({ created: Array.isArray(arr) ? arr : [], updated: [], deleted: [] });
          const changes = {
            recipes: toSyncTable(safeChanges.recipes),
            users: toSyncTable(safeChanges.users),
            tokens: toSyncTable(safeChanges.tokens),
            app_state: toSyncTable(safeChanges.app_state)
          };
          // Safely process recipes (created only)
          changes.recipes.created = changes.recipes.created.map(recipe => ({
            id: String(recipe.ID || recipe.id || ''),
              title: recipe.title || '',
              description: recipe.description || '',
              ingredients: recipe.ingredients || '',
              steps: recipe.steps || '',
              cooking_time: recipe.cooking_time || '',
            remote_id: String(recipe.ID || recipe.id || '')
          })).filter(r => r.id && r.id !== '');
          // Log the final changes object
          console.log('Returning from pullChanges, final changes:', JSON.stringify(changes));
          // Runtime check: throw if any table is an array
          Object.entries(changes).forEach(([table, value]) => {
            if (Array.isArray(value)) {
              throw new Error(`Sync format error: changes.${table} is an array, not an object`);
            }
          });
          return {
            changes,
            timestamp: data.timestamp || Date.now()
          };
        } catch (error) {
          console.error('Error in pullChanges:', error);
          // Return empty changes and timestamp on any error
          return { changes: { recipes: { created: [], updated: [], deleted: [] }, users: { created: [], updated: [], deleted: [] }, tokens: { created: [], updated: [], deleted: [] }, app_state: { created: [], updated: [], deleted: [] } }, timestamp: Date.now() };
        }
      },
      pushChanges: async ({ changes, lastPulledAt }) => {
        try {
          // Flatten to arrays for your backend
          const flatten = table => [
            ...(changes[table]?.created || []),
            ...(changes[table]?.updated || []),
            ...(changes[table]?.deleted || [])
          ];
          const payload = {
            recipes: flatten('recipes'),
            users: flatten('users'),
            tokens: flatten('tokens'),
            app_state: flatten('app_state'),
            lastPulledAt,
            is_logout: false
          };
          const response = await fetch(`${API_URL}/recipes/sync/push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify(payload),
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
  } finally {
    isSyncing = false;
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