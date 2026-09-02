import { BusinessunitsService } from '../../generated/services/BusinessunitsService';
import { Crd04_regionsesService } from '../../generated/services/Crd04_regionsesService';

export interface BusinessUnit {
  id: string;
  name: string;
  region?: string;
  regionId?: string;
}

export class BusinessUnitService {
  public static async getAllBusinessUnits(): Promise<BusinessUnit[]> {
    const result = await BusinessunitsService.getAll({
      filter: 'isdisabled eq false',
      orderBy: ['name asc'],
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to fetch business units');
    }

    // The BU record's own region-name companion field (cr603_regionname) isn't
    // always populated by the SDK (same finding as elsewhere in this codebase),
    // so resolve it from the Regions table as a fallback, keyed off the BU's own region lookup.
    const regionsResult = await Crd04_regionsesService.getAll({});
    const regionNameById = new Map((regionsResult.data ?? []).map((r) => [r.crd04_regionsid, r.crd04_id]));

    return (result.data || []).map(record => {
      const regionId = record._cr603_region_value;
      return {
        id: record.businessunitid,
        name: record.name,
        region: record.cr603_regionname || (regionId ? regionNameById.get(regionId) : undefined) || 'Unknown Region',
        regionId,
      };
    });
  }
}
