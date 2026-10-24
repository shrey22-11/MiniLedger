import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from './api';
import { validDate } from './format';
import { Button, colors, ErrorNote, Field, s } from './ui';
import type { Receipt } from './types';

export function AddLoanModal({
  token,
  today,
  onClose,
  onSaved,
  onUnauthorized,
}: {
  token: string;
  today: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onUnauthorized: (error: unknown) => void;
}) {
  const [friendName, setFriendName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pickReceipt() {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError('Choose an image smaller than 5 MB.');
        return;
      }
      // Cropped native selections are JPEG; web keeps the browser file type.
      const type = asset.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png'].includes(type)) {
        setError('Choose a JPEG or PNG receipt.');
        return;
      }
      setReceipt({
        uri: asset.uri,
        type,
        name: asset.fileName || `receipt.${type === 'image/png' ? 'png' : 'jpg'}`,
      });
    } catch {
      setError('Could not open your photos. Check photo permissions and try again.');
    }
  }
  async function save() {
    const name = friendName.trim();
    if (!name || name.length > 80) {
      setError('Enter a friend’s name, up to 80 characters.');
      return;
    }
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 1000000) {
      setError('Enter an amount from ₹0.01 to ₹10,00,000 with at most 2 decimal places.');
      return;
    }
    if (!validDate(dueDate)) {
      setError('Enter a real date as YYYY-MM-DD, between 2000 and 2100.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.addLoan(token, { friendName: name, amount, dueDate }, receipt);
      await onSaved();
      onClose();
    } catch (err) {
      onUnauthorized(err);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={{ padding: 26, gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.top}>
              <View>
                <Text style={styles.eyebrow}>KEEP THE DETAILS, LOSE THE WORRY</Text>
                <Text style={s.heading}>A new entry.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close form"
                onPress={onClose}
                disabled={busy}
                style={styles.close}
              >
                <Text style={{ fontSize: 24, color: colors.ink }}>×</Text>
              </Pressable>
            </View>
            <Text style={s.muted}>Who did you lend a little help to?</Text>
            <Field
              label="Friend’s name"
              placeholder="e.g. Aditi Sharma"
              value={friendName}
              onChangeText={setFriendName}
              maxLength={80}
              autoCapitalize="words"
              editable={!busy}
            />
            <Field
              label="Amount (₹)"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!busy}
            />
            <Field
              label="Due date (YYYY-MM-DD)"
              placeholder="2026-11-15"
              value={dueDate}
              onChangeText={setDueDate}
              maxLength={10}
              autoCapitalize="none"
              editable={!busy}
            />
            <Text style={[s.muted, { fontSize: 12, marginTop: -10 }]}>
              Past dates are allowed for loans you already made.
            </Text>
            <View style={styles.receipt}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={s.label}>A receipt, if you have one</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>Optional · JPEG or PNG · up to 5 MB</Text>
              </View>
              <Pressable disabled={busy} accessibilityRole="button" onPress={pickReceipt}>
                <Text style={styles.link}>{receipt ? 'Change' : '+ Add photo'}</Text>
              </Pressable>
            </View>
            {receipt && (
              <View style={{ gap: 8 }}>
                <Image
                  source={{ uri: receipt.uri }}
                  style={{ height: 140, borderRadius: 12 }}
                  resizeMode="contain"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setReceipt(null)}
                >
                  <Text style={styles.link}>Remove photo</Text>
                </Pressable>
              </View>
            )}
            <ErrorNote message={error} />
            <Button title="Save entry  →" busy={busy} onPress={save} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#102B2570',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '94%',
    maxWidth: 540,
    width: '100%',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: {
    fontSize: 8,
    color: colors.muted,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 10,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8EBE2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receipt: {
    padding: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C4CFC1',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  link: { color: colors.ink, fontSize: 13, fontWeight: '700' },
});
