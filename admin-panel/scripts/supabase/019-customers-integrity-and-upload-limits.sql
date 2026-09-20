-- Integrity + upload hardening for registration. Run after 018.
--
-- 1) One application per person and per email. Before this, nothing stopped a double-click (or a
--    direct API call) from inserting the same customer twice -- verified live: a second insert for
--    the same user was accepted. The app's own "already applied" check is only check-then-insert
--    and races.
--    PRE-CHECK (must return zero rows for each, or the index creation below will fail):
--      select supabase_user_id, count(*) from customers group by 1 having count(*) > 1;
--      select lower(email), count(*) from customers group by 1 having count(*) > 1;
--    (Both were zero when this file was written.)
create unique index if not exists customers_supabase_user_id_key on customers (supabase_user_id);
create unique index if not exists customers_email_lower_key on customers (lower(email));

-- 2) The private `registration-documents` bucket had NO size limit and NO type restriction, so any
--    signed-in user could upload arbitrary files of any size straight to storage (the RLS policy
--    only pins the folder to their own user id). Match what the form actually accepts
--    (.jpeg .jpg .pdf .doc .docx .png).
update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'registration-documents';
