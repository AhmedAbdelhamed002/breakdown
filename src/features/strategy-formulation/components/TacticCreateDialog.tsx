import { useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { listCategories } from "../services/categoryService";
import { searchUsers, listMainProcessesByDepartment, listRegions } from "../services/referenceDataService";
import type { StrategyKpi } from "../models/strategyKpi";
import type { Tactic, TacticDraft } from "../models/tactic";

const CATEGORY_SCOPE_TACTIC = 1;

interface Props {
  strategyKpis: StrategyKpi[];
  strategyType: number;
  departmentId?: string;
  isServiceTrack: boolean;
  /** The parent Strategy's own Region — seeds this Tactic's Region so it matches its Strategy by
   * default, without locking the field (a Tactic can still scope to a different Region). */
  strategyRegionId?: string;
  existing?: Tactic;
  onSave: (draft: TacticDraft) => Promise<Tactic>;
  onClose: () => void;
}

/** Step 1 of Create Tactic: identity/category/owner/target fields only. Financial Model / Driver
 * KPI / Impact calculation live in TacticImpactDialog (Step 2), chained right after a successful
 * save here. */
export function TacticCreateDialog({ strategyKpis, strategyType, departmentId, isServiceTrack, strategyRegionId, existing, onSave, onClose }: Props) {
  /** An existing Tactic is only ever opened here to be viewed, not edited — Tactics & POCs no
   * longer supports in-place editing (delete + re-add instead), so `existing` now doubles as the
   * read-only flag rather than needing a separate prop. */
  const readOnly = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [strategyKpiId, setStrategyKpiId] = useState(existing?.strategyKpiId ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [assigneeId, setAssigneeId] = useState(existing?.assigneeId ?? "");
  const [target, setTarget] = useState(existing?.target ?? 0);
  const [currentBaseline, setCurrentBaseline] = useState(existing?.currentBaseline);
  const [deadline, setDeadline] = useState(existing?.deadline ?? "");
  const [neededBudget, setNeededBudget] = useState(existing?.neededBudget);
  const [processId, setProcessId] = useState(existing?.processId ?? "");
  const [regionId, setRegionId] = useState(existing?.regionId ?? strategyRegionId ?? "");
  const [saving, setSaving] = useState(false);

  const categories = useOptions(() => listCategories(CATEGORY_SCOPE_TACTIC, strategyType), [strategyType]);
  const processes = useOptions(() => (isServiceTrack ? Promise.resolve([]) : listMainProcessesByDepartment(departmentId)), [isServiceTrack, departmentId]);
  const regions = useOptions(listRegions, []);

  const kpiOptions = strategyKpis.map((k) => ({ id: k.id, label: k.kpiName }));

  const canSave = name && description && strategyKpiId && categoryId && assigneeId && target && deadline;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        strategyKpiId,
        categoryId,
        assigneeId,
        target: Number(target),
        deadline,
        currentBaseline,
        neededBudget: isServiceTrack ? undefined : neededBudget,
        processId: isServiceTrack ? undefined : processId || undefined,
        serviceExecutionMode: isServiceTrack ? 1 : undefined,
        regionId: regionId || undefined,
      });
      // Not onClose() here — every caller's onSave already moves its own state on to the
      // chained TacticImpactDialog step. Closing here too would tear that transition back down
      // (onClose is the whole flow's close handler in AddPocTacticFlow/AddExecItemDialog, not
      // just this step's), skipping straight past Link Financial Model & Calculate Impact.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={existing ? "View Tactic" : "Add Tactic"}
      onClose={onClose}
      footer={
        readOnly ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSave || saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Create Tactic"}
            </Button>
          </>
        )
      }
    >
      <Field label="Tactic Name" required>
        <input type="text" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description" required>
        <textarea value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Related KPI" required hint="Drawn from this strategy's KPIs.">
        <LookupField
          value={strategyKpiId}
          onChange={setStrategyKpiId}
          options={kpiOptions}
          selectedLabel={existing?.strategyKpiName}
          placeholder="Related KPI…"
          disabled={readOnly}
        />
      </Field>
      <Field label="Region" hint="A Group Region lets this Tactic's Impact be calculated and applied across several Business Units — see Impact.">
        <LookupField value={regionId} onChange={setRegionId} options={regions} selectedLabel={existing?.regionName} placeholder="Choose Region…" disabled={readOnly} />
      </Field>
      <Field label="Category" required hint={!isServiceTrack ? "Operational Tactic set: Manpower / Throughput / Conversion / SLA." : undefined}>
        <LookupField value={categoryId} onChange={setCategoryId} options={categories} selectedLabel={existing?.categoryName} placeholder="Category…" disabled={readOnly} />
      </Field>
      <Field label="Named Owner" required>
        <LookupField value={assigneeId} onChange={setAssigneeId} onSearch={searchUsers} selectedLabel={existing?.assigneeName} placeholder="Search any user…" disabled={readOnly} />
      </Field>
      <div className="grid-3">
        <Field label="Current" required>
          <input type="number" step="any" value={currentBaseline ?? ""} disabled={readOnly} onChange={(e) => setCurrentBaseline(Number(e.target.value))} />
        </Field>
        <Field label="Measurable Target" required>
          <input type="number" step="any" value={target} disabled={readOnly} onChange={(e) => setTarget(Number(e.target.value))} />
        </Field>
        <Field label="Deadline" required>
          <input type="date" value={deadline} disabled={readOnly} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      {!isServiceTrack && (
        <Field label="Budget Needed">
          <input type="number" step="any" value={neededBudget ?? ""} disabled={readOnly} onChange={(e) => setNeededBudget(Number(e.target.value))} />
        </Field>
      )}
      {!isServiceTrack && (
        <Field label="Related Process">
          <LookupField value={processId} onChange={setProcessId} options={processes} selectedLabel={existing?.processName} placeholder="Related process (optional)…" disabled={readOnly} />
        </Field>
      )}
      {isServiceTrack && <div className="hint">Service tactics always execute as a TMS Task.</div>}
    </Modal>
  );
}
