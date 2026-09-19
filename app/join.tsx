/**
 * Employee join (s86, mockup Row 6) — five steps on the owners' rail:
 *   1 Code · 2 You · 3 Jobs · 4 Theme · 5 Review → Create Account.
 *
 * NOTHING is written until the last tap: quitting early leaves no half-made account. Step 2's
 * Next asks the server once (join_prepare — pre-auth, join-code gated, shares the join
 * throttle) for the REAL username (collision suffix resolved), whether the email is already
 * on this team, and the positions a joiner may pick (the org's own list minus management
 * titles), so nobody fills five steps to be bounced at the end. The theme step works before
 * the account exists because themes are a device preference.
 *
 * join_signup re-validates everything server-side and returns the authenticated row, which
 * is adopted as the session; the root layout then forces /change-password.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { hexToRgba } from '@/styles/commonStyles';
import { fonts } from '@/constants/fonts';
import { IconSymbol } from '@/components/IconSymbol';
import GlassCard from '@/components/GlassCard';
import AppearanceBody from '@/components/appearance/AppearanceBody';
import { THEME_LABEL_KEY } from '@/components/appearance/appearanceKit';
import { supabase } from '@/app/integrations/supabase/client';
import { deriveUsername } from '@/utils/username';
import { translateServerError } from '@/utils/serverErrors';
import { markPersonalized } from '@/utils/deviceFlags';
import {
  OnbScreen,
  OnboardingRail,
  OnboardingDock,
  Hero,
  IconField,
  InfoBlurb,
  Body,
  B,
  UsernameChip,
  Pill,
  ErrorLine,
  useOnbAccents,
} from '@/components/onboarding/OnboardingKit';

// Join-screen override: these two join errors have richer join.* copy ("check with your
// manager" guidance) than the generic server_errors.* pair every other surface uses.
// Site-local on purpose — the shared map stays 1:1.
const JOIN_COPY_OVERRIDES: Record<string, string> = {
  'Invalid join code': 'join.invalid_code',
  'Self-registration is disabled for this organization': 'join.self_signup_disabled',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAGLINE_MAX = 60;

/** "robi7967" → "ROBI-7967": upper-case, and the dash drops itself in after four. */
function formatJoinCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export default function JoinScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { adoptSession } = useAuth();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [joinCode, setJoinCode] = useState('');
  const [orgName, setOrgName] = useState('');
  // A valid code whose org has self-signup switched off: stay on step 1 with the note.
  const [signupClosed, setSignupClosed] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tagline, setTagline] = useState('');

  const [username, setUsername] = useState('');
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const hasTitles = titleOptions.length > 0;
  const railSteps = [t('join.rail_code'), t('join.rail_you'), t('join.rail_jobs'), t('join.rail_theme'), t('join.rail_review')];

  // Prefer this screen's richer copy for the two errors that have it;
  // everything else goes through the shared server-error map.
  const joinServerError = (err: { message?: string | null } | null | undefined) => {
    const overrideKey = JOIN_COPY_OVERRIDES[(err?.message || '').trim()];
    return overrideKey ? t(overrideKey) : translateServerError(err, t('onboarding.something_went_wrong'));
  };

  const goTo = (n: number) => {
    setError('');
    setStep(n);
  };

  // ── Step 1: the code ───────────────────────────────────────────────────
  const handleLookupCode = async () => {
    const code = joinCode.trim();
    if (!code) {
      setError(t('join.enter_code_required'));
      return;
    }
    setIsLoading(true);
    setError('');
    setSignupClosed(false);
    try {
      const { data, error: queryError } = await supabase.rpc('lookup_join_code', { p_join_code: code });
      const row = Array.isArray(data) ? data[0] : data;
      if (queryError || !row) {
        setError(queryError ? joinServerError(queryError) : t('join.invalid_code'));
        return;
      }
      setOrgName(row.org_name);
      if (!row.allow_self_signup) {
        setSignupClosed(true);
        return;
      }
      goTo(2);
    } catch (e) {
      console.error('[Join] Error looking up code:', e);
      setError(t('onboarding.something_went_wrong'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: about you → the quiet server check ─────────────────────────
  const handlePrepare = async () => {
    if (!firstName.trim()) return setError(t('onboarding.first_name_required'));
    if (!lastName.trim()) return setError(t('onboarding.last_name_required'));
    if (!email.trim()) return setError(t('onboarding.email_required'));
    if (!EMAIL_RE.test(email.trim())) return setError(t('onboarding.email_invalid'));

    setIsLoading(true);
    setError('');
    try {
      const { data, error: prepError } = await supabase.rpc('join_prepare', {
        p_join_code: joinCode.trim(),
        p_username: deriveUsername(firstName, lastName),
        p_email: email.trim(),
      });
      if (prepError) {
        setError(joinServerError(prepError));
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        // The code stopped resolving (regenerated meanwhile) — back to step 1.
        setStep(1);
        setError(t('join.invalid_code'));
        return;
      }
      if (!row.allow_self_signup) {
        setStep(1);
        setSignupClosed(true);
        return;
      }
      if (row.email_in_use) {
        setError(t('server_errors.s86_email_on_team'));
        return;
      }
      const options: string[] = row.job_titles ?? [];
      setUsername(row.username);
      setOrgName(row.org_name);
      setTitleOptions(options);
      setPicked((prev) => prev.filter((p) => options.includes(p)));
      goTo(options.length > 0 ? 3 : 4);
    } catch (e) {
      console.error('[Join] join_prepare error:', e);
      setError(t('onboarding.something_went_wrong'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 5: create ─────────────────────────────────────────────────────
  const handleCreateAccount = async () => {
    setIsLoading(true);
    setError('');
    try {
      // join_signup re-validates the code + self-signup flag, the email, and the picked
      // positions; resolves a free username from this base server-side (numeric suffix on
      // collision); creates the employee with the org's default password — which never
      // reaches this client — and returns the authenticated row (login_user shape).
      const { data, error: signupError } = await supabase.rpc('join_signup', {
        p_join_code: joinCode.trim(),
        p_username: deriveUsername(firstName, lastName),
        p_name: `${firstName.trim()} ${lastName.trim()}`,
        p_email: email.trim(),
        p_phone: phone.trim(),
        p_tagline: tagline.trim() || undefined,
        p_job_titles: picked.length > 0 ? picked : undefined,
      });
      if (signupError) {
        console.error('[Join] Error creating account:', signupError);
        setError(joinServerError(signupError));
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError(t('onboarding.something_went_wrong'));
        return;
      }
      // The row is already authenticated — adopt it as the session (no credential round-trip).
      const adopted = await adoptSession(row, false);
      if (adopted) {
        // The forced password screen shows them their username; the root layout would send
        // them there anyway (force_password_change is true on every self-signup).
        router.replace('/change-password');
      } else {
        setError(t('join.created_signin_failed', { username: row.username }));
      }
    } catch (e: any) {
      console.error('[Join] Error creating account:', e);
      setError(joinServerError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const onBack = () => {
    if (step === 1) {
      if (router.canGoBack()) router.back();
      else router.replace('/welcome');
      return;
    }
    // Step 3 is skipped when the org offers no pickable positions.
    goTo(step === 4 && !hasTitles ? 2 : step - 1);
  };

  const onNext = () => {
    if (step === 1) return void handleLookupCode();
    if (step === 2) return void handlePrepare();
    if (step === 3) {
      if (picked.length === 0) return setError(t('join.pick_position_required'));
      return goTo(4);
    }
    if (step === 4) {
      markPersonalized();
      return goTo(5);
    }
    return void handleCreateAccount();
  };

  const last = step === 5;

  return (
    <OnbScreen
      header={<OnboardingRail steps={railSteps} current={step} rightLabel={step === 1 ? t('join.rail_right_default') : orgName} />}
      dock={
        <OnboardingDock
          onBack={onBack}
          nextLabel={step === 1 ? t('join.continue') : last ? t('join.create_account') : t('onboarding.next')}
          nextIosIcon={last ? 'checkmark' : undefined}
          nextAndroidIcon={last ? 'check' : undefined}
          nextLeading={last}
          onNext={onNext}
          loading={isLoading}
        />
      }
    >
      {step === 1 && (
        <StepCode
          joinCode={joinCode}
          onChangeCode={(v) => { setJoinCode(formatJoinCode(v)); setError(''); setSignupClosed(false); }}
          onSubmit={handleLookupCode}
          disabled={isLoading}
          closedOrg={signupClosed ? orgName : null}
        />
      )}
      {step === 2 && (
        <StepYou
          orgName={orgName}
          firstName={firstName}
          lastName={lastName}
          email={email}
          phone={phone}
          tagline={tagline}
          disabled={isLoading}
          onChange={(field, v) => {
            setError('');
            if (field === 'firstName') setFirstName(v);
            else if (field === 'lastName') setLastName(v);
            else if (field === 'email') setEmail(v);
            else if (field === 'phone') setPhone(v);
            else setTagline(v.slice(0, TAGLINE_MAX));
          }}
        />
      )}
      {step === 3 && (
        <StepJobs
          orgName={orgName}
          options={titleOptions}
          picked={picked}
          onToggle={(title) => {
            setError('');
            setPicked((prev) => (prev.includes(title) ? prev.filter((p) => p !== title) : [...prev, title]));
          }}
        />
      )}
      {step === 4 && <StepTheme />}
      {step === 5 && (
        <StepReview
          name={`${firstName.trim()} ${lastName.trim()}`}
          orgName={orgName}
          username={username}
          email={email.trim()}
          phone={phone.trim()}
          tagline={tagline.trim()}
          picked={titleOptions.filter((o) => picked.includes(o))}
          onEdit={goTo}
        />
      )}
      <ErrorLine message={error} />
    </OnbScreen>
  );
}

// ── Step bodies (top-level module components) ──────────────────────────────

function StepCode({ joinCode, onChangeCode, onSubmit, disabled, closedOrg }: { joinCode: string; onChangeCode: (v: string) => void; onSubmit: () => void; disabled: boolean; closedOrg: string | null }) {
  const { t } = useTranslation();
  return (
    <>
      <Hero iosIcon="ticket.fill" androidIcon="confirmation-number" tone="pop" title={t('join.title')} subtitle={t('join.subtitle')} />
      <GlassCard variant="glass" radius={16} style={styles.card}>
        <IconField
          value={joinCode}
          onChangeText={onChangeCode}
          placeholder={t('join.code_ph')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          editable={!disabled}
          mono
          style={styles.codeInput}
        />
      </GlassCard>
      {closedOrg ? (
        <InfoBlurb iosIcon="building.2.fill" androidIcon="store">
          <Body><B>{closedOrg}</B></Body>
          <Body>{t('join.self_signup_disabled')}</Body>
        </InfoBlurb>
      ) : (
        <InfoBlurb>
          <Body><B>{t('join.no_code_lead')}</B> {t('join.no_code_body')}</Body>
        </InfoBlurb>
      )}
    </>
  );
}

type YouField = 'firstName' | 'lastName' | 'email' | 'phone' | 'tagline';

function StepYou({ orgName, firstName, lastName, email, phone, tagline, disabled, onChange }: { orgName: string; firstName: string; lastName: string; email: string; phone: string; tagline: string; disabled: boolean; onChange: (field: YouField, v: string) => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  const preview = firstName.trim() && lastName.trim() ? deriveUsername(firstName, lastName) : '';
  return (
    <>
      <View style={[styles.orgBadge, { backgroundColor: hexToRgba(a.ok, 0.09), borderColor: hexToRgba(a.ok, 0.3) }]}>
        <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={18} color={a.ok} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: a.ok }]}>{t('join.joining_eyebrow')}</Text>
          <Text style={[styles.orgBadgeName, { color: colors.text }]} numberOfLines={1}>{orgName}</Text>
        </View>
      </View>

      <GlassCard variant="glass" radius={16} style={styles.card}>
        <View style={styles.two}>
          <IconField containerStyle={styles.flex1} label={t('onboarding.first_name')} required value={firstName} onChangeText={(v) => onChange('firstName', v)} autoCapitalize="words" textContentType="givenName" returnKeyType="next" editable={!disabled} />
          <IconField containerStyle={styles.flex1} label={t('onboarding.last_name')} required value={lastName} onChangeText={(v) => onChange('lastName', v)} autoCapitalize="words" textContentType="familyName" returnKeyType="next" editable={!disabled} />
        </View>
        {!!preview && (
          <View style={styles.unRow}>
            <Text style={[styles.unLead, { color: colors.textSecondary }]}>{t('onboarding.username_will_be')}</Text>
            <UsernameChip username={preview} />
          </View>
        )}
        <IconField label={t('onboarding.email')} required iosIcon="envelope.fill" androidIcon="email" value={email} onChangeText={(v) => onChange('email', v)} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="next" editable={!disabled} />
        <IconField
          label={t('join.phone')}
          iosIcon="phone.fill"
          androidIcon="phone"
          value={phone}
          onChangeText={(v) => onChange('phone', v)}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          mono
          editable={!disabled}
          hint={
            <View style={styles.privacy}>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={12} color={a.quiet} style={{ marginTop: 2 }} />
              <Text style={[styles.privacyText, { color: colors.textSecondary }]}>{t('join.privacy_note')}</Text>
            </View>
          }
        />
      </GlassCard>

      <GlassCard variant="glass" radius={16} style={styles.card}>
        <IconField
          label={t('join.tagline')}
          labelTrailing={<Text style={[styles.counter, { color: colors.textSecondary }]}>{tagline.length} / {TAGLINE_MAX}</Text>}
          iosIcon="quote.bubble.fill"
          androidIcon="format-quote"
          placeholder={t('join.tagline_ph')}
          value={tagline}
          onChangeText={(v) => onChange('tagline', v)}
          maxLength={TAGLINE_MAX}
          returnKeyType="done"
          editable={!disabled}
          hint={t('join.tagline_hint')}
        />
      </GlassCard>
    </>
  );
}

function StepJobs({ orgName, options, picked, onToggle }: { orgName: string; options: string[]; picked: string[]; onToggle: (title: string) => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <>
      <Hero align="left" title={t('join.positions_title')} subtitle={t('join.positions_subtitle')} />
      <GlassCard variant="glass" radius={16} style={[styles.card, { gap: 12 }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.eyebrow, { color: a.quiet, flex: 1 }]} numberOfLines={1}>{t('join.positions_at', { orgName })}</Text>
          <Text style={[styles.eyebrow, { color: a.pop }]}>{t('join.n_selected', { n: picked.length })}</Text>
        </View>
        <View style={styles.chips}>
          {options.map((title) => {
            const on = picked.includes(title);
            return (
              <Pressable
                key={title}
                onPress={() => onToggle(title)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[
                  styles.chip,
                  on
                    ? { backgroundColor: hexToRgba(a.pop, 0.13), borderColor: hexToRgba(a.pop, 0.42) }
                    : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                ]}
              >
                {/* Always-present slot (○ → ✓): the chip keeps its width, so picking never reflows the row. */}
                <IconSymbol
                  ios_icon_name={on ? 'checkmark.circle.fill' : 'circle'}
                  android_material_icon_name={on ? 'check-circle' : 'radio-button-unchecked'}
                  size={14}
                  color={on ? a.pop : colors.textSecondary}
                />
                <Text style={[styles.chipText, { color: on ? colors.text : colors.textSecondary }]}>{title}</Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
      <InfoBlurb iosIcon="lock.fill" androidIcon="lock">
        <Body>{t('join.positions_note')} <B>{t('join.positions_lock')}</B></Body>
      </InfoBlurb>
    </>
  );
}

function StepTheme() {
  const { t } = useTranslation();
  return (
    <>
      <Hero align="left" title={t('personalize.title')} subtitle={t('personalize.subtitle')} />
      <AppearanceBody showTags={false} />
    </>
  );
}

function StepReview({ name, orgName, username, email, phone, tagline, picked, onEdit }: { name: string; orgName: string; username: string; email: string; phone: string; tagline: string; picked: string[]; onEdit: (step: number) => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { palette, resolvedMode } = useAppTheme();
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
  const modeLabel = t(resolvedMode === 'dark' ? 'appearance.dark_mode' : 'appearance.light_mode');
  return (
    <>
      <Hero align="left" title={t('join.review_title')} />
      <InfoBlurb iosIcon="key.fill" androidIcon="vpn-key">
        <Body>{t('join.review_note')}</Body>
      </InfoBlurb>

      <GlassCard variant="glass" radius={18} style={styles.idCard}>
        <View style={[styles.avatar, { backgroundColor: hexToRgba(colors.tint, 0.18), borderColor: colors.glassBorder }]}>
          <Text style={{ fontFamily: fonts.display.bold, fontSize: 15, color: colors.tint }}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.idName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.idSub, { color: colors.textSecondary }]} numberOfLines={1}>{t('join.joining', { orgName })}</Text>
          <View style={{ marginTop: 3 }}><UsernameChip username={username} /></View>
        </View>
        <EditChip onPress={() => onEdit(2)} />
      </GlassCard>

      <ReviewCard iosIcon="lock.fill" androidIcon="lock" title={t('join.review_contact')} pill={<Pill label={t('join.private_pill')} />} onEdit={() => onEdit(2)}>
        <ReviewLine iosIcon="envelope.fill" androidIcon="email" text={email} />
        {!!phone && <ReviewLine iosIcon="phone.fill" androidIcon="phone" text={phone} mono />}
      </ReviewCard>

      {picked.length > 0 && (
        <ReviewCard iosIcon="briefcase.fill" androidIcon="work" title={t('join.review_positions')} pill={<Pill tone="pop" label={t('join.locks_pill')} />} onEdit={() => onEdit(3)}>
          <View style={styles.minis}>
            {picked.map((p) => (
              <View key={p} style={[styles.mini, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <Text style={[styles.miniText, { color: colors.text }]}>{p}</Text>
              </View>
            ))}
          </View>
        </ReviewCard>
      )}

      {!!tagline && (
        <ReviewCard iosIcon="quote.bubble.fill" androidIcon="format-quote" title={t('join.tagline')} onEdit={() => onEdit(2)}>
          <Text style={[styles.lineText, { color: colors.text }]}>“{tagline}”</Text>
        </ReviewCard>
      )}

      <ReviewCard iosIcon="paintpalette.fill" androidIcon="palette" title={t('join.review_theme')} onEdit={() => onEdit(4)}>
        <View style={styles.themeRow}>
          {[colors.background, colors.ember, colors.tint].map((c, i) => (
            <View key={i} style={[styles.swatch, { backgroundColor: c, borderColor: colors.glassBorder }]} />
          ))}
          <Text style={[styles.lineText, { color: colors.textSecondary }]}>
            <Text style={{ fontFamily: fonts.body.semibold, color: colors.text }}>{t(THEME_LABEL_KEY[palette])}</Text> · {modeLabel}
          </Text>
        </View>
      </ReviewCard>
    </>
  );
}

function EditChip({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.editChip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={13} color={colors.text} />
      <Text style={[styles.editText, { color: colors.text }]}>{t('join.edit')}</Text>
    </Pressable>
  );
}

function ReviewCard({ iosIcon, androidIcon, title, pill, onEdit, children }: { iosIcon: string; androidIcon: string; title: string; pill?: React.ReactNode; onEdit: () => void; children: React.ReactNode }) {
  const colors = useThemeColors();
  const a = useOnbAccents();
  return (
    <GlassCard variant="glass" radius={16} style={styles.reviewCard}>
      <View style={styles.reviewHead}>
        <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={15} color={a.quiet} />
        <Text style={[styles.reviewTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {pill}
        <EditChip onPress={onEdit} />
      </View>
      {children}
    </GlassCard>
  );
}

function ReviewLine({ iosIcon, androidIcon, text, mono }: { iosIcon: string; androidIcon: string; text: string; mono?: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={styles.line}>
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={androidIcon} size={13} color={colors.textSecondary} />
      <Text style={[styles.lineText, { color: colors.text, flex: 1 }, mono && { fontFamily: fonts.mono.medium }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  flex1: { flex: 1 },
  two: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontFamily: fonts.mono.semibold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' },
  codeInput: { fontFamily: fonts.mono.semibold, fontSize: 26, letterSpacing: 4, textAlign: 'center', paddingVertical: 16 },

  orgBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
  orgBadgeName: { fontFamily: fonts.body.semibold, fontSize: 14, marginTop: 1 },
  unRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unLead: { fontFamily: fonts.body.regular, fontSize: 12 },
  privacy: { flexDirection: 'row', gap: 6, marginTop: 6 },
  privacyText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 11.5, lineHeight: 16 },
  counter: { fontFamily: fonts.mono.medium, fontSize: 10 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: fonts.body.semibold, fontSize: 13 },

  idCard: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  idName: { fontFamily: fonts.display.bold, fontSize: 17, letterSpacing: -0.2 },
  idSub: { fontFamily: fonts.body.regular, fontSize: 11.5 },

  reviewCard: { padding: 12, gap: 9 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewTitle: { flex: 1, fontFamily: fonts.display.semibold, fontSize: 14 },
  editChip: { height: 30, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  editText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontFamily: fonts.body.regular, fontSize: 12.5 },
  minis: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mini: { height: 26, paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, justifyContent: 'center' },
  miniText: { fontFamily: fonts.body.semibold, fontSize: 11.5 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 22, height: 22, borderRadius: 8, borderWidth: 1 },
});
