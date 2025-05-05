import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { updateProfile } from '../services/api';
import { getUser, database } from '../database';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savedRecipesCount, setSavedRecipesCount] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const user = await getUser();
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
    // Fetch saved recipes count
    try {
      const recipes = await database.get('recipes').query().fetch();
      setSavedRecipesCount(recipes.length);
    } catch (err) {
      setSavedRecipesCount(0);
    }
  };

  const handleUpdate = async () => {
    try {
      await updateProfile(name);
      Alert.alert('Profile Updated', 'Your profile has been updated.');
    } catch (err) {
      let msg = 'Failed to update profile.';
      if (err.response && err.response.data && err.response.data.message) {
        msg = err.response.data.message;
      } else if (err.message) {
        msg = err.message;
      }
      Alert.alert('Error', msg);
    }
  };

  const handleLogout = () => {
    // TODO: Implement real logout logic
    Alert.alert('Logged Out', 'You have been logged out.');
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 26 }} />
      </View>
      <View style={styles.center}>
        <Icon name="person-circle-outline" size={80} color="#007AFF" style={{ marginBottom: 18 }} />
        <View style={styles.inputGroup}>
        <View style={styles.statsBox}>
          <Text style={styles.statsText}>Saved Recipes: {savedRecipesCount}</Text>
        </View>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#f0f0f0', color: '#aaa' }]}
            value={email}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={false}
          />
        </View>

        <TouchableOpacity style={styles.updateBtn} onPress={handleUpdate}>
          <Text style={styles.updateBtnText}>Update Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 28,
    backgroundColor: 'transparent',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', letterSpacing: 0.5 },
  center: { flex: 1, paddingTop: 30, justifyContent: 'top', alignItems: 'center' },
  inputGroup: { width: '90%', marginBottom: 18 },
  label: { fontSize: 15, color: '#666', marginBottom: 4, marginTop: 10 },
  input: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 4,
    backgroundColor: '#fafbfc',
  },
  statsBox: {
    backgroundColor: '#eaf4ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  statsText: { color: '#007AFF', fontWeight: 'bold', fontSize: 15 },
  updateBtn: {
    backgroundColor: '#3578e5',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 36,
    marginBottom: 18,
    alignItems: 'center',
  },
  updateBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  logoutBtn: {
    backgroundColor: '#c0392b',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  logoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default ProfileScreen; 