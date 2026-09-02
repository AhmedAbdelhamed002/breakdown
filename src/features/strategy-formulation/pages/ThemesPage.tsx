import { useState } from "react";
import { Button } from "@shared/components/Button/Button";
import { DataTable, type Column } from "@shared/components/DataTable/DataTable";
import { Loading } from "@shared/components/Loading/Loading";
import { ErrorState } from "@shared/components/ErrorState/ErrorState";
import { EmptyState } from "@shared/components/EmptyState/EmptyState";
import { useThemes } from "../hooks/useThemes";
import { createTheme, updateTheme } from "../services/themeService";
import { ThemeDialog } from "../components/ThemeDialog";
import type { Theme, ThemeDraft } from "../models/theme";

export function ThemesPage() {
  const { data: themes, loading, error, reload } = useThemes();
  const [editing, setEditing] = useState<Theme | "new" | null>(null);

  const columns: Column<Theme>[] = [
    { key: "name", header: "Theme", render: (t) => t.name },
    { key: "description", header: "Description", render: (t) => t.description || "—" },
    { key: "region", header: "Region", render: (t) => t.regionName || "—" },
    { key: "year", header: "Year", render: (t) => t.year ?? "—" },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <Button size="sm" onClick={() => setEditing(t)}>
          Edit
        </Button>
      ),
    },
  ];

  async function handleSave(draft: ThemeDraft) {
    if (editing === "new") await createTheme(draft);
    else if (editing) await updateTheme(editing.id, draft);
    await reload();
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="card">
        <div className="card-head">
          <h3>Themes</h3>
          <div style={{ flex: 1 }} />
          <Button variant="primary" onClick={() => setEditing("new")}>
            + Create Theme
          </Button>
        </div>
        <div className="card-body">
          {loading ? (
            <Loading label="Loading themes…" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !themes || themes.length === 0 ? (
            <EmptyState title="No themes yet" description="Create the first strategic theme." />
          ) : (
            <DataTable columns={columns} rows={themes} rowKey={(t) => t.id} />
          )}
        </div>
      </div>
      {editing && <ThemeDialog existing={editing === "new" ? undefined : editing} onSave={handleSave} onClose={() => setEditing(null)} />}
    </div>
  );
}
