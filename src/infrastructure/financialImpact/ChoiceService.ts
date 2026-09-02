import { Pm_proposalsService } from '@generated/services/Pm_proposalsService';
import { Pm_conflictsService } from '@generated/services/Pm_conflictsService';
import {
  Pm_proposalspm_entitykind, Pm_proposalspm_hasconflict, Pm_proposalspm_source, Pm_proposalspm_proposalstatus
} from '@generated/models/Pm_proposalsModel';
import {
  Pm_conflictspm_conflicttype, Pm_conflictspm_entitykind, Pm_conflictspm_proposedsource
} from '@generated/models/Pm_conflictsModel';
import { EntityRef } from './types';

/**
 * ChoiceService — resolves the numeric value of a Dataverse choice (option set) option from its
 * label, so a write can stamp a choice column without hard-coding an option number.
 *
 * The generated choice enums are the starting point, but they're only as current as the last
 * `npx power-apps refresh-data-source`: before one, a column's options read as 'Option 1' /
 * 'Option 2' placeholders that say nothing about which value means what.
 *
 * So the map is also learned from the data. Reads go out with `odata.include-annotations=*`, so
 * every row carries each choice column's label in `<column>@OData...FormattedValue` alongside its
 * raw numeric value — one page of existing rows pairs them up, and that always wins over the
 * generated seed. A label that can't be resolved either way yields undefined, so the caller can
 * leave the column empty rather than write a wrong option.
 */

const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue';

/** How many rows to scan for value↔label pairs. Enough to cover every option in practice. */
const LEARN_PAGE_SIZE = 200;

/** Compare labels ignoring case, spacing and punctuation — 'Org Output' matches 'org_output'. */
const normalize = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Turn a generated choice (value → label) into a normalized label → value seed. */
const seedFrom = (choice: Record<number, string>): Record<string, number> =>
  Object.fromEntries(Object.entries(choice).map(([value, label]) => [normalize(label), Number(value)]));

export interface ChoiceTable {
  /** Cache key — the table's logical name. */
  name: string;
  /** Choice columns harvested together on the one read. */
  columns: string[];
  fetch: (columns: string[]) => Promise<Record<string, any>[]>;
  /** Fallback label→value per column, used only when no row carries that label. */
  seed: Record<string, Record<string, number>>;
}

export const PROPOSAL_CHOICES: ChoiceTable = {
  name: 'pm_proposals',
  columns: ['pm_entitykind', 'pm_hasconflict', 'pm_source', 'pm_proposalstatus'],
  fetch: async columns => {
    const res = await Pm_proposalsService.getAll({ select: ['pm_proposalid', ...columns], top: LEARN_PAGE_SIZE });
    return (res.data || []) as Record<string, any>[];
  },
  seed: {
    pm_entitykind: seedFrom(Pm_proposalspm_entitykind),
    pm_hasconflict: seedFrom(Pm_proposalspm_hasconflict),
    pm_source: seedFrom(Pm_proposalspm_source),
    pm_proposalstatus: seedFrom(Pm_proposalspm_proposalstatus)
  }
};

export const CONFLICT_CHOICES: ChoiceTable = {
  name: 'pm_conflicts',
  columns: ['pm_entitykind', 'pm_conflicttype', 'pm_proposedsource'],
  fetch: async columns => {
    const res = await Pm_conflictsService.getAll({ select: ['pm_conflictid', ...columns], top: LEARN_PAGE_SIZE });
    return (res.data || []) as Record<string, any>[];
  },
  seed: {
    pm_entitykind: seedFrom(Pm_conflictspm_entitykind),
    pm_conflicttype: seedFrom(Pm_conflictspm_conflicttype),
    pm_proposedsource: seedFrom(Pm_conflictspm_proposedsource)
  }
};

/** Labels to try for an entity kind, most specific first. */
const ENTITY_KIND_LABELS: Record<EntityRef['kind'], string[]> = {
  outcome: ['Org Outcome', 'Outcome'],
  output: ['Org Output', 'Output'],
  kpi: ['KPI']
};

export class ChoiceService {
  /** `${table}:${column}` → normalized label → option value, learned from existing rows. */
  private static learned = new Map<string, Map<string, number>>();

  /** One learning read per table per session, shared by concurrent callers. */
  private static learning = new Map<string, Promise<void>>();

  /**
   * The option value for the first of `labels` that this column actually offers, or undefined
   * when none of them can be resolved.
   */
  public static async resolve(table: ChoiceTable, column: string, ...labels: string[]): Promise<number | undefined> {
    await this.learn(table);
    const fromData = this.learned.get(`${table.name}:${column}`);
    const seed = table.seed[column] ?? {};

    for (const label of labels) {
      const key = normalize(label);
      const known = fromData?.get(key);
      if (known != null) return known;

      // A seed is only usable while the data doesn't contradict it: if some row already shows
      // this option value carrying a different label, the seed's ordering is wrong for this
      // environment and using it would stamp the opposite meaning.
      const guess = seed[key];
      if (guess != null && !this.valueTaken(fromData, guess, key)) return guess;
    }
    return undefined;
  }

  /** Whether the data maps this option value to some label other than `except`. */
  private static valueTaken(fromData: Map<string, number> | undefined, value: number, except: string): boolean {
    if (!fromData) return false;
    for (const [label, known] of fromData) {
      if (known === value && label !== except) return true;
    }
    return false;
  }

  /** The option value for an entity kind on a `pm_entitykind` column. */
  public static entityKind(table: ChoiceTable, entityRef: EntityRef): Promise<number | undefined> {
    return this.resolve(table, 'pm_entitykind', ...ENTITY_KIND_LABELS[entityRef.kind]);
  }

  /** The Yes/No option value for a two-option flag column. */
  public static yesNo(table: ChoiceTable, column: string, value: boolean): Promise<number | undefined> {
    return value
      ? this.resolve(table, column, 'Yes', 'True')
      : this.resolve(table, column, 'No', 'False');
  }

  /**
   * Record the value↔label pairs carried by a row that was just created or read, so a seed that
   * turned out to be wrong is corrected for the rest of the session. Worth calling on a create
   * response: it's the only feedback available when the table had no rows to learn from.
   */
  public static observe(table: ChoiceTable, row: Record<string, any> | null | undefined): void {
    if (!row) return;
    for (const column of table.columns) {
      const value = row[column];
      const label = row[`${column}${FORMATTED_VALUE}`];
      if (typeof value !== 'number' || typeof label !== 'string' || !label.trim()) continue;
      const map = this.learned.get(`${table.name}:${column}`) ?? new Map<string, number>();
      map.set(normalize(label), value);
      this.learned.set(`${table.name}:${column}`, map);
    }
  }

  /**
   * Harvest value↔label pairs from a page of existing rows. A failed read is not retried and
   * leaves the seeds in charge — resolving an option must never block a save.
   */
  private static async learn(table: ChoiceTable): Promise<void> {
    const pending = this.learning.get(table.name);
    if (pending) return pending;

    const run = (async () => {
      let rows: Record<string, any>[] = [];
      try {
        rows = await table.fetch(table.columns);
      } catch {
        return;
      }
      for (const column of table.columns) {
        const map = this.learned.get(`${table.name}:${column}`) ?? new Map<string, number>();
        for (const row of rows) {
          const value = row[column];
          const label = row[`${column}${FORMATTED_VALUE}`];
          if (typeof value === 'number' && typeof label === 'string' && label.trim()) {
            map.set(normalize(label), value);
          }
        }
        this.learned.set(`${table.name}:${column}`, map);
      }
    })();

    this.learning.set(table.name, run);
    return run;
  }
}
