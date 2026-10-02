# Set up Karbs

1. Download the Windows x64 installer from the project's GitHub releases and run it. Component downloads need internet access. Windows may ask you to approve installation of an unsigned application.
2. Open Settings. Use **Set up desktop components** to retry Node/Codex setup if needed.
3. For Codex, select a signed-in Codex native executable in Settings, or sign in to the installed CLI. Each user uses their own eligible account. For Gemini, add an API key from Google AI Studio and choose a model available to that key. Gemini desktop/website login does not supply an API key.
4. Keep Reviewed access while trying a task. Enable PC control and Full access only when you want the agent to carry out your requested desktop actions without individual tool prompts.
5. Optional voice setup downloads Python packages and an English Whisper speech model. It can use significant disk space and time. Check your microphone in Windows before recording.
6. Check for signed updates in Settings. An update restarts the app after installation. Updates are distributed as versioned releases, not on every source edit.

Data and downloaded components default to `%LOCALAPPDATA%/Karbs`. Advanced portable installs can set `COUCOU_DATA_DIR` to a writable directory on another drive before launching. That environment variable retains its historical internal name; the public app is Karbs.

Do not give a test agent deletion, payment or account-management work. A simple initial test is to create a new folder inside Documents, write a short text file there, and verify its content.
