
export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  jobTitle: string;
  phoneNumber: string;
  role: 'employee' | 'manager';
  profilePictureUrl?: string;
  isActive?: boolean;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
