import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Input, Screen, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDayDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Note } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/**
 * Kağıt defterin dijital karşılığı: tüm çalışanlar aynı deftere not düşer,
 * herkes tüm notları görür; herkes kendi notunu silebilir.
 */
export default function NotesScreen() {
  const { session } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
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

  async function addNote() {
    if (!session) return;
    const text = body.trim();
    if (!text) {
      feedback.error();
      showAlert('Hata', 'Not metni boş olamaz.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('notes')
      .insert({ profile_id: session.user.id, body: text });
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setBody('');
    await load();
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
        <Text style={styles.subtitle}>Defter yerine: vardiya notlarını buraya düşün.</Text>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Card style={{ gap: 10, marginBottom: 6 }}>
            <Input
              label="Yeni not"
              value={body}
              onChangeText={setBody}
              placeholder="ör. Antifrizden az kaldı, sipariş verilmeli"
              multiline
            />
            <Button title="Notu Kaydet" icon="create-outline" onPress={addNote} loading={busy} />
          </Card>
        }
        ListEmptyComponent={<EmptyState text="Henüz not yok. İlk notu siz bırakın." />}
        renderItem={({ item }) => {
          const own = item.profile_id === session?.user.id;
          return (
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.rowMeta}>
                  {item.profiles?.full_name || 'Çalışan'} · {formatDayDateTime(item.created_at)}
                </Text>
                <Text style={styles.rowBody}>{item.body}</Text>
              </View>
              {own ? (
                <Pressable hitSlop={8} onPress={() => removeNote(item)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          );
        }}
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
