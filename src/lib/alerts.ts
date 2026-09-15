import { Alert, Platform } from 'react-native';

/**
 * RN Web'de Alert polyfill'i yoktur: Alert.alert web'de sessizce yok sayılır
 * ve kullanıcı hiçbir geri bildirim görmez. Bu yardımcılar native'de sistem
 * diyalogunu, web'de window.alert / window.confirm'u kullanır.
 */

export function showAlert(title: string, message?: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n${message}` : title);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'Tamam', onPress: onOk }] : undefined);
}

/** Onay diyaloğu açar; kullanıcı onaylarsa true döner. */
export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
