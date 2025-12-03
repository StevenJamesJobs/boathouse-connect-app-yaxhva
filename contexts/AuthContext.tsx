
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '@/types/user';

interface AuthContextType extends AuthState {
  login: (username: string, password: string, rememberMe: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock user database - In production, this would be in Supabase
const MOCK_USERS: User[] = [
  {
    id: '1',
    username: '251',
    name: 'Steven Eccles',
    email: 'seccles@mcloones.com',
    jobTitle: 'Manager',
    phoneNumber: '732-551-6184',
    role: 'manager',
  },
  {
    id: '2',
    username: '1205',
    name: 'Test Manager',
    email: 'Stevenjamesjobs@gmail.com',
    jobTitle: 'Manager',
    phoneNumber: '555-555-555',
    role: 'manager',
  },
  {
    id: '3',
    username: '1206',
    name: 'Test Employee',
    email: 'alanawilliams327@gmail.com',
    jobTitle: 'Server',
    phoneNumber: '556-556-5566',
    role: 'employee',
  },
  {
    id: '4',
    username: '201',
    name: 'Dylan Cathcart',
    email: 'Dylancathcart@gmail.com',
    jobTitle: 'Server/Bartender/Banquets',
    phoneNumber: '(973) 830-9288',
    role: 'employee',
  },
  {
    id: '5',
    username: '9410',
    name: 'Amanda Martino',
    email: 'amandamarzouk24@gmail.com',
    jobTitle: 'Server',
    phoneNumber: '(856) 533-8232',
    role: 'employee',
  },
  {
    id: '6',
    username: '9874',
    name: 'Hanifah Donaldson',
    email: 'nifahk12@yahoo.com',
    jobTitle: 'Server',
    phoneNumber: '(862) 930-8778',
    role: 'employee',
  },
  {
    id: '7',
    username: '1614',
    name: 'Najii Demsyn',
    email: 'najiimccain4850@gmail.com',
    jobTitle: 'Server/Banquets',
    phoneNumber: '(516) 602-8024',
    role: 'employee',
  },
  {
    id: '8',
    username: '6218',
    name: 'Ernesto Gibson',
    email: 'EPGibson94@gmail.com',
    jobTitle: 'Manager',
    phoneNumber: '(609) 851-7927',
    role: 'manager',
  },
  {
    id: '9',
    username: '6858',
    name: 'Nasio Mathieson',
    email: 'nmathieson123@gmail.com',
    jobTitle: 'Runner/Busser',
    phoneNumber: '(973) 380-9144',
    role: 'employee',
  },
  {
    id: '10',
    username: '5665',
    name: 'Atoy Smith',
    email: 'atoysmith21@gmail.com',
    jobTitle: 'Kitchen',
    phoneNumber: '(201) 463-5707',
    role: 'employee',
  },
  {
    id: '11',
    username: '1786',
    name: 'Alicia Orsino',
    email: 'aliciaorsino85@gmail.com',
    jobTitle: 'Bartender',
    phoneNumber: '(973) 932-2505',
    role: 'employee',
  },
  {
    id: '12',
    username: '6807',
    name: 'John Lachawiec',
    email: 'babciacakes@gmail.com',
    jobTitle: 'Server/Bartender/Banquets/Kitchen',
    phoneNumber: '(732) 759-7304',
    role: 'employee',
  },
  {
    id: '13',
    username: '2209',
    name: 'Leana Santos',
    email: 'leanasantos0303@gmail.com',
    jobTitle: 'Banquets',
    phoneNumber: '(908) 606-7957',
    role: 'employee',
  },
];

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
      
      // Find user by username
      const user = MOCK_USERS.find(u => u.username === username);
      
      if (!user) {
        console.log('User not found');
        return false;
      }

      // Check password
      if (password !== DEFAULT_PASSWORD) {
        console.log('Invalid password');
        return false;
      }

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
