# Set up Karbs

1. Download the Windows x64 installer from the project's GitHub releases and run it. Component downloads need internet access. Windows may ask you to approve installation of an unsigned application.
2. Open Settings. Use **Set up desktop components** to retry Node/Codex setup if needed.
3. For Codex, select a signed-in Codex native executable in Settings, or sign in to the installed CLI. Each user uses their own eligible account. For Gemini, add an API key from Google AI Studio and choose a model available to that key. Gemini desktop/website login does not supply an API key.
4. Keep Reviewed access while trying a task. Enable PC control and Full access only when you want the agent to carry out your requested desktop actions without individual tool prompts.
5. Optional voice setup downloads Python packages and an English Whisper speech model. It can use significant disk space and time. Check your microphone in Windows before recording.
6. Check for signed updates in Settings. An update restarts the app after installation. Updates are distributed as versioned releases, not on every source edit.

Data and downloaded components default to `%LOCALAPPDATA%/Karbs`. Advanced portable installs can set `COUCOU_DATA_DIR` to a writable directory on another drive before launching. That environment variable retains its historical internal name; the public app is Karbs.

Do not give a test agent deletion, payment or account-management work. A simple initial test is to create a new folder inside Documents, write a short text file there, and verify its content.

## Native platform previews

Use only a published preview download from the Karbs website or GitHub releases. These have different capabilities from the Windows app; see [the platform guide](../ports/README.md).

On macOS, choose Apple Silicon or Intel for your Mac and copy Karbs Preview from the DMG to Applications. The preview is ad-hoc signed, not Apple-notarized. On Linux x64, use the DEB through your package manager, which resolves GTK/WebKit/Secret Service and espeak-ng dependencies. The AppImage needs a compatible system and its runtime dependencies.

On Android, install the signed APK and approve installation in Android. Open Karbs Settings and connect your own Gemini API key. Android does not run the desktop Codex CLI. System reply speech uses your installed Android speech engine.

To float Karbs, choose **Allow floating bar**, grant Android Display over other apps permission, return to Karbs and choose **Show floating bar**. Allow notifications if you want the persistent Hide control in the notification tray. Drag the face to reposition it; tap it for status, Open Karbs, Hide and Stop phone actions.

For phone tasks, choose **Set up Android Accessibility**, enable **Karbs Phone Assist**, return to Karbs and enable **Allow Phone Assist for tasks I send**. Use **Test Phone Assist** first. It checks its own text field/button, Home navigation and screen inspection, without sending screen contents to Gemini. Then send a small task such as opening your browser to a requested URL. Phone Assist screen text is sent to your Gemini API account during an enabled task. It cannot access private app files or bypass protected screens. Disable the task setting or the Android Accessibility service to revoke it.

Desktop previews check their separate signed update channel. Android updates use a newer APK signed by the same publisher key and still require Android installation approval. Source commits alone are not application updates.
