
import React from "react";
import { View, StyleSheet } from "react-native";
import { Redirect } from "expo-router";

export default function HomeScreen() {
  // Redirect to login screen - this tab should not be accessible
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
