import { Stf_themesService } from "@generated/services/Stf_themesService";
import { resultOrThrow } from "@infrastructure/dataverse/resultOrThrow";
import { toTheme, type Theme, type ThemeDraft } from "../models/theme";

export async function listThemes(): Promise<Theme[]> {
  const rows = resultOrThrow(await Stf_themesService.getAll({ orderBy: ["stf_name asc"] }), "List themes");
  return rows.map(toTheme);
}

export async function createTheme(draft: ThemeDraft): Promise<Theme> {
  const row = resultOrThrow(
    await Stf_themesService.create({
      statecode: 0,
      stf_name: draft.name,
      stf_description: draft.description,
      stf_year: draft.year,
    }),
    "Create theme"
  );
  return toTheme(row);
}

export async function updateTheme(id: string, draft: ThemeDraft): Promise<Theme> {
  const row = resultOrThrow(
    await Stf_themesService.update(id, {
      stf_name: draft.name,
      stf_description: draft.description,
      stf_year: draft.year,
    }),
    "Update theme"
  );
  return toTheme(row);
}
