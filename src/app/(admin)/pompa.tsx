import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminPompa } from '@/components/cizelge/admin-pompa';
import { Button, EmptyState, Screen, colors } from '@/components/ui';
import { feedback } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';

/** Herhangi bir nöbetin 2. sayfası; vardiya bloklarından ve vardiya detayından açılır. */
export default function AdminPompaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shift, setShift] = useState<Shift | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('shifts').select('*, profiles(full_name)').eq('id', id).maybeSingle();
    setShift((data as Shift) ?? null);
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function back() {
    feedback.press();
    if (router.canGoBack()) router.back();
    else router.navigate('/(admin)/vardiyalar');
  }

  if (!loaded) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!shift) {
    return (
      <Screen>
        <EmptyState text="Vardiya bulunamadı." />
        <View style={{ paddingHorizontal: 16 }}>
          <Button title="Geri" variant="ghost" onPress={back} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={styles.title}>2. SAYFA · POMPA SAYAÇLARI</Text>
      </View>
      {/* Nöbet değişince sayfa taslakları eskisinden kalmasın. */}
      <AdminPompa key={shift.id} shift={shift} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 0.3,
  },
});
