import type { FilterContext, Region, BusinessUnit, Department, HrFunction } from '../models/types';

interface ContextBarProps {
  context: FilterContext;
  onContextChange: (ctx: FilterContext) => void;
  regions: Region[];
  businessUnits: BusinessUnit[];
  departments: Department[];
  functions: HrFunction[];
  showFilters?: boolean;
  showDepartmentFunction?: boolean;
}

export function ContextBar({
  context,
  onContextChange,
  regions,
  businessUnits,
  departments,
  functions,
  showFilters = true,
  showDepartmentFunction = true,
}: ContextBarProps) {
  if (!showFilters) return null;

  // Always require a Region before the BU select is enabled — the Business Units list is empty
  // until one is chosen (see useFinancialModeler.ts), so gating only on showDepartmentFunction
  // left the Ceilings tab's BU dropdown looking enabled but silently empty (ported fix).
  const buRequiresRegion = true;
  const buDisabled = buRequiresRegion && !context.region;
  const buPlaceholder = buDisabled
    ? 'Select region first'
    : showDepartmentFunction
      ? 'Select BU'
      : 'All BUs';

  return (
    <div className="ctx">
      <div className="ctx-f">
        <label>Region</label>
        <select
          value={context.region}
          onChange={(e) =>
            onContextChange({
              region: e.target.value,
              businessUnit: '',
              department: '',
              functionId: '',
            })
          }
        >
          <option value="">Select Region</option>
          {regions.map((r) => (
            <option key={r.regionid} value={r.regionid}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="ctx-f">
        <label>Business Unit</label>
        <select
          value={context.businessUnit}
          disabled={buDisabled}
          onChange={(e) =>
            onContextChange({
              ...context,
              businessUnit: e.target.value,
              department: '',
              functionId: '',
            })
          }
        >
          <option value="">{buPlaceholder}</option>
          {businessUnits.map((bu) => (
            <option key={bu.businessunitid} value={bu.businessunitid}>{bu.name}</option>
          ))}
        </select>
      </div>

      {showDepartmentFunction && (
        <>
          <div className="ctx-f">
            <label>Department</label>
            <select
              value={context.department}
              disabled={!context.businessUnit}
              onChange={(e) =>
                onContextChange({
                  ...context,
                  department: e.target.value,
                  functionId: '',
                })
              }
            >
              <option value="">{context.businessUnit ? 'Select Department' : 'Select BU first'}</option>
              {departments.map((d) => (
                <option key={d.departmentid} value={d.departmentid}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="ctx-f">
            <label>Function</label>
            <select
              value={context.functionId}
              disabled={!context.department}
              onChange={(e) => onContextChange({ ...context, functionId: e.target.value })}
            >
              <option value="">{context.department ? 'Select Function' : 'Select department first'}</option>
              {functions.map((f) => (
                <option key={f.functionid} value={f.functionid}>
                  {f.name.includes('/') ? f.name.split('/')[0].trim() : f.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
