import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { feedback } from '@/lib/feedback';

export const colors = {
  primary: '#1d6ff2',
  primaryDark: '#1554b8',
  primarySoft: '#e8f0fe',
  danger: '#d92d20',
  success: '#12805c',
  warning: '#b54708',
  bg: '#f4f6fa',
  card: '#ffffff',
  border: '#e2e6ee',
  text: '#101828',
  textMuted: '#667085',
};

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'ghost' | 'success';
  loading?: boolean;
  disabled?: boolean;
  /** Basınca hafif titreşim ver (varsayılan açık). */
  haptics?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  haptics = true,
  icon,
  style,
}: ButtonProps) {
  const bg =
    variant === 'primary' ? colors.primary
    : variant === 'danger' ? colors.danger
    : variant === 'success' ? colors.success
    : 'transparent';
  const isDisabled = disabled || loading;
  const fg = variant === 'ghost' ? colors.primary : '#fff';
  return (
    <Pressable
      onPress={() => {
        if (haptics) feedback.press();
        onPress();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.buttonGhost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Ürün fotoğrafı küçük resmi; fotoğraf yoksa kutu ikonu gösterir. */
export function ProductThumb({ uri, size = 48 }: { uri?: string | null; size?: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: size * 0.22 }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Ionicons name="cube-outline" size={Math.round(size * 0.5)} color={colors.textMuted} />
      )}
    </View>
  );
}

interface InputProps extends TextInputProps {
  label?: string;
}

export function Input({ label, style, ...rest }: InputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1a` }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ text }: { text: string }) {
  return <Text style={styles.sectionTitle}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  thumb: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
