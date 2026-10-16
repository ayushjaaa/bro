// Split out of activity.ts (which is `server-only`) so client components can import the page
// size without pulling in the Supabase/admin-auth server code.
export const ACTIVITY_PAGE_SIZE = 50;
