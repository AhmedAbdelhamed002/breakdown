import { useEffect, useMemo, useState } from 'react';
import type { KpiCeiling, StrategyKpi, BusinessUnit, ConstraintEnforcement } from '../models/types';
import { Card, CardHead, CardBody } from '@shared/components/Card/Card';
import { Button } from '@shared/components/Button/Button';
import { Badge } from '@shared/components/Badge/Badge';
import { DataTable, type Column } from '@shared/components/DataTable/DataTable';
import { EmptyState } from '@shared/components/EmptyState/EmptyState';
import { Modal } from '@shared/components/Modal/Modal';
import { Field } from '@shared/components/Field/Field';
import { SearchableSelect } from './SearchableSelect';
import { isSupersededCeiling } from '../utils/ceilingStatus';

interface KpiCeilingsViewProps {
  ceilings: KpiCeiling[];
  kpis: StrategyKpi[];
  businessUnits: BusinessUnit[];
  allKpis?: StrategyKpi[];
  allBusinessUnits?: BusinessUnit[];
  /** Prefills the create modal's BU with the context bar's current selection. */
  preferredBusinessUnitId?: string;
  onAdd: (ceiling: Omit<KpiCeiling, 'pm_kpiceilingid'>) => void;
  onRemove: (ceilingId: string) => void;
  onUpdate: (ceilingId: string, updates: Partial<KpiCeiling>) => void;
  isLoading?: boolean;
  saveError?: string | null;
}

type CreateForm = {
  kpiId: string;
  buId: string;
  min: string;
  max: string;
  effectiveDate: string;
  enforced: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function emptyForm(kpis: StrategyKpi[], bus: BusinessUnit[], preferredBuId?: string): CreateForm {
  const preferred =
    preferredBuId && bus.some((b) => b.businessunitid === preferredBuId) ? preferredBuId : bus[0]?.businessunitid || '';
  return {
    kpiId: kpis[0]?.strategy_kpisid || '',
    buId: preferred,
    min: '',
    max: '',
    effectiveDate: todayIsoDate(),
    enforced: true,
  };
}

function EnforcedToggle({ enforced, superseded, onToggle }: { enforced: boolean; superseded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enforced}
      aria-label={
        superseded
          ? 'Enforced off — superseded constraints cannot be enforced'
          : enforced
            ? 'Enforced on'
            : 'Enforced off'
      }
      disabled={superseded}
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: superseded ? 'not-allowed' : 'pointer',
        pointerEvents: superseded ? 'none' : 'auto',
        opacity: superseded ? 0.45 : 1,
      }}
    >
      <span
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          backgroundColor: enforced ? 'var(--accent)' : 'var(--border)',
          position: 'relative',
          flexShrink: 0,
          transition: 'var(--transition)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: enforced ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: 'var(--surface)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'var(--transition)',
          }}
        />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: enforced ? 'var(--accent)' : 'var(--text-muted)', minWidth: 24 }}>
        {enforced ? 'On' : 'Off'}
      </span>
    </button>
  );
}

