import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ContextBar, FM_COLORS, FM_FONT } from '@features/financial';
import { useGovernance, type GovernanceTab } from '../hooks/useGovernance';
import { ProposalsView } from '../components/ProposalsView';
import { ConflictsView } from '../components/ConflictsView';
import { TargetComplianceView } from '../components/TargetComplianceView';
import { ActivityLogView } from '../components/ActivityLogView';

function parseTab(raw: string | undefined): GovernanceTab {
  if (raw === 'conflicts' || raw === 'compliance' || raw === 'activity' || raw === 'proposals') {
    return raw;
  }
  return 'proposals';
}

export function GovernancePage() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const tab = parseTab(tabParam);
  const g = useGovernance(tab);

  useEffect(() => {
    if (tab !== g.activeTab) g.setActiveTab(tab);
  }, [tab, g.activeTab, g.setActiveTab]);

  const showBuFilter = tab === 'proposals' || tab === 'compliance';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: FM_FONT.family,
        background: FM_COLORS.pageBg,
      }}
    >
      <ContextBar
        context={g.context}
        onContextChange={g.setContext}
        regions={g.regions}
        businessUnits={g.businessUnits}
        departments={g.contextDepartments}
        functions={g.contextFunctions}
        showFilters={showBuFilter}
        showDepartmentFunction={tab === 'proposals'}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {g.error && (
          <div
            style={{
              background: FM_COLORS.noOrgLinkBg,
              color: FM_COLORS.noOrgLink,
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {g.error}
          </div>
        )}
        {g.notice && (
          <div
            style={{
              background: FM_COLORS.statusDraftBg,
              color: FM_COLORS.statusDraft,
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{g.notice}</span>
            <button type="button" onClick={() => g.setNotice(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
              ×
            </button>
          </div>
        )}
        {g.isLoading ? (
          <div style={{ color: FM_COLORS.textMuted }}>Loading governance data…</div>
        ) : g.activeTab === 'proposals' ? (
          <ProposalsView
            rows={g.proposals}
            kpis={g.kpis}
            openProposalId={g.openProposalId}
            filter={g.proposalFilter}
            onFilterChange={g.setProposalFilter}
            liveTarget={g.liveTarget}
            canApprove={g.canApprove}
            isActing={g.isActing}
            onApprove={g.approveProposal}
            onReject={g.rejectProposal}
          />
        ) : g.activeTab === 'conflicts' ? (
          <ConflictsView
            rows={g.conflicts}
            onOpenProposal={(proposalId) => {
              g.goToProposalConflicts(proposalId);
              navigate('/governance/proposals');
            }}
          />
        ) : g.activeTab === 'compliance' ? (
          <TargetComplianceView
            view={g.complianceView}
            onViewChange={g.setComplianceView}
            month={g.month}
            year={g.year}
            onMonthChange={g.setMonth}
            onYearChange={g.setYear}
            regions={g.regions}
            businessUnits={
              g.complianceView === 'all' && !g.context.region && !g.context.businessUnit
                ? g.allBusinessUnits
                : g.businessUnits
            }
            selectedBuId={g.context.businessUnit}
            kpis={g.kpis}
            departments={g.departments}
            functions={g.functions}
            pmKpiIds={g.pmKpiIds}
            kpiTarget={g.kpiTarget}
            isMissingTarget={g.isMissingTarget}
          />
        ) : (
          <ActivityLogView />
        )}
      </div>
    </div>
  );
}
