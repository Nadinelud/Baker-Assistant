import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StyleSheet, View } from 'react-native';

import { formatShortDate, formatTime } from '@/lib/dates';
import { spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

type DateTimeFieldProps = {
  label: string;
  value: Date | null;
  onChange: (value: Date) => void;
  error?: string;
};

// Tanggal dan jam dengan dialog bawaan Android. Dua tombol terpisah supaya jam bisa diganti
// tanpa memilih tanggal lagi.
export function DateTimeField({ label, value, onChange, error }: DateTimeFieldProps) {
  const base = value ?? defaultValue();

  function pickDate() {
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      onValueChange: (_event, date) => {
        const next = new Date(base);
        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        onChange(next);
      },
    });
  }

  function pickTime() {
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, date) => {
        const next = new Date(base);
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
        onChange(next);
      },
    });
  }

  return (
    <View style={styles.container}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View style={styles.row}>
        <View style={styles.date}>
          <Button
            label={value ? formatShortDate(value) : 'Pilih tanggal'}
            icon="calendar-outline"
            variant="outline"
            onPress={pickDate}
          />
        </View>
        <View style={styles.time}>
          <Button label={value ? formatTime(value) : 'Jam'} icon="time-outline" variant="outline" onPress={pickTime} />
        </View>
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// Bawaan: besok jam 10.00.
function defaultValue(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  date: {
    flex: 2,
  },
  time: {
    flex: 1,
  },
});
