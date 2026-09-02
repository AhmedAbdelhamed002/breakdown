import { Cr603_chklst_departmentsesService } from '../../../generated/services/Cr603_chklst_departmentsesService';
import { Hr_functionsService } from '../../../generated/services/Hr_functionsService';

export interface DepartmentRef {
  id: string;
  name: string;
}

export interface FunctionRef {
  id: string;
  name: string;
  departmentId?: string;
}

/**
 * OrgMetadataService — Department / Function catalogue for the context bar.
 * Department (cr603_chklst_departments) and Function (hr_functions, hr_Department lookup)
 * are an org hierarchy independent of Region/BU.
 */
export class OrgMetadataService {
  public static async getDepartments(): Promise<DepartmentRef[]> {
    const res = await Cr603_chklst_departmentsesService.getAll({
      select: ['cr603_chklst_departmentsid', 'cr603_department'],
      filter: 'statecode eq 0'
    });
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to fetch departments');
    return res.data.map(r => ({
      id: r.cr603_chklst_departmentsid,
      name: r.cr603_department || 'Unnamed Department'
    }));
  }

  public static async getFunctions(departmentId?: string): Promise<FunctionRef[]> {
    const filter = departmentId
      ? `statecode eq 0 and _hr_department_value eq ${departmentId}`
      : 'statecode eq 0';
    const res = await Hr_functionsService.getAll({
      select: ['hr_functionid', 'hr_functionname'],
      filter
    });
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to fetch functions');
    return res.data.map(r => ({
      id: r.hr_functionid,
      name: r.hr_functionname || 'Unnamed Function',
      departmentId: r._hr_department_value
    }));
  }
}
