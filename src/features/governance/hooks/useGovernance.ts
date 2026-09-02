import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveProposalInDataverse,
  fetchBusinessUnitsFromDataverse,
  fetchConflictsFromDataverse,
  fetchDepartmentsFromDataverse,
  fetchFunctionsFromDataverse,
  fetchKpiAchievementsFromDataverse,
  fetchKpisFromDataverse,
  fetchModelTermsFromDataverse,
  fetchModelsFromDataverse,
  fetchOrgOutcomeAchievementsFromDataverse,
  fetchOrgOutputAchievementsFromDataverse,
  fetchProposalsFromDataverse,
  fetchRegionsFromDataverse,
  fetchRelationFactorsFromDataverse,
  rejectProposalInDataverse,
  useActingRole,
  type BusinessUnit,
  type Conflict,
  type Department,
  type FilterContext,
  type FinancialModel,
  type HrFunction,
  type KpiAchievement,
  type ModelTerm,
  type OrgOutcomeAchievement,
  type OrgOutputAchievement,
  type Proposal,
  type Region,
  type RelationFactor,
  type StrategyKpi,
} from '@features/financial';
import { CAN } from '../utils/permissions';
import { collectPmKpiIds, isMissingTarget } from '../utils/pmKpis';

export type GovernanceTab = 'proposals' | 'conflicts' | 'compliance' | 'activity';
export type ProposalFilter = 'all' | 'open' | 'approved' | 'inactive' | 'conflicts';
export type ComplianceView = 'single' | 'all';

function norm(id: unknown): string {
  return String(id ?? '')
    .replace(/[{}]/g, '')
    .toLowerCase()
    .trim();
}

function entityId(proposal: Proposal | Conflict): string {
  return norm(proposal.pm_kpi || proposal.pm_orgoutput || proposal.pm_orgoutcome);
}

export function entityName(row: Proposal | Conflict): string {
  return (
    row.pm_kpiname ||
    row.pm_orgoutputname ||
    row.pm_orgoutcomename ||
    row.pm_entitykind
  );
}

