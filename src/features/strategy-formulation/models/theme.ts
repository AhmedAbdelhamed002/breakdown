import type { Stf_themes } from "@generated/models/Stf_themesModel";

export interface Theme {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  ownerName?: string;
  regionId?: string;
  regionName?: string;
  year?: number;
}

export interface ThemeDraft {
  name: string;
  description?: string;
  ownerId?: string;
  regionId?: string;
  year?: number;
}

export function toTheme(row: Stf_themes): Theme {
  return {
    id: row.stf_themeid,
    name: row.stf_name,
    description: row.stf_description,
    ownerId: row._stf_owner_value,
    ownerName: row.stf_ownername,
    regionId: row._stf_region_value,
    regionName: row.stf_regionname,
    year: row.stf_year,
  };
}
