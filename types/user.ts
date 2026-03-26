
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
  mcloonesBucks?: number; // McLoone's Bucks balance
  quickTools?: string[]; // Array of quick tool IDs for profile dashboard
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
