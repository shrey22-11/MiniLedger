import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, ApiError } from './api';
import { AddLoanModal } from './AddLoanModal';
import { ReceiptModal } from './ReceiptModal';
import { dateLabel, money, settlementLabel } from './format';
import type { Loan, Session, Summary } from './types';
import { Button, colors, ErrorNote, s } from './ui';

type Filter = 'All' | 'Outstanding' | 'Overdue' | 'Repaid';
const filters: Filter[] = ['All', 'Outstanding', 'Overdue', 'Repaid'];
export function LedgerScreen({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => Promise<void>;
}) {
  const [entries, setEntries] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Loan | null>(null);
  const [repaying, setRepaying] = useState(false);
  const [receipt, setReceipt] = useState<Loan | null>(null);
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const mounted = useRef(true);
  const unauthorized = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) void onLogout();
    },
    [onLogout],
  );
  const refresh = useCallback(async () => {
    setError('');
    try {
      const [loans, totals] = await Promise.all([
        api.loans(session.token),
        api.summary(session.token),
      ]);
      if (mounted.current) {
        setEntries(loans.entries);
        setSummary(totals);
      }
    } catch (err) {
      if (mounted.current) {
        unauthorized(err);
        setError((err as Error).message);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [session.token, unauthorized]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    // Refresh date-derived overdue status even when the app stays open overnight.
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      mounted.current = false;
      subscription.remove();
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function repay() {
    if (!confirm || repaying) return;
    setRepaying(true);
    setError('');
    try {
      await api.repay(session.token, confirm.id);
      setConfirm(null);
      setNotice('All settled. Repayment recorded.');
      await refresh();
    } catch (err) {
      unauthorized(err);
      setError((err as Error).message);
      setConfirm(null);
    } finally {
      setRepaying(false);
    }
  }
  const visible = entries.filter(
    (loan) =>
      filter === 'All' ||
      (filter === 'Outstanding' && !loan.repaidAt) ||
      (filter === 'Overdue' && loan.overdue) ||
      (filter === 'Repaid' && !!loan.repaidAt),
  );
  const outstandingCount = entries.filter((entry) => !entry.repaidAt).length;

  function renderEntry({ item }: { item: Loan }) {
    const status = item.repaidAt ? 'Repaid' : item.overdue ? 'Overdue' : 'Pending';
    return (
      <View style={[styles.entry, item.overdue && styles.overdueEntry]}>
        <View style={styles.entryTop}>
          <View
            style={[
              styles.avatar,
              item.overdue && { backgroundColor: '#F6DED1' },
              !!item.repaidAt && { backgroundColor: '#E5EFDF' },
            ]}
          >
            <Text style={styles.initials}>
              {item.friendName
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join('')
                .toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.friend}>{item.friendName}</Text>
            <Text style={styles.date}>
              {item.repaidAt ? 'Settled' : 'Due'}{' '}
              {item.repaidAt
                ? settlementLabel(item.repaidAt, summary?.timezone)
                : dateLabel(item.dueDate)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={styles.amount}>{money(item.amountPaise)}</Text>
            <View
              style={[
                styles.badge,
                item.overdue && { backgroundColor: '#F9E3D7' },
                !!item.repaidAt && { backgroundColor: '#E8F1E0' },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  item.overdue && { color: colors.orange },
                  !!item.repaidAt && { color: '#4C763A' },
                ]}
              >
                {status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.entryBottom}>
          <Text style={styles.entryNote}>
            {item.overdue
              ? 'A gentle reminder might help.'
              : item.repaidAt
                ? 'One less thing on your mind.'
                : 'A little help, kept on record.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {item.hasReceipt && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View receipt for ${item.friendName}`}
                onPress={() => {
                  setReceipt(item);
                }}
              >
                <Text style={styles.receiptLink}>Receipt ↗</Text>
              </Pressable>
            )}
            {!item.repaidAt && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark ${item.friendName} as repaid`}
                onPress={() => setConfirm(item)}
                style={styles.repay}
              >
                <Text style={styles.repayText}>Mark repaid ✓</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={visible}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh();
            }}
            tintColor={colors.ink}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 25 }}>
            <View style={styles.header}>
              <View style={styles.brand}>
                <View style={styles.logo}>
                  <Text style={styles.logoText}>m.</Text>
                </View>
                <Text style={styles.brandText}>MiniLedger</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={signingOut}
                onPress={async () => {
                  setSigningOut(true);
                  try {
                    await onLogout();
                  } catch {
                    setError('Could not sign out. Please try again.');
                    setSigningOut(false);
                  }
                }}
              >
                <Text style={styles.signOut}>{signingOut ? 'Signing out…' : 'Sign out ↗'}</Text>
              </Pressable>
            </View>
            <View style={{ gap: 7 }}>
              <Text style={styles.eyebrow}>YOUR MONEY, A LITTLE MORE MINDFUL</Text>
              <Text style={styles.greeting}>A clearer picture.</Text>
              <Text style={s.muted}>Keep track of the help you lend.</Text>
            </View>
            <View style={styles.summary}>
              <View style={styles.summaryTop}>
                <Text style={styles.summaryLabel}>OUTSTANDING BALANCE</Text>
                <View style={styles.liveDot} />
              </View>
              <Text style={styles.balance}>{summary ? money(summary.outstandingPaise) : '—'}</Text>
              <Text style={styles.summaryCaption}>
                {summary
                  ? `${outstandingCount} open ${outstandingCount === 1 ? 'entry' : 'entries'} · a little help that comes back`
                  : 'Getting your ledger ready…'}
              </Text>
              <View style={styles.summaryDivider} />
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Total lent</Text>
                  <Text style={styles.statValue}>
                    {summary ? money(summary.totalLentPaise) : '—'}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Repaid</Text>
                  <Text style={styles.statValue}>
                    {summary ? money(summary.totalRepaidPaise) : '—'}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: '#EBC1A3' }]}>Overdue</Text>
                  <Text style={[styles.statValue, { color: '#FFD2AE' }]}>
                    {summary ? money(summary.overduePaise) : '—'}
                  </Text>
                </View>
              </View>
            </View>
            {!!notice && (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>
                {notice}
              </Text>
            )}
            <ErrorNote message={error} />
            {!!error && (
              <Button
                title="Try again"
                secondary
                onPress={() => {
                  setRefreshing(true);
                  void refresh();
                }}
                busy={refreshing}
              />
            )}
            <View style={styles.section}>
              <View>
                <Text style={styles.sectionTitle}>
                  Your ledger
                  <Text style={{ color: '#9AA795', fontSize: 18 }}>
                    {' '}
                    / {entries.length.toString().padStart(2, '0')}
                  </Text>
                </Text>
                <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
                  Small entries. Stronger friendships.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!summary}
                onPress={() => setAdding(true)}
                style={[styles.add, !summary && { opacity: 0.4 }]}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>+ New entry</Text>
              </Pressable>
            </View>
            <View style={styles.filters}>
              {filters.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === value }}
                  onPress={() => setFilter(value)}
                  style={[styles.filter, filter === value && styles.activeFilter]}
                >
                  <Text style={[styles.filterText, filter === value && { color: '#fff' }]}>
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
            {loading && <ActivityIndicator color={colors.ink} style={{ marginBottom: 20 }} />}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>↗</Text>
              <Text style={styles.emptyTitle}>
                {!summary
                  ? 'Your ledger is a moment away.'
                  : entries.length === 0
                    ? 'Start with a little help.'
                    : 'Nothing here. A good kind of quiet.'}
              </Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>
                {!summary
                  ? 'Connect to the server and try again.'
                  : entries.length === 0
                    ? 'Add your first loan to keep the details in one place.'
                    : 'Try another filter to see the rest of your ledger.'}
              </Text>
              {summary && entries.length === 0 && (
                <Button title="+ Add your first entry" onPress={() => setAdding(true)} />
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerText}>A LITTLE LEDGER. A LIGHTER MIND.</Text>
            <Text style={[styles.footerText, { fontSize: 10, letterSpacing: 0, marginTop: 7 }]}>
              {session.user.phone}
              {summary ? ` · Dates in ${summary.timezone}` : ''}
            </Text>
          </View>
        }
      />
      {adding && summary && (
        <AddLoanModal
          token={session.token}
          today={summary.today}
          onClose={() => setAdding(false)}
          onUnauthorized={unauthorized}
          onSaved={async () => {
            setNotice('A little help, now on record.');
            await refresh();
          }}
        />
      )}
      <Modal
        visible={!!confirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!repaying) setConfirm(null);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={s.heading}>All settled?</Text>
            <Text style={s.muted}>
              Mark {confirm?.friendName}’s {confirm ? money(confirm.amountPaise) : ''} loan as fully
              repaid? This cannot be undone in the app.
            </Text>
            <Button title="Yes, mark repaid" onPress={repay} busy={repaying} />
            <Button
              title="Keep it open"
              secondary
              disabled={repaying}
              onPress={() => setConfirm(null)}
            />
          </View>
        </View>
      </Modal>
      {receipt && (
        <ReceiptModal loan={receipt} token={session.token} onClose={() => setReceipt(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 22,
    paddingTop: 22,
    paddingBottom: 20,
    maxWidth: 660,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    width: 35,
    height: 35,
    backgroundColor: colors.ink,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: { color: colors.green, fontSize: 25, fontWeight: '800', marginTop: -4 },
  brandText: { color: colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.8 },
  signOut: { color: colors.muted, fontSize: 12, paddingVertical: 12 },
  eyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 1.6, fontWeight: '600' },
  greeting: { color: colors.ink, fontWeight: '700', fontSize: 34, letterSpacing: -1.3 },
  summary: { backgroundColor: colors.ink, borderRadius: 24, padding: 24 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { color: '#BDCFBC', fontSize: 10, letterSpacing: 1.7, fontWeight: '600' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D0E9A5' },
  balance: {
    color: '#EDF5DA',
    fontSize: 43,
    letterSpacing: -1.9,
    fontWeight: '600',
    marginTop: 13,
  },
  summaryCaption: { color: '#ABC2B2', fontSize: 11, marginTop: 8 },
  summaryDivider: { height: 1, backgroundColor: '#3A5748', marginVertical: 23 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 7 },
  statLabel: { fontSize: 11, color: '#B2C6B6' },
  statValue: { fontSize: 17, color: '#F1F6E7', fontWeight: '600', letterSpacing: -0.5 },
  notice: {
    color: colors.ink,
    backgroundColor: '#E4F1D7',
    padding: 14,
    borderRadius: 12,
    fontSize: 13,
  },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 23, fontWeight: '600', letterSpacing: -0.7 },
  add: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  filters: { flexDirection: 'row', gap: 6, marginTop: -5, marginBottom: 17 },
  filter: {
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: '#EBEDE6',
  },
  activeFilter: { backgroundColor: colors.ink },
  filterText: { fontSize: 11, color: '#687767', fontWeight: '600' },
  entry: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E6EAE0',
    marginBottom: 12,
  },
  overdueEntry: { backgroundColor: '#FFF9F4', borderColor: '#E8C7AF', borderLeftWidth: 3 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#EDEEE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  friend: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  date: { color: colors.muted, fontSize: 10 },
  amount: { color: colors.ink, fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
  badge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: '#F0F1E8' },
  badgeText: { color: '#7C805C', fontSize: 9, fontWeight: '600' },
  entryBottom: {
    borderTopColor: '#EEEFE8',
    borderTopWidth: 1,
    marginTop: 15,
    paddingTop: 12,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryNote: { color: '#86917F', fontSize: 10 },
  repay: { backgroundColor: '#EDF2E7', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 8 },
  repayText: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  receiptLink: { color: colors.muted, fontSize: 11, textDecorationLine: 'underline' },
  empty: {
    padding: 25,
    gap: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D2DACB',
    borderRadius: 20,
  },
  emptyIcon: { color: colors.ink, fontSize: 40 },
  emptyTitle: { fontSize: 18, color: colors.ink, fontWeight: '600', textAlign: 'center' },
  footer: { paddingVertical: 25, alignItems: 'center' },
  footerText: { color: '#98A18E', fontSize: 9, letterSpacing: 1.8 },
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
