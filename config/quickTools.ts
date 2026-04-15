export interface QuickToolConfig {
  id: string;
  labelKey: string; // i18n translation key
  iosIcon: string;
  androidIcon: string;
  route: string;
  category: 'assistants' | 'editors' | 'management' | 'general';
  availableTo: 'all' | 'employee' | 'manager';
  // For role-based assistants, which job titles can access
  requiredJobTitles?: string[];
}

export const QUICK_TOOLS_CATALOG: QuickToolConfig[] = [
  // === GENERAL (All Users) ===
  {
    id: 'guides-training',
    labelKey: 'quick_tools.guides_training',
    iosIcon: 'book.fill',
    androidIcon: 'menu-book',
    route: '/guides-and-training',
    category: 'general',
    availableTo: 'all',
  },
  {
    id: 'messages',
    labelKey: 'quick_tools.messages',
    iosIcon: 'envelope.fill',
    androidIcon: 'mail',
    route: '/messages',
    category: 'general',
    availableTo: 'all',
  },
  {
    id: 'my-schedule',
    labelKey: 'quick_tools.my_schedule',
    iosIcon: 'calendar',
    androidIcon: 'event',
    route: '/my-schedule',
    category: 'general',
    availableTo: 'all',
  },
  {
    id: 'memory-game',
    labelKey: 'quick_tools.memory_game',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/menu-memory-game',
    category: 'general',
    availableTo: 'all',
  },
  {
    id: 'word-search',
    labelKey: 'quick_tools.word_search',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-game',
    category: 'general',
    availableTo: 'all',
  },
  {
    id: 'menus',
    labelKey: 'quick_tools.menus',
    iosIcon: 'fork.knife',
    androidIcon: 'restaurant',
    route: '/(portal)/employee/menus',
    category: 'general',
    availableTo: 'employee',
  },
  {
    id: 'menus-manager',
    labelKey: 'quick_tools.menus',
    iosIcon: 'fork.knife',
    androidIcon: 'restaurant',
    route: '/(portal)/manager/menus',
    category: 'general',
    availableTo: 'manager',
  },
  {
    id: 'rewards',
    labelKey: 'quick_tools.rewards',
    iosIcon: 'star.fill',
    androidIcon: 'star',
    route: '/(portal)/employee/rewards',
    category: 'general',
    availableTo: 'employee',
  },
  {
    id: 'weekly-quizzes',
    labelKey: 'quick_tools.weekly_quizzes',
    iosIcon: 'questionmark.circle.fill',
    androidIcon: 'quiz',
    route: '/weekly-quizzes',
    category: 'general',
    availableTo: 'employee',
  },
  {
    id: 'game-hub',
    labelKey: 'quick_tools.game_hub',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/game-hub',
    category: 'general',
    availableTo: 'employee',
  },
  // === ASSISTANTS (Role-Based) ===
  {
    id: 'server-assistant',
    labelKey: 'quick_tools.server_assistant',
    iosIcon: 'tray.full.fill',
    androidIcon: 'room-service',
    route: '/server-assistant',
    category: 'assistants',
    availableTo: 'all',
    requiredJobTitles: ['Server', 'Lead Server'],
  },
  {
    id: 'bartender-assistant',
    labelKey: 'quick_tools.bartender_assistant',
    iosIcon: 'wineglass.fill',
    androidIcon: 'local-bar',
    route: '/bartender-assistant',
    category: 'assistants',
    availableTo: 'all',
    requiredJobTitles: ['Bartender', 'Lead Server', 'Banquet Captain'],
  },
  {
    id: 'host-assistant',
    labelKey: 'quick_tools.host_assistant',
    iosIcon: 'person.2.fill',
    androidIcon: 'people',
    route: '/host-assistant',
    category: 'assistants',
    availableTo: 'all',
    requiredJobTitles: ['Host'],
  },
  {
    id: 'kitchen-assistant',
    labelKey: 'quick_tools.kitchen_assistant',
    iosIcon: 'flame.fill',
    androidIcon: 'local-fire-department',
    route: '/kitchen-assistant',
    category: 'assistants',
    availableTo: 'all',
    requiredJobTitles: ['Busser', 'Chef', 'Kitchen', 'Runner'],
  },
  // === EDITORS (Manager Only) ===
  {
    id: 'announcement-editor',
    labelKey: 'quick_tools.announcement_editor',
    iosIcon: 'megaphone.fill',
    androidIcon: 'campaign',
    route: '/announcement-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'special-features-editor',
    labelKey: 'quick_tools.special_features_editor',
    iosIcon: 'star.fill',
    androidIcon: 'star',
    route: '/special-features-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'upcoming-events-editor',
    labelKey: 'quick_tools.upcoming_events_editor',
    iosIcon: 'calendar',
    androidIcon: 'event',
    route: '/upcoming-events-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'menu-editor',
    labelKey: 'quick_tools.menu_editor',
    iosIcon: 'fork.knife',
    androidIcon: 'restaurant',
    route: '/menu-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'guides-training-editor',
    labelKey: 'quick_tools.guides_training_editor',
    iosIcon: 'square.and.pencil',
    androidIcon: 'book',
    route: '/guides-and-training-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'game-hub-editor',
    labelKey: 'quick_tools.game_hub_editor',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/game-hub-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'memory-game-editor',
    labelKey: 'quick_tools.memory_game_editor',
    iosIcon: 'gamecontroller.fill',
    androidIcon: 'sports-esports',
    route: '/memory-game-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'word-search-editor',
    labelKey: 'quick_tools.word_search_editor',
    iosIcon: 'textformat.abc',
    androidIcon: 'spellcheck',
    route: '/word-search-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'rewards-reviews-editor',
    labelKey: 'quick_tools.rewards_reviews_editor',
    iosIcon: 'star.circle.fill',
    androidIcon: 'stars',
    route: '/rewards-and-reviews-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'quiz-hub-editor',
    labelKey: 'quick_tools.quiz_hub_editor',
    iosIcon: 'questionmark.circle.fill',
    androidIcon: 'quiz',
    route: '/quiz-hub-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'server-assistant-editor',
    labelKey: 'quick_tools.server_assistant_editor',
    iosIcon: 'tray.full.fill',
    androidIcon: 'room-service',
    route: '/server-assistant-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'bartender-assistant-editor',
    labelKey: 'quick_tools.bartender_assistant_editor',
    iosIcon: 'wineglass.fill',
    androidIcon: 'local-bar',
    route: '/bartender-assistant-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'host-assistant-editor',
    labelKey: 'quick_tools.host_assistant_editor',
    iosIcon: 'person.2.fill',
    androidIcon: 'people',
    route: '/host-assistant-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  {
    id: 'kitchen-assistant-editor',
    labelKey: 'quick_tools.kitchen_assistant_editor',
    iosIcon: 'flame.fill',
    androidIcon: 'local-fire-department',
    route: '/kitchen-assistant-editor',
    category: 'editors',
    availableTo: 'manager',
  },
  // === MANAGEMENT (Manager Only) ===
  {
    id: 'employee-hub',
    labelKey: 'quick_tools.employee_hub',
    iosIcon: 'person.2.fill',
    androidIcon: 'people',
    route: '/employee-hub',
    category: 'management',
    availableTo: 'manager',
  },
  {
    id: 'schedule-upload',
    labelKey: 'quick_tools.schedule_upload',
    iosIcon: 'arrow.up.doc.fill',
    androidIcon: 'upload-file',
    route: '/schedule-upload',
    category: 'management',
    availableTo: 'manager',
  },
  {
    id: 'todays-roster',
    labelKey: 'quick_tools.todays_roster',
    iosIcon: 'list.clipboard.fill',
    androidIcon: 'assignment',
    route: '/todays-roster',
    category: 'management',
    availableTo: 'manager',
  },
  {
    id: 'notification-center',
    labelKey: 'quick_tools.notification_center',
    iosIcon: 'bell.fill',
    androidIcon: 'notifications',
    route: '/notification-center',
    category: 'management',
    availableTo: 'manager',
  },
];

