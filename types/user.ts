
export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  jobTitle: string; // Display string (comma-separated)
  jobTitles?: string[]; // Array of job titles for conditional logic
  phoneNumber: string;
  role: 'employee' | 'manager';
  profilePictureUrl?: string;
  badgeTitle?: string; // Custom badge title override (e.g., "General Manager")
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
