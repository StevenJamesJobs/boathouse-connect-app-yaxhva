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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { splashColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export default function JoinCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ organizationId: string }>();
  const { organizationId: contextOrgId, organization } = useOrganization();
  const organizationId = params.organizationId || contextOrgId;

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>(organization.name);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchCode() {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('join_code, name')
          .eq('id', organizationId)
          .single();

        if (error) {
          console.error('[JoinCode] Fetch error:', error);
        } else if (data) {
          setJoinCode(data.join_code);
          setOrgName(data.name || organization.name);
        }
      } catch (err) {
        console.error('[JoinCode] Unexpected error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCode();
  }, [organizationId]);

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
        message: `Join ${orgName} on MyResto Connect! Use code: ${joinCode}`,
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
      <View style={styles.content}>
        {/* Success icon */}
        <View style={styles.iconCircle}>
          <IconSymbol
            ios_icon_name="checkmark.circle.fill"
            android_material_icon_name="check-circle"
            size={48}
            color="#FFFFFF"
          />
        </View>

        <Text style={styles.title}>You're All Set!</Text>
        <Text style={styles.subtitle}>
          {orgName} is ready to go. Share the join code below with your team.
        </Text>

        {/* Join code display */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your Join Code</Text>
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
              {copied ? 'Copied!' : 'Copy Code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <IconSymbol
              ios_icon_name="square.and.arrow.up"
              android_material_icon_name="share"
              size={20}
              color={splashColors.primary}
            />
            <Text style={styles.actionText}>Share</Text>
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
            Share this code with your staff. They'll use it to join your
            restaurant on MyResto Connect.
          </Text>
        </View>
      </View>

      {/* Go to Dashboard */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleGoToDashboard}
        >
          <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
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
  content: {
    flex: 1,
    paddingTop: 100,
    paddingHorizontal: 24,
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
