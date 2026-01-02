
import { employeeColors, managerColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function CheckOutCalculatorScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const isManager = user?.role === 'manager';
  const colors = isManager ? managerColors : employeeColors;

  const [shiftSales, setShiftSales] = useState('');
  const [declarePercentage, setDeclarePercentage] = useState('');
  const [cashedOutIn, setCashedOutIn] = useState('');
  const [isNegative, setIsNegative] = useState(false);
  const [sharedParty, setSharedParty] = useState<boolean | null>(null);
  const [partySubtotal, setPartySubtotal] = useState('');
  const [isCheckUnderName, setIsCheckUnderName] = useState<boolean | null>(null);
  const [partyGratuity, setPartyGratuity] = useState('');
  const [busserPercentage, setBusserPercentage] = useState('');
  const [bartenderPercentage, setBartenderPercentage] = useState('');
  const [results, setResults] = useState<any>(null);

  const calculateResults = () => {
    const sales = parseFloat(shiftSales) || 0;
    const declarePercent = parseFloat(declarePercentage) || 0;
    const cashValue = (parseFloat(cashedOutIn) || 0) * (isNegative ? -1 : 1);
    const busserPercent = parseFloat(busserPercentage) || 0;
    const bartenderPercent = parseFloat(bartenderPercentage) || 0;

    const declaredAmount = sales * (declarePercent / 100);
    const busserTipOut = declaredAmount * (busserPercent / 100);
    const bartenderTipOut = declaredAmount * (bartenderPercent / 100);
    const totalTipOut = busserTipOut + bartenderTipOut;
    const netAmount = declaredAmount - totalTipOut + cashValue;

    let partyResults = null;
    if (sharedParty && partyGratuity) {
      const gratuity = parseFloat(partyGratuity) || 0;
      const partySub = parseFloat(partySubtotal) || 0;
      const partyBusserTipOut = partySub * (busserPercent / 100);
      const partyBartenderTipOut = partySub * (bartenderPercent / 100);
      const partyTotalTipOut = partyBusserTipOut + partyBartenderTipOut;
      const netGratuity = gratuity - partyTotalTipOut;
      const splitAmount = netGratuity / 2;

      partyResults = {
        netGratuity,
        splitAmount,
        isUnderName: isCheckUnderName,
      };
    }

    return {
      declaredAmount,
      busserTipOut,
      bartenderTipOut,
      totalTipOut,
      netAmount,
      partyResults,
    };
  };

  const handleCalculate = () => {
    setResults(calculateResults());
  };

  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toFixed(2)}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Check Out Calculator</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.formSection}>
          <Text style={[styles.label, { color: colors.text }]}>Shift Sales</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            value={shiftSales}
            onChangeText={setShiftSales}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>Declare Percentage</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            value={declarePercentage}
            onChangeText={setDeclarePercentage}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>Cashed Out/In Total</Text>
          <View style={styles.cashInputContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, { backgroundColor: isNegative ? colors.primary : colors.card }]}
              onPress={() => setIsNegative(!isNegative)}
            >
              <Text style={[styles.toggleText, { color: isNegative ? '#FFFFFF' : colors.text }]}>
                {isNegative ? '-' : '+'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.cashInput, { borderColor: colors.border, color: colors.text }]}
              value={cashedOutIn}
              onChangeText={setCashedOutIn}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Did you share a party?</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.optionButton, sharedParty === true && { backgroundColor: colors.primary }]}
              onPress={() => setSharedParty(true)}
            >
              <Text style={[styles.optionText, sharedParty === true && styles.optionTextSelected]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, sharedParty === false && { backgroundColor: colors.primary }]}
              onPress={() => setSharedParty(false)}
            >
              <Text style={[styles.optionText, sharedParty === false && styles.optionTextSelected]}>No</Text>
            </TouchableOpacity>
          </View>

          {sharedParty && (
            <>
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <Text style={[styles.label, { color: colors.text }]}>Party Subtotal</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                value={partySubtotal}
                onChangeText={setPartySubtotal}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={[styles.label, { color: colors.text }]}>Party Gratuity</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                value={partyGratuity}
                onChangeText={setPartyGratuity}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={[styles.label, { color: colors.text }]}>Is the check under your name?</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.optionButton, isCheckUnderName === true && { backgroundColor: colors.primary }]}
                  onPress={() => setIsCheckUnderName(true)}
                >
                  <Text style={[styles.optionText, isCheckUnderName === true && styles.optionTextSelected]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, isCheckUnderName === false && { backgroundColor: colors.primary }]}
                  onPress={() => setIsCheckUnderName(false)}
                >
                  <Text style={[styles.optionText, isCheckUnderName === false && styles.optionTextSelected]}>No</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            </>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Busser/Runner Tip Out %</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            value={busserPercentage}
            onChangeText={setBusserPercentage}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.text }]}>Bartender Tip Out %</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            value={bartenderPercentage}
            onChangeText={setBartenderPercentage}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
          />

          <TouchableOpacity
            style={[styles.calculateButton, { backgroundColor: colors.primary }]}
            onPress={handleCalculate}
          >
            <Text style={styles.calculateButtonText}>Calculate</Text>
          </TouchableOpacity>
        </View>

        {results && (
          <View style={[styles.resultsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>Calculation Results</Text>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Declared Amount:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(results.declaredAmount)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Busser/Runner Tip Out:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(results.busserTipOut)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Bartender Tip Out:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(results.bartenderTipOut)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Total Tip Out:</Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(results.totalTipOut)}</Text>
            </View>
            <View style={[styles.resultRow, styles.finalRow]}>
              <Text style={[styles.resultLabel, styles.finalLabel, { color: colors.text }]}>
                {results.netAmount >= 0 ? 'You are Owed:' : 'You Owe:'}
              </Text>
              <Text style={[styles.resultValue, styles.finalValue, { color: colors.primary }]}>
                {formatCurrency(results.netAmount)}
              </Text>
            </View>

            {results.partyResults && (
              <>
                <View style={[styles.separator, { backgroundColor: colors.border, marginVertical: 16 }]} />
                <View style={styles.resultRow}>
                  <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Party Gratuity After Tip Outs:</Text>
                  <Text style={[styles.resultValue, { color: colors.text }]}>{formatCurrency(results.partyResults.netGratuity)}</Text>
                </View>
                <View style={[styles.resultRow, styles.finalRow]}>
                  <Text style={[styles.resultLabel, styles.finalLabel, { color: colors.text }]}>
                    {results.partyResults.isUnderName ? 'You owe your Teammate:' : 'Your Teammate owes you:'}
                  </Text>
                  <Text style={[styles.resultValue, styles.finalValue, { color: colors.primary }]}>
                    {formatCurrency(results.partyResults.splitAmount)}
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  formSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  cashInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 24,
    fontWeight: '700',
  },
  cashInput: {
    flex: 1,
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
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  separator: {
    height: 2,
    marginVertical: 16,
  },
  calculateButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  calculateButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultsSection: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 80,
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
    paddingVertical: 8,
  },
  resultLabel: {
    fontSize: 16,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  finalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#E5E5EA',
  },
  finalLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  finalValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});