export function useGovernance(initialTab: GovernanceTab = 'proposals') {
  const { activeRole } = useActingRole();
  const [activeTab, setActiveTab] = useState<GovernanceTab>(initialTab);
  const [proposalFilter, setProposalFilter] = useState<ProposalFilter>('all');
  const [openProposalId, setOpenProposalId] = useState<string | null>(null);
  const [complianceView, setComplianceView] = useState<ComplianceView>('single');
  const [context, setContext] = useState<FilterContext>({
    region: '',
    businessUnit: '',
    department: '',
    functionId: '',
  });
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [kpis, setKpis] = useState<StrategyKpi[]>([]);
  const [models, setModels] = useState<FinancialModel[]>([]);
  const [terms, setTerms] = useState<ModelTerm[]>([]);
  const [factors, setFactors] = useState<RelationFactor[]>([]);
  const [achievements, setAchievements] = useState<KpiAchievement[]>([]);
  const [outputAchievements, setOutputAchievements] = useState<OrgOutputAchievement[]>([]);
  const [outcomeAchievements, setOutcomeAchievements] = useState<OrgOutcomeAchievement[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [allBusinessUnits, setAllBusinessUnits] = useState<BusinessUnit[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [allFunctions, setAllFunctions] = useState<HrFunction[]>([]);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [
        props,
        confs,
        kpiRows,
        modelRows,
        termRows,
        factorRows,
        achRows,
        outAch,
        outcomeAch,
        regs,
        bus,
        depts,
        fns,
      ] = await Promise.all([
        fetchProposalsFromDataverse(),
        fetchConflictsFromDataverse(),
        fetchKpisFromDataverse(),
        fetchModelsFromDataverse(),
        fetchModelTermsFromDataverse(),
        fetchRelationFactorsFromDataverse(),
        fetchKpiAchievementsFromDataverse({ year }),
        fetchOrgOutputAchievementsFromDataverse(),
        fetchOrgOutcomeAchievementsFromDataverse(),
        fetchRegionsFromDataverse(),
        fetchBusinessUnitsFromDataverse(),
        fetchDepartmentsFromDataverse(),
        fetchFunctionsFromDataverse(),
      ]);
      setProposals(props);
      setConflicts(confs);
      setKpis(kpiRows);
      setModels(modelRows);
      setTerms(termRows);
      setFactors(factorRows);
      setAchievements(achRows);
      setOutputAchievements(outAch);
      setOutcomeAchievements(outcomeAch);
      setRegions(regs);
      setAllBusinessUnits(bus);
      setAllDepartments(depts);
      setAllFunctions(fns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load governance data.');
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const businessUnits = useMemo(() => {
    if (!context.region) return allBusinessUnits;
    const filtered = allBusinessUnits.filter((b) => b.regionid === context.region);
    return filtered.length ? filtered : allBusinessUnits;
  }, [allBusinessUnits, context.region]);

  const departments = useMemo(() => {
    if (!context.businessUnit) return [];
    return allDepartments.filter((d) => !d.businessunitid || d.businessunitid === context.businessUnit);
  }, [allDepartments, context.businessUnit]);

  const functions = useMemo(() => {
    if (!context.department) return [];
    return allFunctions.filter((f) => !f.departmentid || f.departmentid === context.department);
  }, [allFunctions, context.department]);

  const liveTarget = useCallback(
    (row: Proposal): number | null => {
      const id = entityId(row);
      const bu = norm(row.pm_businessunit);
      if (row.pm_entitykind === 'OrgOutput') {
        const hit = outputAchievements.find(
          (a) =>
            norm(a.pm_orgoutput) === id &&
            norm(a.pm_businessunit) === bu &&
            a.pm_month === row.pm_month &&
            a.pm_year === row.pm_year
        );
        return hit?.pm_target ?? null;
      }
      if (row.pm_entitykind === 'OrgOutcome') {
        const hit = outcomeAchievements.find(
          (a) =>
            norm(a.pm_orgoutcome) === id &&
            norm(a.pm_businessunit) === bu &&
            a.pm_month === row.pm_month &&
            a.pm_year === row.pm_year
        );
        return hit?.pm_target ?? null;
      }
      const hit = achievements.find(
        (a) =>
          norm(a.pm_kpi) === id &&
          norm(a.pm_businessunit) === bu &&
          a.pm_month === row.pm_month &&
          a.pm_year === row.pm_year
      );
      return hit?.pm_target ?? null;
    },
    [achievements, outputAchievements, outcomeAchievements]
  );

  const filteredProposals = useMemo(() => {
    const bu = norm(context.businessUnit);
    const department = norm(context.department);
    const functionId = norm(context.functionId);
    const departmentName = norm(allDepartments.find((d) => norm(d.departmentid) === department)?.name);
    const functionName = norm(allFunctions.find((f) => norm(f.functionid) === functionId)?.name);

    const matchesOrgContext = (proposal: Proposal): boolean => {
      const text = norm(proposal.pm_deptfunction);
      return (!departmentName || text.includes(departmentName)) && (!functionName || text.includes(functionName));
    };

    const matchesKpiContext = (proposal: Proposal): boolean => {
      if (!department && !functionId) return true;
      const matchingAchievements = achievements.filter(
        (achievement) =>
          norm(achievement.pm_kpi) === norm(proposal.pm_kpi) &&
          norm(achievement.pm_businessunit) === norm(proposal.pm_businessunit) &&
          achievement.pm_month === proposal.pm_month &&
          achievement.pm_year === proposal.pm_year
      );
      if (matchingAchievements.length === 0) return matchesOrgContext(proposal);
      return matchingAchievements.some(
        (achievement) =>
          (!department || norm(achievement.pm_department) === department) &&
          (!functionId || norm(achievement.pm_function) === functionId)
      );
    };

    return proposals.filter((p) => {
      if (bu && norm(p.pm_businessunit) !== bu) return false;
      if (p.pm_entitykind === 'KPI' ? !matchesKpiContext(p) : !matchesOrgContext(p)) return false;
      if (proposalFilter === 'open') return p.statuscode === 'Active';
      if (proposalFilter === 'approved') return p.statuscode === 'Approved';
      if (proposalFilter === 'inactive') return p.statuscode === 'Inactive';
      if (proposalFilter === 'conflicts') return p.pm_hasconflict === 'Yes';
      return true;
    });
  }, [achievements, allDepartments, allFunctions, proposals, proposalFilter, context.businessUnit, context.department, context.functionId]);

  const openProposalCount = useMemo(
    () => proposals.filter((p) => p.statuscode === 'Active').length,
    [proposals]
  );

  const monthConflicts = useMemo(() => conflicts, [conflicts]);

  const pmKpiIds = useMemo(() => collectPmKpiIds(models, terms, factors), [models, terms, factors]);

  const kpiTarget = useCallback(
    (kpiId: string, buId: string) => {
      const hit = achievements.find(
        (a) =>
          norm(a.pm_kpi) === norm(kpiId) &&
          norm(a.pm_businessunit) === norm(buId) &&
          a.pm_month === month &&
          a.pm_year === year
      );
      return hit?.pm_target ?? null;
    },
    [achievements, month, year]
  );

  const canApprove = CAN.approveProposal(activeRole);

  const approveProposal = useCallback(
    async (proposal: Proposal) => {
      if (!canApprove) {
        setError('Finance approves proposals.');
        return;
      }
      setIsActing(true);
      setError(null);
      try {
        await approveProposalInDataverse(proposal);
        setProposals((prev) =>
          prev.map((p) =>
            p.pm_proposalid === proposal.pm_proposalid ? { ...p, statuscode: 'Approved' as const } : p
          )
        );
        setNotice(`Proposal approved → ${entityName(proposal)} target updated`);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve proposal.');
      } finally {
        setIsActing(false);
      }
    },
    [canApprove, reload]
  );

  const rejectProposal = useCallback(
    async (proposal: Proposal) => {
      if (!canApprove) {
        setError('Finance approves proposals.');
        return;
      }
      setIsActing(true);
      setError(null);
      try {
        await rejectProposalInDataverse(proposal);
        setProposals((prev) =>
          prev.map((p) =>
            p.pm_proposalid === proposal.pm_proposalid ? { ...p, statuscode: 'Inactive' as const } : p
          )
        );
        setNotice(`Proposal rejected → ${entityName(proposal)} set to Inactive`);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject proposal.');
      } finally {
        setIsActing(false);
      }
    },
    [canApprove, reload]
  );

  const goToProposalConflicts = useCallback((proposalId?: string) => {
    setProposalFilter('conflicts');
    setOpenProposalId(proposalId ? norm(proposalId) : null);
    setActiveTab('proposals');
  }, []);

  return {
    activeTab,
    setActiveTab,
    proposalFilter,
    setProposalFilter,
    openProposalId,
    complianceView,
    setComplianceView,
    context,
    setContext,
    month,
    setMonth,
    year,
    setYear,
    isLoading,
    isActing,
    error,
    notice,
    setNotice,
    proposals: filteredProposals,
    openProposalCount,
    conflicts: monthConflicts,
    conflictCount: monthConflicts.length,
    liveTarget,
    kpis,
    departments: allDepartments,
    functions: allFunctions,
    regions,
    businessUnits,
    allBusinessUnits,
    contextDepartments: departments,
    contextFunctions: functions,
    pmKpiIds,
    kpiTarget,
    isMissingTarget,
    canApprove,
    approveProposal,
    rejectProposal,
    goToProposalConflicts,
    activeRole,
  };
}
