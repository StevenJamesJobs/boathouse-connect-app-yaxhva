
# McLoone's Boathouse Connect - Project Structure

## ✅ SINGLE UNIFIED PROJECT

This is **ONE project** - McLoone's Boathouse Connect. There are no "two projects" - just one app with different user roles.

## 📁 App Structure

```
app/
├── index.tsx                    # Entry point - redirects to login or portal
├── login.tsx                    # Login screen for all users
├── _layout.tsx                  # Root layout with navigation
│
├── (portal)/                    # Main app - Employee & Manager portals
│   ├── _layout.tsx             # Portal layout
│   ├── employee/               # Employee portal screens
│   │   ├── _layout.tsx        # Employee navigation with FloatingTabBar
│   │   ├── index.tsx          # Employee home/welcome screen
│   │   ├── menus.tsx          # Employee menus view
│   │   ├── profile.tsx        # Employee profile
│   │   ├── rewards.tsx        # Employee rewards
│   │   └── tools.tsx          # Employee tools
│   │
│   └── manager/                # Manager portal screens
│       ├── _layout.tsx        # Manager navigation with FloatingTabBar
│       ├── index.tsx          # Manager home/welcome screen
│       ├── menus.tsx          # Manager menus view
│       ├── profile.tsx        # Manager profile
│       ├── manage.tsx         # Manager management tools
│       └── tools.tsx          # Manager tools
│
├── Editor Screens (Manager Only):
│   ├── menu-editor.tsx
│   ├── cocktails-az-editor.tsx
│   ├── signature-recipes-editor.tsx
│   ├── announcement-editor.tsx
│   ├── upcoming-events-editor.tsx
│   ├── special-features-editor.tsx
│   ├── guides-and-training-editor.tsx
│   ├── rewards-and-reviews-editor.tsx
│   ├── bartender-assistant-editor.tsx
│   └── employee-editor.tsx
│
├── Shared Screens (Both Roles):
│   ├── messages.tsx
│   ├── message-detail.tsx
│   ├── compose-message.tsx
│   ├── notification-center.tsx
│   ├── cocktails-az.tsx
│   ├── signature-recipes.tsx
│   ├── bartender-assistant.tsx
│   ├── guides-and-training.tsx
│   ├── check-out-calculator.tsx
│   ├── view-all-upcoming-events.tsx
│   └── view-all-special-features.tsx
│
└── employee-detail.tsx          # Manager only - edit employee details
```

## 🔄 User Flow

1. **App Launch** → `index.tsx`
   - Checks authentication status
   - If not logged in → redirects to `login.tsx`
   - If logged in → redirects to appropriate portal

2. **Login** → `login.tsx`
   - User enters username and password
   - System checks role (employee or manager)
   - Redirects to appropriate portal

3. **Employee Portal** → `(portal)/employee/`
   - Home screen with announcements, events, specials
   - Menus (view only)
   - Profile management
   - Rewards tracking
   - Tools (calculators, guides, etc.)

4. **Manager Portal** → `(portal)/manager/`
   - Home screen with announcements, events, specials
   - Menus (view only)
   - Profile management
   - Manage section (access to all editors)
   - Tools (calculators, guides, etc.)

## 🎨 Color Schemes

- **Employee Portal**: Lighter blue, white, gray (defined in `styles/commonStyles.ts` as `employeeColors`)
- **Manager Portal**: Darker color scheme (defined in `styles/commonStyles.ts` as `managerColors`)

## 🗄️ Database Structure

All data is stored in Supabase with these main tables:
- `users` - Employee and manager accounts
- `menu_items` - Restaurant menu items
- `cocktails` - Cocktail A-Z recipes
- `signature_recipes` - Signature cocktail recipes
- `announcements` - Portal announcements
- `upcoming_events` - Events calendar
- `special_features` - Special features section
- `messages` - Internal messaging system
- `message_recipients` - Message delivery tracking
- `reward_transactions` - McLoone's Bucks rewards
- `guest_reviews` - Guest review management
- `guide_files` - Training guides and documents

## 🔐 Authentication & Authorization

- **Authentication**: Handled by Supabase Auth via `contexts/AuthContext.tsx`
- **Authorization**: Role-based (employee vs manager)
  - Employees: Can view content, manage their profile, use tools
  - Managers: All employee permissions + CRUD access to all editors

## 🚀 Key Features

### For All Users:
- Profile management with photo upload
- Internal messaging system
- View menus, cocktails, recipes
- Access training guides
- Check-out calculator
- Rewards tracking
- Notification center

### Manager Only:
- Employee management (CRUD)
- Content editors for all portal sections
- Rewards distribution
- Guest review management
- Full administrative access

## 📱 Navigation

- **Employee Portal**: FloatingTabBar with 5 tabs (Home, Menus, Profile, Rewards, Tools)
- **Manager Portal**: FloatingTabBar with 5 tabs (Home, Menus, Profile, Manage, Tools)
- **Standalone Screens**: Use Stack navigation with back buttons (editors, messages, etc.)

## 🎯 This is ONE Project

There is no confusion or "two projects". This is a single McLoone's Boathouse Connect app with:
- One codebase
- One database
- One authentication system
- Two user roles (employee and manager)
- Two portal experiences (customized per role)

The `(portal)` folder contains your entire app. The old `(tabs)` template folder has been removed to eliminate confusion.
