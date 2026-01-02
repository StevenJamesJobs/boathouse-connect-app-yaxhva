
import React, { useState, useMemo } from 'react';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 8,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  optionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderWidth: 2,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultSection: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginTop: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultLabel: {
    fontSize: 14,
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  finalTallySection: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
  },
  finalTallyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  finalTallyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  finalTallyLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  finalTallyValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  negativeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  negativeToggleText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default function CheckOutCalculatorScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;

  const [creditCardTips, setCreditCardTips] = useState('');
  const [cashTips, setCashTips] = useState('');
  const [busserRunnerTipOut, setBusserRunnerTipOut] = useState('3');
  const [bartenderTipOut, setBartenderTipOut] = useState('10');
  const [sharedParty, setSharedParty] = useState<boolean | null>(null);
  const [partySubtotal, setPartySubtotal] = useState('');
  const [checkUnderMyName, setCheckUnderMyName] = useState<boolean | null>(null);
  const [partyGratuity, setPartyGratuity] = useState('');
  const [isNegative, setIsNegative] = useState(false);

  const calculateResults = useMemo(() => {
    const ccTips = parseFloat(creditCardTips) || 0;
    const cTips = parseFloat(cashTips) || 0;
    const busserPercent = parseFloat(busserRunnerTipOut) || 0;
    const bartenderPercent = parseFloat(bartenderTipOut) || 0;

    const totalTips = ccTips + cTips;
    const busserAmount = (totalTips * busserPercent) / 100;
    const bartenderAmount = (totalTips * bartenderPercent) / 100;
    const totalTipOut = busserAmount + bartenderAmount;
    const netTips = totalTips - totalTipOut;

    let partyAmount = 0;
    let partyGratuityAfterTipOut = 0;
    let partySplit = 0;

    if (sharedParty && partySubtotal) {
      const subtotal = parseFloat(partySubtotal) || 0;
      partyAmount = isNegative ? -subtotal : subtotal;

      // Calculate party gratuity split if provided
      if (partyGratuity) {
        const gratuity = parseFloat(partyGratuity) || 0;
        const gratuityTipOut = (gratuity * (busserPercent + bartenderPercent)) / 100;
        partyGratuityAfterTipOut = gratuity - gratuityTipOut;
        partySplit = partyGratuityAfterTipOut / 2;
      }
    }

    const finalAmount = netTips + partyAmount;

    return {
      totalTips,
      busserAmount,
      bartenderAmount,
      totalTipOut,
      netTips,
      partyAmount,
      partyGratuityAfterTipOut,
      partySplit,
      finalAmount,
    };
  }, [
    creditCardTips,
    cashTips,
    busserRunnerTipOut,
    bartenderTipOut,
    sharedParty,
    partySubtotal,
    partyGratuity,
    isNegative,
  ]);

  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toFixed(2)}`;
  };

  const toggleNegative = () => {
    setIsNegative(!isNegative);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Check Out Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Tips Input Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tips Received</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Credit Card Tips</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={creditCardTips}
              onChangeText={setCreditCardTips}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Cash Tips</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={cashTips}
              onChangeText={setCashTips}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Tip Out Percentages */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tip Out Percentages</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Busser/Runner Tip Out %</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={busserRunnerTipOut}
              onChangeText={setBusserRunnerTipOut}
              keyboardType="decimal-pad"
              placeholder="3"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Bartender Tip Out %</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={bartenderTipOut}
              onChangeText={setBartenderTipOut}
              keyboardType="decimal-pad"
              placeholder="10"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={[styles.resultSection, { backgroundColor: colors.highlight, borderColor: colors.primary }]}>
            <Text style={[styles.resultTitle, { color: colors.text }]}>Tip Calculations</Text>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.text }]}>Total Tips:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(calculateResults.totalTips)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.text }]}>Busser/Runner:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(calculateResults.busserAmount)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.text }]}>Bartender:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(calculateResults.bartenderAmount)}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.text, fontWeight: 'bold' }]}>Net Tips:</Text>
              <Text style={[styles.resultValue, { color: colors.primary }]}>{formatCurrency(calculateResults.netTips)}</Text>
            </View>
          </View>
        </View>

        {/* Shared Party Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Did you share a party?</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                { borderColor: colors.border, backgroundColor: sharedParty === true ? colors.primary : colors.background },
                sharedParty === true && styles.optionButtonSelected,
              ]}
              onPress={() => {
                setSharedParty(true);
                if (!partySubtotal) setPartySubtotal('');
              }}
            >
              <Text style={[styles.optionButtonText, { color: sharedParty === true ? '#fff' : colors.text }]}>Yes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionButton,
                { borderColor: colors.border, backgroundColor: sharedParty === false ? colors.primary : colors.background },
                sharedParty === false && styles.optionButtonSelected,
              ]}
              onPress={() => {
                setSharedParty(false);
                setPartySubtotal('');
                setCheckUnderMyName(null);
                setPartyGratuity('');
              }}
            >
              <Text style={[styles.optionButtonText, { color: sharedParty === false ? '#fff' : colors.text }]}>No</Text>
            </TouchableOpacity>
          </View>

          {sharedParty === true && (
            <>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Party Subtotal</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={partySubtotal}
                  onChangeText={setPartySubtotal}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity
                  style={[styles.negativeToggle, { borderColor: colors.border, backgroundColor: isNegative ? colors.primary : colors.background }]}
                  onPress={toggleNegative}
                >
                  <IconSymbol name={isNegative ? 'checkmark.square.fill' : 'square'} size={20} color={isNegative ? '#fff' : colors.text} />
                  <Text style={[styles.negativeToggleText, { color: isNegative ? '#fff' : colors.text }]}>Make Negative</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Is the check under my name?</Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      { borderColor: colors.border, backgroundColor: checkUnderMyName === true ? colors.primary : colors.background },
                      checkUnderMyName === true && styles.optionButtonSelected,
                    ]}
                    onPress={() => setCheckUnderMyName(true)}
                  >
                    <Text style={[styles.optionButtonText, { color: checkUnderMyName === true ? '#fff' : colors.text }]}>Yes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      { borderColor: colors.border, backgroundColor: checkUnderMyName === false ? colors.primary : colors.background },
                      checkUnderMyName === false && styles.optionButtonSelected,
                    ]}
                    onPress={() => setCheckUnderMyName(false)}
                  >
                    <Text style={[styles.optionButtonText, { color: checkUnderMyName === false ? '#fff' : colors.text }]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Party Gratuity (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={partyGratuity}
                  onChangeText={setPartyGratuity}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {partyGratuity && parseFloat(partyGratuity) > 0 && (
                <View style={[styles.resultSection, { backgroundColor: colors.highlight, borderColor: colors.primary }]}>
                  <Text style={[styles.resultTitle, { color: colors.text }]}>Party Gratuity Split</Text>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.text }]}>Original Gratuity:</Text>
                    <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(parseFloat(partyGratuity))}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.text }]}>After Tip Outs:</Text>
                    <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(calculateResults.partyGratuityAfterTipOut)}</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.text, fontWeight: 'bold' }]}>Your Split:</Text>
                    <Text style={[styles.resultValue, { color: colors.primary }]}>{formatCurrency(calculateResults.partySplit)}</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Final Tally */}
        <View style={[styles.finalTallySection, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <Text style={[styles.finalTallyTitle, { color: '#fff' }]}>Final Tally</Text>

          <View style={styles.finalTallyRow}>
            <Text style={[styles.finalTallyLabel, { color: '#fff' }]}>Net Tips:</Text>
            <Text style={[styles.finalTallyValue, { color: '#fff' }]}>{formatCurrency(calculateResults.netTips)}</Text>
          </View>

          {sharedParty && partySubtotal && (
            <View style={styles.finalTallyRow}>
              <Text style={[styles.finalTallyLabel, { color: '#fff' }]}>
                {checkUnderMyName ? 'You Owe:' : 'You Are Owed:'}
              </Text>
              <Text style={[styles.finalTallyValue, { color: '#fff' }]}>{formatCurrency(calculateResults.partyAmount)}</Text>
            </View>
          )}

          {sharedParty && partyGratuity && parseFloat(partyGratuity) > 0 && (
            <View style={styles.finalTallyRow}>
              <Text style={[styles.finalTallyLabel, { color: '#fff' }]}>
                {checkUnderMyName ? 'You Owe Your Teammate:' : 'Your Teammate Owes You:'}
              </Text>
              <Text style={[styles.finalTallyValue, { color: '#fff' }]}>{formatCurrency(calculateResults.partySplit)}</Text>
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />

          <View style={styles.finalTallyRow}>
            <Text style={[styles.finalTallyLabel, { color: '#fff', fontSize: 18 }]}>Total:</Text>
            <Text style={[styles.finalTallyValue, { color: '#fff', fontSize: 22 }]}>{formatCurrency(calculateResults.finalAmount)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
