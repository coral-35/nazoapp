export function normalizeAnswer(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}
