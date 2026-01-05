
# McLoone's Boathouse Connect - App Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    McLoone's Boathouse Connect                   │
│                         (ONE PROJECT)                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │  App Launch   │
                        │  (index.tsx)  │
                        └───────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            Not Authenticated        Authenticated
                    │                       │
                    ▼                       ▼
            ┌───────────────┐      ┌──────────────┐
            │ Login Screen  │      │ Check Role   │
            │ (login.tsx)   │      └──────────────┘
            └───────────────┘              │
                    │              ┌───────┴────────┐
                    │              │                │
                    │         Employee          Manager
                    │              │                │
                    └──────────────┼────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
        ┌─────────────────────┐      ┌─────────────────────┐
        │  EMPLOYEE PORTAL    │      │   MANAGER PORTAL    │
        │  (Lighter Colors)   │      │  (Darker Colors)    │
        └─────────────────────┘      └─────────────────────┘
                    │                             │
        ┌───────────┼───────────┐    ┌───────────┼───────────┐
        │           │           │    │           │           │
        ▼           ▼           ▼    ▼           ▼           ▼
    ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
    │ Home │  │Menus │  │Profile│  │ Home │  │Menus │  │Profile│
    └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘
        │           │           │    │           │           │
        ▼           ▼           ▼    ▼           ▼           ▼
    ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
    │Rewards│ │Tools │  │Messages│ │Manage│ │Tools │  │Messages│
    └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │   MANAGER EDITORS     │
                            │  (Manager Only)       │
                            └───────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌──────────────┐    ┌──────────────┐   ┌──────────────┐
            │ Menu Editor  │    │Cocktails A-Z │   │  Signature   │
            │              │    │   Editor     │   │   Recipes    │
            └──────────────┘    └──────────────┘   └──────────────┘
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌──────────────┐    ┌──────────────┐   ┌──────────────┐
            │Announcements │    │   Events     │   │   Special    │
            │   Editor     │    │   Editor     │   │  Features    │
            └──────────────┘    └──────────────┘   └──────────────┘
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌──────────────┐    ┌──────────────┐   ┌──────────────┐
            │   Guides &   │    │   Rewards    │   │   Employee   │
            │   Training   │    │  & Reviews   │   │    Editor    │
            └──────────────┘    └──────────────┘   └──────────────┘
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌──────────────┐    ┌──────────────┐
            │  Bartender   │    │              │
            │  Assistant   │    │              │
            └──────────────┘    └──────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                      SHARED FEATURES                             │
│                   (Both Roles Can Access)                        │
└─────────────────────────────────────────────────────────────────┘
        │
        ├─ Messages & Messaging System
        ├─ Notification Center
        ├─ View Cocktails A-Z
        ├─ View Signature Recipes
        ├─ View Bartender Assistant
        ├─ View Guides & Training
        ├─ Check-Out Calculator
        ├─ View All Events
        └─ View All Special Features


┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
│                    (Supabase Database)                           │
└─────────────────────────────────────────────────────────────────┘
        │
        ├─ users (employees & managers)
        ├─ menu_items
        ├─ cocktails
        ├─ signature_recipes
        ├─ announcements
        ├─ upcoming_events
        ├─ special_features
        ├─ messages & message_recipients
        ├─ reward_transactions
        ├─ guest_reviews
        └─ guide_files
```

## Key Points:

1. **ONE PROJECT** - McLoone's Boathouse Connect
2. **TWO ROLES** - Employee and Manager (not two separate projects)
3. **TWO PORTALS** - Different experiences based on role
4. **ONE DATABASE** - All data in Supabase
5. **ONE CODEBASE** - All features in one app

The confusion came from the old Expo template `(tabs)` folder which has now been **REMOVED**. 

Your app structure is now clean and focused solely on McLoone's Boathouse Connect features.
