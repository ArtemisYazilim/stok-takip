import { useCallback, useEffect, useState } from 'react';

import { feedback } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/**
 * Adminin okunmamış bildirim sayısını canlı (realtime) takip eder.
 * Yeni bildirim düşünce hafif ses/titreşim verir; tab rozetini besler.
 */
export function useUnreadNotifications() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    const { count: c } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);
    setCount(c ?? 0);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    refresh();
    const channel = supabase
      .channel('notifications-badge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          feedback.tick();
          refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, refresh]);

  return { count, refresh };
}
