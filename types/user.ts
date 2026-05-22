
export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  jobTitle: string; // Display string (comma-separated)
  jobTitles?: string[]; // Array of job titles for conditional logic
  phoneNumber: string;
  role: 'employee' | 'manager' | 'owner';
  organizationId: string;
  profilePictureUrl?: string;
  badgeTitle?: string; // Custom badge title override (e.g., "General Manager")
  mcloonesBucks?: number; // Rewards balance (display name from org.reward_currency_name)
  quickTools?: string[]; // Array of quick tool IDs for profile dashboard
  forcePasswordChange?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  weatherLocation: string | null;
  googleMapsQuery: string | null;
  rewardCurrencyName: string;
  joinCode: string;
  allowSelfSignup: boolean;
  menuCount: 1 | 2;
  menu1Name: string;
  menu2Name: string;
  defaultPassword: string;
  ownerId: string | null;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
