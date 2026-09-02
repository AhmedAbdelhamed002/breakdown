import { useState } from "react";
import { ObjectiveDialog } from "@features/strategy-formulation/components/ObjectiveDialog";
import { createObjective } from "@features/strategy-formulation/services/objectiveService";
import { addContributingDepartment } from "@features/strategy-formulation/services/objectiveDepartmentService";
import type { ObjectiveDraft } from "@features/strategy-formulation/models/objective";
import type { PickerOption } from "@features/strategy-formulation/models/reference";
import { SubgridList } from "../components/SubgridList";
import { MandatoryDepartmentsPanel } from "../components/MandatoryDepartmentsPanel";
import { ObjectivesOverviewTable } from "../components/ObjectivesOverviewTable";
import { useOrgOutcomeCascade, type MandatoryDepartmentGroup } from "../hooks/useOrgOutcomeCascade";

/** When there's exactly one mandatory department with exactly one KPI, pre-fill both — otherwise leave the dialog's normal pickers open. */
function solePrefill(groups: MandatoryDepartmentGroup[]): { departmentId?: string; functionId?: string; primaryKpiId?: string } {
  if (groups.length !== 1) return {};
  const [group] = groups;
  return {
    departmentId: group.departmentId,
    functionId: group.kpis.length === 1 ? group.kpis[0].functionId : undefined,
    primaryKpiId: group.kpis.length === 1 ? group.kpis[0].id : undefined,
  };
}

export function OrgObjectivesPage() {
  const cascade = useOrgOutcomeCascade();
  const [creating, setCreating] = useState(false);

  const selectedOutcome = cascade.outcomes.find((o) => o.id === cascade.selectedOutcomeId);
  const selectedOutput = cascade.outputs.find((o) => o.id === cascade.selectedOutputId);

  async function handleSaveObjective(draft: ObjectiveDraft, description: string, contributingDepartments?: PickerOption[]) {
    const { objective, measurableFieldsError } = await createObjective(draft, description);
    if (measurableFieldsError) {
      window.alert(`Objective created, but measurable/time-bound fields failed to save: ${measurableFieldsError}`);
    }
    if (contributingDepartments?.length) {
      await Promise.all(
        contributingDepartments.map((dept) => addContributingDepartment(objective.id, draft.title, dept.id, dept.label))
      );
    }
    cascade.refreshExistingObjective();
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="alert alert-warn">
        Highlevel setup: pick an <b>Org Outcome</b>, then an <b>Org Output</b> under it, then create an <b>Objective</b>. Departments
        owning a Dept-Output KPI linked to that Org Output are auto-attached (mandatory). Objectives are written to the shared store
        and appear in the Strategy tree.
      </div>

      <SubgridList
        title="1 · Choose Org Outcome"
        rows={cascade.outcomes}
        loading={cascade.outcomesLoading}
        selectedId={cascade.selectedOutcomeId}
        onSelect={cascade.selectOutcome}
        emptyTitle="No Org Outcomes found"
        emptyDescription="Create an Org Outcome record in Dataverse to get started."
      />

      {cascade.selectedOutcomeId && (
        <SubgridList
          title={`Org Outputs under ${selectedOutcome?.label ?? ""}`}
          rows={cascade.outputs}
          loading={cascade.outputsLoading}
          selectedId={cascade.selectedOutputId}
          onSelect={cascade.selectOutput}
          emptyTitle="No Org Outputs found"
          emptyDescription="No Org Output is linked to this Org Outcome yet."
        />
      )}

      {cascade.selectedOutputId && (
        <MandatoryDepartmentsPanel
          outputLabel={selectedOutput?.label ?? ""}
          loading={cascade.mandatoryLoading}
          groups={cascade.mandatoryGroups}
          existingObjective={cascade.existingObjectiveForOutput}
          existingObjectiveLoading={cascade.existingObjectiveLoading}
          onCreateObjective={() => setCreating(true)}
        />
      )}

      <ObjectivesOverviewTable />

      {creating && (
        <ObjectiveDialog
          onSave={handleSaveObjective}
          onClose={() => setCreating(false)}
          initialDraft={{
            ...solePrefill(cascade.mandatoryGroups),
            orgOutputId: cascade.selectedOutputId,
          }}
          orgOutputLabel={selectedOutput?.label}
          initialContributingDepartments={cascade.mandatoryGroups.map((g) => ({ id: g.departmentId, label: g.departmentName }))}
          contextNote={`Org Outcome: "${selectedOutcome?.label ?? ""}"`}
        />
      )}
    </div>
  );
}
