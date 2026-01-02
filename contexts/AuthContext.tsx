
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { User, AuthState } from '@/types/user';

interface AuthContextType extends AuthState {
  login: (username: string, password: string, rememberMe: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = '@mcloones_auth';
const REMEMBER_ME_KEY = '@mcloones_remember_me';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const fetchUserFromDatabase = async (userId: string): Promise<User | null> => {
    try {
      console.log('Fetching user data from database for user:', userId);
      
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.log('Error fetching user from database:', error);
        return null;
      }

      if (!userData) {
        console.log('User not found in database');
        return null;
      }

      // Get job title display - prefer job_titles array, fallback to job_title
      let jobTitleDisplay = '';
      let jobTitlesArray: string[] = [];
      
      if (userData.job_titles && Array.isArray(userData.job_titles) && userData.job_titles.length > 0) {
        jobTitlesArray = userData.job_titles;
        jobTitleDisplay = userData.job_titles.join(', ');
      } else if (userData.job_title) {
        jobTitlesArray = [userData.job_title];
        jobTitleDisplay = userData.job_title;
      }

      // Map database user to app user format
      const user: User = {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        email: userData.email,
        jobTitle: jobTitleDisplay,
        jobTitles: jobTitlesArray,
        phoneNumber: userData.phone_number || '',
        role: userData.role as 'employee' | 'manager',
        profilePictureUrl: userData.profile_picture_url || undefined,
      };

      console.log('User data fetched successfully, job titles:', user.jobTitles, 'profile picture URL:', user.profilePictureUrl);
      return user;
    } catch (error) {
      console.log('Error fetching user from database:', error);
      return null;
    }
  };

  const loadStoredAuth = useCallback(async () => {
    try {
      const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
      if (rememberMe === 'true') {
        const storedAuth = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedAuth) {
          const storedUser = JSON.parse(storedAuth);
          console.log('Loaded user from storage:', storedUser.name);
          
          // Fetch the latest user data from database to get updated profile picture and job titles
          const freshUser = await fetchUserFromDatabase(storedUser.id);
          
          if (freshUser) {
            // Update storage with fresh data
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshUser));
            
            setAuthState({
              user: freshUser,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }
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
  }, []);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  const refreshUser = async () => {
    try {
      if (!authState.user?.id) return;
      
      console.log('Refreshing user data...');
      const freshUser = await fetchUserFromDatabase(authState.user.id);
      
      if (freshUser) {
        // Update storage
        const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
        if (rememberMe === 'true') {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshUser));
        }
        
        setAuthState({
          user: freshUser,
          isLoading: false,
          isAuthenticated: true,
        });
        console.log('User data refreshed successfully');
      }
    } catch (error) {
      console.log('Error refreshing user:', error);
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean): Promise<boolean> => {
    try {
      console.log('Attempting login with username:', username);
      
      // Clean username - remove any leading zeros and whitespace
      const cleanUsername = username.trim();
      
      console.log('Querying database for username:', cleanUsername);

      // Query Supabase for user by username
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', cleanUsername)
        .single();

      if (error) {
        console.log('Database error:', error);
        return false;
      }

      if (!userData) {
        console.log('User not found in database');
        return false;
      }

      console.log('User found:', userData.name);

      // Verify password using the database function
      const { data: passwordValid, error: verifyError } = await supabase.rpc('verify_password', {
        user_id: userData.id,
        password: password,
      });

      if (verifyError) {
        console.log('Password verification error:', verifyError);
        return false;
      }

      if (!passwordValid) {
        console.log('Invalid password');
        return false;
      }

      // Get job title display - prefer job_titles array, fallback to job_title
      let jobTitleDisplay = '';
      let jobTitlesArray: string[] = [];
      
      if (userData.job_titles && Array.isArray(userData.job_titles) && userData.job_titles.length > 0) {
        jobTitlesArray = userData.job_titles;
        jobTitleDisplay = userData.job_titles.join(', ');
      } else if (userData.job_title) {
        jobTitlesArray = [userData.job_title];
        jobTitleDisplay = userData.job_title;
      }

      // Map database user to app user format
      const user: User = {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        email: userData.email,
        jobTitle: jobTitleDisplay,
        jobTitles: jobTitlesArray,
        phoneNumber: userData.phone_number || '',
        role: userData.role as 'employee' | 'manager',
        profilePictureUrl: userData.profile_picture_url || undefined,
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

      console.log('Login successful for user:', user.name, 'Job titles:', user.jobTitles, 'Profile picture:', user.profilePictureUrl);
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
    <AuthContext.Provider value={{ ...authState, login, logout, refreshUser }}>
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
