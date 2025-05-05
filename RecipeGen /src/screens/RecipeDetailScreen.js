import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';

const RecipeDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { recipeName, description, ingredients, recipe } = route.params || {};
  const displayDescription = recipe?.description || description;

  const handleGenerate = () => {
    navigation.navigate('RecipeProcess', { recipeName, ingredients });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>{recipeName}</Text>
        <View style={styles.descriptionCard}>
          <Text style={styles.description}>{displayDescription}</Text>
        </View>
        <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate} activeOpacity={0.85}>
          <Text style={styles.generateBtnText}>Generate Recipe</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backBtn: { marginRight: 12, position: 'relative', top: 2, zIndex: 10 },
  scrollContent: {
    paddingTop: 70,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 70,
    marginBottom: 18,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  descriptionCard: {
    backgroundColor: '#f4f8ff',
    borderRadius: 18,
    padding: 20,
    marginBottom: 32,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e0eaff',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  description: {
    fontSize: 17,
    color: '#444',
    lineHeight: 26,
    textAlign: 'left',
  },
  generateBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
    marginHorizontal: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  generateBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
});

export default RecipeDetailScreen; 