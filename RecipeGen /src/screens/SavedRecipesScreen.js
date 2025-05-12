import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { database, Recipe, getAppState, clearAppState } from '../database';
import { deleteRecipe, syncRecipesFromBackend } from '../services/api';

const clearAllRecipes = async () => {
  await database.write(async () => {
    const allRecipes = await database.get('recipes').query().fetch();
    for (const r of allRecipes) await r.markAsDeleted();
  });
  // Optionally, refresh the list
  // fetchRecipes();
};

const isValidRemoteId = (remoteId) => {
  if (!remoteId) return false;
  if (typeof remoteId === 'number') return Number.isInteger(remoteId) && remoteId > 0;
  if (typeof remoteId === 'string') {
    if (
      remoteId === 'undefined' ||
      remoteId.trim() === '' ||
      remoteId.trim().toLowerCase() === 'undefined'
    ) return false;
    const n = Number(remoteId);
    return n > 0 && Number.isInteger(n);
  }
  return false;
};

const SavedRecipesScreen = () => {
  const navigation = useNavigation();
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchRecipes = async () => {
    setLoading(true);
    try {
      const recipes = await database.get('recipes').query().fetch();
      console.log('Fetched recipes from DB (raw):', recipes);
      setSavedRecipes(recipes);
    } catch (err) {
      console.error('Error fetching recipes:', err);
      setSavedRecipes([]);
    }
    setLoading(false);
  };

  const checkRefreshFlag = async () => {
    try {
      const shouldRefresh = await getAppState('shouldRefreshRecipes');
      if (shouldRefresh === 'true') {
        await clearAppState('shouldRefreshRecipes');
        fetchRecipes();
      }
    } catch (err) {
      console.error('Error checking refresh flag:', err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      checkRefreshFlag();
    }, [])
  );

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleDelete = async (id, remoteId) => {
    if (!id) {
      console.error('Invalid local recipe ID');
      Alert.alert('Error', 'Invalid recipe ID');
      return;
    }

    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            let backendDeleteError = false;
            try {
              // Delete from backend if remoteId exists and is valid
              if (isValidRemoteId(remoteId)) {
                try {
                  console.log('Attempting to delete from backend. remoteId:', remoteId);
                  await deleteRecipe(remoteId);
                  console.log('Successfully deleted from backend:', remoteId);
                } catch (error) {
                  backendDeleteError = true;
                  console.error('Error deleting from backend:', error);
                  // Continue with local deletion even if backend delete fails
                }
              } else {
                console.log('Skipping backend delete, invalid remoteId:', remoteId);
              }

              // Always delete from WatermelonDB
              try {
                await database.write(async () => {
                  const recipe = await database.get('recipes').find(id);
                  if (recipe) {
                    await recipe.markAsDeleted();
                    console.log('Successfully deleted from local DB:', id);
                  } else {
                    console.log('Recipe not found in local DB:', id);
                  }
                });
              } catch (error) {
                console.error('Error deleting from local DB:', error);
                throw error; // Re-throw to show error to user
              }

              // Update UI immediately
              setSavedRecipes(recipes => recipes.filter(r => r.id !== id));

              // Sync from backend to ensure local DB matches
              try {
                await syncRecipesFromBackend();
                console.log('Successfully synced after delete');
              } catch (error) {
                console.error('Error syncing after delete:', error);
                // Continue even if sync fails
              }

              if (backendDeleteError) {
                Alert.alert('Warning', 'Recipe deleted locally, but failed to delete from server.');
              }
            } catch (err) {
              console.error('Error in delete process:', err);
              Alert.alert('Error', 'Failed to delete recipe. Please try again.');
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Saved Recipes</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>
      ) : savedRecipes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No saved recipes yet.</Text>
        </View>
      ) : (
        <FlatList
          data={deduplicateRecipes(savedRecipes.filter(r => r && r.title))}
          keyExtractor={item => (item.id ? item.id.toString() : Math.random().toString())}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            console.log('Rendering recipe:', item.title, 'cooking_time:', item.cooking_time, 'id:', item.id, 'remote_id:', item.remote_id);
            return (
              <View style={styles.recipeCard}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id, item.remote_id)}
                  disabled={deleting}
                >
                  <Icon name="trash" size={22} color="#ff3b30" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{flex: 1}}
                  onPress={() => {
                    // Extract only serializable properties to prevent navigation warning
                    const serializedRecipe = {
                      id: item.id,
                      title: item.title,
                      description: item.description,
                      ingredients: item.ingredients,
                      steps: item.steps,
                      cooking_time: item.cooking_time,
                      remote_id: item.remote_id
                    };
                    
                    navigation.navigate('RecipeProcess', { 
                      recipe: serializedRecipe, 
                      recipeName: item.title || 'Recipe' 
                    });
                  }}
                >
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeTitle}>{item.title}</Text>
                    <Text style={styles.recipeDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <View style={styles.recipeMeta}>
                      <Text style={styles.recipeTime}>
                        {item.cooking_time || 'Time not specified'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

// Helper to deduplicate recipes by remote_id or id
function deduplicateRecipes(recipes) {
  // First, group recipes by title
  const recipesByTitle = {};
  recipes.forEach(recipe => {
    if (!recipe.title) return;
    if (!recipesByTitle[recipe.title]) {
      recipesByTitle[recipe.title] = [];
    }
    recipesByTitle[recipe.title].push(recipe);
  });

  // For each title group, prioritize the recipe with a remote_id
  const dedupedRecipes = Object.values(recipesByTitle).map(group => {
    // Sort by whether they have a remote_id (remote_id first)
    group.sort((a, b) => {
      if (a.remote_id && !b.remote_id) return -1;
      if (!a.remote_id && b.remote_id) return 1;
      return 0;
    });
    // Return the first item (prioritizing remote_id)
    return group[0];
  });

  console.log('Deduplicated recipes:', dedupedRecipes.map(r => ({
    id: r.id, 
    remote_id: r.remote_id, 
    title: r.title
  })));
  
  return dedupedRecipes;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
    paddingHorizontal: 18,
  },
  backBtn: { marginRight: 12, position: 'relative', top: 2, zIndex: 10 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007AFF',
    textAlign: 'left',
    letterSpacing: 0.5,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 16 },
  list: { 
    padding: 16,
  },
  recipeCard: {
    width: '100%',
    backgroundColor: '#f4f8ff',
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0eaff',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
    minHeight: 160,
  },
  recipeInfo: {
    padding: 20,
  },
  recipeTitle: {
    fontSize: 20,
    color: '#222',
    fontWeight: 'bold',
    marginBottom: 10,
    lineHeight: 26,
  },
  recipeDescription: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  recipeTime: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  deleteBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 8,
    borderRadius: 12,
  },
  cookingTimeLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 10,
  },
  cookingTime: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  section: {
    marginBottom: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#222',
    marginBottom: 4,
  },
  recipeCookingTime: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 6,
  },
});

export default SavedRecipesScreen; 