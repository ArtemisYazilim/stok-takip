import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { colors } from '@/components/ui';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { useAuth } from '@/providers/auth-provider';

export default function AdminLayout() {
  const { session, profile, loading } = useAuth();
  const { count: unread } = useUnreadNotifications();

  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (profile && profile.role !== 'admin') return <Redirect href="/(calisan)/satis" />;

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
        name="stok"
        options={{
          title: 'Stok',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="hareketler"
        options={{
          title: 'Hareketler',
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-vertical-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="vardiyalar"
        options={{
          title: 'Vardiyalar',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bildirimler"
        options={{
          title: 'Bildirim',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calisanlar"
        options={{
          title: 'Çalışanlar',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notlar"
        options={{
          title: 'Notlar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="urun" options={{ href: null }} />
      <Tabs.Screen name="vardiya-detay" options={{ href: null }} />
      <Tabs.Screen name="calisan-detay" options={{ href: null }} />
    </Tabs>
  );
}
