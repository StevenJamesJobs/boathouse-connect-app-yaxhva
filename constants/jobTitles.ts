/**
 * Unified list of job titles used across the app.
 *
 * Single source of truth for:
 * - Employee Editor (user profile job_titles picker)
 * - Schedule Review / Edit Shift form (role dropdown)
 * - Roster shift editor (role dropdown)
 * - parse-schedule edge function (roles the AI is allowed to emit)
 *
 * Keep alphabetized within logical groups so the picker reads naturally.
 */
export const JOB_TITLES: readonly string[] = [
  // Management
  'Manager',
  'Bar Manager',
  'Banquet Captain',
  // Front of house — Servers
  'Server',
  'Lead Server',
  'Training Server',
  'Banquet Server',
  // Front of house — Bar
  'Bartender',
  'Training Bartender',
  'Banquet Bartender',
  'Barback',
  // Front of house — Support
  'Host',
  'Busser',
  'Runner',
  'Expo',
  // Back of house
  'Chef',
  'Cook',
  'Kitchen',
  'Dishwasher',
] as const;

export type JobTitle = (typeof JOB_TITLES)[number];
