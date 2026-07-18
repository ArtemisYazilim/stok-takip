import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, Screen, colors } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';

export default function ShiftsScreen() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shifts')
      .select('*, profiles(full_name)')
      .order('started_at', { ascending: false })
      .limit(60);
    setShifts((data as Shift[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen>
      <Text style={styles.title}>Vardiyalar</Text>
      <FlatList
        data={shifts}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz vardiya kaydı yok." />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/(admin)/vardiya-detay', params: { id: item.id } })}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.rowName}>{item.profiles?.full_name || 'Çalışan'}</Text>
              <Text style={styles.rowMeta}>
                {formatDateTime(item.started_at)}
                {item.ended_at ? ` → ${formatDateTime(item.ended_at)}` : ''}
              </Text>
            </View>
            {item.ended_at ? (
              <Badge text="Kapalı" color={colors.textMuted} />
            ) : (
              <Badge text="Açık" color={colors.success} />
            )}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
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
    padding: 14,
    gap: 12,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
