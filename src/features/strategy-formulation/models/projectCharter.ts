export const PROJECT_STRATEGIC_TYPE_STRATEGIC = 322020000;
export const PROJECT_STRATEGIC_TYPE_NON_STRATEGIC = 322020001;

export const RELATED_STRATEGY_OPTIONS = [
  { value: 928320000, label: "Related to Market Strategy" },
  { value: 928320001, label: "Related to Departmental Strategy" },
  { value: 928320002, label: "Related to Specialty Strategy" },
  { value: 928320003, label: "Related to Corporate Strategy" },
  { value: 928320004, label: "Non Strategic" },
];

export const PROJECT_ASSUMPTION_OPTIONS = [
  { value: 989230000, label: "Volume" },
  { value: 989230001, label: "CPV" },
];

export interface ProjectCharterDraft {
  name: string;
  objective: string;
  companyId: string;
  departmentId: string;
  regionId: string;
  businessUnitId: string;
  functionId?: string;
  baselineStartDate: string;
  baselineEndDate: string;
  category: number;
  entityId: string;
  priority: number;
  period: number;
  /** Best-effort default: Strategic (322020000) — the live schema requires this field but the legacy source never set it. Editable; confirm the right default with the Projects module owner. */
  strategicType: number;
  assumption?: number;
  /** Only meaningful — and only sent — when strategicType is Strategic; a Non Strategic project has no Related Strategy. */
  relatedStrategy?: number;
  isTechnologyProject: boolean;
  assignedId: string;
  smoPmo1Id: string;
  smoPmo2Id?: string;
  followUpId: string;
  sponsorId?: string;
  /**
   * Best-effort guess: the live schema's `cr18c_relatedmainobjective` is a
   * plain text field, not the lookup the legacy source assumed
   * (`project_mainobjective`). Populated here from the linked objective's
   * title as free text — confirm the intended real mechanism with the
   * Projects module owner before relying on this for reporting/rollups.
   */
  mainObjectiveText?: string;
  strategyId?: string;
  /** No default in the live schema — the user must explicitly pick Yes/No. Picking Yes forces every
   * other Project Classification flag below to No (a Regulatory/Mandatory project is exempted from
   * being scored on the rest). */
  regulatoryMandatoryCandidate: boolean;
  financialReturn: boolean;
  strategicAlignment: boolean;
  capitalEfficiency: boolean;
  riskInverseScored: boolean;
  urgencyCostOfDelay: boolean;
  qualityPatientImpactEnhancement: boolean;
}

export interface ProjectCharterResult {
  id: string;
  name: string;
}
