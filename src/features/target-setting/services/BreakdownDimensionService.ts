import { Cr301_accountsService } from '../../../generated/services/Cr301_accountsService';
import { Cr301_newdoctordatasetsService } from '../../../generated/services/Cr301_newdoctordatasetsService';
import { Cr301_specialtyksa_service_hubsService } from '../../../generated/services/Cr301_specialtyksa_service_hubsService';
import { Cr603_chklst_departmentsesService } from '../../../generated/services/Cr603_chklst_departmentsesService';
import { Hr_employeesService } from '../../../generated/services/Hr_employeesService';
import { Stf_platformsService } from '../../../generated/services/Stf_platformsService';
import { Cr301_subaccountsService } from '../../../generated/services/Cr301_subaccountsService';
import { Pm_servicecategoriesService } from '../../../generated/services/Pm_servicecategoriesService';
import { Cr301_accountscr301_accounttype } from '../../../generated/models/Cr301_accountsModel';
import { Cr301_subaccountscr301_accounttype } from '../../../generated/models/Cr301_subaccountsModel';
import {
  Stf_kpiachievmentbreakdownsstf_breakdowntype,
  Stf_kpiachievmentbreakdownsstf_paymenttype
} from '../../../generated/models/Stf_kpiachievmentbreakdownsModel';

/**
 * BreakdownDimensionService — what each breakdown dimension is picked from.
 *
 * stf_breakdowntype says *how* a target is being split; the row then records *which* one it was
 * split into. For most dimensions that's a lookup to the dimension's own table; Payment Type is
 * a choice on the row itself. This registry is the single place that pairs the two, so a row can
 * be written, read back and re-picked without the rest of the breakdown code knowing the tables.
 *
 * | Dimension    | Picked from                        | Written to        |
 * | ------------ | ---------------------------------- | ----------------- |
 * | Account      | cr301_accounts                     | stf_Account       |
 * | Physician    | cr301_newdoctordatasets (doctors)  | stf_Physician     |
 * | Department   | cr603_chklst_departmentses         | stf_Department    |
 * | Platform     | stf_platforms                      | stf_Platform      |
 * | Employee     | hr_employees                       | stf_Employee      |
 * | Specialty    | cr301_specialtyksa_service_hubs    | stf_Specialty     |
 * | Sub Account  | cr301_subaccounts                  | stf_subaccount    |
 * | Service Cat. | pm_servicecategories               | pm_ServiceCategory |
 * | Payment Type | Cash / Credit (choice)             | stf_paymenttype   |
 */

/** One selectable value of a dimension — a record from its table, or a choice option. */
export interface DimensionOption {
  /** The record id, or the choice's option value as a string. */
  id: string;
  label: string;
}

/** One page of a dimension's values. `skipToken` is set while more remain. */
export interface DimensionPage {
  options: DimensionOption[];
  skipToken?: string;
}

/** Where to continue from, and how many to take — used to list a whole dimension in pages. */
export interface PageRequest {
  top?: number;
  skipToken?: string;
}

export interface DimensionSource {
  /** The stf_breakdowntype option label, as shown in the UI. */
  label: string;
  /** Its stf_breakdowntype option value. */
  value: number;
  /** Whether the pick is stored as a lookup to another table, or as a choice on the row. */
  kind: 'lookup' | 'choice';
  /** Lookup only — the navigation property to bind on write, and the entity set to bind into. */
  bindProperty?: string;
  entitySet?: string;
  /** The column a read row carries the pick in: `_stf_x_value` for lookups, the choice column otherwise. */
  valueColumn: string;
  /**
   * Matching values. An empty query lists from the start; `page` walks the whole table when
   * every value is being listed at once for bulk entry.
   */
  search: (query: string, page?: PageRequest, facetClauses?: string[]) => Promise<DimensionPage>;
  /**
   * Optional narrowing filters offered above the search box for bulk entry — Account and Sub
   * Account by account type, Sub Account by parent Account, Physician by specialty, Employee by
   * department/function. A dimension with none leaves this unset, and BulkDimensionPanel's facet
   * UI degrades to "no facets" cleanly rather than needing a special case.
   */
  facets?: DimensionFacet[];
}

