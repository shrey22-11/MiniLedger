import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LoginScreen } from './src/LoginScreen';
import { LedgerScreen } from './src/LedgerScreen';
import { clearSession, loadSession, saveSession } from './src/session';
import type { Session } from './src/types';
import { colors } from './src/ui';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    void loadSession()
      .then(setSession)
      .finally(() => setRestoring(false));
  }, []);
  const login = useCallback(async (value: Session) => {
    await saveSession(value);
    setSession(value);
  }, []);
  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        {restoring ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.ink} />
            <Text style={{ color: colors.muted }}>Opening your ledger…</Text>
          </View>
        ) : session ? (
          <LedgerScreen session={session} onLogout={logout} />
        ) : (
          <LoginScreen onLogin={login} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
});
