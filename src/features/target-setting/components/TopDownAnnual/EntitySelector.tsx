import React from 'react';
import { BaseEntity } from '../../services/EntityService';
import { SearchableSelect } from '@shared/components/SearchableSelect';

type EntityKind = 'outcome' | 'output' | 'kpi';

interface EntitySelectorProps {
  entities: BaseEntity[];
  selectedEntity: BaseEntity | null;
  onSelect: (entity: BaseEntity | null) => void;
  /**
   * False until a Department and a Function are both chosen — the KPI picker stays empty and
   * disabled, since `entities` carries no KPI at all before that.
   */
  kpiScopeReady?: boolean;
  /** Extra detail under the picker — what the selected entity has on record for the year. */
  children?: React.ReactNode;
}

export const EntitySelector: React.FC<EntitySelectorProps> = ({
  entities, selectedEntity, onSelect, kpiScopeReady = true, children
}) => {
  const kinds: { value: EntityKind; label: string }[] = [
    { value: 'outcome', label: 'Org Outcome' },
    { value: 'output', label: 'Org Output' },
    { value: 'kpi', label: 'KPI' }
  ];

  /**
   * Which of the three kinds the picker is showing. Held here rather than derived from the
   * selection, so choosing KPI sticks even while the scope leaves the list empty.
   */
  const [kind, setKind] = React.useState<EntityKind>(selectedEntity?.kind || 'outcome');
  const filteredEntities = entities.filter(e => e.kind === kind);

  /** The KPI picker stays empty until a Department and a Function are both chosen. */
  const placeholder = kind !== 'kpi'
    ? 'Select an org entity…'
    : !kpiScopeReady
      ? 'Pick a Department and Function first…'
      : filteredEntities.length
        ? 'Select a KPI…'
        : 'No KPI for this Department and Function';

  // Switching kind drops the selection rather than carrying another kind's entity behind an empty
  // picker — the rest of the screen reads the selection, so the two have to agree.
  const handleKindChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setKind(e.target.value as EntityKind);
    if (selectedEntity) onSelect(null);
  };

  return (
    <div className="card-head between" style={{ alignItems: 'flex-start' }}>
      <div>
        <h3>Forecast target</h3>
        {children}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '300px' }}>
        <select value={kind} onChange={handleKindChange} className="input">
          {kinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <SearchableSelect
          options={filteredEntities.map(ent => ({ value: ent.id, label: ent.name, hint: ent.type }))}
          value={selectedEntity?.kind === kind ? selectedEntity.id : ''}
          onChange={id => { const ent = entities.find(x => x.id === id); if (ent) onSelect(ent); }}
          placeholder={placeholder}
          disabled={kind === 'kpi' && !kpiScopeReady}
        />
      </div>
    </div>
  );
};
