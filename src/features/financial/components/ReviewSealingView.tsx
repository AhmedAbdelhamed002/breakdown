import { useMemo, useState } from 'react';
import type { FinancialModel, ActingRole } from '../models/types';
import { Button } from '@shared/components/Button/Button';
import { Badge } from '@shared/components/Badge/Badge';
import { DataTable, type Column } from '@shared/components/DataTable/DataTable';
import { EmptyState } from '@shared/components/EmptyState/EmptyState';
import { ModelReviewModal } from './ModelReviewModal';
import { isSealedModel } from '../services/dataverseService';
import { getModelStatusInfo } from '../utils/modelStatus';

interface ReviewSealingViewProps {
  modelsAwaitingReview: FinancialModel[];
  sealedModels: FinancialModel[];
  activeRole: ActingRole;
  getResultKpiName: (model: FinancialModel) => string;
  getModelDefinition: (model: FinancialModel) => string;
  onApprove: (modelId: string) => void | Promise<void>;
  onReturn: (modelId: string) => void | Promise<void>;
  isLoading?: boolean;
  isBusy?: boolean;
  reviewError?: string | null;
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{ width: 4, height: 24, background: 'var(--primary)', borderRadius: 2 }} />
      <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--brand-brown)' }}>{title}</h3>
      <span className="pill">{count}</span>
    </div>
  );
}

function ModelTable({
  models,
  getResultKpiName,
  getModelDefinition,
  showActions,
  activeRole,
  isBusy,
  onOpen,
  onApprove,
  onReturn,
}: {
  models: FinancialModel[];
  getResultKpiName: (model: FinancialModel) => string;
  getModelDefinition: (model: FinancialModel) => string;
  showActions: boolean;
  activeRole: ActingRole;
  isBusy?: boolean;
  onOpen: (model: FinancialModel) => void;
  onApprove?: (id: string) => void;
  onReturn?: (id: string) => void;
}) {
  const columns: Column<FinancialModel>[] = [
    { key: 'model', header: 'Model', render: (m) => <strong>{m.pm_name?.trim() || getResultKpiName(m)}</strong> },
    { key: 'resultKpi', header: 'Result KPI', render: (m) => getResultKpiName(m) },
    { key: 'status', header: 'Status', render: (m) => {
      const { label, badge } = getModelStatusInfo(m);
      return <Badge status={badge}>{label}</Badge>;
    } },
    { key: 'type', header: 'Type', render: (m) => <span className="pill">{m.pm_modeltype}</span> },
    { key: 'definition', header: 'Definition', render: (m) => <span style={{ color: 'var(--text-secondary)' }}>{getModelDefinition(m)}</span> },
    { key: 'function', header: 'Function', render: (m) => m.pm_scopename ?? '' },
  ];

  if (showActions) {
    columns.push({
      key: 'actions',
      header: '',
      render: (model) => {
        // Single-step approval: Finance's Approve seals the model directly; BI can only
        // Return/Reject it back to Draft (ported from FinancialModeler).
        const isFinance = activeRole === 'Finance';
        const isBi = activeRole === 'BI';
        const sealed = isSealedModel(model);
        const canReturn = !sealed;
        const canApprove = isFinance && !sealed;
        return (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {(isFinance || isBi) && (
              <Button
                variant="danger"
                size="sm"
                disabled={isBusy || !canReturn}
                onClick={(e) => {
                  e.stopPropagation();
                  onReturn?.(model.pm_modelid);
                }}
              >
                {isFinance ? 'Reject' : 'Return'}
              </Button>
            )}
            {isFinance && (
              <Button
                variant="accent"
                size="sm"
                disabled={isBusy || !canApprove}
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove?.(model.pm_modelid);
                }}
              >
                Approve
              </Button>
            )}
          </div>
        );
      },
    });
  }

  return <DataTable columns={columns} rows={models} rowKey={(m) => m.pm_modelid} onRowClick={onOpen} />;
}

export function ReviewSealingView({
  modelsAwaitingReview,
  sealedModels,
  activeRole,
  getResultKpiName,
  getModelDefinition,
  onApprove,
  onReturn,
  isLoading,
  isBusy = false,
  reviewError = null,
}: ReviewSealingViewProps) {
  const canReview = activeRole === 'Finance' || activeRole === 'BI';
  const [openModelId, setOpenModelId] = useState<string | null>(null);
  const openModel = useMemo(
    () =>
      [...modelsAwaitingReview, ...sealedModels].find((m) => m.pm_modelid === openModelId) ??
      null,
    [modelsAwaitingReview, sealedModels, openModelId]
  );
  const emptyAwaiting = isLoading
    ? 'Loading models from Dataverse…'
    : 'Nothing awaiting review.';
  const emptySealed = isLoading
    ? 'Loading models from Dataverse…'
    : 'No sealed models.';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--brand-brown)' }}>Review & Sealing</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Finance: Approve seals the model, or Reject returns it to Draft. BI: Return only.
        </p>
      </div>

      {reviewError &&
        !/equation terms|submitting for review|saving a proposal|relation factors/i.test(reviewError) && (
        <div className="alert alert-warn">{reviewError}</div>
      )}

      <SectionHeader title="Awaiting review" count={modelsAwaitingReview.length} />
      {modelsAwaitingReview.length === 0 ? (
        <EmptyState title="Nothing to review" description={emptyAwaiting} />
      ) : (
        <ModelTable
          models={modelsAwaitingReview}
          getResultKpiName={getResultKpiName}
          getModelDefinition={getModelDefinition}
          showActions={canReview}
          activeRole={activeRole}
          isBusy={isBusy}
          onOpen={(m) => setOpenModelId(m.pm_modelid)}
          onApprove={onApprove}
          onReturn={onReturn}
        />
      )}

      <div style={{ marginTop: 40 }}>
        <SectionHeader title="Sealed" count={sealedModels.length} />
        {sealedModels.length === 0 ? (
          <EmptyState title="No sealed models" description={emptySealed} />
        ) : (
          <ModelTable
            models={sealedModels}
            getResultKpiName={getResultKpiName}
            getModelDefinition={getModelDefinition}
            showActions={false}
            activeRole={activeRole}
            onOpen={(m) => setOpenModelId(m.pm_modelid)}
          />
        )}
      </div>

      {openModel && (
        <ModelReviewModal
          model={openModel}
          resultKpiName={getResultKpiName(openModel)}
          definition={getModelDefinition(openModel)}
          activeRole={activeRole}
          showActions={canReview && !isSealedModel(openModel)}
          isBusy={isBusy}
          onClose={() => setOpenModelId(null)}
          onApprove={onApprove}
          onReturn={onReturn}
        />
      )}
    </div>
  );
}
