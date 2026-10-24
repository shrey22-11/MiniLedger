import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from './api';
import { Button, colors, ErrorNote, Field, s } from './ui';
import type { Session } from './types';

export function LoginScreen({ onLogin }: { onLogin: (session: Session) => Promise<void> }) {
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError('Include your country code, for example +919876543210.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.requestOtp(normalized);
      setPhone(normalized);
      setStep('otp');
      setOtp('');
      setCooldown(result.retryAfterSeconds);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from the backend terminal.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLogin(await api.verifyOtp(phone, otp));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>m.</Text>
          </View>
          <Text style={styles.brandText}>MiniLedger</Text>
        </View>
        <View style={styles.illustration}>
          <Text style={styles.eyebrow}>A LITTLE CLARITY GOES A LONG WAY</Text>
          <Text style={styles.hero}>Good friends.{'\n'}Clear accounts.</Text>
          <View style={styles.sample}>
            <Text style={{ color: '#CDE8BD', fontSize: 13 }}>YOUR PEACE-OF-MIND FUND</Text>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700', marginTop: 10 }}>
              Less guessing.{'\n'}More living.
            </Text>
            <Text style={{ color: '#B9CEC1', marginTop: 16, lineHeight: 21 }}>
              A simple home for the money you lend.
            </Text>
          </View>
        </View>
        <View style={styles.form}>
          <Text style={s.heading}>
            {step === 'phone' ? 'Let’s get you settled.' : 'One small check.'}
          </Text>
          <Text style={s.muted}>
            {step === 'phone'
              ? 'Sign in with your phone to start your ledger.'
              : `Enter the code for ${phone}.`}
          </Text>
          {step === 'phone' ? (
            <Field
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="+919876543210"
              editable={!busy}
            />
          ) : (
            <Field
              label="Verification code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6-digit OTP"
              autoComplete="one-time-code"
              editable={!busy}
              onSubmitEditing={verify}
            />
          )}
          <ErrorNote message={error} />
          <Button
            title={step === 'phone' ? 'Continue  →' : 'Open my ledger  →'}
            busy={busy}
            onPress={step === 'phone' ? send : verify}
          />
          {step === 'otp' && (
            <View style={{ gap: 14 }}>
              <Button
                title={cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}
                secondary
                disabled={cooldown > 0 || busy}
                onPress={send}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  setStep('phone');
                  setError('');
                }}
              >
                <Text style={styles.link}>Use a different phone number</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.notice}>
            <Text style={{ color: colors.orange, fontWeight: '700', fontSize: 12 }}>
              DEMO LOGIN
            </Text>
            <Text style={[s.muted, { fontSize: 12 }]}>
              No SMS is sent. The mock OTP appears only in the server terminal and expires in 5
              minutes.
            </Text>
          </View>
        </View>
        <Text style={styles.footer}>A little ledger. A lighter mind.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 26,
    paddingTop: 24,
    gap: 30,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    backgroundColor: colors.ink,
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.green, fontSize: 27, fontWeight: '800', marginTop: -4 },
  brandText: { fontWeight: '700', color: colors.ink, fontSize: 21, letterSpacing: -0.7 },
  illustration: { gap: 15, marginTop: 12 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  hero: { fontSize: 42, lineHeight: 47, color: colors.ink, fontWeight: '700', letterSpacing: -1.8 },
  sample: { backgroundColor: colors.ink, padding: 25, borderRadius: 24 },
  form: { gap: 17 },
  notice: { backgroundColor: '#EEEDE5', padding: 15, borderRadius: 14, gap: 5 },
  link: { textAlign: 'center', color: colors.ink, fontSize: 13, textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: colors.muted, fontSize: 12, marginBottom: 10 },
});
