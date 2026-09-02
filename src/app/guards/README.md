# app/guards

Reserved for route-level guards (e.g. role/permission-based access to a
feature's routes) once such a requirement exists.

Today, access control is not implemented client-side — Dataverse/server-side
security is authoritative (see `AGENTS.md` § Security). Add a guard here only
when a concrete routing rule is needed, and keep it a thin wrapper around a
feature's own permission check — don't invent generic "auth" logic speculatively.
