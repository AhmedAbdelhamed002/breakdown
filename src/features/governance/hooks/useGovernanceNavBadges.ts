import { useEffect, useState } from 'react';
import { fetchConflictsFromDataverse, fetchProposalsFromDataverse } from '@features/financial';

export function useGovernanceNavBadges() {
  const [openProposals, setOpenProposals] = useState(0);
  const [openConflicts, setOpenConflicts] = useState(0);

  useEffect(() => {
    let alive = true;
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    Promise.all([fetchProposalsFromDataverse(), fetchConflictsFromDataverse()])
      .then(([proposals, conflicts]) => {
        if (!alive) return;
        setOpenProposals(proposals.filter((p) => p.statuscode === 'Active').length);
        setOpenConflicts(
          conflicts.filter(
            (c) => c.statuscode === 'Open' && c.pm_month === month && c.pm_year === year
          ).length
        );
      })
      .catch(() => {
        if (!alive) return;
        setOpenProposals(0);
        setOpenConflicts(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { openProposals, openConflicts };
}
