/**
 * N-1: reachable by any admin session (trusted staff, not the public) but still no reason to let
 * an unbounded/malformed value sit in a table that's joined onto every customer row it's assigned
 * to. Same "reject junk before it's stored" treatment as storefront's `validateSavedLocationInput`.
 * Pure -- unit-tested.
 */
const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;

export function validateSalesRepInput(input: { name: string; phone: string; email: string }): string | null {
  if (typeof input.name !== 'string' || input.name.length === 0 || input.name.length > 100 || !NO_CONTROL_CHARS.test(input.name)) {
    return 'Please enter a valid name.';
  }
  if (typeof input.phone !== 'string' || input.phone.length === 0 || input.phone.length > 30 || !NO_CONTROL_CHARS.test(input.phone)) {
    return 'Please enter a valid phone number.';
  }
  if (typeof input.email !== 'string' || input.email.length === 0 || input.email.length > 254 || !NO_CONTROL_CHARS.test(input.email)) {
    return 'Please enter a valid email.';
  }
  return null;
}
