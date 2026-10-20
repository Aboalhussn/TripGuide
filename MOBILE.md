# Trip guide on Android and iOS

The phone apps wrap the same web app with [Capacitor](https://capacitorjs.com). The design, the screens and the
Arabic/English text are shared: change the web app and both phone apps change with it.

## What is set up

| | |
|---|---|
| App id | `com.tripguide.app` (change it in `capacitor.config.ts` **before** the first store upload) |
| App name | Trip guide |
| Theme | Light only. The app ignores the phone's dark mode (Android `forceDarkAllowed=false`, iOS `UIUserInterfaceStyle=Light`). |
| Status bar | White with dark icons |
| Android back button | Goes back one screen; exits from the home screen |
| Icons and splash | Generated from `assets/` (`npm run assets` regenerates them) |
| Data | Without a server the app carries the demo data inside it and works offline. |

## Connect a real server

1. Deploy the server (`npm start` on any Node 22 host; `render.yaml` is ready for Render).
2. Build the app pointing at it:
   ```
   API_URL=https://your-server.example npm run build:app
   npx cap sync
   ```
3. If the server uses other origins, set `ALLOWED_ORIGINS` on the server. The defaults already allow the apps
   (`capacitor://localhost`, `https://localhost`).

## Build the Android app (APK)

You need Android Studio (it brings the Android SDK and Java).

```
npm install
npm run android        # builds, syncs and opens the project in Android Studio
```

In Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**. For the Play Store use
**Generate Signed Bundle** (AAB) with your own signing key.

Command line instead: `npm run apk` (APK lands in `android/app/build/outputs/apk/debug/`).

## Build the iOS app

You need a Mac with Xcode 16+, and an Apple Developer account ($99/year) to install on phones or publish.

```
npm install
npm run ios            # builds, syncs and opens Xcode
```

In Xcode: pick your team under **Signing & Capabilities**, choose a device, press Run. For the App Store:
**Product > Archive**.

## Automatic builds

`.github/workflows/mobile.yml` runs on GitHub: it tests the code, builds the Android APK (download it from the
run's **Artifacts**) and checks that the iOS app compiles. Set the repository variable `API_URL` to build against
your server.

## Payments

- **Card**: works end to end in **test mode** (no money moves). Test card `4242 4242 4242 4242`, any name, any
  future expiry, any CVC. `4000 0000 0000 0002` shows a declined card. To go live, replace `chargeCard()` in
  `src/core/api.ts` with your gateway (ZainCash, FIB, Qi Card…); keep its return shape.
- **Cash**: the tourist pays the guide at the end of each day and the guide taps "Cash received". Guides must hold
  an active subscription to take cash; the admin sets its price and period on the admin home screen.

## Fonts

The Thmanyah Sans files are not in the repository (licence). Put them in `public/fonts/` before building, or the
app falls back to system fonts. On GitHub Actions the build uses system fonts unless you add them.
