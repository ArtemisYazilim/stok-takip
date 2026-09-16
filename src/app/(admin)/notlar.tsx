import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDayDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Note } from '@/lib/types';

/**
 * Çalışanların ortak deftere düştüğü notların admin tarafı.
 * Defter çalışanların; admin burada yalnızca okur ve gereksiz/eski notu
 * silebilir (RLS "notes_delete" politikası admin'e her notu silme izni verir).
 */
export default function AdminNotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    setNotes((data as Note[]) ?? []);
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

  async function removeNote(n: Note) {
    const onay = await confirmAction('Notu sil', 'Bu not kalıcı olarak silinecek.', 'Sil');
    if (!onay) return;
    const { error } = await supabase.from('notes').delete().eq('id', n.id);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Notlar</Text>
        <Text style={styles.subtitle}>Çalışanların ortak deftere düştüğü notlar.</Text>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz not yok. Çalışanlar not bıraktıkça burada görünür." />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.rowMeta}>
                {item.profiles?.full_name || 'Çalışan'} · {formatDayDateTime(item.created_at)}
              </Text>
              <Text style={styles.rowBody}>{item.body}</Text>
            </View>
            <Pressable hitSlop={8} onPress={() => removeNote(item)}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    gap: 10,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  rowBody: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
