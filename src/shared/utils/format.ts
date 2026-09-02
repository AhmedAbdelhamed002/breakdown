export function formatCurrency(value: number, currency = "EGP"): string {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}
