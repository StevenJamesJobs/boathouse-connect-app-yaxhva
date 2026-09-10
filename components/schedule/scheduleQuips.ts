import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The schedule scanner's rotating one-liners (s83, Steve's list) — fed to the
 * shared ScanQuip rotor via its `quips` prop. Keys are spelled out literally so
 * the i18n harvester sees every reference; both locales carry all 23.
 */
export function useScheduleQuips(): string[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      t('schedule_upload.quip_itinerary', 'Contemplating the meaning of your itinerary.'),
      t('schedule_upload.quip_sunday', 'Questioning if Sunday is real.'),
      t('schedule_upload.quip_meeting', 'Hoping this meeting gets canceled.'),
      t('schedule_upload.quip_freezer', 'Estimating walk-in freezer crying sessions based on this grid: 7.'),
      t('schedule_upload.quip_lunch', 'Looking for hidden lunch breaks.'),
      t('schedule_upload.quip_friday', 'Counting the seconds until Friday.'),
      t('schedule_upload.quip_naps', 'Adding 10-minute naps everywhere.'),
      t('schedule_upload.quip_spacetime', 'Bending the space-time continuum.'),
      t('schedule_upload.quip_oracle', 'Consulting the digital oracle.'),
      t('schedule_upload.quip_freetime', 'Rescuing your lost free time.'),
      t('schedule_upload.quip_mercury', 'Re-routing around Mercury retrograde.'),
      t('schedule_upload.quip_wires', 'Untangling wires… and by that I mean this scheduling mess.'),
      t('schedule_upload.quip_workload', 'Pretending to understand this workload.'),
      t('schedule_upload.quip_coffee', 'Applying digital coffee to calendar.'),
      t('schedule_upload.quip_thatguy', 'Oh boy… that guy again!'),
      t('schedule_upload.quip_silverware', 'Predicting silverware-rolling evasion tactics to peak around 9:30 PM.'),
      t('schedule_upload.quip_cartrouble', 'Predicting three "car troubles" and one "sudden 24-hour flu" for Saturday morning.'),
      t('schedule_upload.quip_alarm', 'Adjusting for his inevitable "my alarm didn\'t go off" texts.'),
      t('schedule_upload.quip_goodluck', 'Applying the "Good Luck with That" filter.'),
      t('schedule_upload.quip_clone', 'Creating a clone for your 8:00 AM meetings.'),
      t('schedule_upload.quip_weekend', 'Plotting a permanent weekend.'),
      t('schedule_upload.quip_snacks', 'Replacing all shifts with snack breaks.'),
      t('schedule_upload.quip_hiding', 'Hiding from your notifications.'),
    ],
    [t]
  );
}
