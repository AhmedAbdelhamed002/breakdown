import { useMemo, useState } from "react";
import { Modal } from "@shared/components/Modal/Modal";
import { Button } from "@shared/components/Button/Button";
import { Field } from "@shared/components/Field/Field";
import { LookupField } from "@shared/components/LookupField/LookupField";
import { useOptions } from "../hooks/useOptions";
import { listStrategies } from "../services/strategyService";
import { searchUsers, listDepartments } from "../services/referenceDataService";
import { requestAlignmentSession } from "../services/alignmentSessionService";
import { addAlignmentStakeholder } from "../services/alignmentStakeholderService";
import { ALIGNMENT_REASON_OPTIONS, ALIGNMENT_CYCLE_OPTIONS, type AlignmentSession } from "../models/alignmentSession";

interface StagedStakeholder {
  userId: string;
  userName: string;
  departmentId?: string;
  departmentName?: string;
}

interface Props {
  /** Pre-picks the strategy (e.g. launched from the wizard's Review step) — hides the strategy picker. */
  strategyId?: string;
  strategyName?: string;
  onCreated: (session: AlignmentSession) => void;
  onClose: () => void;
}

export function RequestAlignmentDialog({ strategyId: fixedStrategyId, strategyName: fixedStrategyName, onCreated, onClose }: Props) {
  const [strategyId, setStrategyId] = useState(fixedStrategyId ?? "");
  const [reason, setReason] = useState(ALIGNMENT_REASON_OPTIONS[0].value);
  const [cycle, setCycle] = useState(ALIGNMENT_CYCLE_OPTIONS[0].value);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [stakeholders, setStakeholders] = useState<StagedStakeholder[]>([]);
  const [pickUserId, setPickUserId] = useState("");
  const [pickUserLabel, setPickUserLabel] = useState<string | undefined>(undefined);
  const [pickDeptId, setPickDeptId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allStrategies = useOptions(listStrategies, []);
  const departments = useOptions(listDepartments, []);

  const strategyOptions = useMemo(
    () => allStrategies.map((s) => ({ id: s.id, label: `${s.name} (${s.revisionStatus})` })),
    [allStrategies],
  );

  function handlePickUserChange(id: string, label?: string) {
    setPickUserId(id);
    setPickUserLabel(label);
  }

  function addStakeholder() {
    if (!pickUserId || !pickUserLabel) {
      setError("Pick a person first.");
      return;
    }
    if (stakeholders.some((s) => s.userId === pickUserId)) {
      setError("That person is already staged.");
      return;
    }
    const dept = departments.find((d) => d.id === pickDeptId);
    setStakeholders((prev) => [...prev, { userId: pickUserId, userName: pickUserLabel, departmentId: dept?.id, departmentName: dept?.label }]);
    setPickUserId("");
    setPickUserLabel(undefined);
    setPickDeptId("");
    setError(null);
  }

  function removeStakeholder(userId: string) {
    setStakeholders((prev) => prev.filter((s) => s.userId !== userId));
  }

  async function handleCreate() {
    if (!strategyId) {
      setError("Pick a strategy.");
      return;
    }
    if (stakeholders.length === 0 && !window.confirm("No stakeholders staged yet — create the request anyway?")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const session = await requestAlignmentSession({ strategyId, reason, cycle, fiscalYear });
      for (const s of stakeholders) {
        await addAlignmentStakeholder(session.id, s.userId, s.userName, s.departmentId);
      }
      onCreated(session);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request alignment session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Request Alignment Session"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!strategyId || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create request"}
          </Button>
        </>
      }
    >
      {fixedStrategyId ? (
        <Field label="Strategy">
          <input type="text" value={fixedStrategyName ?? fixedStrategyId} disabled readOnly />
        </Field>
      ) : (
        <Field label="Strategy" required>
          <LookupField value={strategyId} onChange={setStrategyId} options={strategyOptions} placeholder="Search a strategy…" />
        </Field>
      )}

      <Field label="Reason for Alignment" required>
        <select value={reason} onChange={(e) => setReason(Number(e.target.value))}>
          {ALIGNMENT_REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Cycle" required>
          <select value={cycle} onChange={(e) => setCycle(Number(e.target.value))}>
            {ALIGNMENT_CYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fiscal Year" required>
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} />
        </Field>
      </div>

      <div className="section-label">Needed stakeholders</div>
      {stakeholders.length === 0 ? (
        <div className="hint">None staged yet.</div>
      ) : (
        <ul>
          {stakeholders.map((s) => (
            <li key={s.userId}>
              {s.userName} {s.departmentName && `(${s.departmentName})`}{" "}
              <Button size="xs" variant="danger" onClick={() => removeStakeholder(s.userId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid-2">
        <LookupField value={pickUserId} onChange={handlePickUserChange} onSearch={searchUsers} selectedLabel={pickUserLabel} placeholder="Select a person…" />
        <LookupField value={pickDeptId} onChange={setPickDeptId} options={departments} placeholder="Department (optional)" />
      </div>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <Button size="sm" onClick={addStakeholder}>
          + Add stakeholder
        </Button>
      </div>

      {error && <div className="alert alert-warn">{error}</div>}
    </Modal>
  );
}
