import { Cr603_projectsesService } from "@generated/services/Cr603_projectsesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import { resolveCurrentUserId } from "@infrastructure/authentication/currentUser";
import { PROJECT_STRATEGIC_TYPE_STRATEGIC } from "../models/projectCharter";
import type { ProjectCharterDraft, ProjectCharterResult } from "../models/projectCharter";

const PROJECT_STATUS_PENDING = 322020005;
const PROJECT_TYPE_TECHNOLOGY = 819930000;
const PROJECT_TYPE_OTHER = 819930001;

/**
 * Live search for "Link existing project…" on the POC dialog. Shown/matched by
 * projm_subsubprojectname (the always-set project name column), and — when the strategy's own
 * Department is known — scoped to projects under that same Department, so a POC can only link a
 * project its own strategy's Department actually owns.
 */
export async function searchProjects(term: string, departmentId?: string): Promise<{ id: string; label: string }[]> {
  const filters: string[] = [];
  if (term) filters.push(`contains(projm_subsubprojectname,'${term.replace(/'/g, "''")}')`);
  if (departmentId) filters.push(`_cr603_department_value eq '${departmentId}'`);
  const rows = resultOrThrow(
    await Cr603_projectsesService.getAll({
      filter: filters.length ? filters.join(" and ") : undefined,
      top: 25,
      orderBy: ["projm_subsubprojectname asc"],
    }),
    "Search projects"
  );
  return rows.map((r) => ({ id: r.cr603_projectsid, label: r.projm_subsubprojectname || r.cr603_projectname || r.cr603_projectsid }));
}

/**
 * Two-phase create, mirroring the legacy source's intent — but adapted to
 * what the live, typed schema actually requires: Assigned/SMO-PMO-1/
 * Follow-up/Project-Creator are schema-required, so (unlike the legacy's
 * dynamically-typed create-then-patch dance) they must be supplied on the
 * single create call. Only the two genuinely optional person-lookups
 * (SMO/PMO 2, Sponsor) get the legacy's resilient "created either way, warn
 * on failure" follow-up treatment.
 */
export async function submitProjectCharter(draft: ProjectCharterDraft): Promise<ProjectCharterResult> {
  const creatorId = await resolveCurrentUserId();
  if (!creatorId) throw new Error("Cannot determine the signed-in user. This action requires the Power Platform host context.");

  const created = resultOrThrow(
    await Cr603_projectsesService.create({
      statecode: 0,
      projm_subsubprojectname: draft.name,
      projm_projectobjective: draft.objective,
      cr603_projectstatus: PROJECT_STATUS_PENDING as Parameters<typeof Cr603_projectsesService.create>[0]["cr603_projectstatus"],
      cr603_projectcategory: draft.category as Parameters<typeof Cr603_projectsesService.create>[0]["cr603_projectcategory"],
      cr603_prioritylevel: draft.priority as Parameters<typeof Cr603_projectsesService.create>[0]["cr603_prioritylevel"],
      cr603_projectperiod: draft.period as Parameters<typeof Cr603_projectsesService.create>[0]["cr603_projectperiod"],
      cr603_projectstrategictype: draft.strategicType as Parameters<typeof Cr603_projectsesService.create>[0]["cr603_projectstrategictype"],
      cr18c_projectassumption: draft.assumption as Parameters<typeof Cr603_projectsesService.create>[0]["cr18c_projectassumption"],
      ...(draft.strategicType === PROJECT_STRATEGIC_TYPE_STRATEGIC && draft.relatedStrategy !== undefined
        ? { projm_relatedstrategy: draft.relatedStrategy as Parameters<typeof Cr603_projectsesService.create>[0]["projm_relatedstrategy"] }
        : {}),
      project_istechnologyproject: draft.isTechnologyProject,
      project_projecttype: (draft.isTechnologyProject ? PROJECT_TYPE_TECHNOLOGY : PROJECT_TYPE_OTHER) as Parameters<
        typeof Cr603_projectsesService.create
      >[0]["project_projecttype"],
      cr603_progress: 0,
      project_baselinestartdate: draft.baselineStartDate,
      project_baselineenddate: draft.baselineEndDate,
      cr18c_relatedmainobjective: draft.mainObjectiveText,
      project_regulatorymandatorycandidate: draft.regulatoryMandatoryCandidate,
      project_financialreturn: draft.financialReturn,
      project_strategicalignment: draft.strategicAlignment,
      project_capitalefficiency: draft.capitalEfficiency,
      project_riskinversescored: draft.riskInverseScored,
      project_urgencycostofdelay: draft.urgencyCostOfDelay,
      project_qualitypatientimpactenhancement: draft.qualityPatientImpactEnhancement,
      "cr603_Company@odata.bind": bindRef("company", draft.companyId),
      "cr603_Entity@odata.bind": bindRef("projectEntity", draft.entityId),
      "cr603_Region@odata.bind": bindRef("region", draft.regionId),
      "cr603_Department@odata.bind": bindRef("department", draft.departmentId),
      "cr603_BU@odata.bind": bindRef("businessUnit", draft.businessUnitId),
      "cr603_Assigned@odata.bind": bindRef("user", draft.assignedId),
      "cr603_SMOPMO1@odata.bind": bindRef("user", draft.smoPmo1Id),
      "cr603_FollowUp@odata.bind": bindRef("user", draft.followUpId),
      "cr603_ProjectCreator@odata.bind": bindRef("user", creatorId),
      ...(draft.functionId ? { "project_Function@odata.bind": bindRef("hrFunction", draft.functionId) } : {}),
      ...(draft.strategyId ? { "project_StrategyName@odata.bind": bindRef("strategy", draft.strategyId) } : {}),
    }),
    "Create project charter"
  );

  const warnings: string[] = [];
  if (draft.smoPmo2Id) {
    try {
      await Cr603_projectsesService.update(created.cr603_projectsid, { "cr603_SMOPMO2@odata.bind": bindRef("user", draft.smoPmo2Id) });
    } catch (e) {
      warnings.push(`SMO/PMO 2: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (draft.sponsorId) {
    try {
      await Cr603_projectsesService.update(created.cr603_projectsid, { "cr603_ProjectSponsor@odata.bind": bindRef("user", draft.sponsorId) });
    } catch (e) {
      warnings.push(`Sponsor: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Project created, but some role assignment lookups could not be saved: ${warnings.join("; ")}`);
  }

  return { id: created.cr603_projectsid, name: draft.name };
}
