import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Session } from './types';

const key = 'miniledger-session';
// Native tokens live in the OS keychain. Web uses a per-tab session for the demo.
export async function saveSession(value: Session): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.setItem(key, JSON.stringify(value));
    return;
  }
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}
export async function loadSession(): Promise<Session | null> {
  try {
    const raw =
      Platform.OS === 'web' ? sessionStorage.getItem(key) : await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.token !== 'string' || typeof parsed.user?.phone !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
