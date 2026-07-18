import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input, Screen, colors } from '@/components/ui';
import { supabase, toLoginEmail } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function LoginScreen() {
  const { session, loading: authLoading } = useAuth();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!authLoading && session) return <Redirect href="/" />;

  async function handleLogin() {
    setError('');
    if (!identity.trim() || !password) {
      setError('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(identity),
      password,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Kullanıcı adı veya şifre hatalı.'
          : `Giriş başarısız: ${err.message}`,
      );
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Stok Takip</Text>
          <Text style={styles.subtitle}>Vardiya ve stok yönetimi</Text>
        </View>
        <Card style={styles.form}>
          <Input
            label="Kullanıcı adı veya e-posta"
            value={identity}
            onChangeText={setIdentity}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ör. ahmet"
          />
          <Input
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••"
            onSubmitEditing={handleLogin}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Giriş Yap" onPress={handleLogin} loading={busy} />
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 24,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  form: {
    gap: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
