import { Pm_workingdaysesService } from '../../../generated/services/Pm_workingdaysesService';
import { Pm_workingdayses, Pm_workingdaysespm_month, Pm_workingdaysesstatecode } from '../../../generated/models/Pm_workingdaysesModel';
import { BusinessUnitService } from '../../../shared/services/BusinessUnitService';
import { WorkingDaysRecord } from '../models/WorkingDays';

export class WorkingDaysService {
  /**
   * Fetches all working days records and maps them to application models.
   */
  public static async getAllWorkingDays(): Promise<WorkingDaysRecord[]> {
    const [response, businessUnits] = await Promise.all([
      Pm_workingdaysesService.getAll(),
      BusinessUnitService.getAllBusinessUnits()
    ]);
    
    if (!response.success || !response.data) {
      throw new Error(response.error?.message ?? 'Failed to fetch working days');
    }

    return response.data.map((record: Pm_workingdayses) => {
      const appRecord = this.mapToAppModel(record);
      // Map name from our fetched BUs
      const bu = businessUnits.find(b => b.id === appRecord.businessUnitId);
      if (bu) {
        appRecord.businessUnitName = bu.name;
      }
      return appRecord;
    });
  }

  /**
   * Saves (creates or updates) a working days record for a specific BU, Year, and Month.
   */
  public static async saveWorkingDays(record: WorkingDaysRecord): Promise<WorkingDaysRecord> {
    // Check if one already exists to update, else create.
    // Assuming we do a client-side filter for simplicity since we fetched all, 
    // or we can fetch specifically.
    const all = await this.getAllWorkingDays();
    const existing = all.find(
      r => r.businessUnitId === record.businessUnitId && r.year === record.year && r.month === record.month
    );

    const dataverseRecord = {
      'pm_businessunit@odata.bind': `/businessunits(${record.businessUnitId})`,
      pm_year: record.year,
      pm_month: record.month as unknown as Pm_workingdaysespm_month,
      pm_workingdays: record.totalWorkingDays,
      pm_name: `WD - ${record.year}/${record.month}`,
      statecode: 0 as Pm_workingdaysesstatecode // Active
    };

    if (existing && existing.id) {
      // Update
      const response = await Pm_workingdaysesService.update(existing.id, dataverseRecord);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to update working days');
      }
      return this.mapToAppModel(response.data);
    } else {
      // Create
      const response = await Pm_workingdaysesService.create(dataverseRecord);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to create working days');
      }
      return this.mapToAppModel(response.data);
    }
  }

  /**
   * Deletes a working days record by ID.
   */
  public static async deleteWorkingDays(id: string): Promise<void> {
    await Pm_workingdaysesService.delete(id);
  }

  private static mapToAppModel(record: Pm_workingdayses): WorkingDaysRecord {
    return {
      id: record.pm_workingdaysid,
      businessUnitId: record._pm_businessunit_value || '',
      businessUnitName: record.pm_businessunitname || 'Unknown BU',
      month: record.pm_month as unknown as number,
      year: record.pm_year || 0,
      totalWorkingDays: record.pm_workingdays || 0,
      name: record.pm_name
    };
  }
}
