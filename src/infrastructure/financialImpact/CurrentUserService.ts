import { getContext } from '@microsoft/power-apps/app';
import { SystemusersService } from '@generated/services/SystemusersService';

/**
 * CurrentUserService — who is signed in, as a systemuser record.
 *
 * The platform gives the signed-in user's Entra identity (`getContext().user`), not a Dataverse
 * row. `systemuser.azureactivedirectoryobjectid` is the same Entra object id, so it joins the two;
 * the user principal name is tried as a fallback for a record whose Entra id isn't stamped.
 *
 * This is what stamps pm_raisedby on a conflict, so a reviewer can see who raised it.
 */

export interface CurrentUser {
  /** The systemuser record id — what a lookup binds to. */
  id: string;
  name: string;
}

/** Escape a single quote for an OData string literal. */
const escapeOData = (value: string) => value.replace(/'/g, "''");

export class CurrentUserService {
  /** Resolved once per session — the signed-in user doesn't change under the app. */
  private static cache?: Promise<CurrentUser | null>;

  /**
   * The signed-in user's systemuser record, or null when it can't be resolved — a lookup is
   * better left empty than bound to the wrong person.
   */
  public static get(): Promise<CurrentUser | null> {
    if (!this.cache) {
      this.cache = this.resolve();
      this.cache.catch(() => { this.cache = undefined; });
    }
    return this.cache;
  }

  private static async resolve(): Promise<CurrentUser | null> {
    let objectId: string | undefined;
    let principalName: string | undefined;
    let fullName: string | undefined;

    try {
      const context = await getContext();
      objectId = context.user?.objectId;
      principalName = context.user?.userPrincipalName;
      fullName = context.user?.fullName;
    } catch {
      return null;
    }

    const filters: string[] = [];
    if (objectId) filters.push(`azureactivedirectoryobjectid eq ${objectId}`);
    if (principalName) {
      const upn = escapeOData(principalName);
      filters.push(`domainname eq '${upn}'`);
      filters.push(`internalemailaddress eq '${upn}'`);
    }
    if (!filters.length) return null;

    try {
      const res = await SystemusersService.getAll({
        select: ['systemuserid', 'fullname', 'azureactivedirectoryobjectid', 'domainname'],
        // Any of the three identifies the same person; whichever the record carries wins.
        filter: `(${filters.join(' or ')}) and isdisabled eq false`,
        top: 5
      });
      const rows = res.data || [];
      // Prefer the Entra id match — a mailbox address can be shared, an object id can't.
      const match = rows.find(r => objectId && r.azureactivedirectoryobjectid === objectId) ?? rows[0];
      if (!match) return null;
      return { id: match.systemuserid, name: match.fullname || fullName || 'Unknown user' };
    } catch {
      return null;
    }
  }
}
