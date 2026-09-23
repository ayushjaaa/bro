-- Wishlist folder names: the app now enforces 1-100 characters (lib/wishlist-input.ts); this makes the
-- database refuse anything else too, even from a direct API call. `not valid` = existing rows are NOT
-- re-checked (so this can never fail on old data); every NEW or edited row is checked.
-- Safe to re-run.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wishlist_folders_name_length') then
    alter table public.wishlist_folders
      add constraint wishlist_folders_name_length check (char_length(name) between 1 and 100) not valid;
  end if;
end $$;

-- VERIFY (expect: 1 row): select conname from pg_constraint where conname = 'wishlist_folders_name_length';
