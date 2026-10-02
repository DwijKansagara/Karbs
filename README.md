# Karbs

Meet Karbs, your personal desktop assistant.

Karbs brings Codex and Gemini chat, session activity, file attachments and optional desktop tools into a compact Windows panel. Click an agent to expand its activity; use **Open app** to bring its separate application forward.

**Release status:** Windows x64 is the implemented release target. macOS, Linux, Android and iOS installers are not available. This repository does not claim those platforms work.

- Website: https://karbs.antideploy.app
- Publisher: Dwij Kansagara
- Support: kansagara.dwij@gmail.com
- Original source: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou), MIT

## Features

- Select Codex or Gemini for built-in chat. Each user supplies their own Codex sign-in or Gemini API key.
- Expand session activity without automatically opening another app.
- Windows desktop inspection, screenshots, clicks, Unicode typing, scrolling and PowerShell tasks.
- Reviewed access by default. Optional Full access lets the agent execute requested actions without a prompt for every tool call. It uses the current Windows account and cannot override OS restrictions.
- Text and image attachments; optional Python components prepare PDF pages and GIF frames for Codex.
- Optional local English speech recognition and reply playback. Online natural speech sends reply text to Microsoft's speech service; Windows speech is available offline.
- Signed update checks in Settings. Publishing a GitHub release is required to deliver an update; source commits alone do not update installed apps.

## Installation

Use only an installer linked from a published [GitHub release](https://github.com/DwijKansagara/Karbs/releases). A source-code ZIP is not an installer. Windows x64 requires Windows 10/11 and WebView2.

The per-user installer sets up Node and Codex components automatically. It does not sign in for you, install other desktop apps, copy the publisher's accounts, or enable Full access. Optional voice components and the speech model download through Settings. You can retry component setup if your network interrupts it.

See [setup](docs/SETUP.md), [privacy](docs/PRIVACY.md), [terms](docs/TERMS.md), and [security](SECURITY.md).

## Build on Windows

Install Node.js, Rust, Microsoft C++ build tools and WebView2. From `windows/`:

```powershell
npm ci
npm run icons
npm run build
npm run tauri -- build --no-bundle
```

An installer build requires your own Tauri updater signing key and its matching public key in `tauri.conf.json`. The publisher's private key is never committed. For another fork, change the app identifier, updater endpoint and public key before distributing.

## Contributing

Include Windows version, app version, provider, reproduction steps and redacted logs with a bug report. Do not upload API keys, private conversations or desktop screenshots containing sensitive information. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Attribution and artwork

Original software copyright © 2026 Louis Raillé. Karbs modifications © 2026 Dwij Kansagara. The MIT copyright notice is retained in [LICENSE](LICENSE). Karbs has an independent expressive robot faces and K brand mark and synthesized notification tones. Upstream names, character designs, sounds, icons and demo artwork are not distributed. Karbs is an independent project and is not endorsed by OpenAI, Google, Microsoft or the upstream author.
