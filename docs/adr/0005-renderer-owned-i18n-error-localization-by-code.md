# 0005: Renderer-owned i18n; errors localized by stable code

The translation catalogue is a **homegrown, typed module owned by the renderer** — no i18n library. A pure `t(locale, key, params)` core is wrapped by a thin `useT()` React hook; logic functions (`stageLabel`, `errorAction`, `accountLabel`, formatting helpers) take `t` as a parameter so they stay pure and unit-testable. Both locales must satisfy `Record<TranslationKey, string>`, giving compile-time key parity plus a runtime parity test.

**Errors are localized at the renderer boundary, by stable code.** `AppError` keeps its English `message` purely as a technical/log fallback; the renderer translates `code` → template and interpolates an optional `params` field for the few errors that carry data (e.g. a file path). To support this, the `main.ts` defensive inline errors gain distinct codes (`NoClip`, `PublishInProgress`, `CoverUnavailable`, …) instead of reusing `EngineError`. The English `error.code` stays visible in the banner as a debugging tag; `details` stays untranslated (technical). Secret redaction is extended to string `params`.

The renderer **pushes the active locale to main over IPC** (`setLocale`) on startup and on every change; main caches it, rebuilds the application menu, and uses it for native dialog titles and filter names.

Chosen because `AppError.message` is an IPC data contract, not a display string: localizing it in main would thread the locale through every `throw` site, whereas a code lookup keeps one source of truth in the renderer. A third-party library (i18next et al.) was rejected — the app has no pluralization/formatting load heavy enough to justify the dependency, and the repo favors small, pure, tested modules.
