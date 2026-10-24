import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { API_URL } from './api';
import { Button, colors, ErrorNote, s } from './ui';
import type { Loan } from './types';

export function ReceiptModal({
  loan,
  token,
  onClose,
}: {
  loan: Loan;
  token: string;
  onClose: () => void;
}) {
  const endpoint = `${API_URL}/loans/${loan.id}/receipt`;
  const [uri, setUri] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    // Fetch the protected image explicitly. The native Image component only
    // needs to decode a local file, without handling authentication or HTTP.
    const controller = new AbortController();
    let objectUrl = '';
    let localFile: File | undefined;
    let active = true;
    setUri('');
    setError('');
    const timeout = setTimeout(() => controller.abort(), 15_000);
    async function load() {
      const fetcher = Platform.OS === 'web' ? fetch : expoFetch;
      const response = await fetcher(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (response.status === 401)
        throw new Error('Your session expired. Sign out and sign in again.');
      if (response.status === 404)
        throw new Error('This receipt is no longer available on the server.');
      if (!response.ok)
        throw new Error('Could not download the receipt. Please close and try again.');
      if (Platform.OS === 'web') {
        const blob = await response.blob();
        if (active && !controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setUri(objectUrl);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!active || controller.signal.aborted) return;
        const extension = response.headers.get('content-type')?.includes('image/png')
          ? 'png'
          : 'jpg';
        localFile = new File(Paths.cache, `receipt-${loan.id}-${Date.now()}.${extension}`);
        localFile.write(bytes);
        setUri(localFile.uri);
      }
    }
    void load()
      .catch((err: unknown) => {
        if (active) {
          setError(
            controller.signal.aborted
              ? 'The receipt download timed out. Please close and try again.'
              : err instanceof Error
                ? err.message
                : 'Could not load the receipt. Please close and try again.',
          );
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      // This cache file belongs only to this modal; keep the server original.
      try {
        if (localFile?.exists) localFile.delete();
      } catch {
        /* The OS may already have evicted it. */
      }
    };
  }, [endpoint, token, loan.id]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={s.heading}>Receipt</Text>
          <Text style={s.muted}>{loan.friendName}</Text>
          {!uri && !error && <ActivityIndicator color={colors.ink} />}
          {!!uri && !error && (
            <Image
              accessibilityLabel="Loan receipt photo"
              source={{ uri }}
              resizeMode="contain"
              style={{ width: '100%', height: 340 }}
              onError={() =>
                setError('The receipt downloaded, but the image could not be displayed.')
              }
            />
          )}
          <ErrorNote message={error} />
          <Button title="Close receipt" secondary onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#102B2580',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.paper,
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    padding: 26,
    gap: 18,
  },
});
