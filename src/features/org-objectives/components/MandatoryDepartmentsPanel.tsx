import { Link } from "react-router-dom";
import { Card, CardHead, CardBody } from "@shared/components/Card/Card";
import { Loading } from "@shared/components/Loading/Loading";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { Button } from "@shared/components/Button/Button";
import type { Objective } from "@features/strategy-formulation/models/objective";
import type { MandatoryDepartmentGroup } from "../hooks/useOrgOutcomeCascade";

interface Props {
  outputLabel: string;
  loading: boolean;
  groups: MandatoryDepartmentGroup[];
  existingObjective: Objective | null;
  existingObjectiveLoading: boolean;
  onCreateObjective: () => void;
}

export function MandatoryDepartmentsPanel({
  outputLabel,
  loading,
  groups,
  existingObjective,
  existingObjectiveLoading,
  onCreateObjective,
}: Props) {
  return (
    <Card>
      <CardHead title={`New Objective on "${outputLabel}"`} />
      <CardBody>
        {loading ? (
          <Loading label="Finding mandatory departments…" />
        ) : groups.length === 0 ? (
          <EmptyState
            title="No mandatory departments found"
            description="No Dept Output KPI is linked to this Org Output yet."
          />
        ) : (
          <>
            <div className="section-label" style={{ margin: "0 0 12px" }}>
              Mandatory departments (auto — own a Dept Output KPI linked to this Org Output)
            </div>
            {groups.map((group) => (
              <div key={group.departmentId} className="mandatory-dept-group">
                <div className="mandatory-dept-head">
                  <strong>{group.departmentName}</strong>
                </div>
                <ul className="mandatory-kpi-list">
                  {group.kpis.map((kpi) => (
                    <li key={kpi.id}>{kpi.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        <div style={{ marginTop: 16 }}>
          {existingObjectiveLoading ? (
            <Loading label="Checking for an existing objective…" />
          ) : existingObjective ? (
            <div className="alert alert-info">
              An Objective already exists for this Org Output — <strong>{existingObjective.title}</strong>
              {existingObjective.departmentName ? ` (Department: ${existingObjective.departmentName})` : ""}. Only one
              Objective is allowed per Org Output.{" "}
              <Link to="/strategy-formulation/tree">View in Strategy Tree</Link>
            </div>
          ) : (
            <Button variant="primary" onClick={onCreateObjective}>
              Create Objective
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
