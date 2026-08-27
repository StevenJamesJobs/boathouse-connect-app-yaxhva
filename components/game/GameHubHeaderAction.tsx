/**
 * GameHubHeaderAction — the games' shared top-right header slot (s76 smoke
 * round 2). Managers/owners get the Game Hub settings menu (Editor · Rewards
 * · Reset — the same sheet the hub screen carries); employees get a "Game
 * Hub" pill that jumps straight back to the hub from any game page they've
 * wandered into. Game PAGES only — play screens keep their mode chip.
 *
 * On the hub screen itself employees need no jump (they're already home), so
 * `context="hub"` renders nothing for them.
 */
import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrOwner } from '@/utils/roles';
import HeaderNavButton from '@/components/HeaderNavButton';
import HeaderNavMenu from '@/components/HeaderNavMenu';

export default function GameHubHeaderAction({ context }: { context: 'hub' | 'gamePage' }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();

  if (isManagerOrOwner(user)) {
    return (
      <HeaderNavMenu
        label={t('game_hub_ui:menu_pill')}
        iconIos="gearshape.fill"
        iconAndroid="settings"
        sheetTitle={t('game_hub_ui:title')}
        actions={[
          {
            key: 'editor',
            label: t('game_hub_ui:menu_editor'),
            iosIcon: 'pencil',
            androidIcon: 'edit',
            onPress: () => router.replace('/game-hub-editor'),
          },
          {
            key: 'rewards',
            label: t('game_hub_ui:menu_rewards'),
            iosIcon: 'star.fill',
            androidIcon: 'star',
            onPress: () => router.push('/rewards-and-reviews-editor'),
          },
          {
            key: 'reset',
            label: t('game_hub_ui:menu_reset'),
            iosIcon: 'arrow.counterclockwise',
            androidIcon: 'refresh',
            onPress: () => router.replace('/game-hub-editor?tab=boards'),
          },
        ]}
      />
    );
  }

  if (context === 'hub') return null;

  return (
    <HeaderNavButton
      label={t('game_hub_ui:menu_pill')}
      iconIos="gamecontroller.fill"
      iconAndroid="sports-esports"
      onPress={() => router.replace('/game-hub')}
    />
  );
}
