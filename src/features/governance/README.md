# governance

**Owner:** Planning & Monitoring

Governance tab group from the Pulse spec: Proposals, Conflicts, Target Compliance,
and Activity Log (placeholder until `pm_activitylog` exists).

Uses Dataverse tables already in the environment: `pm_proposal`, `pm_conflict`,
`pm_kpiachievment` / org achievement ledgers, sealed `pm_model` + terms/factors.

Do not import internal files from other features — only `@features/financial`.
