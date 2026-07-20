import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

/**
 * Merkezi geri bildirim: ses + dokunsal titreşim (haptics).
 * Ekranların her yerinden `feedback.success()` gibi çağrılır.
 * Web'de haptics sessizce yok sayılır; ses çalışır.
 */

type SfxName = 'tap' | 'success' | 'sale' | 'error';

const sources: Record<SfxName, number> = {
  tap: require('../../assets/sounds/tap.wav'),
  success: require('../../assets/sounds/success.wav'),
  sale: require('../../assets/sounds/sale.wav'),
  error: require('../../assets/sounds/error.wav'),
};

const players: Partial<Record<SfxName, AudioPlayer>> = {};
let audioReady = false;
let soundEnabled = true;

function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  try {
    // Sessiz moddayken bile geri bildirim sesleri duyulsun.
    Promise.resolve(setAudioModeAsync({ playsInSilentMode: true })).catch(() => {});
  } catch {
    // web / desteklenmeyen platform
  }
}

function playSound(name: SfxName) {
  if (!soundEnabled) return;
  ensureAudio();
  try {
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(sources[name]);
      p.volume = 0.9;
      players[name] = p;
    }
    Promise.resolve(p.seekTo(0)).catch(() => {});
    p.play();
  } catch {
    // ses çalınamazsa sessizce geç
  }
}

type HapticKind = 'light' | 'success' | 'warning' | 'error';

function haptic(kind: HapticKind) {
  try {
    const p =
      kind === 'success'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : kind === 'warning'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          : kind === 'error'
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Promise.resolve(p).catch(() => {});
  } catch {
    // haptics yoksa yok say
  }
}

export const feedback = {
  /** Genel buton dokunuşu — sadece hafif titreşim. */
  press() {
    haptic('light');
  },
  /** Sepete ekleme gibi artışlar — hafif titreşim + tık sesi. */
  tick() {
    haptic('light');
    playSound('tap');
  },
  /** Satış kaydedildi — başarı titreşimi + "cha-ching". */
  sale() {
    haptic('success');
    playSound('sale');
  },
  /** Genel başarı (vardiya kapatma vb.) — başarı titreşimi + çan sesi. */
  success() {
    haptic('success');
    playSound('success');
  },
  /** Hata — uyarı titreşimi + hata sesi. */
  error() {
    haptic('error');
    playSound('error');
  },
  /** Dikkat çeken bilgi — sadece uyarı titreşimi. */
  warning() {
    haptic('warning');
  },
  setSoundEnabled(v: boolean) {
    soundEnabled = v;
  },
};
