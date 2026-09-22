/**
 * N-1: same "reject junk before it's stored" treatment as sales-reps' `validateSalesRepInput` --
 * a staff-only field, but still no reason to let an empty or unbounded value sit in a log every
 * staff member reads. Pure -- unit-tested.
 */
const NOTE_BODY_MAX_LENGTH = 5000;

export function validateNoteBody(body: string): string | null {
  if (typeof body !== 'string' || body.trim().length === 0) {
    return 'Note cannot be empty.';
  }
  if (body.length > NOTE_BODY_MAX_LENGTH) {
    return `Note is too long (max ${NOTE_BODY_MAX_LENGTH} characters).`;
  }
  return null;
}
