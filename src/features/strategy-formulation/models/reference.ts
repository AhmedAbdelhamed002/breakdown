/** Generic shape for simple id/label pickers (business unit, region, function, ...). */
export interface PickerOption {
  id: string;
  label: string;
}

export interface CategoryOption extends PickerOption {
  scope: number;
  strategyType?: number;
}

export interface ObjectiveDepartmentOption extends PickerOption {
  departmentId?: string;
  objectiveId?: string;
}
