import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (profile?.role === 'admin') return <Redirect href="/(admin)/stok" />;
  return <Redirect href="/(calisan)/satis" />;
}
