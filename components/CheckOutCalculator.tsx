
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';

interface CheckOutCalculatorProps {
  colors: {
    primary: string;
    card: string;
    text: string;
    textSecondary: string;
    highlight: string;
    border: string;
  };
}

export default function CheckOutCalculator({ colors }: CheckOutCalculatorProps) {
  const [totalShiftSales, setTotalShiftSales] = useState('');
  const [cashInOutTotal, setCashInOutTotal] = useState('');
  const [busserRunnerPercent, setBusserRunnerPercent] = useState(0.035);
  const [bartenderPercent, setBartenderPercent] = useState(0.02);
  const [showResults, setShowResults] = useState(false);

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

  const calculateResults = () => {
    const sales = parseFloat(totalShiftSales) || 0;
    const cashInOut = parseFloat(cashInOutTotal) || 0;
    
    const busserAmount = sales * busserRunnerPercent;
    const bartenderAmount = sales * bartenderPercent;
    const finalTally = cashInOut + busserAmount + bartenderAmount;

    return {
      busserAmount,
      bartenderAmount,
      cashInOut,
      finalTally,
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
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
              onChangeText={setTotalShiftSales}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Cashed Out/In Total */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>
            Cashed Out/In Total *
          </Text>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            (Enter negative number with - sign if applicable)
          </Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border }]}>
            <Text style={[styles.dollarSign, { color: colors.textSecondary }]}>$</Text>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={cashInOutTotal}
              onChangeText={setCashInOutTotal}
              keyboardType="numeric"
              placeholder="0.00 or -0.00"
              placeholderTextColor={colors.textSecondary}
            />
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
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
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
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
});
