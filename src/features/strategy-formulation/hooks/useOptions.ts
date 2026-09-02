import { useEffect, useState } from "react";

/** Loads a reference-data picker's options whenever its dependencies change. */
export function useOptions<T>(loader: () => Promise<T[]>, deps: unknown[]): T[] {
  const [options, setOptions] = useState<T[]>([]);
  useEffect(() => {
    let cancelled = false;
    loader().then((result) => {
      if (!cancelled) setOptions(result);
    }).catch(() => {
      if (!cancelled) setOptions([]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return options;
}

export interface OptionsState<T> {
  data: T[];
  loading: boolean;
}

/**
 * Same as `useOptions`, but also exposes a `loading` flag — for callers that
 * need to tell "still loading" apart from "genuinely empty" (an empty-state
 * message like "nothing found" would otherwise flash on every load before
 * the real data arrives).
 */
export function useOptionsState<T>(loader: () => Promise<T[]>, deps: unknown[]): OptionsState<T> {
  const [state, setState] = useState<OptionsState<T>>({ data: [], loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    loader().then((result) => {
      if (!cancelled) setState({ data: result, loading: false });
    }).catch(() => {
      if (!cancelled) setState({ data: [], loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
