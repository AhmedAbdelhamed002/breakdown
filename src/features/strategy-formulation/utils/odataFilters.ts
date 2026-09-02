/** Builds an OR'd equality filter, e.g. orFilter("_stf_strategykpi_value", ["a","b"]) -> "_stf_strategykpi_value eq 'a' or _stf_strategykpi_value eq 'b'". */
export function orFilter(field: string, ids: string[]): string {
  return ids.map((id) => `${field} eq '${id}'`).join(" or ");
}
