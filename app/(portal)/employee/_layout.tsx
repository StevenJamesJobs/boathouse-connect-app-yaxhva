
import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

function EmployeeHeader() {
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Employee Portal</Text>
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <IconSymbol
          ios_icon_name="rectangle.portrait.and.arrow.right"
          android_material_icon_name="logout"
          size={24}
          color={employeeColors.text}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function EmployeeLayout() {
  return (
    <>
      <EmployeeHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: employeeColors.primary,
          tabBarInactiveTintColor: employeeColors.textSecondary,
          tabBarStyle: {
            backgroundColor: employeeColors.card,
            borderTopColor: employeeColors.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Welcome',
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="house.fill"
                android_material_icon_name="home"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="menus"
          options={{
            title: 'Menus',
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant_menu"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="tools"
          options={{
            title: 'Tools',
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="wrench.and.screwdriver.fill"
                android_material_icon_name="build"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="rewards"
          options={{
            title: 'Rewards',
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="star.fill"
                android_material_icon_name="star"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <IconSymbol
                ios_icon_name="person.fill"
                android_material_icon_name="person"
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: employeeColors.border,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
  },
  logoutButton: {
    padding: 8,
  },
});
