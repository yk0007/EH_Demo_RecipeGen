import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { generateRecipes } from '../services/api';

const RecipeListScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { ingredients } = route.params || {};
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecipes = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await generateRecipes(ingredients);
        console.log('Gemini backend response:', result);
        if (!Array.isArray(result) || result.length === 0) {
          setError('No recipes generated. Try different ingredients.');
          setRecipes([]);
        } else {
          setRecipes(result);
        }
      } catch (err) {
        setError('Failed to generate recipes.');
        setRecipes([]);
      }
      setLoading(false);
    };
    fetchRecipes();
  }, [ingredients]);

  const handleSelect = (recipe) => {
    navigation.navigate('RecipeDetail', { 
      recipeName: recipe.recipe_name, 
      description: recipe.description,
      ingredients 
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Available Recipes</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>Generating recipes...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: 'red' }}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item, idx) => item.recipe_name + idx}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.recipeCard} onPress={() => handleSelect(item)}>
              <View style={styles.cardContent}>
                <Text style={styles.recipeName} numberOfLines={2}>{item.recipe_name}</Text>
                <Text style={styles.recipeDescription} numberOfLines={3}>{item.description}</Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
};

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
  list: {
    padding: 16,
  },
  recipeCard: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#f4f8ff',
    borderRadius: 18,
    minHeight: 120,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0eaff',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContent: {
    padding: 12,
  },
  recipeName: { 
    fontSize: 16, 
    color: '#222', 
    fontWeight: 'bold', 
    marginBottom: 6,
    lineHeight: 20,
  },
  recipeDescription: { 
    fontSize: 13, 
    color: '#666',
    lineHeight: 18,
  },
});

export default RecipeListScreen; 