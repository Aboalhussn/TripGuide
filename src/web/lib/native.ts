// Native (Capacitor) setup for the Android and iOS apps. Does nothing in a normal browser.
import { Capacitor } from '@capacitor/core';

export function isNative() {
  return Capacitor.isNativePlatform();
}

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  const platform = Capacitor.getPlatform();
  document.documentElement.classList.add('native', 'platform-' + platform);
  const [{ StatusBar, Style }, { SplashScreen }, { App }, { Keyboard }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/app'),
    import('@capacitor/keyboard'),
  ]);
  // The app is light only: dark status-bar icons on a white bar, whatever the phone's theme.
  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (platform === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: '#FFFFFF' });
    }
  } catch {
    /* older devices */
  }
  // Android back button: go back a screen, or leave the app from the home screen.
  App.addListener('backButton', () => {
    const route = window.location.hash.replace(/^#/, '') || '/';
    if (route === '/' || route === '') App.exitApp();
    else window.history.back();
  });
  if (platform === 'ios') Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
  window.setTimeout(() => SplashScreen.hide().catch(() => {}), 250);
}
