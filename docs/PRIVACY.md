EFFECTIVE 2 OCTOBER 2026

# Privacy policy

What Karbs reads, stores and sends when you use it.

## Publisher and contact

Karbs is published by Dwij Kansagara. Questions about this policy can be sent to kansagara.dwij@gmail.com. This policy describes the software in this repository and its download website.

## On your device

Preferences, working files, converted attachments, speech models and activity logs are stored in the Karbs data directory, normally your local application-data folder. Activity logs can include prompts, file paths, window names and commands. API keys are saved in Windows Credential Manager. Codex manages its own sign-in credentials. The publisher does not receive those credentials automatically.

## Native platform previews

macOS and Linux store Gemini keys in the system Keychain or Secret Service. Android stores only encrypted key data, protected by an Android Keystore key. A session-only key stays in memory. Preview conversations and task activity stay in memory; preferences and temporary Codex attachments use private application storage. Device system text-to-speech follows the settings and policies of your installed speech engine.

## Android floating bar and Phone Assist

The floating bar requires Display over other apps permission and runs as a user-started foreground service with a persistent notification and Hide control. It does not record your screen. Phone Assist requires you to enable the Karbs Accessibility service and the separate Karbs task setting. It reads accessible screen text only when an enabled task calls the inspection tool, excludes password nodes, and sends the returned text to your Gemini API account as a tool result. It can click, type, swipe, navigate, list launchable apps and open apps or web URLs for that task. It is disarmed when a task finishes or stops. Stop phone actions from the floating bar, turn the task setting off, or disable the service in Android settings to revoke control. Protected screens and private app files remain subject to Android restrictions.

## Your selected AI provider

When you send a message, Karbs sends that message, selected conversation context and attached content to your selected provider. If desktop tools are enabled, screenshots, window information and tool results may also be sent so the provider can complete your task. Codex requests use your own Codex connection; Gemini requests use your API key. Provider policies and account settings determine their storage and processing. Do not attach content you do not have permission to share.

## Voice

The optional Whisper speech-recognition model processes microphone audio locally. Your recognized text becomes a chat message when you submit it. Online natural speech sends reply text to Microsoft’s speech service. Choose Windows speech for offline playback. Temporary playback files are deleted after playback, but interruptions may leave files until you remove them.

## Downloads, searches and integrations

Component setup contacts Node.js, Python, the Python package index, the npm registry and the speech-model host. Release checks and downloads contact GitHub. Web search contacts Bing. Enabled integrations contact their configured services. Those services receive network metadata such as your IP address and apply their own policies.

## Website

The landing page does not include advertising, an analytics tracker, a contact form or tracking cookies. Its download section requests public release metadata from GitHub. The hosting provider may process access and security logs. Visiting external links is subject to the destination’s policy.

## Control and deletion

You can disable desktop access, voice, reply speech and integrations in Settings. Remove a saved API key using its Settings control. You can uninstall Karbs and delete its data directory to remove remaining local files; Windows Credential Manager entries and Codex credentials may require separate removal. Provider-side deletion requests must be made to the provider.

## Support and changes

If you email support or post an issue, you choose what information to send. Remove keys, private conversations and identifying desktop content from bug reports. Contact the publisher to request deletion of support correspondence. This policy will be updated when the application’s data flows change.
