# Security

Report security issues privately to kansagara.dwij@gmail.com with version and reproduction steps. Never include credentials or other people's personal information.

Full access executes with the current user's Windows permissions. It can change or delete files accessible to that account when requested. Reviewed mode gates desktop mutations, but screenshots and window inspection can still expose sensitive content to a selected provider. Treat third-party files and web pages as untrusted input.

Release installers use Tauri signatures for update integrity. These are separate from Windows Authenticode certificates. Never disable signature verification or run an installer from an unofficial link. Code changes do not become automatic releases.