export function KpiCeilingsView({
  ceilings,
  kpis,
  businessUnits,
  allKpis,
  allBusinessUnits,
  preferredBusinessUnitId,
  onAdd,
  onRemove,
  onUpdate,
  isLoading,
  saveError,
}: KpiCeilingsViewProps) {
  const availableKpis = allKpis && allKpis.length > 0 ? allKpis : kpis;
  // Region-filtered BUs (from the context bar) for the create modal and the table's editable BU
  // select; the full unfiltered list is kept separately for resolving names of already-assigned
  // BUs that fall outside whatever region is currently selected.
  const availableBUs = businessUnits.length > 0 ? businessUnits : allBusinessUnits && allBusinessUnits.length > 0 ? allBusinessUnits : [];
  const lookupBUs = allBusinessUnits && allBusinessUnits.length > 0 ? allBusinessUnits : availableBUs;

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(() => emptyForm(availableKpis, availableBUs, preferredBusinessUnitId));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const kpiOptions = useMemo(
    () => availableKpis.map((kpi) => ({ value: kpi.strategy_kpisid, label: kpi.btm_kpibusinessname || 'Unnamed KPI' })),
    [availableKpis]
  );

  const canCreate = availableKpis.length > 0 && availableBUs.length > 0 && !isLoading;

  const openCreateModal = () => {
    if (!canCreate) return;
    setForm(emptyForm(availableKpis, availableBUs, preferredBusinessUnitId));
    setFormError(null);
    setModalOpen(true);
  };

  const closeCreateModal = () => {
    setModalOpen(false);
    setFormError(null);
  };

  const handleCreate = () => {
    if (!form.kpiId) { setFormError('Select a KPI.'); return; }
    if (!form.buId) { setFormError('Select a business unit.'); return; }
    if (!form.effectiveDate) { setFormError('Select an effective date.'); return; }

    const minVal = form.min.trim() === '' ? undefined : Number(form.min);
    const maxVal = form.max.trim() === '' ? undefined : Number(form.max);
    if (minVal != null && Number.isNaN(minVal)) { setFormError('Min must be a number.'); return; }
    if (maxVal != null && Number.isNaN(maxVal)) { setFormError('Max must be a number.'); return; }
    if (minVal != null && maxVal != null && minVal > maxVal) { setFormError('Min cannot be greater than Max.'); return; }
    if (minVal == null && maxVal == null) { setFormError('Enter at least a Min or a Max value.'); return; }

    const kpi = availableKpis.find((k) => k.strategy_kpisid === form.kpiId);
    const bu = lookupBUs.find((b) => b.businessunitid === form.buId);

    onAdd({
      pm_kpi: form.kpiId,
      pm_kpiname: kpi?.btm_kpibusinessname,
      pm_businessunit: form.buId,
      pm_businessunitname: bu?.name,
      pm_min: minVal,
      pm_max: maxVal,
      pm_effectivedate: form.effectiveDate,
      pm_isconstraint: (form.enforced ? 'Enforced' : 'Off') as ConstraintEnforcement,
      status: 'Active',
      statuscode: 1,
    });
    closeCreateModal();
  };

  const columns: Column<KpiCeiling>[] = [
    {
      key: 'kpi',
      header: 'KPI',
      render: (ceiling) => (
        <SearchableSelect
          value={ceiling.pm_kpi || ''}
          onChange={(kpiId) => onUpdate(ceiling.pm_kpiceilingid, { pm_kpi: kpiId })}
          placeholder="Search KPI…"
          options={[
            ...(ceiling.pm_kpi && !availableKpis.some((k) => k.strategy_kpisid === ceiling.pm_kpi)
              ? [{ value: ceiling.pm_kpi, label: ceiling.pm_kpiname || 'Unknown KPI' }]
              : []),
            ...availableKpis.map((kpi) => ({ value: kpi.strategy_kpisid, label: kpi.btm_kpibusinessname || 'Unnamed KPI' })),
          ]}
        />
      ),
    },
    {
      key: 'bu',
      header: 'BU',
      render: (ceiling) => (
        <select
          value={ceiling.pm_businessunit || ''}
          onChange={(e) => onUpdate(ceiling.pm_kpiceilingid, { pm_businessunit: e.target.value })}
        >
          {ceiling.pm_businessunit && !lookupBUs.some((b) => b.businessunitid === ceiling.pm_businessunit) && (
            <option value={ceiling.pm_businessunit}>{ceiling.pm_businessunitname || 'Unknown BU'}</option>
          )}
          {lookupBUs.map((bu) => (
            <option key={bu.businessunitid} value={bu.businessunitid}>{bu.name || 'Unnamed BU'}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'min',
      header: 'Min',
      render: (ceiling) => (
        <input
          type="number"
          value={ceiling.pm_min === undefined ? '' : ceiling.pm_min}
          onChange={(e) => onUpdate(ceiling.pm_kpiceilingid, { pm_min: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="No Min"
          style={{ width: 100 }}
        />
      ),
    },
    {
      key: 'max',
      header: 'Max',
      render: (ceiling) => (
        <input
          type="number"
          value={ceiling.pm_max === undefined ? '' : ceiling.pm_max}
          onChange={(e) => onUpdate(ceiling.pm_kpiceilingid, { pm_max: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="No Max"
          style={{ width: 100 }}
        />
      ),
    },
    {
      key: 'effective',
      header: 'Effective',
      render: (ceiling) => (
        <input
          type="date"
          value={ceiling.pm_effectivedate ? String(ceiling.pm_effectivedate).substring(0, 10) : ''}
          onChange={(e) => onUpdate(ceiling.pm_kpiceilingid, { pm_effectivedate: e.target.value })}
          style={{ width: 150 }}
        />
      ),
    },
    {
      key: 'enforced',
      header: 'Enforced',
      render: (ceiling) => {
        const superseded = isSupersededCeiling(ceiling);
        const enforced = !superseded && ceiling.pm_isconstraint === 'Enforced';
        return (
          <EnforcedToggle
            enforced={enforced}
            superseded={superseded}
            onToggle={() => onUpdate(ceiling.pm_kpiceilingid, { pm_isconstraint: enforced ? 'Off' : 'Enforced' })}
          />
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (ceiling) => {
        const superseded = isSupersededCeiling(ceiling);
        return <Badge status={superseded ? 'superseded' : 'approved'}>{superseded ? 'Superseded' : 'Active'}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (ceiling) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onRemove(ceiling.pm_kpiceilingid)}
          title="Remove Constraint"
          aria-label="Remove Constraint"
          style={{ color: 'var(--danger)', fontSize: 16 }}
        >
          ×
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--brand-brown)' }}>KPI Constraints</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>pm_kpiceiling — Min / Max per KPI per BU</p>
      </div>

      {isLoading && <div className="alert alert-info">Loading live Dataverse records…</div>}
      {saveError && <div className="alert alert-warn">{saveError}</div>}
      {availableKpis.length === 0 && !isLoading && (
        <div className="alert alert-warn">
          No KPIs loaded from <b>strategy_kpis</b>. Constraints cannot be saved until KPIs are available.
        </div>
      )}
      {availableBUs.length === 0 && !isLoading && (
        <div className="alert alert-warn">
          No business units loaded from Dataverse. Check that the <b>businessunits</b> table is added as a Code App
          data source, then republish/reload. Constraints cannot be saved until BUs are available.
        </div>
      )}

      <Card>
        <CardHead title="KPI constraints (Min / Max)">
          <Button variant="accent" disabled={!canCreate} onClick={openCreateModal}>+ Constraint</Button>
        </CardHead>
        <CardBody>
          {ceilings.length === 0 ? (
            <EmptyState
              title="No constraints yet"
              description={
                preferredBusinessUnitId
                  ? 'No constraints for the selected business unit. Click "+ Constraint" to add one.'
                  : 'Select Region / BU above to filter, or click "+ Constraint" to add one.'
              }
            />
          ) : (
            <DataTable columns={columns} rows={ceilings} rowKey={(c) => c.pm_kpiceilingid} />
          )}
        </CardBody>
      </Card>

      {modalOpen && (
        <Modal
          title="New KPI constraint"
          onClose={closeCreateModal}
          footer={
            <>
              <Button onClick={closeCreateModal}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate}>Create constraint</Button>
            </>
          }
        >
          <div className="hint" style={{ marginBottom: 10 }}>
            Set Min and/or Max for a KPI in a business unit. Leave either bound blank for unbounded.
          </div>
          <Field label="KPI" required>
            <SearchableSelect value={form.kpiId} onChange={(kpiId) => setForm((prev) => ({ ...prev, kpiId }))} placeholder="Search KPI…" options={kpiOptions} />
          </Field>
          <Field label="Business unit" required>
            <select value={form.buId} onChange={(e) => setForm((prev) => ({ ...prev, buId: e.target.value }))}>
              {availableBUs.map((bu) => (
                <option key={bu.businessunitid} value={bu.businessunitid}>{bu.name || 'Unnamed BU'}</option>
              ))}
            </select>
          </Field>
          <div className="grid-2">
            <Field label="Min">
              <input type="number" value={form.min} onChange={(e) => setForm((prev) => ({ ...prev, min: e.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Max">
              <input type="number" value={form.max} onChange={(e) => setForm((prev) => ({ ...prev, max: e.target.value }))} placeholder="Optional" />
            </Field>
          </div>
          <Field label="Effective date" required>
            <input type="date" value={form.effectiveDate} onChange={(e) => setForm((prev) => ({ ...prev, effectiveDate: e.target.value }))} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', marginBottom: 10 }}>
            <input type="checkbox" checked={form.enforced} onChange={(e) => setForm((prev) => ({ ...prev, enforced: e.target.checked }))} />
            <span>Enforce this constraint</span>
          </label>
          {formError && <div className="alert alert-warn">{formError}</div>}
        </Modal>
      )}
    </div>
  );
}
