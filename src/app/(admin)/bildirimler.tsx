import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, Screen, colors } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data as AppNotification[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Canlı: yeni bildirim düşünce listeye ekle.
  useEffect(() => {
    const channel = supabase
      .channel('notifications-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          setItems((prev) => [payload.new as AppNotification, ...prev]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unread = items.filter((n) => !n.read).length;

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markRead(n: AppNotification) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    }
    if (n.shift_id) {
      router.push({ pathname: '/(admin)/vardiya-detay', params: { id: n.shift_id } });
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('read', false);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Bildirimler</Text>
          <Text style={styles.subtitle}>
            {unread > 0 ? `${unread} okunmamış` : 'Tümü okundu'}
          </Text>
        </View>
        {unread > 0 ? (
          <Button title="Tümünü okundu" variant="ghost" icon="checkmark-done" onPress={markAllRead} />
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz bildirim yok. Vardiya kapanınca burada görünür." />}
        renderItem={({ item }) => {
          const diff = item.has_diff;
          const accent = diff ? colors.danger : colors.success;
          return (
            <Pressable
              style={[styles.row, !item.read && { backgroundColor: `${accent}0d`, borderColor: `${accent}55` }]}
              onPress={() => markRead(item)}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${accent}1a` }]}>
                <Ionicons
                  name={diff ? 'alert-circle' : 'checkmark-circle'}
                  size={22}
                  color={accent}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowTitle, !item.read && { fontWeight: '800' }]}>
                    {item.title}
                  </Text>
                  {!item.read ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
                </View>
                <Text style={styles.rowBody}>{item.body}</Text>
                <Text style={styles.rowTime}>{formatDateTime(item.created_at)}</Text>
              </View>
              {item.shift_id ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowBody: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
