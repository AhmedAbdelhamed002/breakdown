import { useNavigate } from "react-router-dom";

interface Tile {
  label: string;
  desc: string;
  to: string;
  icon: string;
  group: "utb";
}

const ICONS = {
  tree: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  align: '<path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="9"/>',
  exec: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  cr: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9 10h6M9 13h4"/>',
  themes: '<path d="M4 7h16M4 12h10M4 17h7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  unassigned: '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
};

// Flat — no Top Down Flow / Bottom-Up Flow split. One grid, every screen this module offers.
const TILES: Tile[] = [
  { label: "Strategy Tree", desc: "Browse the live Objective → Strategy hierarchy, by department coverage.", to: "/strategy-formulation/tree", icon: ICONS.tree, group: "utb" },
  { label: "Strategy List", desc: "Flat table of every strategy, sortable by status/track/department.", to: "/strategy-formulation/list", icon: ICONS.list, group: "utb" },
  { label: "Alignment Sessions", desc: "Strategy-linked alignment requests.", to: "/strategy-formulation/alignment", icon: ICONS.align, group: "utb" },
  { label: "Strategy Execution", desc: "Break Tactics/POCs down into tracked tasks.", to: "/strategy-formulation/execution", icon: ICONS.exec, group: "utb" },
  { label: "Change Requests", desc: "Cross-strategy change requests raised from Comments.", to: "/strategy-formulation/change-requests", icon: ICONS.cr, group: "utb" },
  { label: "Themes", desc: "Strategic themes objectives roll up into.", to: "/strategy-formulation/themes", icon: ICONS.themes, group: "utb" },
  { label: "Unassigned Tactics & POCs", desc: "Items with no Strategy-KPI link yet.", to: "/strategy-formulation/unassigned", icon: ICONS.unassigned, group: "utb" },
];

function Tile({ tile }: { tile: Tile }) {
  const navigate = useNavigate();
  return (
    <div className="card tile-card" style={{ cursor: "pointer", marginBottom: 0 }} onClick={() => navigate(tile.to)}>
      <div className="card-head">
        <div className={`tile-icon ${tile.group}`}>
          <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: tile.icon }} />
        </div>
        <div>
          <h3>{tile.label}</h3>
          <div className="sub">{tile.desc}</div>
        </div>
      </div>
      <div className="card-body">
        <div className="flex" style={{ justifyContent: "flex-end" }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              navigate(tile.to);
            }}
          >
            Open →
          </button>
        </div>
      </div>
    </div>
  );
}

export function StrategyFormulationHomePage() {
  return (
    <div style={{ padding: 24 }}>
      <div className="alert alert-info">Pick a starting point below.</div>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginTop: 22 }}>
        {TILES.map((t) => (
          <Tile key={t.to} tile={t} />
        ))}
      </div>
    </div>
  );
}
