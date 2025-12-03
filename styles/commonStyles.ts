
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';

// Employee Portal Colors (Improved Light Blue Theme with Better Contrast)
export const employeeColors = {
  background: '#E8F4F8',
  text: '#1A3A52',
  textSecondary: '#4A6B7C',
  primary: '#1976D2',
  primaryLight: '#42A5F5',
  card: '#FFFFFF',
  highlight: '#90CAF9',
  border: '#B0BEC5',
  tabBarBackground: '#FFFFFF',
  tabBarActive: '#0D47A1',
  tabBarInactive: '#546E7A',
};

// Manager Portal Colors (Improved Dark Blue Theme with better contrast)
export const managerColors = {
  background: '#1A2332',
  text: '#FFFFFF',
  textSecondary: '#A8B8D8',
  primary: '#4A90E2',
  card: '#2C3E50',
  highlight: '#5DADE2',
  border: '#34495E',
  accent: '#3498DB',
};

// Splash Screen Colors
export const splashColors = {
  background: '#FFFFFF',
  primary: '#2C5F8D',
  secondary: '#A7D9ED',
  text: '#2E3B4E',
  textSecondary: '#607B96',
};

// Legacy colors for backward compatibility
export const colors = {
  primary: '#162456',
  secondary: '#193cb8',
  accent: '#64B5F6',
  background: '#101824',
  backgroundAlt: '#162133',
  text: '#e3e3e3',
  grey: '#90CAF9',
  card: '#193cb8',
};

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    backgroundColor: colors.backgroundAlt,
    alignSelf: 'center',
    width: '100%',
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 10
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.grey,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
    width: '100%',
    boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: "white",
  },
});
