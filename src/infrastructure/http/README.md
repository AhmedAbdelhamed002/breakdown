# infrastructure/http

Reserved. This app currently talks to Dataverse exclusively through the
generated services (`src/generated/`) via the Power Apps Code Apps SDK client
in `infrastructure/dataverse/client/powerAppsClient.ts` — there is no custom
HTTP/REST client.

Add a client here only if a real non-Dataverse HTTP integration (a custom
connector, an external API) is introduced.
