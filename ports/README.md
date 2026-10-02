# Karbs platform preview

Native Tauri 2 app for macOS, Linux and Android. The stable Windows app lives in `windows/` and is not replaced by this preview.

| Capability | macOS and Linux | Android |
| --- | --- | --- |
| Gemini chat and available-model discovery | Yes, with your own API key | Yes, with your own API key |
| Codex chat | Bundled official CLI, your own device sign-in | Not supported |
| Text, image and PDF attachments | Gemini; Codex accepts text/images | Gemini |
| GIF attachments | First frame converted to PNG | First frame converted to PNG |
| Full access | Opt-in native command execution for the requested task | Not supported |
| Floating assistant | Standard application window | Draggable face/status bar, explicit Android overlay permission |
| Pointer control, external-session monitoring, voice dictation | Not implemented in this preview | Not implemented |
| Reply speech | macOS system voice; Linux `espeak-ng` | Installed Android TTS engine |
| Secure Gemini key storage | macOS Keychain / Linux Secret Service | AES-GCM with an Android Keystore key |
| Updates | Signed preview channel, user initiates installation | Signed APK; Android asks before installing |

If the desktop keyring is unavailable, **Use for this session** connects without saving a plaintext key. Conversations stay in memory and clear when the app closes. Selected images prepared for Codex are temporary files in private app storage. Preferences are ordinary JSON and contain no API key. Full access runs as the logged-in user and does not bypass OS permissions.

The preview uses separate app storage and a separate update channel from Windows 0.2.0. Public character artwork is independently authored; upstream restricted assets are not distributed.

## Development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). From this folder:

```sh
npm ci
npm run build
cargo test -p karbs-port-core --locked
npm run tauri -- dev
```

Desktop packaging first downloads the checksum-pinned official Codex CLI and its redistribution license using `scripts/vendor-codex.mjs` with the target triple. Use an updater signing key matching the public key in `src-tauri/tauri.conf.json`; never commit private signing keys.

Android generation runs `tauri android init`, then `scripts/configure-android.mjs` adds the Keystore/TTS implementation and configures release signing from private CI environment variables. Generated SDK, Gradle, keystore and binary files are ignored. This is direct APK distribution, not a Play Store listing.

On Android, Settings provides **Allow floating bar**, **Show floating bar**, and **Hide floating bar**. The bar is a user-started foreground service with a persistent stop notification. Drag its face to reposition it; tap to expand status and Open Karbs/Hide controls. The overlay permission grants no access to other apps' files or controls. It does not start on boot or record the screen.

macOS builds use ad-hoc signing. They are not Apple-notarized; normal Gatekeeper checks still apply. Linux packages target Ubuntu 22.04 or newer x64 with GTK/WebKit dependencies. Android targets Android 7 or newer, arm64 and x86_64, with NDK 28 for 16 KB page compatibility. Physical-device provider and voice testing is still required before claiming full feature parity.

Large build dependencies and caches on the publisher's PC belong on E:. Native macOS/Linux builds use their respective GitHub runners; Android builds use an isolated SDK on a runner.
