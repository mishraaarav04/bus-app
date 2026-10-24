# Development build (background GPS and push)

Expo Go is perfect for trying the app, but two features need a real app build:

| Feature | Expo Go | Development build |
|---|---|---|
| Driver location while the phone is locked / app in background | No (falls back to "keep this app open") | Yes |
| Push notifications | iPhone only | iPhone and Android |
| Everything else | Yes | Yes |

The app detects this and falls back on its own, so nothing breaks in Expo Go.

## One-time setup

1. Create a free Expo account at expo.dev and install the tools: `npm install -g eas-cli`, then `eas login`.
2. In `mobile/`: `npx expo install expo-dev-client`
3. Link the project: `eas init` (this writes your project id into `app.json` under `extra.eas.projectId`; push notifications need it).
4. Change the app identifiers in `mobile/app.json` from the placeholder `com.example.wheelie` (both `ios.bundleIdentifier` and `android.package`) to your own, e.g. `com.yourschool.wheelie`.

## Android

```
eas build --profile development --platform android
```

When it finishes, open the link on your phone to install the app, then run `npx expo start --dev-client` and open it.

For push on Android you also need Firebase Cloud Messaging credentials: follow https://docs.expo.dev/push-notifications/fcm-credentials/ (create a Firebase project, download `google-services.json`, run `eas credentials`).

## iPhone

Installing on a real iPhone needs a paid Apple Developer account ($99/year):

```
eas device:create        # registers your iPhone
eas build --profile development --platform ios
```

(The simulator build, `--profile development-simulator` after adding it to `eas.json`, is free but can't test GPS or push.)

## Testing background GPS

1. Sign in as a driver on the development build, start a ride, and accept **Allow all the time** (iOS: "Always") when asked.
2. Lock the phone and walk or drive around. A notification "Wheelie is sharing the bus location" shows on Android; iPhone shows a blue status pill.
3. Watch from a second phone as a parent: the bus should keep moving.
4. End the ride: sharing stops and the indicator disappears.

## Store release

When you're ready for TestFlight / Google Play, change `--profile development` to `--profile production` and follow EAS Submit (`eas submit`). Apple and Google both ask why you use background location; use the wording in `app.json` and the privacy notes in `PRIVACY_AND_COMPLIANCE.md`.
