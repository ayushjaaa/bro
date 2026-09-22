/**
 * Q-3: no length caps existed on taxonomy (Category/Sub-category/Brand) name/description --
 * staff-only, and Shopify would eventually reject or truncate an absurd value anyway, but same
 * "reject junk before it's stored" treatment as N-1's sales-rep/note validation, for consistency.
 * Pure -- unit-tested.
 */
const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const NO_CONTROL_CHARS_EXCEPT_NEWLINE = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

export function validateTaxonomyEntryInput(input: { name: string; description?: string }): string | null {
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return 'Please enter a name.';
  }
  if (input.name.length > NAME_MAX_LENGTH) {
    return `Name is too long (max ${NAME_MAX_LENGTH} characters).`;
  }
  if (!NO_CONTROL_CHARS_EXCEPT_NEWLINE.test(input.name)) {
    return 'Name contains invalid characters.';
  }
  if (input.description !== undefined) {
    if (input.description.length > DESCRIPTION_MAX_LENGTH) {
      return `Description is too long (max ${DESCRIPTION_MAX_LENGTH} characters).`;
    }
    if (!NO_CONTROL_CHARS_EXCEPT_NEWLINE.test(input.description)) {
      return 'Description contains invalid characters.';
    }
  }
  return null;
}
