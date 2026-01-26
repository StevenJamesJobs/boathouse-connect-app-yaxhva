
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
  Platform,
} from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  scrollContent: {
    padding: 20,
  },
  calculatorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
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
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    gap: 8,
  },
  calculateButtonDisabled: {
    opacity: 0.5,
  },
  calculateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultsCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  finalTallyValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  sectionSeparator: {
    height: 2,
    marginVertical: 16,
    borderRadius: 1,
  },
  partySection: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 2,
  },
  realtimeCalculation: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  realtimeLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  realtimeValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  signToggleButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  signToggleText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  inputWrapperWithToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default function CheckOutCalculatorScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;

  const [totalShiftSales, setTotalShiftSales] = useState('');
  const [cashInOutTotal, setCashInOutTotal] = useState('');
  const [isNegativeCashOut, setIsNegativeCashOut] = useState(false);
  const [busserRunnerPercent, setBusserRunnerPercent] = useState(0.035);
  const [bartenderPercent, setBartenderPercent] = useState(0.02);
  const [declarePercent, setDeclarePercent] = useState(0.12); // Default to 12%
  const [showResults, setShowResults] = useState(false);
  
  // Shared party state
  const [sharedParty, setSharedParty] = useState(false);
  const [partySubtotal, setPartySubtotal] = useState('');
  const [partyGratuity, setPartyGratuity] = useState('');
  const [checkUnderMyName, setCheckUnderMyName] = useState<boolean | null>(null);

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

  // Calculate party gratuity split in real-time
  const partyGratuityCalculation = useMemo(() => {
    if (!sharedParty || !partyGratuity || !partySubtotal) {
      return null;
    }

    const gratuity = parseFloat(partyGratuity) || 0;
    const subtotal = parseFloat(partySubtotal) || 0;
    
    // Calculate tip-outs from Party Subtotal
    const busserTipOut = subtotal * busserRunnerPercent;
    const bartenderTipOut = subtotal * bartenderPercent;
    const totalTipOuts = busserTipOut + bartenderTipOut;
    
    // Subtract tip-outs from Party Gratuity
    const afterTipOuts = gratuity - totalTipOuts;
    
    // Split evenly between two people
    const splitAmount = afterTipOuts / 2;
    
    return {
      busserTipOut,
      bartenderTipOut,
      totalTipOuts,
      afterTipOuts,
      splitAmount,
    };
  }, [sharedParty, partyGratuity, partySubtotal, busserRunnerPercent, bartenderPercent]);

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

  const calculateResults = () => {
    const sales = parseFloat(totalShiftSales) || 0;
    const cashInOutValue = parseFloat(cashInOutTotal) || 0;
    // Apply negative sign if toggle is set to negative
    const cashInOut = isNegativeCashOut ? -cashInOutValue : cashInOutValue;
    
    // Busser/Runner and Bartender amounts are based on ORIGINAL Total Sales
    const busserAmount = sales * busserRunnerPercent;
    const bartenderAmount = sales * bartenderPercent;
    
    // Declare amount is based on ADJUSTED sales
    const declareAmount = adjustedSales * declarePercent;
    
    const finalTally = cashInOut + busserAmount + bartenderAmount;

    return {
      busserAmount,
      bartenderAmount,
      declareAmount,
      cashInOut,
      finalTally,
      adjustedSales,
      partyGratuityCalc: partyGratuityCalculation,
    };
  };

  const handleCalculate = () => {
    if (totalShiftSales && cashInOutTotal) {
      setShowResults(true);
    }
  };

  const results = showResults ? calculateResults() : null;

  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toFixed(2)}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Check Out Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Header */}
        <View style={styles.calculatorHeader}>
          <IconSymbol
            ios_icon_name="calculator.fill"
            android_material_icon_name="calculate"
            size={32}
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
                onChangeText={(text) => {
                  setTotalShiftSales(text);
                  setShowResults(false);
                }}
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
                  setPartyGratuity('');
                  setCheckUnderMyName(null);
                }
                setShowResults(false);
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

          {/* Party Details Section - Only show if shared party is checked */}
          {sharedParty && (
            <>
              {/* Visual Separator */}
              <View style={[styles.sectionSeparator, { backgroundColor: colors.primary, opacity: 0.3 }]} />
              
              <View style={[styles.partySection, { backgroundColor: colors.background, borderColor: colors.primary }]}>
                {/* Party Subtotal */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Party Subtotal *
                  </Text>
                  <View style={[styles.inputWrapper, { borderColor: colors.border }]}>
                    <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={partySubtotal}
                      onChangeText={(text) => {
                        setPartySubtotal(text);
                        setShowResults(false);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </View>

                {/* Party Gratuity */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Party Gratuity
                  </Text>
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    (Automatic gratuity amount to split)
                  </Text>
                  <View style={[styles.inputWrapper, { borderColor: colors.border }]}>
                    <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={partyGratuity}
                      onChangeText={(text) => {
                        setPartyGratuity(text);
                        setShowResults(false);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  {/* Real-time Party Gratuity Calculation */}
                  {partyGratuityCalculation && (
                    <View style={[styles.realtimeCalculation, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.realtimeLabel, { color: colors.textSecondary }]}>
                        After Tip-Outs:
                      </Text>
                      <Text style={[styles.realtimeValue, { color: colors.primary }]}>
                        {formatCurrency(partyGratuityCalculation.afterTipOuts)}
                      </Text>
                      <Text style={[styles.helperText, { color: colors.textSecondary, marginTop: 4 }]}>
                        (Gratuity ${formatCurrency(parseFloat(partyGratuity) || 0)} - Busser ${formatCurrency(partyGratuityCalculation.busserTipOut)} - Bartender ${formatCurrency(partyGratuityCalculation.bartenderTipOut)})
                      </Text>
                    </View>
                  )}
                </View>

                {/* Is the check under my name? */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Is the check under my name? *
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
                      onPress={() => {
                        setCheckUnderMyName(true);
                        setShowResults(false);
                      }}
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
                      onPress={() => {
                        setCheckUnderMyName(false);
                        setShowResults(false);
                      }}
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
                </View>
              </View>

              {/* Visual Separator */}
              <View style={[styles.sectionSeparator, { backgroundColor: colors.primary, opacity: 0.3 }]} />
            </>
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
                  onPress={() => {
                    setDeclarePercent(option.value);
                    setShowResults(false);
                  }}
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
          </View>

          {/* Cashed Out/In Total */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Cashed Out/In Total *
            </Text>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              (Use the +/- button to toggle between positive and negative)
            </Text>
            <View style={styles.inputWrapperWithToggle}>
              {/* Positive/Negative Toggle Button */}
              <TouchableOpacity
                style={[
                  styles.signToggleButton,
                  {
                    backgroundColor: isNegativeCashOut ? '#FFEBEE' : '#E8F5E9',
                    borderColor: isNegativeCashOut ? '#EF5350' : '#66BB6A',
                  },
                ]}
                onPress={() => {
                  setIsNegativeCashOut(!isNegativeCashOut);
                  setShowResults(false);
                }}
              >
                <Text
                  style={[
                    styles.signToggleText,
                    {
                      color: isNegativeCashOut ? '#D32F2F' : '#388E3C',
                    },
                  ]}
                >
                  {isNegativeCashOut ? '−' : '+'}
                </Text>
              </TouchableOpacity>

              {/* Input Field */}
              <View style={[styles.inputWrapper, { borderColor: colors.border, flex: 1 }]}>
                <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={cashInOutTotal}
                  onChangeText={(text) => {
                    // Only allow numbers and decimal point
                    const cleanedText = text.replace(/[^0-9.]/g, '');
                    // Ensure only one decimal point
                    const parts = cleanedText.split('.');
                    const finalText = parts.length > 2 
                      ? parts[0] + '.' + parts.slice(1).join('')
                      : cleanedText;
                    setCashInOutTotal(finalText);
                    setShowResults(false);
                  }}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>
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
                  onPress={() => {
                    setBusserRunnerPercent(option.value);
                    setShowResults(false);
                  }}
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
                  onPress={() => {
                    setBartenderPercent(option.value);
                    setShowResults(false);
                  }}
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
          </View>

          {/* Calculate Button */}
          <TouchableOpacity
            style={[
              styles.calculateButton,
              { backgroundColor: colors.primary },
              (!totalShiftSales || !cashInOutTotal) && styles.calculateButtonDisabled,
            ]}
            onPress={handleCalculate}
            disabled={!totalShiftSales || !cashInOutTotal}
          >
            <Text style={styles.calculateButtonText}>Calculate</Text>
            <IconSymbol
              ios_icon_name="equal.circle.fill"
              android_material_icon_name="calculate"
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        {/* Results Card */}
        {showResults && results && (
          <View style={[styles.resultsCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>
              Calculation Results
            </Text>

            {/* Show adjusted sales if different from original */}
            {sharedParty && checkUnderMyName !== null && (
              <View style={styles.resultRow}>
                <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                  Adjusted Sales for Declare:
                </Text>
                <Text style={[styles.resultValue, { color: colors.text }]}>
                  {formatCurrency(results.adjustedSales)}
                </Text>
              </View>
            )}

            {/* Declare Amount */}
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                Declare Amount ({declarePercent === 0.12 ? '12%' : '8%'}):
              </Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>
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
                    color: results.cashInOut >= 0 ? colors.text : colors.text,
                  },
                ]}
              >
                {results.cashInOut >= 0 ? '' : '-'}
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

            {/* Party Gratuity Split - Only show if party gratuity was entered */}
            {results.partyGratuityCalc && checkUnderMyName !== null && (
              <>
                {/* Visual Separator */}
                <View style={[styles.sectionSeparator, { backgroundColor: colors.primary, opacity: 0.3 }]} />

                <View style={styles.finalTallyContainer}>
                  <Text
                    style={[
                      styles.finalTallyLabel,
                      {
                        color: checkUnderMyName ? '#D32F2F' : '#388E3C',
                      },
                    ]}
                  >
                    {checkUnderMyName ? 'You owe your Teammate' : 'Your Teammate owes you'}
                  </Text>
                  <Text
                    style={[
                      styles.finalTallyValue,
                      {
                        color: checkUnderMyName ? '#D32F2F' : '#388E3C',
                      },
                    ]}
                  >
                    {formatCurrency(results.partyGratuityCalc.splitAmount)}
                  </Text>
                  <Text style={[styles.helperText, { color: colors.textSecondary, marginTop: 8, textAlign: 'center' }]}>
                    (Party Gratuity split after tip-outs)
                  </Text>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