/** One narrowing filter a dimension can offer above its search box. */
export interface DimensionFacet {
  /** Stable key, used to track which value is picked. */
  key: string;
  label: string;
  /** The facet's own values, loaded once when the dimension is opened. */
  options: () => Promise<DimensionOption[]>;
  /** The OData clause to add to the dimension's own search filter once a value is picked. */
  clause: (id: string) => string;
}

/** Turn a generated choice into facet options. */
const choiceOptions = (choice: Record<number, string>): DimensionOption[] =>
  Object.entries(choice).map(([value, label]) => ({ id: value, label: label.trim() }));

/**
 * The distinct values a column holds, read from a page of rows. Used where the options aren't a
 * choice — a lookup whose target table isn't a data source, or a read-only text column.
 */
async function distinctFrom<T extends Record<string, any>>(
  read: () => Promise<T[]>,
  column: string,
  isLookup: boolean
): Promise<DimensionOption[]> {
  const rows = await read().catch(() => [] as T[]);
  const byId = new Map<string, string>();
  rows.forEach(row => {
    const raw = row[column];
    if (raw == null || raw === '') return;
    const label = isLookup
      ? (row[`${column}@OData.Community.Display.V1.FormattedValue`] ?? String(raw))
      : String(raw);
    byId.set(String(raw), label);
  });
  return Array.from(byId.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** How many rows to scan when learning a facet's values. */
const FACET_SCAN = 500;

/** How many matches the type-ahead picker shows. Account/physician tables are far larger. */
const PAGE_SIZE = 50;

/** OData string literals escape a quote by doubling it. */
const escapeOData = (value: string) => value.replace(/'/g, "''");

const PAYMENT_TYPES: DimensionOption[] = Object.entries(Stf_kpiachievmentbreakdownsstf_paymenttype)
  .map(([value, label]) => ({ id: value, label }));

/** Every dimension keyed by its stf_breakdowntype label. */
export const DIMENSION_SOURCES: Record<string, DimensionSource> = {
  Account: {
    label: 'Account',
    value: 1,
    kind: 'lookup',
    bindProperty: 'stf_Account',
    entitySet: 'cr301_accounts',
    valueColumn: '_stf_account_value',
    search: async (query, page, facetClauses) => {
      const filters = ['statecode eq 0', ...(facetClauses ?? [])];
      if (query) filters.push(`contains(cr301_acccountname,'${escapeOData(query)}')`);
      const res = await Cr301_accountsService.getAll({
        select: ['cr301_accountid', 'cr301_acccountname'],
        filter: filters.join(' and '),
        orderBy: ['cr301_acccountname asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({
          id: r.cr301_accountid,
          label: r.cr301_acccountname || '(unnamed account)'
        })),
        skipToken: res.skipToken
      };
    },
    facets: [{
      key: 'accountType',
      label: 'Account type',
      options: async () => choiceOptions(Cr301_accountscr301_accounttype),
      clause: id => `cr301_accounttype eq ${id}`
    }]
  },

  Physician: {
    label: 'Physician',
    value: 2,
    kind: 'lookup',
    bindProperty: 'stf_Physician',
    entitySet: 'cr301_newdoctordatasets',
    valueColumn: '_stf_physician_value',
    search: async (query, page, facetClauses) => {
      const filters = ['statecode eq 0', ...(facetClauses ?? [])];
      if (query) filters.push(`contains(cr301_title,'${escapeOData(query)}')`);
      const res = await Cr301_newdoctordatasetsService.getAll({
        select: ['cr301_newdoctordatasetid', 'cr301_title'],
        filter: filters.join(' and '),
        orderBy: ['cr301_title asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({
          id: r.cr301_newdoctordatasetid,
          label: r.cr301_title || '(unnamed doctor)'
        })),
        skipToken: res.skipToken
      };
    },
    facets: [{
      key: 'specialty',
      label: 'Specialty',
      options: () => distinctFrom(
        async () => {
          const res = await Cr301_newdoctordatasetsService.getAll({
            select: ['cr301_newdoctordatasetid', '_cr301_specialty_value'],
            filter: 'statecode eq 0',
            top: FACET_SCAN
          });
          return (res.data || []) as Record<string, any>[];
        },
        '_cr301_specialty_value',
        true
      ),
      clause: id => `_cr301_specialty_value eq ${id}`
    }]
  },

  Department: {
    label: 'Department',
    value: 3,
    kind: 'lookup',
    bindProperty: 'stf_Department',
    entitySet: 'cr603_chklst_departmentses',
    valueColumn: '_stf_department_value',
    search: async (query, page) => {
      const filters = ['statecode eq 0'];
      if (query) filters.push(`contains(cr603_department,'${escapeOData(query)}')`);
      const res = await Cr603_chklst_departmentsesService.getAll({
        select: ['cr603_chklst_departmentsid', 'cr603_department'],
        filter: filters.join(' and '),
        orderBy: ['cr603_department asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({
          id: r.cr603_chklst_departmentsid,
          label: r.cr603_department || '(unnamed department)'
        })),
        skipToken: res.skipToken
      };
    }
  },

  Platform: {
    label: 'Platform',
    value: 4,
    kind: 'lookup',
    bindProperty: 'stf_Platform',
    entitySet: 'stf_platforms',
    valueColumn: '_stf_platform_value',
    search: async (query, page) => {
      const filters = ['statecode eq 0'];
      if (query) filters.push(`contains(stf_name,'${escapeOData(query)}')`);
      const res = await Stf_platformsService.getAll({
        select: ['stf_platformid', 'stf_name'],
        filter: filters.join(' and '),
        orderBy: ['stf_name asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({ id: r.stf_platformid, label: r.stf_name || '(unnamed platform)' })),
        skipToken: res.skipToken
      };
    }
  },

  Employee: {
    label: 'Employee',
    value: 5,
    kind: 'lookup',
    bindProperty: 'stf_Employee',
    entitySet: 'hr_employees',
    valueColumn: '_stf_employee_value',
    search: async (query, page, facetClauses) => {
      // hr_employees' primary name is hr_id (a code), so rows read as "First Last · code" and a
      // search matches any of the three.
      const filters = ['statecode eq 0', ...(facetClauses ?? [])];
      if (query) {
        const q = escapeOData(query);
        filters.push(`(contains(hr_firstname,'${q}') or contains(hr_lastname,'${q}') or contains(hr_id,'${q}'))`);
      }
      const res = await Hr_employeesService.getAll({
        select: ['hr_employeeid', 'hr_firstname', 'hr_lastname', 'hr_id'],
        filter: filters.join(' and '),
        orderBy: ['hr_firstname asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => {
          const name = [r.hr_firstname, r.hr_lastname].filter(Boolean).join(' ').trim();
          return {
            id: r.hr_employeeid,
            label: [name || '(unnamed employee)', r.hr_id].filter(Boolean).join(' · ')
          };
        }),
        skipToken: res.skipToken
      };
    },
    facets: [
      {
        key: 'department',
        label: 'Department',
        options: () => distinctFrom(
          async () => {
            const res = await Hr_employeesService.getAll({
              select: ['hr_employeeid', 'hr_department'],
              filter: 'statecode eq 0',
              top: FACET_SCAN
            });
            return (res.data || []) as Record<string, any>[];
          },
          'hr_department',
          false
        ),
        clause: id => `hr_department eq '${escapeOData(id)}'`
      },
      {
        key: 'function',
        label: 'Function',
        options: () => distinctFrom(
          async () => {
            const res = await Hr_employeesService.getAll({
              select: ['hr_employeeid', 'hr_function'],
              filter: 'statecode eq 0',
              top: FACET_SCAN
            });
            return (res.data || []) as Record<string, any>[];
          },
          'hr_function',
          false
        ),
        clause: id => `hr_function eq '${escapeOData(id)}'`
      }
    ]
  },

  Specialty: {
    label: 'Specialty',
    value: 6,
    kind: 'lookup',
    bindProperty: 'stf_Specialty',
    entitySet: 'cr301_specialtyksa_service_hubs',
    valueColumn: '_stf_specialty_value',
    search: async (query, page) => {
      const filters = ['statecode eq 0'];
      if (query) filters.push(`contains(cr301_title,'${escapeOData(query)}')`);
      const res = await Cr301_specialtyksa_service_hubsService.getAll({
        select: ['cr301_specialtyksa_service_hubid', 'cr301_title'],
        filter: filters.join(' and '),
        orderBy: ['cr301_title asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({
          id: r.cr301_specialtyksa_service_hubid,
          label: r.cr301_title || '(unnamed specialty)'
        })),
        skipToken: res.skipToken
      };
    }
  },

  'Sub Account': {
    label: 'Sub Account',
    value: 8,
    kind: 'lookup',
    bindProperty: 'stf_subaccount',
    entitySet: 'cr301_subaccounts',
    valueColumn: '_stf_subaccount_value',
    search: async (query, page, facetClauses) => {
      const filters = ['statecode eq 0', ...(facetClauses ?? [])];
      if (query) filters.push(`contains(cr301_subaccountname,'${escapeOData(query)}')`);
      const res = await Cr301_subaccountsService.getAll({
        select: ['cr301_subaccountid', 'cr301_subaccountname'],
        filter: filters.join(' and '),
        orderBy: ['cr301_subaccountname asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({
          id: r.cr301_subaccountid,
          label: r.cr301_subaccountname || '(unnamed sub account)'
        })),
        skipToken: res.skipToken
      };
    },
    facets: [
      {
        key: 'parentAccount',
        label: 'Parent account',
        options: async () => {
          const res = await Cr301_accountsService.getAll({
            select: ['cr301_accountid', 'cr301_acccountname'],
            filter: 'statecode eq 0',
            orderBy: ['cr301_acccountname asc'],
            top: FACET_SCAN
          });
          return (res.data || []).map(r => ({
            id: r.cr301_accountid,
            label: r.cr301_acccountname || '(unnamed account)'
          }));
        },
        clause: id => `_cr301_parentaccount_value eq ${id}`
      },
      {
        key: 'accountType',
        label: 'Account type',
        options: async () => choiceOptions(Cr301_subaccountscr301_accounttype),
        clause: id => `cr301_accounttype eq ${id}`
      }
    ]
  },

  'Service Category': {
    label: 'Service Category',
    value: 9,
    kind: 'lookup',
    bindProperty: 'pm_ServiceCategory',
    entitySet: 'pm_servicecategories',
    valueColumn: '_pm_servicecategory_value',
    search: async (query, page) => {
      const filters = ['statecode eq 0'];
      if (query) filters.push(`contains(pm_name,'${escapeOData(query)}')`);
      const res = await Pm_servicecategoriesService.getAll({
        select: ['pm_servicecategoryid', 'pm_name'],
        filter: filters.join(' and '),
        orderBy: ['pm_name asc'],
        top: page?.top ?? PAGE_SIZE,
        skipToken: page?.skipToken
      });
      return {
        options: (res.data || []).map(r => ({
          id: r.pm_servicecategoryid,
          label: r.pm_name || '(unnamed service category)'
        })),
        skipToken: res.skipToken
      };
    }
  },

  'Payment Type': {
    label: 'Payment Type',
    value: 7,
    kind: 'choice',
    valueColumn: 'stf_paymenttype',
    // A choice, not a table: both options are already in hand, so paging never applies.
    search: async query => {
      const q = query.trim().toLowerCase();
      return { options: q ? PAYMENT_TYPES.filter(o => o.label.toLowerCase().includes(q)) : PAYMENT_TYPES };
    }
  }
};

/** The dimensions offered when starting a new breakdown, in stf_breakdowntype's own order. */
export const DIMENSION_LABELS: string[] = Object.entries(Stf_kpiachievmentbreakdownsstf_breakdowntype)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([, label]) => label)
  .filter(label => !!DIMENSION_SOURCES[label]);

export function dimensionSource(label: string): DimensionSource | undefined {
  return DIMENSION_SOURCES[label];
}

/** How many values one "list them all" page pulls. */
export const BULK_PAGE_SIZE = 250;
