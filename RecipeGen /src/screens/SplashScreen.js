import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { getJWT } from '../database';

const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    const timer = setTimeout(async () => {
      const token = await getJWT();
      if (token) {
        navigation.replace('Home');
      } else {
        navigation.replace('Login');
      }
    }, 2000); // Show splash for 2 seconds
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