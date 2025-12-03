
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { User, AuthState } from '@/types/user';

interface AuthContextType extends AuthState {
  login: (username: string, password: string, rememberMe: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_PASSWORD = 'boathouseconnect';
const STORAGE_KEY = '@mcloones_auth';
const REMEMBER_ME_KEY = '@mcloones_remember_me';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
      if (rememberMe === 'true') {
        const storedAuth = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedAuth) {
          const user = JSON.parse(storedAuth);
          setAuthState({
            user,
            isLoading: false,
            isAuthenticated: true,
          });
          return;
        }
      }
    } catch (error) {
      console.log('Error loading stored auth:', error);
    }
    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const login = async (username: string, password: string, rememberMe: boolean): Promise<boolean> => {
    try {
      console.log('Attempting login with username:', username);
      
      // Check password first
      if (password !== DEFAULT_PASSWORD) {
        console.log('Invalid password');
        return false;
      }

      // Query Supabase for user by username
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !userData) {
        console.log('User not found in database:', error);
        return false;
      }

      // Map database user to app user format
      const user: User = {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        email: userData.email,
        jobTitle: userData.job_title,
        phoneNumber: userData.phone_number || '',
        role: userData.role as 'employee' | 'manager',
      };

      // Store auth state
      if (rememberMe) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        await AsyncStorage.setItem(REMEMBER_ME_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await AsyncStorage.setItem(REMEMBER_ME_KEY, 'false');
      }

      setAuthState({
        user,
        isLoading: false,
        isAuthenticated: true,
      });

      console.log('Login successful for user:', user.name);
      return true;
    } catch (error) {
      console.log('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      console.log('Logout successful');
    } catch (error) {
      console.log('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
