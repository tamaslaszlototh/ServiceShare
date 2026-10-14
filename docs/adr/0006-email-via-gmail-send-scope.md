# 0006: Send Email through the Gmail API on the existing Google sign-in

**Send Email** goes out through the Gmail API (`users/me/messages/send`) using the access token from the Google OAuth sign-in the app already has for publishing. The OAuth scope set gains `https://www.googleapis.com/auth/gmail.send`; no new credentials, secrets or settings are introduced. The message is a plain-text `text/plain; charset=utf-8` RFC 822 message built by a pure, dependency-free MIME builder in main, sent from the signed-in account's primary address. Failures are classified into stable error codes (`EmailSendError`, plus the reused `AuthRevoked`, `NetworkError`, `QuotaExceeded`) and localized in the renderer per ADR 0005.

Chosen because the user is already signed in to Google to publish, so sending from that account is one click with no password, no extra configuration, and a From address recipients recognize. The send module reuses the injected-HTTP shape of the upload/thumbnail modules, so it is unit-tested without a network.

Rejected alternatives:

- **`mailto:` handoff** to the system mail client: no setup, but it depends on a configured default client (often absent, or a webmail the OS cannot open), cannot report whether the mail was actually sent, and long bodies or many recipients are truncated or mangled by URL length limits. The user would still leave the app to finish the send.
- **SMTP** (e.g. Gmail with an app password, or any provider): requires the user to enter and the app to store a mail password or app password, adds a mail library and TLS/port configuration, and Google discourages app passwords. It buys provider independence the app does not need.

Consequences:

- **Re-consent.** Tokens obtained before this change do not carry `gmail.send`. Main inspects the stored token's granted scopes and exposes `canSendEmail` on the account state; when it is false, the email panel asks for a one-click re-sign-in through the existing sign-in flow (now requesting the added scope) and keeps the draft across it. Every already-signed-in user goes through the Google consent screen once.
- **Sensitive scope.** `gmail.send` is classified by Google as sensitive. Distributing the app publicly (ADR 0003) may require OAuth app verification and its ongoing upkeep on the Google Cloud side; until then, the consent screen shows the unverified-app warning and the user cap of an unverified project applies. That operational work is tracked separately.
- **Gmail only.** Sending as a non-primary alias or from a non-Google provider is out of scope; doing so later would mean adding a second transport rather than changing this one.
