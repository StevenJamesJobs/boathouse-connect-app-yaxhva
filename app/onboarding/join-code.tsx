import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

export default function JoinCodeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const { user } = useAuth();

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>(organization.name);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchCode() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        // Member-gated: get_org returns the caller's own org (join_code included).
        const { data, error } = await supabase.rpc('get_org', { p_actor_id: user.id });
        const row: any = Array.isArray(data) ? data[0] : data;

        if (error) {
          console.error('[JoinCode] Fetch error:', error);
        } else if (row) {
          setJoinCode(row.join_code);
          setOrgName(row.name || organization.name);
        }
      } catch (err) {
        console.error('[JoinCode] Unexpected error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCopy = async () => {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!joinCode) return;
    try {
      await Share.share({
        message: t('onboarding.share_message', { orgName, joinCode }),
      });
    } catch (err) {
      console.error('[JoinCode] Share error:', err);
    }
  };

  const handleGoToDashboard = () => {
    router.replace('/(portal)/manager');
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={splashColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Success icon */}
        <View style={styles.iconCircle}>
          <IconSymbol
            ios_icon_name="checkmark.circle.fill"
            android_material_icon_name="check-circle"
            size={48}
            color="#FFFFFF"
          />
        </View>

        <Text style={styles.title}>{t('onboarding.join_all_set_title')}</Text>
        <Text style={styles.subtitle}>
          {t('onboarding.join_code_ready', { orgName })}
        </Text>

        {/* Join code display */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>{t('onboarding.join_code_title')}</Text>
          <Text style={styles.codeText}>{joinCode || '----'}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
            <IconSymbol
              ios_icon_name={copied ? 'checkmark' : 'doc.on.doc'}
              android_material_icon_name={copied ? 'check' : 'content-copy'}
              size={20}
              color={splashColors.primary}
            />
            <Text style={styles.actionText}>
              {copied ? t('onboarding.copied') : t('onboarding.copy_code')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <IconSymbol
              ios_icon_name="square.and.arrow.up"
              android_material_icon_name="share"
              size={20}
              color={splashColors.primary}
            />
            <Text style={styles.actionText}>{t('onboarding.share')}</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={20}
            color={splashColors.primary}
          />
          <Text style={styles.instructionsText}>
            {t('onboarding.join_code_instructions')}
          </Text>
        </View>

        {/* Premium trial features */}
        <View style={styles.trialCard}>
          <View style={styles.trialHeader}>
            <IconSymbol
              ios_icon_name="crown.fill"
              android_material_icon_name="workspace-premium"
              size={20}
              color={splashColors.primary}
            />
            <Text style={styles.trialTitle}>{t('onboarding.trial_title')}</Text>
          </View>
          <Text style={styles.trialBody}>
            {t('onboarding.trial_body')}
          </Text>
          {[
            t('onboarding.trial_feature_1'),
            t('onboarding.trial_feature_2'),
            t('onboarding.trial_feature_3'),
            t('onboarding.trial_feature_4'),
            t('onboarding.trial_feature_5'),
          ].map((f) => (
            <View key={f} style={styles.trialRow}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={16}
                color={splashColors.primary}
              />
              <Text style={styles.trialItem}>{f}</Text>
            </View>
          ))}
          <Text style={styles.trialFooter}>
            {t('onboarding.trial_footer')}
          </Text>
        </View>
      </ScrollView>

      {/* Go to Dashboard */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleGoToDashboard}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.go_to_dashboard')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashColors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },

  // Success icon
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: splashColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: splashColors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: splashColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },

  // Code card
  codeCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: splashColors.secondary,
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: splashColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '800',
    color: splashColors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 3,
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: splashColors.secondary,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: splashColors.primary,
  },

  // Instructions
  instructionsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EDF5FA',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    color: splashColors.text,
    lineHeight: 20,
  },

  // Premium trial card
  trialCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: splashColors.secondary,
  },
  trialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  trialTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: splashColors.text,
  },
  trialBody: {
    fontSize: 14,
    color: splashColors.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  trialRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  trialItem: {
    flex: 1,
    fontSize: 14,
    color: splashColors.text,
    lineHeight: 19,
  },
  trialFooter: {
    fontSize: 13,
    color: splashColors.textSecondary,
    lineHeight: 18,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    backgroundColor: splashColors.background,
  },
  primaryButton: {
    backgroundColor: splashColors.primary,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 8px rgba(44, 95, 141, 0.2)',
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
