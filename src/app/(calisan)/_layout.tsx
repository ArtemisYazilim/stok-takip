import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { colors } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

export default function WorkerLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (profile && profile.role === 'admin') return <Redirect href="/(admin)/stok" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarActiveBackgroundColor: colors.primarySoft,
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="satis"
        options={{
          title: 'Satış',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="vardiya"
        options={{
          title: 'Vardiya',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stok"
        options={{
          title: 'Stok',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
