import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatMoney, formatQty, parseNumberInput } from '@/lib/format';
import { round2, type OilRow } from '@/lib/nobet-stok';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type Mode = 'satis' | 'cikis' | 'iade';

const MODES: { key: Mode; label: string; save: string }[] = [
  { key: 'satis', label: 'Satış', save: 'Satışı Kaydet' },
  { key: 'cikis', label: 'ÇKN (depodan)', save: 'ÇKN Kaydet' },
  { key: 'iade', label: 'İade', save: 'İadeyi Kaydet' },
];

interface Props {
  /** null iken pencere kapalıdır. */
  row: OilRow | null;
  shiftId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

/** Stok tablosunda ürüne dokununca açılır: satış, depodan çıkış (ÇKN) veya iade. */
export function UrunIslemPenceresi({ row, shiftId, onClose, onSaved }: Props) {
  return (
    <Modal visible={row !== null} transparent animationType="fade" onRequestClose={onClose}>
      {/* key: başka ürün açılınca adet ve tür sıfırlansın. */}
      {row ? (
        <Pencere key={row.product.id} row={row} shiftId={shiftId} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Modal>
  );
}

function Pencere({ row, shiftId, onClose, onSaved }: Props & { row: OilRow }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>('satis');
  const [qtyText, setQtyText] = useState('1');
  const [busy, setBusy] = useState(false);
  const p = row.product;
  const qty = parseNumberInput(qtyText);

  // Satış raftan, ÇKN depodan düşer; iade müşteriden gelir, sınırı yoktur.
  // Asıl kontrol stok tetikleyicisinde, burası kullanıcıyı önceden uyarır.
  const max = mode === 'satis' ? row.kalan : mode === 'cikis' ? p.depot_stock : null;
  let error: string | null = null;
  if (qty === null || qty <= 0) error = 'Adet girin';
  else if (max !== null && qty > max) {
    error = mode === 'satis' ? `Rafta ${formatQty(max)} var` : `Depoda ${formatQty(max)} var`;
  }

  function step(delta: number) {
    feedback.tick();
    setQtyText(String(Math.max(1, round2((qty ?? 0) + delta))));
  }

  async function save() {
    if (!session || error || qty === null) return;
    setBusy(true);
    const { error: err } = await supabase.from('stock_movements').insert({
      product_id: p.id,
      profile_id: session.user.id,
      shift_id: shiftId,
      type: mode,
      qty,
      unit_price: mode === 'cikis' ? null : p.sale_price,
    });
    setBusy(false);
    if (err) {
      feedback.error();
      showAlert('Hata', err.message.includes('Yetersiz stok') ? 'Rafta yeterli ürün yok!' : err.message);
      return;
    }
    if (mode === 'satis') feedback.sale();
    else feedback.success();
    onClose();
    await onSaved();
  }

  const current = MODES.find((m) => m.key === mode)!;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {p.name}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.meta}>
          Fiyat {formatMoney(p.sale_price)} · Raf {formatQty(row.kalan)} · Depo {formatQty(p.depot_stock)}
        </Text>

        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  feedback.press();
                  setMode(m.key);
                }}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.qtyRow}>
          <Pressable style={styles.stepBtn} onPress={() => step(-1)}>
            <Ionicons name="remove" size={22} color={colors.primary} />
          </Pressable>
          <TextInput
            value={qtyText}
            onChangeText={setQtyText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.qtyInput, error !== null && qtyText !== '' && styles.qtyInvalid]}
          />
          <Pressable style={styles.stepBtn} onPress={() => step(1)}>
            <Ionicons name="add" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : mode === 'cikis' ? (
          <Text style={styles.hint}>Depodan düşer, rafa (DVR) eklenir.</Text>
        ) : (
          <Text style={styles.total}>
            {formatQty(qty ?? 0)} × {formatQty(p.sale_price)} = {formatMoney((qty ?? 0) * p.sale_price)}
          </Text>
        )}

        <View style={styles.actions}>
          <Button title="Vazgeç" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={current.save}
            variant={mode === 'satis' ? 'success' : 'primary'}
            onPress={save}
            loading={busy}
            disabled={error !== null}
            style={{ flex: 1.6 }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: -6,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.card,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    width: 90,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    padding: 0,
  },
  qtyInvalid: {
    borderColor: colors.danger,
    color: colors.danger,
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  total: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
});
