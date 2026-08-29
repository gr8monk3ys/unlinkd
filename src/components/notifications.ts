/**
 * Thin, environment-safe wrapper around the browser Notifications API. All
 * functions no-op gracefully where Notification is unavailable (jsdom, older
 * browsers, insecure contexts), so callers never need to feature-detect.
 */

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/** Show a single "rechecks due" reminder if permission is granted and count > 0. */
export function notifyRechecksDue(count: number): void {
  if (count <= 0 || !notificationsSupported() || Notification.permission !== 'granted') {
    return;
  }
  try {
    const noun = count === 1 ? 'recheck is' : 'rechecks are';
    new Notification('unlinkd — rechecks due', {
      body: `${count} connector ${noun} due. Open unlinkd to review and re-verify.`,
      tag: 'unlinkd-rechecks'
    });
  } catch {
    // Some contexts disallow constructing Notifications directly; ignore.
  }
}
