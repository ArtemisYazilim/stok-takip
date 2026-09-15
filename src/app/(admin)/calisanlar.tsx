import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Input, Screen, SectionTitle, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { USERNAME_EMAIL_DOMAIN, createTempAuthClient, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const TURKISH_FOLD: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
};

function slugifyUsername(name: string): string {
  return name
    .split('')
    .map((ch) => TURKISH_FOLD[ch] ?? ch)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '');
}

export default function EmployeesScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setProfiles((data as Profile[]) ?? []);
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

  async function handleCreate() {
    const uname = slugifyUsername(fullName);
    if (!fullName.trim() || !uname || !password) {
      showAlert('Hata', 'Ad ve şifre gerekli.');
      return;
    }
    if (password.length < 6) {
      showAlert('Hata', 'Şifre en az 6 haneli olmalıdır.');
      return;
    }
    setBusy(true);
    // Ayrı istemci: signUp admin oturumunu değiştirmesin.
    const temp = createTempAuthClient();
    const { error } = await temp.auth.signUp({
      email: `${uname}@${USERNAME_EMAIL_DOMAIN}`,
      password,
      options: { data: { full_name: fullName.trim(), role: 'calisan' } },
    });
    setBusy(false);
    if (error) {
      showAlert(
        'Hata',
        error.message.includes('already registered')
          ? 'Bu kullanıcı adı zaten kayıtlı.'
          : error.message,
      );
      return;
    }
    setFullName('');
    setPassword('');
    showAlert('Tamam', `Çalışan eklendi. Giriş: ${uname} / girdiğiniz şifre`);
    await load();
  }

  async function toggleActive(p: Profile, value: boolean) {
    const { error } = await supabase.from('profiles').update({ active: value }).eq('id', p.id);
    if (error) {
      showAlert('Hata', error.message);
      return;
    }
    await load();
  }

  return (
    <Screen>
      <Text style={styles.title}>Çalışanlar</Text>
      <FlatList
        data={profiles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Kayıtlı kullanıcı yok." />}
        ListHeaderComponent={
          <Card style={{ gap: 12, marginBottom: 14 }}>
            <SectionTitle text="Yeni Çalışan Ekle" />
            <Input
              label="Ad Soyad"
              value={fullName}
              onChangeText={setFullName}
              placeholder="ör. Ahmet Yılmaz"
            />
            <Input
              label="Şifre (en az 6 hane)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••"
            />
            <Button title="Çalışan Ekle" onPress={handleCreate} loading={busy} />
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/(admin)/calisan-detay', params: { id: item.id } })}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.rowName}>{item.full_name || '(İsimsiz)'}</Text>
              <Badge
                text={item.role === 'admin' ? 'Admin' : 'Çalışan'}
                color={item.role === 'admin' ? colors.primary : colors.textMuted}
              />
            </View>
            {item.role !== 'admin' ? (
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text style={styles.switchHint}>{item.active ? 'Aktif' : 'Pasif'}</Text>
                <Switch value={item.active} onValueChange={(v) => toggleActive(item, v)} />
              </View>
            ) : null}
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
  switchHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
