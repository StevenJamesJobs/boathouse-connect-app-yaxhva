// Bundled font families for the glass redesign.
//
// We bundle static TTF instances (not @expo-google-fonts packages) to avoid
// lockfile churn on SDK 54. Weight is baked into the family name on purpose:
// React Native's `fontWeight` is unreliable with custom families on Android,
// so always pick the explicit family below rather than relying on fontWeight.
//
//   display → Bricolage Grotesque (headlines, greeting, card titles)
//   body    → Inter               (body copy, descriptions)
//   mono    → JetBrains Mono      (times, dates, numeric/data labels)

export const fonts = {
  display: {
    semibold: 'BricolageGrotesque-SemiBold',
    bold: 'BricolageGrotesque-Bold',
  },
  body: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semibold: 'Inter-SemiBold',
  },
  mono: {
    medium: 'JetBrainsMono-Medium',
    semibold: 'JetBrainsMono-SemiBold',
  },
} as const;

// Spread into the root `useFonts({...})` call in app/_layout.tsx. The keys must
// match the family names referenced via `fonts` above.
export const fontAssets = {
  'BricolageGrotesque-SemiBold': require('../assets/fonts/BricolageGrotesque-SemiBold.ttf'),
  'BricolageGrotesque-Bold': require('../assets/fonts/BricolageGrotesque-Bold.ttf'),
  'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
  'JetBrainsMono-Medium': require('../assets/fonts/JetBrainsMono-Medium.ttf'),
  'JetBrainsMono-SemiBold': require('../assets/fonts/JetBrainsMono-SemiBold.ttf'),
};
