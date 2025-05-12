import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { createRecipe, generateRecipeProcess, deleteRecipe, syncRecipesFromBackend } from '../services/api';
import { database, clearJWT, setAppState } from '../database';
import { Q } from '@nozbe/watermelondb';

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

const RecipeProcessScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { recipeName, recipe, description: routeDescription } = route.params || {};
  
  // Add debug logging for recipe params
  useEffect(() => {
    console.log('RecipeProcess params:', { 
      recipeName, 
      recipeId: recipe?.id,
      recipeTitle: recipe?.title,
      hasRecipe: !!recipe
    });
  }, [recipeName, recipe]);

  // Use recipe.title as fallback for recipeName
  const displayName = recipeName || recipe?.title || 'Recipe';
  
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recipeProcess, setRecipeProcess] = useState(null);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleAuthError = async () => {
    // Clear the expired token
    await clearJWT();
    // Navigate to login screen
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  useEffect(() => {
    // If recipe is provided (viewing saved), use its data; otherwise, generate
    if (recipe) {
      console.log('Loaded recipe from DB:', recipe);
      setRecipeProcess({
        description: recipe.description,
        ingredients: (typeof recipe.ingredients === 'string' && recipe.ingredients.trim() && recipe.ingredients !== 'null' && recipe.ingredients !== 'undefined')
          ? recipe.ingredients.split(',').map(i => i.trim()).filter(Boolean)
          : [],
        steps: (typeof recipe.steps === 'string' && recipe.steps.trim() && recipe.steps !== 'null' && recipe.steps !== 'undefined')
          ? recipe.steps.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
        cookingTime: recipe.cookingTime || recipe.cooking_time || '',
      });
      setLoading(false);
    } else {
      const fetchRecipeProcess = async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await generateRecipeProcess(recipeName);
          console.log('Generated recipe process:', data);
          setRecipeProcess({
            ...data,
            cookingTime: data.cookingTime || data.cooking_time || '',
          });
        } catch (err) {
          if (err.response && err.response.status === 401) {
            handleAuthError();
          } else {
            setError('Failed to generate recipe process. Please try again.');
            console.error('Error:', err);
          }
        }
        setLoading(false);
      };
      fetchRecipeProcess();
    }
  }, [recipeName, recipe]);

  const handleSave = async () => {
    if (saving) return; // Prevent double submit
    if (!recipeProcess) return;
    let description = routeDescription || recipeProcess?.description;
    if (!description && recipeProcess?.process) {
      description = recipeProcess.process;
    }
    const cooking_time = recipeProcess?.cookingTime || '';
    if (!displayName || !description) {
      Alert.alert('Error', 'Recipe name or description is missing.');
      setSaving(false);
      return;
    }
    setSaving(true);

    try {
      // Only save to backend, then sync
      const backendRecipe = await createRecipe({
        title: displayName,
        description,
        ingredients: recipeProcess.ingredients.join(', '),
        steps: recipeProcess.steps.join('\n'),
        cooking_time,
      });

      setSaved(true);
      await setAppState('shouldRefreshRecipes', 'true');
      Alert.alert('Recipe Saved', `${displayName} has been added to your saved recipes!`);
    } catch (err) {
      console.error('Failed to save recipe:', err);
      Alert.alert('Error', 'Failed to save recipe.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    let backendDeleteError = false;
    try {
      console.log('Starting deletion process for recipe:', {
        id: recipe.id,
        remote_id: recipe.remote_id,
        title: recipe.title
      });
      
      // Delete from backend if remoteId is valid
      if (isValidRemoteId(recipe.remote_id)) {
        try {
          console.log('Attempting to delete recipe from backend with remote_id:', recipe.remote_id);
          await deleteRecipe(recipe.remote_id);
          console.log('Successfully deleted from backend:', recipe.remote_id);
        } catch (error) {
          backendDeleteError = true;
          console.error('Error deleting from backend:', error);
          // Continue with local deletion even if backend delete fails
        }
      } else {
        console.log('Skipping backend delete, invalid remoteId:', recipe.remote_id);
      }
      
      // Always delete from WatermelonDB
      try {
        console.log('Attempting to delete recipe from local database with id:', recipe.id);
        await database.write(async () => {
          try {
            const dbRecipe = await database.get('recipes').find(recipe.id);
            if (dbRecipe) {
              await dbRecipe.markAsDeleted();
              console.log('Successfully deleted from local DB:', recipe.id);
            } else {
              console.log('Recipe not found by ID in local DB, trying to find by title:', recipe.title);
              // Try to find by title as fallback
              const recipesByTitle = await database.get('recipes')
                .query(Q.where('title', recipe.title))
                .fetch();
              
              if (recipesByTitle.length > 0) {
                for (const r of recipesByTitle) {
                  await r.markAsDeleted();
                  console.log('Deleted recipe by title match:', r.id, r.title);
                }
              } else {
                console.log('No recipes found with title:', recipe.title);
              }
            }
          } catch (findError) {
            console.error('Error finding recipe in database:', findError);
            throw findError;
          }
        });
      } catch (dbError) {
        console.error('Error deleting from local database:', dbError);
        throw dbError; // Re-throw to be caught by the outer try/catch
      }
      
      await setAppState('shouldRefreshRecipes', 'true');
      
      // Sync from backend to ensure local DB matches
      try {
        console.log('Attempting to sync recipes after deletion');
        await syncRecipesFromBackend();
        console.log('Successfully synced after delete');
      } catch (syncError) {
        console.error('Error syncing after delete:', syncError);
        // Continue even if sync fails
      }
      
      if (backendDeleteError) {
        Alert.alert('Warning', 'Recipe deleted locally, but failed to delete from server.');
      } else {
        console.log('Recipe deletion process completed successfully');
      }
      
      navigation.goBack();
    } catch (err) {
      console.error('Fatal error in delete process:', err);
      Alert.alert('Error', 'Failed to delete recipe. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    await clearJWT();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const handleSaveRecipe = async () => {
    try {
      await setAppState('shouldRefreshRecipes', 'true');
      navigation.navigate('Home');
    } catch (error) {
      console.error('Error saving recipe:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={26} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.title}>{displayName}</Text>
          </View>
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Generating recipe process...</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={26} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.title}>{displayName}</Text>
          </View>
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Defensive: always use arrays for ingredients and steps
  const safeIngredients = Array.isArray(recipeProcess?.ingredients)
    ? recipeProcess.ingredients
    : typeof recipeProcess?.ingredients === 'string'
      ? recipeProcess.ingredients.split(',').map(i => i.trim()).filter(Boolean)
      : [];

  const safeSteps = Array.isArray(recipeProcess?.steps)
    ? recipeProcess.steps
    : typeof recipeProcess?.steps === 'string'
      ? recipeProcess.steps.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={26} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.title}>{displayName}</Text>
        </View>
        
        {recipeProcess?.cookingTime && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cooking Time</Text>
            <Text style={styles.cookingTime}>{recipeProcess.cookingTime}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {safeIngredients.map((ingredient, idx) => (
            <Text style={styles.text} key={idx}>• {ingredient}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Steps</Text>
          {safeSteps.map((step, idx) => (
            <Text style={styles.text} key={idx}>{idx + 1}. {step}</Text>
          ))}
        </View>

        {recipe ? (
          <TouchableOpacity 
            style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]} 
            onPress={() => {
              Alert.alert(
                'Delete Recipe',
                'Are you sure you want to delete this recipe?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete', style: 'destructive',
                    onPress: handleDelete
                  }
                ]
              );
            }}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>
              {deleting ? 'Deleting...' : 'Delete Recipe'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.saveBtn, (saved || saving) && styles.saveBtnDisabled]} 
            onPress={handleSave} 
            disabled={saved || saving}
          >
            <Text style={styles.saveBtnText}>
              {saved ? 'Saved' : saving ? 'Saving...' : 'Save Recipe'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
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
  scrollContent: {
    paddingTop: 70,
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: { 
    fontWeight: 'bold', 
    fontSize: 18, 
    color: '#222', 
    marginBottom: 12 
  },
  cookingTime: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  text: { 
    fontSize: 15, 
    color: '#333', 
    marginLeft: 6, 
    marginBottom: 8,
    lineHeight: 22,
  },
  processText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  saveBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnDisabled: {
    backgroundColor: '#ccc',
  },
  saveBtnText: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 16 
  },
  loadingText: {
    fontSize: 16,
    color: '#007AFF',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  deleteBtn: {
    backgroundColor: '#ff3b30',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  deleteBtnDisabled: {
    backgroundColor: '#ffcdd2',
  },
  deleteBtnText: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 16 
  },
});

export default RecipeProcessScreen; 