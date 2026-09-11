import 'server-only';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

/**
 * Staff-only notes on a customer account or an individual order -- own table
 * (015-sales-reps-and-notes.sql), own admin-only RLS policy, never touched by any
 * storefront-facing query. Every function here requires an admin session (requireAdmin) on
 * top of the RLS policy itself -- defense in depth, same convention as every other
 * admin-only table in this codebase.
 */

function getServiceRoleClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type NoteEntityType = 'customer' | 'order';

export interface InternalNote {
  id: string;
  entityType: NoteEntityType;
  entityId: string;
  body: string;
  createdBy: string;
  createdAt: string;
}

function toInternalNote(row: any): InternalNote {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Newest first -- a log multiple staff contribute to over time, not a single shared
 * textarea one person could silently overwrite. */
export async function listNotes(entityType: NoteEntityType, entityId: string): Promise<InternalNote[]> {
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('internal_notes')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toInternalNote);
}

export async function createNote(entityType: NoteEntityType, entityId: string, body: string): Promise<InternalNote> {
  const admin = await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('internal_notes')
    .insert({ entity_type: entityType, entity_id: entityId, body, created_by: admin.email })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create note');
  return toInternalNote(data);
}

/** One query for however many customer ids are on the current page, rather than one query
 * per row -- backs the collapsed-row note-count badge (Visibility: staff shouldn't have to
 * expand every row to know notes exist). */
export async function listNoteCountsFor(entityType: NoteEntityType, entityIds: string[]): Promise<Map<string, number>> {
  if (entityIds.length === 0) return new Map();
  await requireAdmin();
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('internal_notes')
    .select('entity_id')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
  }
  return counts;
}
