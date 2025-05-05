import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ScrollView,
  Animated,
  FlatList,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { getRecipes } from '../services/api';
import { getAppState, clearAppState } from '../database';

const HomeScreen = () => {
  const navigation = useNavigation();
  const [ingredient, setIngredient] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [showFindRecipes, setShowFindRecipes] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [recipes, setRecipes] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const shouldRefresh = await getAppState('shouldRefreshRecipes');
      if (shouldRefresh) {
        await clearAppState('shouldRefreshRecipes');
      }
      const data = await getRecipes();
      setRecipes(data);
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Add ingredient
  const addIngredient = () => {
    if (ingredient.trim() && !ingredients.includes(ingredient.trim().toLowerCase())) {
      setIngredients([...ingredients, ingredient.trim().toLowerCase()]);
      setIngredient('');
      setShowFindRecipes(true);
    }
  };

  // Remove ingredient
  const removeIngredient = (item) => {
    const newIngredients = ingredients.filter(i => i !== item);
    setIngredients(newIngredients);
    if (newIngredients.length === 0) {
      setShowFindRecipes(false);
    }
  };

  // Render ingredient chip
  const renderIngredient = (item) => (
    <View style={styles.ingredientChip} key={item}>
      <Text style={styles.ingredientChipText}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
      <TouchableOpacity onPress={() => removeIngredient(item)}>
        <Icon name="close" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient colors={["#f6faff", "#eaf2fb"]} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image source={require('../../assets/splash_logo.png')} style={styles.logo} />
              <Text style={styles.headerTitle}>RecipeGen</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
              <Icon name="person-circle-outline" size={32} color="#007AFF" />
            </TouchableOpacity>
          </View>
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* My Recipes Widget */}
            <TouchableOpacity
              style={styles.myRecipesWidget}
              onPress={() => navigation.navigate('SavedRecipes')}
              activeOpacity={0.85}
            >
              <View style={styles.myRecipesIconContainer}>
                <Icon name="book-outline" size={52} color="#fff" />
              </View>
              <Text style={styles.myRecipesTitle}>My Recipes</Text>
              <Text style={styles.myRecipesSubtitle}>View and manage your saved recipes</Text>
            </TouchableOpacity>

            {/* Create New Recipe Card */}
            <View style={styles.createRecipeCard}>
              <Text style={styles.createRecipeTitle}>Create New Recipe</Text>
              <Text style={styles.createRecipeSubtitle}>Add ingredients to generate recipe suggestions</Text>
              <View style={styles.ingredientInputRow}>
                <TextInput
                  style={styles.ingredientInput}
                  placeholder="Add ingredients..."
                  value={ingredient}
                  onChangeText={setIngredient}
                  onSubmitEditing={addIngredient}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.ingredientAddBtn} onPress={addIngredient}>
                  <Icon name="add-circle" size={32} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Current Ingredients */}
            {ingredients.length > 0 && (
              <View style={styles.currentIngredientsSection}>
                <Text style={styles.currentIngredientsTitle}>Current Ingredients</Text>
                <View style={styles.ingredientChipsRow}>
                  {ingredients.map((item) => renderIngredient(item))}
                </View>
              </View>
            )}

            {/* Find Recipes Button */}
            {showFindRecipes && ingredients.length > 0 && (
              <TouchableOpacity style={styles.findRecipesBtn} onPress={() => navigation.navigate('RecipeList', { ingredients })}>
                <Text style={styles.findRecipesBtnText}>Find Recipes</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  logo: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
    marginRight: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 18,
    backgroundColor: 'transparent',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', letterSpacing: 0.5 },
  scrollContent: { paddingBottom: 120, paddingTop: 0 },
  myRecipesWidget: {
    backgroundColor: '#178aff',
    borderRadius: 36,
    paddingVertical: 30,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 36,
    shadowColor: '#178aff',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  myRecipesIconContainer: {
    backgroundColor: '#005bb5',
    borderRadius: 60,
    padding: 16,
    marginBottom: 20,
  },
  myRecipesTitle: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  myRecipesSubtitle: {
    fontSize: 15,
    color: '#e0eaff',
    textAlign: 'center',
    marginBottom: 2,
  },
  createRecipeCard: {
    backgroundColor: '#f8fbff',
    borderRadius: 22,
    padding: 22,
    marginHorizontal: 12,
    marginBottom: 22,
    borderWidth: 0,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 3,
  },
  createRecipeTitle: { fontWeight: 'bold', fontSize: 19, color: '#222', marginBottom: 2 },
  createRecipeSubtitle: { fontSize: 15, color: '#888', marginBottom: 10 },
  ingredientInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  ingredientInput: {
    flex: 1,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0eaff',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  ingredientAddBtn: { marginLeft: 10 },
  currentIngredientsSection: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 6,
  },
  currentIngredientsTitle: { fontWeight: 'bold', fontSize: 17, color: '#222', marginBottom: 8 },
  ingredientChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ingredientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4db6ff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
    marginRight: 8,
    shadowColor: '#4db6ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 2,
  },
  ingredientChipText: { fontSize: 15, color: '#fff', marginRight: 6, fontWeight: 'bold' },
  findRecipesBtn: {
    backgroundColor: '#111',
    alignSelf: 'center',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 12,
    shadowColor: '#111',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
    elevation: 3,
  },
  findRecipesBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
});

export default HomeScreen; 