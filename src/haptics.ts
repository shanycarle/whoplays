import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptics are native-only; calls are safe no-ops on web.
const enabled = Platform.OS !== 'web';

/** Light tap — for keypad presses. */
export function hapticTap(): void {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Selection change — picking a team or opening a player. */
export function hapticSelect(): void {
  if (enabled) Haptics.selectionAsync().catch(() => {});
}

/** Success — a player was found on explicit search. */
export function hapticSuccess(): void {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Warning — explicit search returned nothing. */
export function hapticWarning(): void {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
