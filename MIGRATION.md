# Vercel + Neon migration

Status: preparation only. The current Google Sheets journal remains authoritative.

## Architecture

- Vercel hosts the static dashboard and server-side API.
- Neon PostgreSQL stores revisioned journal records, audit history and a legacy
  All Data snapshot. The connection string is a Vercel server environment
  variable and must never be delivered to the browser.
- Neon managed authentication identifies the sole owner. Neon currently permits
  public signup, so every API request must verify the token and allow only the
  configured owner user ID before reading or writing. A newly signed-up user must
  receive no journal access.
- A save must check expected revisions and write all affected records and
  history in one PostgreSQL transaction. Reusing a transaction ID must return
  the prior result, never create a duplicate financial action.

## Migration sequence

1. Create a Neon project linked to the existing Vercel project. Use a separate
   database branch for development and enable Neon Auth.
2. Apply `db/001_journal.sql` on the development branch.
3. Implement authenticated API endpoints and replace the Sheets transport.
   Keep the current Google path available during verification.
4. Export TJ_ tables and All Data from a backed-up, private spreadsheet using
   a local-only export. Never put the export, tokens or credentials in Git.
5. Import into the development database. Check entity counts, all revisions,
   duplicate IDs, account totals and realized P&L against the current app.
6. Test opening, editing, partial closes, rolls, restore and IBKR import.
   Verify that an unauthenticated request cannot read or change anything.
7. Repeat the import on production, freeze Google edits briefly, compare final
   counts and totals, then switch the site. Keep the spreadsheet as a backup.
8. Schedule an independent database export and test restore. Neon Free's short
   restore window is not a substitute for a separate backup.

## Configuration

Required later: `DATABASE_URL`, Neon Auth endpoint and signing/JWKS
configuration, and a single allowed user ID. These values belong in Vercel
environment settings and local ignored `.env` files, never in committed code.

No live database, deployment or spreadsheet was changed by this preparation.
