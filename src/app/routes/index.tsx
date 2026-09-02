import { Routes, Route, Navigate } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import {
  StrategyFormulationPage,
  OrgObjectivesPage as StrategyTreePage,
  StrategyWizardPage,
  StrategyFormulationHomePage,
  ChangeRequestsPage,
  ThemesPage,
  AlignmentSessionsPage,
  AlignmentSessionDetailPage,
  ExecutionTrackingPage,
  ExecutionStrategyPage,
  MonitoringPage,
  UnassignedItemsPage,
  StrategySetupPage,
} from "@features/strategy-formulation";
import { OrgObjectivesPage } from "@features/org-objectives";
import { FinancialPage } from "@features/financial";
import {
  TargetSettingPage,
  CalendarAdjustmentPage,
  TopDownAnnualPage,
  TopDownMonthlyPage,
  BottomUpPage,
  BreakdownPage,
  TargetSummaryPage,
  OrgTargetSummaryPage,
} from "@features/target-setting";
import { GovernancePage } from "@features/governance";
import { ExecutionMonitoringPage } from "@features/execution-monitoring";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/org-objectives" element={<OrgObjectivesPage />} />
      <Route path="/modeler-target-setting" element={<Navigate to="/modeler-target-setting/calendar" replace />} />
      <Route path="/modeler-target-setting/target-setting" element={<TargetSettingPage />} />
      <Route path="/modeler-target-setting/calendar" element={<CalendarAdjustmentPage />} />
      <Route path="/modeler-target-setting/top-down-annual" element={<TopDownAnnualPage />} />
      <Route path="/modeler-target-setting/top-down-monthly" element={<TopDownMonthlyPage />} />
      <Route path="/modeler-target-setting/bottom-up" element={<BottomUpPage />} />
      <Route path="/modeler-target-setting/breakdown" element={<BreakdownPage />} />
      <Route path="/modeler-target-setting/target-summary" element={<TargetSummaryPage />} />
      <Route path="/modeler-target-setting/org-target-summary" element={<OrgTargetSummaryPage />} />
      <Route path="/modeler-target-setting/financial-modeler" element={<Navigate to="/modeler-target-setting/financial-modeler/models" replace />} />
      <Route path="/modeler-target-setting/financial-modeler/:tab" element={<FinancialPage />} />
      <Route path="/strategy-formulation" element={<Navigate to="/strategy-formulation/home" replace />} />
      <Route path="/strategy-formulation/tree" element={<StrategyTreePage />} />
      <Route path="/strategy-formulation/list" element={<StrategyFormulationPage />} />
      <Route path="/strategy-formulation/home" element={<StrategyFormulationHomePage />} />
      <Route path="/strategy-formulation/strategy-setup" element={<StrategySetupPage />} />
      <Route path="/strategy-formulation/change-requests" element={<ChangeRequestsPage />} />
      <Route path="/strategy-formulation/themes" element={<ThemesPage />} />
      <Route path="/strategy-formulation/alignment" element={<AlignmentSessionsPage />} />
      <Route path="/strategy-formulation/alignment/:id" element={<AlignmentSessionDetailPage />} />
      <Route path="/strategy-formulation/execution" element={<ExecutionTrackingPage />} />
      <Route path="/strategy-formulation/execution/:strategyId" element={<ExecutionStrategyPage />} />
      <Route path="/strategy-formulation/monitoring" element={<MonitoringPage />} />
      <Route path="/strategy-formulation/unassigned" element={<UnassignedItemsPage />} />
      <Route path="/strategy-formulation/new" element={<StrategyWizardPage />} />
      <Route path="/strategy-formulation/:id" element={<StrategyWizardPage />} />
      <Route path="/governance" element={<Navigate to="/governance/proposals" replace />} />
      <Route path="/governance/:tab" element={<GovernancePage />} />
      <Route path="/execution-monitoring" element={<Navigate to="/execution-monitoring/overview" replace />} />
      <Route path="/execution-monitoring/:tab" element={<ExecutionMonitoringPage />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
