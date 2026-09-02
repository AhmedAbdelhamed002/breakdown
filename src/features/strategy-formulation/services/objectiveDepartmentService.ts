import { Stf_objectivedepartmentsService } from "@generated/services/Stf_objectivedepartmentsService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { bindRef } from "@infrastructure/dataverse/odataBind";
import type { ObjectiveDepartmentOption } from "../models/reference";

/**
 * Read-only picker over existing Objective x Department coverage rows.
 * Strategy authoring only ever selects an objective-department — creating
 * them belongs to Org Objectives (docs/strategy-formulation-spec.md §2,
 * Objective & Strategy step).
 */
export async function listObjectiveDepartments(): Promise<ObjectiveDepartmentOption[]> {
  const rows = resultOrThrow(
    await Stf_objectivedepartmentsService.getAll({ orderBy: ["stf_name asc"] }),
    "List objective departments"
  );
  return rows.map((r) => ({
    id: r.stf_objectivedepartmentid,
    label: r.stf_name ?? `${r.stf_organizationalobjectivename ?? ""} · ${r.stf_departmentname ?? ""}`,
    departmentId: r._stf_department_value,
    objectiveId: r._stf_organizationalobjective_value,
  }));
}

export interface ObjectiveDepartmentRow {
  id: string;
  objectiveId: string;
  departmentId: string;
  departmentName: string;
}

/** Every coverage row across every objective — feeds the Org Objectives tree's in-memory join. */
export async function listObjectiveDepartmentRows(): Promise<ObjectiveDepartmentRow[]> {
  const rows = resultOrThrow(
    await Stf_objectivedepartmentsService.getAll({ orderBy: ["createdon desc"] }),
    "List objective department rows"
  );
  return rows
    .filter((r) => r._stf_organizationalobjective_value && r._stf_department_value)
    .map((r) => ({
      id: r.stf_objectivedepartmentid,
      objectiveId: r._stf_organizationalobjective_value!,
      departmentId: r._stf_department_value!,
      departmentName: r.stf_departmentname ?? "",
    }));
}

export async function listObjectiveDepartmentsForObjective(objectiveId: string): Promise<ObjectiveDepartmentRow[]> {
  const rows = resultOrThrow(
    await Stf_objectivedepartmentsService.getAll({
      filter: `_stf_organizationalobjective_value eq '${objectiveId}'`,
      orderBy: ["createdon desc"],
    }),
    "List contributing departments"
  );
  return rows.map((r) => ({
    id: r.stf_objectivedepartmentid,
    objectiveId,
    departmentId: r._stf_department_value ?? "",
    departmentName: r.stf_departmentname ?? "",
  }));
}

/** Find-or-create so an objective never gets a duplicate coverage row for the same department. */
export async function addContributingDepartment(objectiveId: string, objectiveTitle: string, departmentId: string, departmentLabel: string): Promise<ObjectiveDepartmentRow> {
  const existing = resultOrThrow(
    await Stf_objectivedepartmentsService.getAll({
      filter: `_stf_organizationalobjective_value eq '${objectiveId}' and _stf_department_value eq '${departmentId}'`,
      top: 1,
    }),
    "Check existing contributing department"
  );
  if (existing.length > 0) {
    const r = existing[0];
    return { id: r.stf_objectivedepartmentid, objectiveId, departmentId, departmentName: r.stf_departmentname ?? departmentLabel };
  }
  const created = resultOrThrow(
    await Stf_objectivedepartmentsService.create({
      statecode: 0,
      stf_name: `${objectiveTitle} · ${departmentLabel}`,
      "stf_OrganizationalObjective@odata.bind": bindRef("organizationalObjective", objectiveId),
      "stf_Department@odata.bind": bindRef("department", departmentId),
    }),
    "Add contributing department"
  );
  return { id: created.stf_objectivedepartmentid, objectiveId, departmentId, departmentName: departmentLabel };
}
