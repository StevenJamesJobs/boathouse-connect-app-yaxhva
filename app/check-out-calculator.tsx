
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { employeeColors, managerColors } from '@/styles/commonStyles';

export default function CheckOutCalculatorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;

  const [totalShiftSales, setTotalShiftSales] = useState('');
  const [cashInOutTotal, setCashInOutTotal] = useState('');
  const [isNegative, setIsNegative] = useState(false);
  const [busserRunnerPercent, setBusserRunnerPercent] = useState(0.035);
  const [bartenderPercent, setBartenderPercent] = useState(0.02);
  const [declarePercent, setDeclarePercent] = useState(0.12); // Default to 12%
  
  // Shared party state
  const [sharedParty, setSharedParty] = useState(false);
  const [partySubtotal, setPartySubtotal] = useState('');
  const [checkUnderMyName, setCheckUnderMyName] = useState<boolean | null>(null);
  const [partyGratuity, setPartyGratuity] = useState('');

  const busserRunnerOptions = [
    { label: '3.5%', value: 0.035 },
    { label: '2%', value: 0.02 },
    { label: '1%', value: 0.01 },
    { label: '0%', value: 0 },
  ];

  const bartenderOptions = [
    { label: '2%', value: 0.02 },
    { label: '3%', value: 0.03 },
    { label: '4%', value: 0.04 },
  ];

  const declareOptions = [
    { label: '12%', value: 0.12 },
    { label: '8%', value: 0.08 },
  ];

  // Calculate adjusted sales for declare amount
  const adjustedSales = useMemo(() => {
    const sales = parseFloat(totalShiftSales) || 0;
    const party = parseFloat(partySubtotal) || 0;
    
    if (!sharedParty || checkUnderMyName === null) {
      return sales;
    }
    
    const halfParty = party / 2;
    
    if (checkUnderMyName) {
      // Check is under my name, subtract half
      return sales - halfParty;
    } else {
      // Check is NOT under my name, add half
      return sales + halfParty;
    }
  }, [totalShiftSales, sharedParty, partySubtotal, checkUnderMyName]);

  // Calculate party gratuity split
  const calculatePartyGratuitySplit = () => {
    if (!sharedParty || checkUnderMyName === null || !partyGratuity) {
      return {
        afterTipOuts: 0,
        splitAmount: 0,
      };
    }

    const gratuity = parseFloat(partyGratuity) || 0;
    
    // Subtract busser/runner and bartender percentages from party gratuity
    const busserAmount = gratuity * busserRunnerPercent;
    const bartenderAmount = gratuity * bartenderPercent;
    const afterTipOuts = gratuity - busserAmount - bartenderAmount;
    
    // Split evenly between two people
    const splitAmount = afterTipOuts / 2;

    return {
      afterTipOuts,
      splitAmount,
    };
  };

  const partyGratuitySplit = calculatePartyGratuitySplit();

  // Live calculation
  const calculateResults = () => {
    const sales = parseFloat(totalShiftSales) || 0;
    const cashInOutValue = parseFloat(cashInOutTotal) || 0;
    const cashInOut = isNegative ? -Math.abs(cashInOutValue) : Math.abs(cashInOutValue);
    
    // Busser/Runner and Bartender amounts are based on ORIGINAL Total Sales
    const busserAmount = sales * busserRunnerPercent;
    const bartenderAmount = sales * bartenderPercent;
    
    // Declare amount is based on ADJUSTED sales
    const declareAmount = adjustedSales * declarePercent;
    
    const finalTally = cashInOut + busserAmount + bartenderAmount;

    return {
      busserAmount,
      bartenderAmount,
      cashInOut,
      finalTally,
      declareAmount,
      adjustedSales,
    };
  };

  const results = calculateResults();
  const hasValidInputs = totalShiftSales !== '' && cashInOutTotal !== '';

  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toFixed(2)}`;
  };

  const toggleNegative = () => {
    setIsNegative(!isNegative);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.headerBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="chevron-left"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Check Out Calculator
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.contentContainer}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <IconSymbol
            ios_icon_name="calculator.fill"
            android_material_icon_name="calculate"
            size={40}
            color={colors.primary}
          />
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>
              Check Out Calculator
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Please enter required information for check out calculations.
            </Text>
          </View>
        </View>

        {/* Input Card */}
        <View style={[styles.inputCard, { backgroundColor: colors.card }]}>
          {/* Total Shift Sales */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Total Shift Sales *
            </Text>
            <View style={[styles.inputWrapper, { borderColor: colors.border }]}>
              <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={totalShiftSales}
                onChangeText={setTotalShiftSales}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            
            {/* Shared Party Section */}
            <Text style={[styles.smallText, { color: colors.textSecondary, marginTop: 12 }]}>
              Did you share a party?
            </Text>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => {
                setSharedParty(!sharedParty);
                if (sharedParty) {
                  // Reset party-related fields when unchecking
                  setPartySubtotal('');
                  setCheckUnderMyName(null);
                  setPartyGratuity('');
                }
              }}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: colors.border,
                    backgroundColor: sharedParty ? colors.primary : 'transparent',
                  },
                ]}
              >
                {sharedParty && (
                  <IconSymbol
                    ios_icon_name="checkmark"
                    android_material_icon_name="check"
                    size={16}
                    color="#FFFFFF"
                  />
                )}
              </View>
              <Text style={[styles.checkboxLabel, { color: colors.text }]}>Yes</Text>
            </TouchableOpacity>
          </View>

          {/* Party Subtotal - Only show if shared party is checked */}
          {sharedParty && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Party Subtotal
              </Text>
              <View style={[styles.inputWrapper, { borderColor: colors.border }]}>
                <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={partySubtotal}
                  onChangeText={setPartySubtotal}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
              {/* Is the check under my name? */}
              <Text style={[styles.smallText, { color: colors.textSecondary, marginTop: 12 }]}>
                Is the check under my name?
              </Text>
              <View style={styles.yesNoContainer}>
                <TouchableOpacity
                  style={[
                    styles.yesNoButton,
                    {
                      backgroundColor: checkUnderMyName === true ? colors.primary : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setCheckUnderMyName(true)}
                >
                  <Text
                    style={[
                      styles.yesNoButtonText,
                      {
                        color: checkUnderMyName === true ? '#FFFFFF' : colors.text,
                      },
                    ]}
                  >
                    Yes
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.yesNoButton,
                    {
                      backgroundColor: checkUnderMyName === false ? colors.primary : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setCheckUnderMyName(false)}
                >
                  <Text
                    style={[
                      styles.yesNoButtonText,
                      {
                        color: checkUnderMyName === false ? '#FFFFFF' : colors.text,
                      },
                    ]}
                  >
                    No
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Party Gratuity - Only show if shared party is checked */}
              <Text style={[styles.label, { color: colors.text, marginTop: 16 }]}>
                Party Gratuity (Optional)
              </Text>
              <View style={[styles.inputWrapper, { borderColor: colors.border }]}>
                <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={partyGratuity}
                  onChangeText={setPartyGratuity}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              {/* Live Party Gratuity Calculation */}
              {partyGratuity !== '' && checkUnderMyName !== null && (
                <View style={styles.partyGratuityCalculation}>
                  <View style={styles.liveCalculation}>
                    <Text style={[styles.liveCalcLabel, { color: colors.textSecondary }]}>
                      Party Gratuity After Tip Outs:
                    </Text>
                    <Text style={[styles.liveCalcValue, { color: colors.primary }]}>
                      {formatCurrency(partyGratuitySplit.afterTipOuts)}
                    </Text>
                  </View>
                  <View style={styles.liveCalculation}>
                    <Text style={[styles.liveCalcLabel, { color: colors.textSecondary }]}>
                      {checkUnderMyName ? 'You Owe Your Teammate:' : 'Your Teammate Owes You:'}
                    </Text>
                    <Text style={[styles.liveCalcValue, { color: colors.highlight }]}>
                      {formatCurrency(partyGratuitySplit.splitAmount)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Declare Percentage */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Declare Percentage *
            </Text>
            <View style={styles.buttonGroup}>
              {declareOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor:
                        declarePercent === option.value
                          ? colors.primary
                          : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setDeclarePercent(option.value)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      {
                        color:
                          declarePercent === option.value
                            ? '#FFFFFF'
                            : colors.text,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Live Declare Calculation */}
            {totalShiftSales !== '' && (
              <View style={styles.liveCalculation}>
                <Text style={[styles.liveCalcLabel, { color: colors.textSecondary }]}>
                  Declare Amount:
                </Text>
                <Text style={[styles.liveCalcValue, { color: colors.primary }]}>
                  {formatCurrency(results.declareAmount)}
                </Text>
              </View>
            )}
            {/* Show adjusted sales if different from original */}
            {sharedParty && checkUnderMyName !== null && totalShiftSales !== '' && (
              <View style={styles.liveCalculation}>
                <Text style={[styles.liveCalcLabel, { color: colors.textSecondary }]}>
                  Adjusted Sales for Declare:
                </Text>
                <Text style={[styles.liveCalcValue, { color: colors.highlight }]}>
                  {formatCurrency(results.adjustedSales)}
                </Text>
              </View>
            )}
          </View>

          {/* Cashed Out/In Total */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Cashed Out/In Total *
            </Text>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              (Use +/- button to toggle between positive and negative)
            </Text>
            <View style={styles.cashInputContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: isNegative ? '#D32F2F' : '#388E3C',
                  },
                ]}
                onPress={toggleNegative}
              >
                <Text style={styles.toggleButtonText}>
                  {isNegative ? '-' : '+'}
                </Text>
              </TouchableOpacity>
              <View style={[styles.inputWrapper, styles.cashInputWrapper, { borderColor: colors.border }]}>
                <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={cashInOutTotal}
                  onChangeText={(text) => {
                    // Remove any non-numeric characters except decimal point
                    const cleaned = text.replace(/[^0-9.]/g, '');
                    setCashInOutTotal(cleaned);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>
            {/* Show current value with sign */}
            {cashInOutTotal !== '' && (
              <View style={styles.currentValueContainer}>
                <Text style={[styles.currentValueLabel, { color: colors.textSecondary }]}>
                  Current value:
                </Text>
                <Text style={[styles.currentValue, { color: isNegative ? '#D32F2F' : '#388E3C' }]}>
                  {isNegative ? '-' : '+'}${cashInOutTotal || '0.00'}
                </Text>
              </View>
            )}
          </View>

          {/* Busser/Runner Percentage */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Busser/Runner Tip Out *
            </Text>
            <View style={styles.buttonGroup}>
              {busserRunnerOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor:
                        busserRunnerPercent === option.value
                          ? colors.primary
                          : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setBusserRunnerPercent(option.value)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      {
                        color:
                          busserRunnerPercent === option.value
                            ? '#FFFFFF'
                            : colors.text,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Live Busser/Runner Calculation */}
            {totalShiftSales !== '' && (
              <View style={styles.liveCalculation}>
                <Text style={[styles.liveCalcLabel, { color: colors.textSecondary }]}>
                  Busser/Runner Amount:
                </Text>
                <Text style={[styles.liveCalcValue, { color: colors.primary }]}>
                  {formatCurrency(results.busserAmount)}
                </Text>
              </View>
            )}
          </View>

          {/* Bartender Percentage */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Bartender Tip Out *
            </Text>
            <View style={styles.buttonGroup}>
              {bartenderOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor:
                        bartenderPercent === option.value
                          ? colors.primary
                          : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setBartenderPercent(option.value)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      {
                        color:
                          bartenderPercent === option.value
                            ? '#FFFFFF'
                            : colors.text,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Live Bartender Calculation */}
            {totalShiftSales !== '' && (
              <View style={styles.liveCalculation}>
                <Text style={[styles.liveCalcLabel, { color: colors.textSecondary }]}>
                  Bartender Amount:
                </Text>
                <Text style={[styles.liveCalcValue, { color: colors.primary }]}>
                  {formatCurrency(results.bartenderAmount)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Results Card */}
        {hasValidInputs && (
          <View style={[styles.resultsCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>
              Final Tally
            </Text>

            {/* Show adjusted sales if different from original */}
            {sharedParty && checkUnderMyName !== null && (
              <View style={styles.resultRow}>
                <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                  Original Total Sales:
                </Text>
                <Text style={[styles.resultValue, { color: colors.text }]}>
                  {formatCurrency(parseFloat(totalShiftSales) || 0)}
                </Text>
              </View>
            )}

            {sharedParty && checkUnderMyName !== null && (
              <View style={styles.resultRow}>
                <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                  Adjusted Sales for Declare:
                </Text>
                <Text style={[styles.resultValue, { color: colors.highlight }]}>
                  {formatCurrency(results.adjustedSales)}
                </Text>
              </View>
            )}

            {/* Declare Amount */}
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                Declare Amount ({declarePercent === 0.12 ? '12%' : '8%'}):
              </Text>
              <Text style={[styles.resultValue, { color: colors.primary }]}>
                {formatCurrency(results.declareAmount)}
              </Text>
            </View>

            {/* Busser/Runner Amount */}
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                Busser/Runner Amount:
              </Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>
                {formatCurrency(results.busserAmount)}
              </Text>
            </View>

            {/* Bartender Amount */}
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                Bartender Amount:
              </Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>
                {formatCurrency(results.bartenderAmount)}
              </Text>
            </View>

            {/* Cash In/Out Total */}
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                Cash In/Out Total:
              </Text>
              <Text
                style={[
                  styles.resultValue,
                  {
                    color: results.cashInOut >= 0 ? '#388E3C' : '#D32F2F',
                  },
                ]}
              >
                {results.cashInOut >= 0 ? '+' : '-'}
                {formatCurrency(results.cashInOut)}
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Final Tally */}
            <View style={styles.finalTallyContainer}>
              <Text
                style={[
                  styles.finalTallyLabel,
                  {
                    color: results.finalTally >= 0 ? '#D32F2F' : '#388E3C',
                  },
                ]}
              >
                {results.finalTally >= 0 ? 'You Owe' : 'You are owed'}
              </Text>
              <Text
                style={[
                  styles.finalTallyValue,
                  {
                    color: results.finalTally >= 0 ? '#D32F2F' : '#388E3C',
                  },
                ]}
              >
                {formatCurrency(results.finalTally)}
              </Text>
            </View>

            {/* Party Gratuity Split in Final Tally */}
            {sharedParty && checkUnderMyName !== null && partyGratuity !== '' && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.partyGratuityFinalSection}>
                  <Text style={[styles.partyGratuityFinalTitle, { color: colors.text }]}>
                    Party Gratuity Split
                  </Text>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                      Party Gratuity After Tip Outs:
                    </Text>
                    <Text style={[styles.resultValue, { color: colors.primary }]}>
                      {formatCurrency(partyGratuitySplit.afterTipOuts)}
                    </Text>
                  </View>
                  <View style={styles.finalTallyContainer}>
                    <Text
                      style={[
                        styles.partyGratuitySplitLabel,
                        {
                          color: checkUnderMyName ? '#D32F2F' : '#388E3C',
                        },
                      ]}
                    >
                      {checkUnderMyName ? 'You Owe Your Teammate' : 'Your Teammate Owes You'}
                    </Text>
                    <Text
                      style={[
                        styles.partyGratuitySplitValue,
                        {
                          color: checkUnderMyName ? '#D32F2F' : '#388E3C',
                        },
                      ]}
                    >
                      {formatCurrency(partyGratuitySplit.splitAmount)}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
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
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerText: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  smallText: {
    fontSize: 13,
    marginBottom: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  yesNoContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  yesNoButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  yesNoButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cashInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleButton: {
    width: 50,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cashInputWrapper: {
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: 48,
  },
  currentValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  currentValueLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  currentValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  liveCalculation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  liveCalcLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  liveCalcValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  partyGratuityCalculation: {
    marginTop: 8,
  },
  resultsCard: {
    borderRadius: 16,
    padding: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    flex: 1,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  finalTallyContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  finalTallyLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  finalTallyValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  partyGratuityFinalSection: {
    marginTop: 8,
  },
  partyGratuityFinalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  partyGratuitySplitLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  partyGratuitySplitValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
});
