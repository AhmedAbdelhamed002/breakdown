# app/configuration

Reserved for application-level configuration (e.g. reading `power.config.json`
values, environment/build-mode flags, feature toggles) once the app needs it.

Nothing lives here yet — don't add a config loader until a real, concrete need
exists. See `AGENTS.md` golden rule #12 (no premature abstraction).
