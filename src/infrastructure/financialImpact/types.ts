/** Reference to any entity a target/ledger/conflict can be recorded against (KPI, Org Outcome, Org Output). */
export interface EntityRef {
  kind: 'outcome' | 'output' | 'kpi';
  id: string;
}

/** Single month entry in a 12-month ledger. */
export interface MonthlyLedgerEntry {
  month: number;
  actual: number | null;
  baseline: number | null;
  target: number | null;
  historical: number | null;
  /** The underlying achievement record's own id (pm_kpiachievmentid / pm_orgoutputachievmentid /
   * pm_orgoutcomeachievmentid) — set whenever hasRecord is true. Lets a caller that resolved a
   * month's figures also persist exactly which record it read them from. */
  id?: string;
  /**
   * Whether an achievement record exists for this entity/BU/month at all. Separates "nothing is
   * recorded here" from "recorded, but the target column is empty" — the two read the same in the
   * values above but mean different things when a number is missing on screen.
   */
  hasRecord: boolean;
  /** Whether that record is the month's total rather than a row recorded under another. */
  isTotal?: boolean;
}

/** Full 12-month ledger for an entity+BU+year. */
export interface MonthlyLedger {
  entityRef: EntityRef;
  buId: string;
  year: number;
  months: MonthlyLedgerEntry[];
}
