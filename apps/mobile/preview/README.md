# Browser preview (design review only)

Renders the real phone screens in a browser against an in-memory demo session, so screens can be
captured at cheap-phone size without an emulator. Nothing here ships in the APK.

```sh
cd apps/mobile
npm i --no-save react-dom@19.3.0 react-native-web@0.21.4 @expo/metro-runtime@~58.0.0
EU_PREVIEW=1 npx expo export --platform web --output-dir .expo/preview
npx serve .expo/preview   # or any static server
```

Open `/?s=home&lang=fr` (s = signin | pin | unlock | home | empty | revoked | password, with &forced=1 for the forced change; sync = ok | pending | offline | failed | never).
Unlock PIN in the preview is 1234. Screenshots: Playwright at 360×720, deviceScaleFactor 2.
