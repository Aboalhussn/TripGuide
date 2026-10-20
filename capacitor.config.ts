import type { CapacitorConfig } from '@capacitor/cli';

// Android and iOS app settings. The web files come from `npm run build:app` (dist/app).
const config: CapacitorConfig = {
  appId: 'com.tripguide.app',
  appName: 'Trip guide',
  webDir: 'dist/app',
  backgroundColor: '#FFFFFF',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFFFFF',
      overlaysWebView: false,
    },
    Keyboard: {
      // The whole app view shrinks above the keyboard, so the chat box sits right on top of it.
      resize: 'native',
    },
  },
};

export default config;
