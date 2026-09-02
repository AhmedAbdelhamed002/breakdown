import { useState, useEffect } from 'react';
import { BusinessUnit, BusinessUnitService } from '../services/BusinessUnitService';

export function useBusinessUnits() {
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    BusinessUnitService.getAllBusinessUnits()
      .then(bus => {
        if (mounted) {
          setBusinessUnits(bus);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      });
      
    return () => { mounted = false; };
  }, []);

  return { businessUnits, loading, error };
}
