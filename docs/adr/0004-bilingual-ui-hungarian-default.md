# 0004: Bilingual UI with Hungarian as the default

ServiceShare ships a bilingual UI: **Hungarian and English**, with **Hungarian as the default on first run**. The choice is per-user and persisted in `localStorage`; switching applies live, without restart.

"Localized" covers the whole renderer interface (buttons, labels, dialogs, placeholders, accessibility text, confirm prompts), the user-facing error messages, the Electron application menu, and the native file dialogs. The **brand name "ServiceShare"** (window title, `productName`, the app-menu's first entry), the **dev-only `ErrorPreview`**, and **internal logs** stay English.

Chosen over English-only (reaches the primary Hungarian audience by default) and over OS-locale detection (predictable: everyone gets Hungarian first, and can switch). Hungarian-only was rejected to keep the app shareable with non-Hungarian users. Adding a third locale later is just another dictionary, not a re-architecture.
