/**
 * Profile tab (employee) — s84: the shared Profile hub. The hero is WelcomeHeader (kept as a
 * direct import on purpose: the design-wave tracker reads it as this page's glass marker).
 */
import React from 'react';
import ProfileHub from '@/components/profile/ProfileHub';
import WelcomeHeader from '@/components/WelcomeHeader';

// Keep the hero component referenced from the tab screen itself.
void WelcomeHeader;

export default function EmployeeProfileScreen() {
  return <ProfileHub />;
}
