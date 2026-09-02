import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFinancialModeler } from '../hooks/useFinancialModeler';
import { ContextBar } from '../components/ContextBar';
import { ModelsListTable } from '../components/ModelsListTable';
import { BuilderTesterView } from '../components/BuilderTesterView';
import { ReviewSealingView } from '../components/ReviewSealingView';
import { KpiCeilingsView } from '../components/KpiCeilingsView';
import { NoticeModal, type NoticeContent } from '../components/NoticeModal';
import { ConflictConfirmModal } from '../components/ConflictConfirmModal';
import { Loading } from '@shared/components/Loading/Loading';
import type { FinancialModel } from '../models/types';

type Tab = 'models' | 'builder' | 'review' | 'ceilings';

function parseTab(raw: string | undefined): Tab {
  if (raw === 'builder' || raw === 'review' || raw === 'ceilings' || raw === 'models') return raw;
  return 'models';
}

export function FinancialPage() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const tab = parseTab(tabParam);
  const fm = useFinancialModeler(tab);
  const [notice, setNotice] = useState<NoticeContent | null>(null);

  useEffect(() => {
    if (tab !== fm.activeTab) fm.setActiveTab(tab);
  }, [tab, fm.activeTab, fm.setActiveTab]);

  const goToTab = (next: Tab) => {
    if (next !== tab) navigate(`/modeler-target-setting/financial-modeler/${next}`);
    if (next !== fm.activeTab) fm.setActiveTab(next);
  };

  const showNotice = (next: NoticeContent) => setNotice(next);

  const notifyProposalSaved = (
    result: {
      ok: boolean;
      conflictCount: number;
      awaitingConfirm?: boolean;
      blockedMessage?: string;
    },
    sealedTarget: boolean
  ) => {
    if (result.blockedMessage) {
      showNotice({
        tone: 'warning',
        title: 'Cannot save as proposal',
        message: result.blockedMessage,
      });
      return;
    }
    if (!result.ok || result.awaitingConfirm) return;
    const extra =
      result.conflictCount > 0
        ? `\n\n${result.conflictCount} conflict(s) were raised and linked to the proposal(s).`
        : '';
    // Return to the Models list after a successful save rather than leaving the user parked on
    // the Builder/Tester view with now-stale data (ported fix).
    fm.setSelectedModelId(null);
    goToTab('models');
    void fm.loadDataverseData();
    if (sealedTarget) {
      showNotice({
        tone: result.conflictCount > 0 ? 'warning' : 'success',
        title: result.conflictCount > 0 ? 'Saved with conflicts' : 'Saved as proposals',
        message: `Test values were saved as proposals (Financial Modelar). The sealed model was not changed. Opening the Models list.${extra}`,
      });
      return;
    }
    showNotice({
      tone: result.conflictCount > 0 ? 'warning' : 'success',
      title: result.conflictCount > 0 ? 'Saved with conflicts' : 'Saved as proposal',
      message: `The model was saved as Draft with terms, and test values were saved as proposals. Opening the Models list.${extra}`,
    });
  };

  const handleModelClick = (model: FinancialModel) => {
    fm.setSelectedModelId(model.pm_modelid);
    goToTab('builder');
  };

  const handleNewModel = () => {
    fm.createNewModel({ openBuilder: true });
    goToTab('builder');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Tab Content ── */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
        }}
      >
        {/* ── Context Bar ── */}
        <ContextBar
          context={fm.context}
          onContextChange={fm.setContext}
          regions={fm.regions}
          businessUnits={fm.businessUnits}
          departments={fm.departments}
          functions={fm.functions}
          showFilters={fm.activeTab === 'builder' || fm.activeTab === 'ceilings'}
          showDepartmentFunction={fm.activeTab !== 'ceilings'}
        />

        {/* ── Models List Tab ── */}
        {fm.activeTab === 'models' && (
          <ModelsListTable
            models={fm.models}
            functionName="All models"
            getResultKpiName={fm.getResultKpiName}
            getModelDefinition={fm.getModelDefinition}
            getOrgLinks={fm.getOrgLinks}
            onModelClick={handleModelClick}
            onNewModel={handleNewModel}
            isLoading={fm.isLoadingLive}
          />
        )}

        {/* ── Builder / Tester Tab ── */}
        {fm.activeTab === 'builder' && (
          <div>
            {fm.selectedModel ? (
              <BuilderTesterView
                model={fm.selectedModel}
                resultKpiName={fm.getResultKpiName(fm.selectedModel)}
                functionName={
                  fm.allFunctions.find((f) => f.functionid === fm.selectedModel!.pm_scope)?.name ||
                  fm.functions.find((f) => f.functionid === fm.context.functionId)?.name ||
                  'All contexts'
                }
                businessUnitName={
                  fm.allBusinessUnits.find((b) => b.businessunitid === fm.context.businessUnit)?.name
                }
                terms={fm.selectedModelTerms}
                factors={fm.selectedModelFactors}
                availableKpis={fm.allKpis}
                rows={fm.buildTesterRows(fm.selectedModel)}
                period={fm.testerPeriod}
                workingDays={fm.getWorkingDays(fm.testerPeriod.month, fm.testerPeriod.year)}
                getOrgRollup={(resultValue) => fm.getOrgRollup(fm.selectedModel!, resultValue)}
                models={fm.models}
                getModelLabel={(m) => m.pm_name || fm.getResultKpiName(m)}
                onSelectModel={(id) => fm.setSelectedModelId(id)}
                onPeriodChange={fm.setTesterPeriod}
                onTermsChange={fm.setSelectedModelTerms}
                onFactorsChange={fm.setSelectedModelFactors}
                onToggleWorkingDays={fm.toggleSelectedWorkingDays}
                onSwitchType={fm.switchSelectedModelType}
                onNameChange={(name) => fm.updateSelectedModel({ pm_name: name })}
                resultBaseline={fm.getResultBaseline(fm.selectedModel)}
                testContextReady={fm.testContextReady}
                missingTestFilters={fm.missingTestFilters}
                onResultChange={fm.setSelectedResult}
                orgOutputs={fm.orgOutputs}
                orgOutcomes={fm.orgOutcomes}
                onBack={() => {
                  fm.setSelectedModelId(null);
                  goToTab('models');
                }}
                isSavingDefinition={fm.isSavingModel}
                saveError={fm.saveError}
                onNotice={showNotice}
                onSubmitForReview={async (terms) => {
                  const ok = await fm.submitSelectedForReview(terms);
                  if (!ok) return;
                  fm.setSelectedModelId(null);
                  goToTab('models');
                  void fm.loadDataverseData();
                  showNotice({
                    tone: 'success',
                    title: 'Submitted for review',
                    message: 'The model was set to Under Review. Opening the Models list.',
                  });
                }}
                onSaveTarget={async (values, resultValue) => {
                  const rollup = fm.getOrgRollup(fm.selectedModel!, resultValue);
                  const result = await fm.saveSelectedAsTarget(values, resultValue, rollup);
                  notifyProposalSaved(result, true);
                }}
                onSaveProposal={async (values, resultValue, terms) => {
                  const rollup = fm.getOrgRollup(fm.selectedModel!, resultValue);
                  const result = await fm.saveSelectedAsProposal(values, resultValue, rollup, terms);
                  notifyProposalSaved(result, false);
                }}
              />
            ) : (
              <div className="card">
                <div className="card-body">
                  <Loading label="Opening new model form…" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Review & Sealing Tab ── */}
        {fm.activeTab === 'review' && (
          <ReviewSealingView
            modelsAwaitingReview={fm.modelsAwaitingReview}
            sealedModels={fm.sealedModels}
            activeRole={fm.activeRole}
            getResultKpiName={fm.getResultKpiName}
            getModelDefinition={fm.getModelDefinition}
            onApprove={fm.approveModel}
            onReturn={fm.returnModel}
            isLoading={fm.isLoadingLive}
            isBusy={fm.isReviewing}
            reviewError={fm.saveError}
          />
        )}

        {/* ── KPI Ceilings Tab ── */}
        {fm.activeTab === 'ceilings' && (
          <KpiCeilingsView
            ceilings={fm.ceilings}
            kpis={fm.allKpis}
            businessUnits={fm.businessUnits}
            allKpis={fm.allKpis}
            allBusinessUnits={fm.allBusinessUnits}
            preferredBusinessUnitId={fm.context.businessUnit || undefined}
            onAdd={fm.addCeiling}
            onRemove={fm.removeCeiling}
            onUpdate={fm.updateCeiling}
            isLoading={fm.isLoadingLive}
            saveError={fm.saveError}
          />
        )}
      </div>

      <ConflictConfirmModal
        open={Boolean(fm.pendingConflicts?.length)}
        conflicts={fm.pendingConflicts ?? []}
        isBusy={fm.isSavingModel}
        onCancel={fm.cancelPendingTesterSave}
        onConfirm={async () => {
          const sealedTarget = !fm.pendingSaveRewritesModel;
          const result = await fm.confirmPendingTesterSave();
          notifyProposalSaved(result, sealedTarget);
        }}
      />
      <NoticeModal
        open={Boolean(notice)}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        tone={notice?.tone}
        actions={notice?.actions}
        onClose={() => setNotice(null)}
      />
    </div>
  );
}
