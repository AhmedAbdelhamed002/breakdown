# infrastructure/authentication

Reserved. The Power Apps Code Apps SDK / host handles sign-in and token
acquisition for Dataverse calls — there is no custom login flow.

`currentUser.ts` identifies the signed-in person with `getContext()`
(`@microsoft/power-apps/app`), then loads their `systemuser` row
(name, job title, email) for display in the app chrome.
