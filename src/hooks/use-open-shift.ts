import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/** Giriş yapan çalışanın açık vardiyasını getirir. */
export function useOpenShift() {
  const { session } = useAuth();
  const [shift, setShift] = useState<Shift | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('profile_id', session.user.id)
      .is('ended_at', null)
      .maybeSingle();
    setShift((data as Shift) ?? null);
    setLoaded(true);
  }, [session]);

  return { shift, loaded, reload };
}
