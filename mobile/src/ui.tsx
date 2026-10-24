import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  ink: '#183C32',
  muted: '#73817A',
  paper: '#F7F6F2',
  white: '#FFFFFF',
  line: '#E5E9E1',
  green: '#DDF2C6',
  orange: '#C25D35',
  red: '#B44839',
};
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (busy || disabled) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.ink : '#fff'} />
      ) : (
        <Text style={[s.buttonText, secondary && { color: colors.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#9AA49C"
        style={[s.input, props.style]}
      />
    </View>
  );
}
export function ErrorNote({ message }: { message: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={s.error}>
      {message}
    </Text>
  ) : null;
}
export const s = StyleSheet.create({
  button: {
    backgroundColor: colors.ink,
    minHeight: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondary: { backgroundColor: '#EDF0E9', borderWidth: 1, borderColor: colors.line },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDE3D8',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 54,
    fontSize: 16,
    color: colors.ink,
  },
  error: {
    backgroundColor: '#FFF0EB',
    color: '#9B392A',
    padding: 14,
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 20,
  },
  heading: { color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
