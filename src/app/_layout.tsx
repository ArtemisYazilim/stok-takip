import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider } from '@/providers/auth-provider';

export default function RootLayout() {
  if (!isSupabaseConfigured) {
    return (
      <View style={styles.configWrap}>
        <Text style={styles.configTitle}>Kurulum eksik</Text>
        <Text style={styles.configText}>
          Proje kökünde .env dosyası oluşturup Supabase bilgilerini girin:{'\n\n'}
          EXPO_PUBLIC_SUPABASE_URL=...{'\n'}
          EXPO_PUBLIC_SUPABASE_ANON_KEY=...{'\n\n'}
          Ayrıntılar için KURULUM.md dosyasına bakın, sonra uygulamayı yeniden başlatın.
        </Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  configWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
    gap: 12,
  },
  configTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  configText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#444',
  },
});
