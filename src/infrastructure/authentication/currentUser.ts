import { getContext } from "@microsoft/power-apps/app";
import { SystemusersService } from "@generated/services/SystemusersService";
import { logger } from "../logging/logger";

declare global {
  interface Window {
    Xrm?: {
      Utility: {
        getGlobalContext: () => {
          userSettings: { userId: string };
        };
      };
    };
  }
}

/**
 * Resolves the signed-in Dataverse user's id via the Xrm global that the
 * Power Platform host injects at runtime (matches the pattern already
 * proven in the legacy Strategy Formulation web resource's own orgUrl()
 * check). Returns undefined outside the Power Platform host (e.g. plain
 * localhost during development without the Local Play frame).
 *
 * Kept alongside fetchCurrentUser() below — this one is synchronous and
 * good enough for stamping an id (CommentsPanel, TaskBreakdownDialog,
 * useWorkflowActions, ChangeRequestsPage, projectCharterService); the
 * async one resolves a full display identity (name/initials/title) for UI.
 */
export function getCurrentUserId(): string | undefined {
  const raw = window.Xrm?.Utility.getGlobalContext().userSettings.userId;
  return raw?.replace(/[{}]/g, "");
}

/**
 * The Code App-compatible way to get the signed-in user's id — `getCurrentUserId()` above only
 * reads `window.Xrm`, which classic Model-Driven App web resources get but a Code App's host never
 * injects, so it's always undefined here. Tries the (cheap, synchronous) Xrm path first in case this
 * ever runs embedded somewhere that does provide it, then falls back to the real Code App host
 * context via fetchCurrentUser() below.
 */
export async function resolveCurrentUserId(): Promise<string | undefined> {
  const sync = getCurrentUserId();
  if (sync) return sync;
  const user = await fetchCurrentUser();
  return user?.id || undefined;
}

export interface CurrentUser {
  id: string;
  fullName: string;
  initials: string;
  title?: string;
  email?: string;
  domainName?: string;
}

const USER_SELECT = [
  "systemuserid",
  "fullname",
  "firstname",
  "lastname",
  "jobtitle",
  "title",
  "internalemailaddress",
  "domainname",
  "azureactivedirectoryobjectid",
] as const;

function normalizeGuid(id: unknown): string {
  return String(id ?? "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .trim();
}

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function displayName(parts: Array<string | undefined>): string {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function unwrapRecord(res: unknown): Record<string, unknown> | null {
  if (!res || typeof res !== "object") return null;
  const root = res as Record<string, unknown>;
  const nested = [root.data, root.result, root.record, root.value, root];
  for (const candidate of nested) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const rec = candidate as Record<string, unknown>;
      if (rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)) {
        return rec.data as Record<string, unknown>;
      }
      return rec;
    }
  }
  return null;
}

function unwrapList(res: unknown): Record<string, unknown>[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  const root = res as Record<string, unknown>;
  const candidates = [root.data, root.result, root.value, root.entities, root];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
    if (candidate && typeof candidate === "object") {
      const inner = candidate as Record<string, unknown>;
      if (Array.isArray(inner.value)) return inner.value as Record<string, unknown>[];
      if (Array.isArray(inner.data)) return inner.data as Record<string, unknown>[];
    }
  }
  return [];
}

function mapSystemUser(record: Record<string, unknown>): CurrentUser | null {
  const id = normalizeGuid(record.systemuserid ?? record.SystemUserId ?? record.id);
  const fullName =
    stringField(record, "fullname", "FullName") ||
    displayName([stringField(record, "firstname"), stringField(record, "lastname")]);
  if (!id && !fullName) return null;
  const title = stringField(record, "jobtitle", "title") || undefined;
  return {
    id,
    fullName: fullName || "User",
    initials: initialsFromName(fullName || "User"),
    title,
    email: stringField(record, "internalemailaddress") || undefined,
    domainName: stringField(record, "domainname") || undefined,
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readXrmIdentity(): { systemUserId: string; fullName: string } {
  if (typeof window === "undefined") return { systemUserId: "", fullName: "" };
  try {
    const xrm = (window as { Xrm?: { Utility?: { getGlobalContext?: () => {
      userSettings?: { userId?: string; userName?: string };
      getUserId?: () => string;
      getUserName?: () => string;
    } } } }).Xrm;
    const ctx = xrm?.Utility?.getGlobalContext?.();
    if (!ctx) return { systemUserId: "", fullName: "" };
    return {
      systemUserId: normalizeGuid(ctx.userSettings?.userId ?? ctx.getUserId?.()),
      fullName: String(ctx.userSettings?.userName ?? ctx.getUserName?.() ?? "").trim(),
    };
  } catch {
    return { systemUserId: "", fullName: "" };
  }
}

async function readHostContext(): Promise<{
  objectId: string;
  upn: string;
  fullName: string;
  systemUserId: string;
}> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const ctx = await getContext();
      const objectId = normalizeGuid(ctx.user?.objectId);
      const upn = String(ctx.user?.userPrincipalName ?? "").trim();
      const fullName = String(ctx.user?.fullName ?? "").trim();
      if (objectId || upn || fullName) {
        return { objectId, upn, fullName, systemUserId: "" };
      }
    } catch (err) {
      logger.warn("Power Apps getContext failed", err);
    }
    if (attempt < 3) await delay(250 * (attempt + 1));
  }

  const xrm = readXrmIdentity();
  return { objectId: "", upn: "", fullName: xrm.fullName, systemUserId: xrm.systemUserId };
}

async function loadSystemUserById(id: string): Promise<CurrentUser | null> {
  if (!id || !isGuid(id)) return null;
  try {
    const res = await SystemusersService.get(id, { select: [...USER_SELECT] });
    const record = unwrapRecord(res);
    return record ? mapSystemUser(record) : null;
  } catch (err) {
    logger.warn("Could not load systemuser by id", err);
    return null;
  }
}

async function querySystemUsers(filter: string): Promise<CurrentUser | null> {
  try {
    const res = await SystemusersService.getAll({
      select: [...USER_SELECT],
      filter,
      top: 1,
    });
    const rows = unwrapList(res);
    if (rows.length === 0) return null;
    return mapSystemUser(rows[0]);
  } catch (err) {
    logger.warn("systemusers lookup failed", { filter, err });
    return null;
  }
}

async function loadSystemUser(identity: {
  objectId: string;
  upn: string;
  systemUserId: string;
}): Promise<CurrentUser | null> {
  if (identity.systemUserId) {
    const byId = await loadSystemUserById(identity.systemUserId);
    if (byId) return byId;
  }

  if (identity.objectId && isGuid(identity.objectId)) {
    const byAad = await querySystemUsers(
      `azureactivedirectoryobjectid eq ${identity.objectId} and isdisabled eq false`
    );
    if (byAad) return byAad;
  }

  if (identity.upn) {
    const escaped = escapeODataString(identity.upn);
    const byUpn = await querySystemUsers(
      `(domainname eq '${escaped}' or internalemailaddress eq '${escaped}') and isdisabled eq false`
    );
    if (byUpn) return byUpn;
  }

  return null;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const host = await readHostContext();
  const record = await loadSystemUser({
    objectId: host.objectId,
    upn: host.upn,
    systemUserId: host.systemUserId,
  });

  if (record) return record;

  if (!host.fullName && !host.upn) return null;

  const name = host.fullName || host.upn;
  return {
    id: host.systemUserId || host.objectId,
    fullName: name,
    initials: initialsFromName(name),
    email: host.upn || undefined,
  };
}