// Maximum number of quick tools a user can pin
export const MAX_QUICK_TOOLS = 4;

/**
 * Get available tools for a user based on their role and job titles
 */
export function getAvailableTools(
  role: 'employee' | 'manager',
  jobTitles: string[] = []
): QuickToolConfig[] {
  return QUICK_TOOLS_CATALOG.filter((tool) => {
    // Check role availability
    if (tool.availableTo !== 'all' && tool.availableTo !== role) {
      return false;
    }

    // Managers can access all tools (no job title restriction for managers)
    if (role === 'manager') {
      return true;
    }

    // For employees, check job title requirements
    if (tool.requiredJobTitles && tool.requiredJobTitles.length > 0) {
      const hasMatchingTitle = jobTitles.some((jt) =>
        tool.requiredJobTitles!.some(
          (req) => jt.toLowerCase().includes(req.toLowerCase())
        )
      );
      if (!hasMatchingTitle) return false;
    }

    return true;
  });
}

/**
 * Get default quick tools for a user based on their role and job titles
 */
export function getDefaultQuickTools(
  role: 'employee' | 'manager',
  jobTitles: string[] = []
): string[] {
  const available = getAvailableTools(role, jobTitles);

  if (role === 'manager') {
    // Default manager tools: Employee Hub, Announcement Editor, Schedule Upload, Today's Roster
    const defaults = ['employee-hub', 'announcement-editor', 'schedule-upload', 'todays-roster'];
    return defaults.filter((id) => available.some((t) => t.id === id));
  }

  // For employees, pick their first matching assistant + general tools
  const defaults: string[] = [];

  // Add first matching assistant
  const assistants = available.filter((t) => t.category === 'assistants');
  if (assistants.length > 0) {
    defaults.push(assistants[0].id);
  }

  // Add general tools
  defaults.push('guides-training', 'my-schedule');

  // Add rewards for employees
  if (role === 'employee') {
    defaults.push('rewards');
  }

  return defaults.slice(0, MAX_QUICK_TOOLS);
}
