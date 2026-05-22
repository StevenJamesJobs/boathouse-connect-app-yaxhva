import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="signup" />
      <Stack.Screen name="create-restaurant" />
      <Stack.Screen name="setup-wizard" />
      <Stack.Screen name="join-code" />
    </Stack>
  );
}
