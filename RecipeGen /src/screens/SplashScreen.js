import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { getJWT, database } from '../database';

const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Wait for database to be ready
        await database.write(async () => {
      const token = await getJWT();
          console.log('SplashScreen - Token check:', token ? 'Token exists' : 'No token');
      if (token) {
        navigation.replace('Home');
      } else {
        navigation.replace('Login');
      }
        });
      } catch (error) {
        console.error('SplashScreen - Auth check error:', error);
        navigation.replace('Login');
      }
    };

    const timer = setTimeout(checkAuth, 2000); // Show splash for 2 seconds
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/splash_logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.appName}>RecipeGen</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 16,
    letterSpacing: 0.5,
  },
});

export default SplashScreen; 