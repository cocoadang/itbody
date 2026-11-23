/** Keep the editable value as text; validate only when saving. */
export function parseSessionNumber(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
