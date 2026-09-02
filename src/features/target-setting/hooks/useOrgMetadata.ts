import { useState, useEffect } from 'react';
import { DepartmentRef, FunctionRef, OrgMetadataService } from '../services/OrgMetadataService';

/** Department / Function catalogue for the context bar. Functions are re-fetched when departmentId changes. */
export const useOrgMetadata = (departmentId?: string) => {
  const [departments, setDepartments] = useState<DepartmentRef[]>([]);
  const [functions, setFunctions] = useState<FunctionRef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    OrgMetadataService.getDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    OrgMetadataService.getFunctions(departmentId)
      .then(fns => { if (mounted) setFunctions(fns); })
      .catch(() => { if (mounted) setFunctions([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [departmentId]);

  return { departments, functions, loading };
};
