import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Switch, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Input, Screen, SectionTitle, colors } from '@/components/ui';
import { USERNAME_EMAIL_DOMAIN, createTempAuthClient, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function EmployeesScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
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
    const uname = username.trim().toLowerCase();
    if (!fullName.trim() || !uname || password.length < 6) {
      Alert.alert('Hata', 'Ad, kullanıcı adı ve en az 6 karakterlik şifre gerekli.');
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(uname)) {
      Alert.alert('Hata', 'Kullanıcı adı sadece küçük harf, rakam, nokta, tire içerebilir.');
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
      Alert.alert(
        'Hata',
        error.message.includes('already registered')
          ? 'Bu kullanıcı adı zaten kayıtlı.'
          : error.message,
      );
      return;
    }
    setFullName('');
    setUsername('');
    setPassword('');
    Alert.alert('Tamam', `Çalışan eklendi. Giriş: ${uname} / girdiğiniz şifre`);
    await load();
  }

  async function toggleActive(p: Profile, value: boolean) {
    const { error } = await supabase.from('profiles').update({ active: value }).eq('id', p.id);
    if (error) {
      Alert.alert('Hata', error.message);
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
            <Input label="Ad Soyad" value={fullName} onChangeText={setFullName} placeholder="ör. Ahmet Yılmaz" />
            <Input
              label="Kullanıcı adı"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ör. ahmet"
            />
            <Input
              label="Şifre (en az 6 karakter)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••"
            />
            <Button title="Çalışan Ekle" onPress={handleCreate} loading={busy} />
          </Card>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
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
          </View>
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
