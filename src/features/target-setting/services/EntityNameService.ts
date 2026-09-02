import { EntityService } from './EntityService';
import { EntityRef } from '../models/types';

/**
 * EntityNameService — resolves the display name behind a lookup column.
 *
 * The generated models declare a `<lookup>name` property (pm_targetoutcomename,
 * pm_orgoutcomename, pm_sourcekpiname …), but the platform doesn't populate it — reading those is
 * what left rows showing "Unknown Outcome". What does come back, because reads go out with
 * `odata.include-annotations=*`, is the lookup's formatted value:
 * `_pm_targetoutcome_value@OData.Community.Display.V1.FormattedValue`.
 *
 * The entity's own table is read first so every screen shows the same name for a record (KPIs
 * display strategy_newcolumn, which isn't the table's primary name column), with the annotation
 * as the fallback — it still covers a record that the entity read filtered out.
 */

const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue';

/** The related record's name as returned alongside a lookup column, if the annotation came through. */
export function lookupName(row: Record<string, any>, valueColumn: string): string | undefined {
  const name = row[`${valueColumn}${FORMATTED_VALUE}`];
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

export type EntityNameMaps = Record<EntityRef['kind'], Map<string, string>>;

export class EntityNameService {
  /** Names change rarely, so the read is shared for the life of the session. */
  private static cache?: Promise<EntityNameMaps>;

  /** Org Outcome, Org Output and KPI names by record id. */
  public static maps(): Promise<EntityNameMaps> {
    if (!this.cache) {
      this.cache = (async () => {
        const [outcomes, outputs, kpis] = await Promise.all([
          EntityService.getOrgOutcomes().catch(() => []),
          EntityService.getOrgOutputs().catch(() => []),
          EntityService.getKpis().catch(() => [])
        ]);
        return {
          outcome: new Map(outcomes.map(e => [e.id, e.name])),
          output: new Map(outputs.map(e => [e.id, e.name])),
          kpi: new Map(kpis.map(e => [e.id, e.name]))
        };
      })();
      // A failed read shouldn't be cached as the answer forever.
      this.cache.catch(() => { this.cache = undefined; });
    }
    return this.cache;
  }

  /**
   * The name for a lookup on a row: from the entity table, else the row's formatted-value
   * annotation, else the given fallback.
   */
  public static resolve(
    maps: EntityNameMaps,
    kind: EntityRef['kind'],
    id: string | undefined,
    row: Record<string, any>,
    valueColumn: string,
    fallback: string
  ): string {
    return (id ? maps[kind].get(id) : undefined) || lookupName(row, valueColumn) || fallback;
  }
}
