import type { Stf_alignmentstakeholders } from "@generated/models/Stf_alignmentstakeholdersModel";

export interface AlignmentStakeholder {
  id: string;
  sessionId: string;
  stakeholderId?: string;
  stakeholderName?: string;
  departmentId?: string;
  departmentName?: string;
  notified?: boolean;
  roleNote?: string;
  createdOn?: string;
}

export function toAlignmentStakeholder(row: Stf_alignmentstakeholders): AlignmentStakeholder {
  return {
    id: row.stf_alignmentstakeholderid,
    sessionId: row._stf_alignmentsession_value ?? "",
    stakeholderId: row._stf_stakeholder_value,
    stakeholderName: row.stf_stakeholdername,
    departmentId: row._stf_department_value,
    departmentName: row.stf_departmentname,
    notified: row.stf_notified,
    roleNote: row.stf_rolenote,
    createdOn: row.createdon,
  };
}
