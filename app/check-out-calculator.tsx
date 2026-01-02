
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';

const CheckOutCalculatorScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;
  const scrollViewRef = useRef<ScrollView>(null);

  // Form state
  const [cashSales, setCashSales] = useState('');
  const [creditSales, setCreditSales] = useState('');
  const [cashedOutIn, setCashedOutIn] = useState('');
  const [sharedParty, setSharedParty] = useState<boolean | null>(null);
  const [partySubtotal, setPartySubtotal] = useState('');
  const [partyGratuity, setPartyGratuity] = useState('');
  const [checkUnderMyName, setCheckUnderMyName] = useState<boolean | null>(null);
  const [declarePercentage, setDeclarePercentage] = useState<number | null>(null);
  const [busserTipOut, setBusserTipOut] = useState<number | null>(null);
  const [bartenderTipOut, setBartenderTipOut] = useState<number | null>(null);

  // Real-time calculations using useMemo
  const calculationResults = useMemo(() => {
    return calculateResults();
  }, [
    cashSales,
    creditSales,
    cashedOutIn,
    sharedParty,
    partySubtotal,
    partyGratuity,
    checkUnderMyName,
    declarePercentage,
    busserTipOut,
    bartenderTipOut,
  ]);

  function calculateResults() {
    const cash = parseFloat(cashSales) || 0;
    const credit = parseFloat(creditSales) || 0;
    const cashedOut = parseFloat(cashedOutIn) || 0;

    const totalSales = cash + credit;
    const declaredTips = declarePercentage ? (totalSales * declarePercentage) / 100 : 0;

    let busserAmount = 0;
    let bartenderAmount = 0;
    let netTips = declaredTips;

    if (sharedParty && partySubtotal) {
      const partySub = parseFloat(partySubtotal) || 0;
      busserAmount = busserTipOut ? (partySub * busserTipOut) / 100 : 0;
      bartenderAmount = bartenderTipOut ? (partySub * bartenderTipOut) / 100 : 0;
    } else {
      busserAmount = busserTipOut ? (totalSales * busserTipOut) / 100 : 0;
      bartenderAmount = bartenderTipOut ? (totalSales * bartenderTipOut) / 100 : 0;
    }

    netTips = declaredTips - busserAmount - bartenderAmount;

    const finalAmount = cash + netTips - cashedOut;

    // Party Gratuity Calculation
    let partyGratuityAfterTipOuts = 0;
    let partyGratuitySplit = 0;
    let partyGratuityMessage = '';

    if (sharedParty && partyGratuity && partySubtotal) {
      const gratuity = parseFloat(partyGratuity) || 0;
      const partySub = parseFloat(partySubtotal) || 0;
      const partyBusserAmount = busserTipOut ? (partySub * busserTipOut) / 100 : 0;
      const partyBartenderAmount = bartenderTipOut ? (partySub * bartenderTipOut) / 100 : 0;

      partyGratuityAfterTipOuts = gratuity - partyBusserAmount - partyBartenderAmount;
      partyGratuitySplit = partyGratuityAfterTipOuts / 2;

      if (checkUnderMyName === true) {
        partyGratuityMessage = 'You owe your Teammate';
      } else if (checkUnderMyName === false) {
        partyGratuityMessage = 'Your Teammate owes you';
      }
    }

    return {
      totalSales,
      declaredTips,
      busserAmount,
      bartenderAmount,
      netTips,
      finalAmount,
      partyGratuityAfterTipOuts,
      partyGratuitySplit,
      partyGratuityMessage,
    };
  }

  const handleCalculate = () => {
    // Scroll to results section when Calculate is pressed
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Fixed Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Check Out Calculator
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cash Sales */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Cash Sales</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            value={cashSales}
            onChangeText={setCashSales}
          />
        </View>

        {/* Credit Sales */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Credit Sales</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            value={creditSales}
            onChangeText={setCreditSales}
          />
        </View>

        {/* Cashed Out/In Total */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Cashed Out/In Total</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="0.00 (use - for negative)"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            value={cashedOutIn}
            onChangeText={setCashedOutIn}
          />
        </View>

        {/* Did you share a party? */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Did you share a party?</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                sharedParty === true && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSharedParty(true)}
            >
              <Text style={[styles.optionText, { color: sharedParty === true ? '#fff' : colors.text }]}>
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                sharedParty === false && { backgroundColor: colors.primary },
              ]}
              onPress={() => {
                setSharedParty(false);
                setPartySubtotal('');
                setPartyGratuity('');
                setCheckUnderMyName(null);
              }}
            >
              <Text style={[styles.optionText, { color: sharedParty === false ? '#fff' : colors.text }]}>
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shared Party Section with Visual Separator */}
        {sharedParty === true && (
          <View style={[styles.sharedPartySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Party Subtotal */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Party Subtotal</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={partySubtotal}
                onChangeText={setPartySubtotal}
              />
            </View>

            {/* Party Gratuity */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Party Gratuity</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={partyGratuity}
                onChangeText={setPartyGratuity}
              />
            </View>

            {/* Is the check under my name? */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Is the check under my name?</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    checkUnderMyName === true && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setCheckUnderMyName(true)}
                >
                  <Text style={[styles.optionText, { color: checkUnderMyName === true ? '#fff' : colors.text }]}>
                    Yes
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.optionButton,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    checkUnderMyName === false && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setCheckUnderMyName(false)}
                >
                  <Text style={[styles.optionText, { color: checkUnderMyName === false ? '#fff' : colors.text }]}>
                    No
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Real-time Party Gratuity Display */}
            {partyGratuity && calculationResults.partyGratuityAfterTipOuts > 0 && (
              <View style={styles.realTimeDisplay}>
                <Text style={[styles.realTimeLabel, { color: colors.textSecondary }]}>
                  Party Gratuity After Tip Outs:
                </Text>
                <Text style={[styles.realTimeValue, { color: colors.primary }]}>
                  {formatCurrency(calculationResults.partyGratuityAfterTipOuts)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Declare Percentage Section with Visual Separator */}
        <View style={[styles.declareSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Declare Percentage</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Select Percentage</Text>
            <View style={styles.percentageRow}>
              {[15, 18, 20].map((percent) => (
                <TouchableOpacity
                  key={percent}
                  style={[
                    styles.percentButton,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    declarePercentage === percent && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setDeclarePercentage(percent)}
                >
                  <Text style={[styles.percentText, { color: declarePercentage === percent ? '#fff' : colors.text }]}>
                    {percent}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Busser/Runner Tip Out */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Busser/Runner Tip Out %</Text>
            <View style={styles.percentageRow}>
              {[2, 3, 4].map((percent) => (
                <TouchableOpacity
                  key={percent}
                  style={[
                    styles.percentButton,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    busserTipOut === percent && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setBusserTipOut(percent)}
                >
                  <Text style={[styles.percentText, { color: busserTipOut === percent ? '#fff' : colors.text }]}>
                    {percent}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bartender Tip Out */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Bartender Tip Out %</Text>
            <View style={styles.percentageRow}>
              {[1, 2, 3].map((percent) => (
                <TouchableOpacity
                  key={percent}
                  style={[
                    styles.percentButton,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    bartenderTipOut === percent && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setBartenderTipOut(percent)}
                >
                  <Text style={[styles.percentText, { color: bartenderTipOut === percent ? '#fff' : colors.text }]}>
                    {percent}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Calculate Button */}
        <TouchableOpacity
          style={[styles.calculateButton, { backgroundColor: colors.primary }]}
          onPress={handleCalculate}
        >
          <Text style={styles.calculateButtonText}>Calculate</Text>
        </TouchableOpacity>

        {/* Calculation Results - Now with real-time updates and extra padding */}
        <View style={[styles.resultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.resultsTitle, { color: colors.text }]}>Calculation Results</Text>

          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Total Sales:</Text>
            <Text style={[styles.resultValue, { color: colors.text }]}>
              {formatCurrency(calculationResults.totalSales)}
            </Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Declared Tips:</Text>
            <Text style={[styles.resultValue, { color: colors.text }]}>
              {formatCurrency(calculationResults.declaredTips)}
            </Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Busser/Runner Tip Out:</Text>
            <Text style={[styles.resultValue, { color: colors.text }]}>
              -{formatCurrency(calculationResults.busserAmount)}
            </Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Bartender Tip Out:</Text>
            <Text style={[styles.resultValue, { color: colors.text }]}>
              -{formatCurrency(calculationResults.bartenderAmount)}
            </Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Net Tips:</Text>
            <Text style={[styles.resultValue, { color: colors.text }]}>
              {formatCurrency(calculationResults.netTips)}
            </Text>
          </View>

          <View style={[styles.finalTallyDivider, { backgroundColor: colors.border }]} />

          <View style={styles.resultRow}>
            <Text style={[styles.finalTallyLabel, { color: colors.text }]}>Final Tally:</Text>
            <Text style={[styles.finalTallyValue, { color: colors.primary }]}>
              {calculationResults.finalAmount >= 0 ? 'You Owe' : 'You are Owed'}
            </Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={[styles.finalAmountValue, { color: colors.primary }]}>
              {formatCurrency(Math.abs(calculationResults.finalAmount))}
            </Text>
          </View>

          {/* Party Gratuity Split Display */}
          {sharedParty && partyGratuity && calculationResults.partyGratuitySplit > 0 && (
            <>
              <View style={[styles.partyGratuityDivider, { backgroundColor: colors.border }]} />

              <View style={styles.resultRow}>
                <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                  Party Gratuity After Tip Outs:
                </Text>
                <Text style={[styles.resultValue, { color: colors.text }]}>
                  {formatCurrency(calculationResults.partyGratuityAfterTipOuts)}
                </Text>
              </View>

              <View style={styles.resultRow}>
                <Text style={[styles.finalTallyLabel, { color: colors.text }]}>
                  {calculationResults.partyGratuityMessage}:
                </Text>
                <Text style={[styles.finalTallyValue, { color: colors.primary }]}>
                  {formatCurrency(calculationResults.partyGratuitySplit)}
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginRight: 32, // Balance the back button
  },
  headerRight: {
    width: 24,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 60, // Extra padding at bottom to prevent cutoff
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
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
  },
  optionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sharedPartySection: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 20,
  },
  declareSection: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  percentageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  percentButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  percentText: {
    fontSize: 16,
    fontWeight: '600',
  },
  realTimeDisplay: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  realTimeLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  realTimeValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  calculateButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  calculateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  resultsContainer: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 40, // Extra padding at bottom
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 16,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  finalTallyDivider: {
    height: 2,
    marginVertical: 16,
  },
  partyGratuityDivider: {
    height: 2,
    marginVertical: 16,
  },
  finalTallyLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  finalTallyValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  finalAmountValue: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
});

export default CheckOutCalculatorScreen;
