import { useMemo, useState } from 'react';
import { Card, CardHead, CardBody } from '@shared/components/Card/Card';
import { Button } from '@shared/components/Button/Button';
import { Badge } from '@shared/components/Badge/Badge';
import { DataTable, type Column } from '@shared/components/DataTable/DataTable';
import { EmptyState } from '@shared/components/EmptyState/EmptyState';
import { Loading } from '@shared/components/Loading/Loading';
import type { FinancialModel, OrgLinkInfo } from '../models/types';
import { getModelStatusInfo } from '../utils/modelStatus';

interface ModelsListTableProps {
  models: FinancialModel[];
  functionName: string;
  getResultKpiName: (model: FinancialModel) => string;
  getModelDefinition: (model: FinancialModel) => string;
  getOrgLinks: (model: FinancialModel) => OrgLinkInfo[];
  onModelClick: (model: FinancialModel) => void;
  onNewModel: () => void;
  isLoading?: boolean;
}

function TypePill({ type }: { type: string }) {
  return <span className="pill">{type}</span>;
}

function OrgLinkBadge({ links }: { links: OrgLinkInfo[] }) {
  if (links.length === 0) {
    return <span className="pill-red">no org link</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {links.map((link) => (
        <span key={`${link.kind}-${link.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span className="pill">{link.kind}</span>
          {link.name}
        </span>
      ))}
    </div>
  );
}

export function ModelsListTable({
  models,
  functionName,
  getResultKpiName,
  getModelDefinition,
  getOrgLinks,
  onModelClick,
  onNewModel,
  isLoading,
}: ModelsListTableProps) {
  const [query, setQuery] = useState('');
  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((model) => {
      const name = (model.pm_name || getResultKpiName(model)).toLowerCase();
      const result = getResultKpiName(model).toLowerCase();
      const definition = getModelDefinition(model).toLowerCase();
      const type = String(model.pm_modeltype || '').toLowerCase();
      const status = String(model.statusLabel || model.statuscode || '').toLowerCase();
      const links = getOrgLinks(model)
        .map((l) => `${l.kind} ${l.name}`)
        .join(' ')
        .toLowerCase();
      return (
        name.includes(q) ||
        result.includes(q) ||
        definition.includes(q) ||
        type.includes(q) ||
        status.includes(q) ||
        links.includes(q)
      );
    });
  }, [models, query, getResultKpiName, getModelDefinition, getOrgLinks]);

  const columns: Column<FinancialModel>[] = [
    { key: 'name', header: 'Name', render: (m) => m.pm_name || getResultKpiName(m) },
    { key: 'type', header: 'Type', render: (m) => <TypePill type={m.pm_modeltype || 'Equation'} /> },
    { key: 'definition', header: 'Definition', render: (m) => (
      <span title={getModelDefinition(m)} style={{ display: 'inline-block', maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {getModelDefinition(m)}
      </span>
    ) },
    { key: 'version', header: 'Ver', render: (m) => m.pm_version || '1.0' },
    { key: 'status', header: 'Status', render: (m) => {
      const { label, badge } = getModelStatusInfo(m);
      return <Badge status={badge}>{label}</Badge>;
    } },
    { key: 'orgLink', header: 'Org Link', render: (m) => <OrgLinkBadge links={getOrgLinks(m)} /> },
  ];

  return (
    <Card>
      <CardHead title={`Models — ${functionName}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            aria-label="Search models"
            style={{ width: 240, maxWidth: '40vw' }}
          />
          <Button variant="accent" onClick={onNewModel}>+ New Model</Button>
        </div>
      </CardHead>
      <CardBody>
        {isLoading ? (
          <Loading label="Loading models from Dataverse…" />
        ) : filteredModels.length === 0 ? (
          <EmptyState
            title={query.trim() ? 'No matches' : 'No models yet'}
            description={query.trim() ? 'No models match this search.' : 'Click "+ New Model" to create one.'}
          />
        ) : (
          <DataTable columns={columns} rows={filteredModels} rowKey={(m) => m.pm_modelid} onRowClick={onModelClick} />
        )}
      </CardBody>
    </Card>
  );
}
