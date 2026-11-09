# Private options trading journal

An English options journal on GitHub Pages, with private Google Sheets storage. Supports stock/ETF options, multiple USD accounts, package or individual-leg prices, open and historical closed trades, partial closes, manual marks, commissions, linked rolls, planning/review lists and revision history.

## First use — no manual column setup

1. Make a backup copy of your private spreadsheet in Google Sheets (File → Make a copy). Keep the working file restricted, not published.
2. Save your restricted Picker browser API key in Connection & import if needed, connect the dedicated Google account, and select your editable private spreadsheet.
3. Select the existing `All Data` worksheet. Its first row must have the existing journal headings (including Full name or Symbol, or your configured mapping). Original dates should be DD/MM/YY or DD/MM/YYYY.
4. Open **Trades → Set up journal tabs**. Enter the first account name and your commission per contract, then click **Create journal tabs**.
5. The app creates eight new worksheets in this same file. Existing worksheets stay untouched.

| Worksheet | Purpose |
|---|---|
| TJ_Accounts | Accounts and archive state |
| TJ_Trades | Trade metadata, plans, review, roll links and adopted legacy summaries |
| TJ_Legs | Option type, side, strike, expiry, ratio and multiplier |
| TJ_Actions | Execution events, fill quantities/prices and commissions |
| TJ_Quotes | Manually entered marks and observation times |
| TJ_Lists | Editable/archivable strategies, emotions and mistakes |
| TJ_Settings | Default account, legacy account/tab and fee rate |
| TJ_History | Before/after snapshots for every app save |

The TJ_ tables use `id, revision, change_id, updated_at, deleted, data` columns; data is a JSON record. **Use the dashboard to edit these tables.** Do not change their columns or delete/sort their rows. Changes append revisions rather than overwriting prior records.

## Enter and manage trades

Click **New trade**, choose an account (default preselected), and enter the name, underlying, date and structure.

- **One total strategy price** tracks whole packages. Enter debit/long or credit/short, the multiplier and contracts per package for commission calculation. Optional leg details describe the package; when present, their ratios determine commission contract count.
- **Individual leg prices** tracks separate legs. Add Call/Put, long/short, strike, expiry, ratio and multiplier per leg. Choose this mode if you may close individual legs. The accounting mode is fixed after the first execution; package prices are never silently allocated to individual legs.
- Planning/review fields are optional. Fill strategy, reason, target/loss limit, confidence, emotions, mistakes and notes as needed.
- Opening quantities, per-share prices and fees appear immediately. Advanced accounting and legs expand when needed; valid leg changes update the fills while preserving entered values for unchanged legs. For a historical closed trade, check the closed-trade option and enter its closing fills/date too.
- Click **Save trade** to write the trade and initial executions together. Nothing is saved before this click.

Use the unified **Trades** table with **Open / Closed / All**, text search, symbol/strategy filters and the global account filter. Statistics reflect the visible filters. Click a trade to open a side drawer; remaining positions, planning/review, legs and execution history are collapsible. Strategies use single-select tags; emotions and mistakes use multi-select tags. Positive P&L is green, negative is red, zero is neutral, and unavailable values remain distinct.

In **Overview**, click a cumulative P&L or drawdown point to open its corresponding closed trade. Strategy, trade-type, symbol and mistake chart items open a side drawer containing the exact account-filtered category members, count and net P&L. Category tick labels and mistake legend items also open results. Each row supports opening or editing a trade, with Back navigation to the result list. Saving refreshes the chart and group membership while remaining in Overview. Canvas keyboard navigation supports arrow keys, Home/End and Enter/Space.

Historical source summaries can be viewed through the same charts. Their first saved edit creates a revisioned managed summary, preserves the original row and prevents duplicate display; merely opening or cancelling does not write anything. No execution history is invented. Chart selection retains stable journal/source references independently of display names and ordering. Disconnect removes chart handlers and drawer state.

**Performance** uses the same editable drawers: period P&L, win-rate and trade-count points show the selected month/week; a stacked strategy segment selects that strategy within the period; time-used scatter points open the individual trade; DTE bars show the corresponding entry-DTE bucket. The time-used strategy legend lists only trades eligible for that graph. Result summaries include count, net P&L, win rate and average P&L. Saving recalculates membership and supports returning to the same selection without leaving Performance. Multi-dataset clicks and keyboard selection retain the dataset as well as point index.

Click an open trade for **Add execution**, **Update prices**, **Roll**, editing, history or deletion. Set a leg quantity to zero to skip it. Closings cannot exceed remaining quantities. Worthless expiry requires price zero. Exercise/assignment requires an option-only settlement price and a broker-evidence note; stock positions and later stock P&L are outside this version.

**Roll** is a two-step draft: old closing fills, then a new linked trade with opening fills. Both sides and history are saved in one Google request only at the final click. A partial roll can leave the original trade open.

Journal settings supports accounts/default account, legacy-account assignment, future commission defaults and list management. Captured labels and commission rates on old trades/actions are not rewritten when defaults change. All accounts use USD. The account filter applies to managed trades and existing analytics.

## Legacy history

All Data stays summarized; no fills are invented. **Manage summary** adopts a historical row into an editable journal summary without changing the original row or counting it twice. Deleting an adopted summary keeps its original row suppressed until restoration.

Use stable, unique `No.` values on historical rows. If absent, the app falls back to row numbers: rearranging those original rows can break adopted-summary links. Keep historical rows stable once adopted. Full reconstruction of legacy fills is not automatic.

### Approved IBKR history reconciliation

The connected **Import file** picker also accepts a private reconciliation JSON (`trading-journal-ibkr-reconciliation`, version 1). The file contains the broker CSV and reviewed allocations of its TradeIDs to historical source records. Choose the journal account, inspect the preview and click **Import ready executions**. No changes occur before confirmation.

Each group can replace several historical summaries with one position and can contain several option legs. Sources must match the loaded legacy tab uniquely. Full closed quantities, contract terms, execution IDs and the approved broker net result are validated before any write. Original summaries and annotations are retained on the managed trade; source rows stay untouched and are excluded from duplicate display. Actual `IBCommission` values are used, including zero commission at expiry, with no extra estimated fee.

Reimporting either the package or the ordinary annual CSV skips the recorded execution IDs. Changed signatures, partial existing allocations, missing opening history and unsupported settlement events require review. Held historical positions remain unchanged. Broker reports without an account identifier require explicit selection of the correct journal account. Reconciliation files contain private trading history and must never be committed to this public repository.

## Calculations

- Cash flow = quoted price × multiplier × quantity. Default multiplier is 100; adjusted contracts can use another value.
- Cost basis is **weighted average per package or per leg**. This journal methodology is not tax-lot accounting; do not use this as a tax report.
- Closing P&L includes allocated entry fees and closing fees. Unclosed entry fees stay with unrealized P&L. Future closing fees are not estimated.
- Monthly realized P&L includes partial closes on execution dates. Win rate counts a trade only after all its positions close; break-even is closed but not a win.
- Missing marks produce incomplete prices, not zero. Mark observation times are displayed; no live market prices are fetched.
- Dollar net P&L, return on allocated capital, return on maximum-risk basis and return relative to net opening premium are separate. Detail views display denominators. No averaging of unlike percentage bases into a portfolio return.
- Automatic risk is based on the **first opening**, for supported packages or same-expiry leg payoffs. Unlimited-loss short calls have no automatic risk denominator. Additional opening fills or uneven remaining leg balances require a manually reviewed risk basis. Position changes, exercise and assignment need review.
- Historical percentages retain their original legacy meaning. Missing new denominators stay blank.
- Time used is calendar days from the first opening to the final closing, divided by calendar days from opening to expiry, rounded to a percent and capped at 100%. Managed/imported trades derive this at render time; no reimport or data write is needed. Detailed legs must share one valid expiry. Missing/invalid dates, a closing before opening, and same-day expiry (no intraday timestamps in this calculation) are excluded rather than treated as zero; the performance chart reports coverage. A same-day exit before a later expiry is a valid 0% point.

## Integrity and privacy

Drafts, legacy rows and journal data stay in page memory. The restricted public Picker key is saved in localStorage. The short-lived Google access token, its original expiry and the chosen spreadsheet/worksheet are kept in sessionStorage for this tab, allowing reload to restore authorization and read fresh data from Google. No client secret, service-account key or refresh token is used. The app caps each authorization session at one hour, or Google's shorter lifetime, with a 30-second safety margin. Reload never extends that deadline; reconnect after expiry. Browser tab/session storage behavior applies; a new independent tab does not share this session. Blocked storage falls back to an in-memory connection and displays that limitation.

The visible **Disconnect** button clears both the in-memory and saved tab connection and loaded data. Expiry and HTTP 401 also discard it. File switches clear journal/chart data and close the editor; late requests cannot repopulate another file/session. Reload does not restore unsaved forms, selected import files or review previews. A reload restoration only reads Google data and never submits writes automatically.

Each save atomically appends entity revisions and history via Sheets batchUpdate. Literal stringValue cells prevent formula interpretation. Unknown reserved schemas stop setup without overwriting data. Lost responses are checked against history; an unconfirmed save blocks further writes until reload.

Preflight version checks prevent known stale edits. **Google Sheets does not provide a server-side conditional lock: use one editing window per trade.** Concurrent same-revision changes are retained and flagged for repair in History. This is not a multi-user transactional database.

Soft-deleted records remain in history. Restore appends another revision. Deleting/restoring an execution is validated against remaining positions; multiple dependent restorations may need an appropriate order.

New UI inserts user content as text nodes. Legacy dynamic HTML uses vendored DOMPurify. Previously published sheets, Git history/forks/caches and the other dashboard repository are **not** purged by this feature.

## Google configuration

Enable Google Sheets API and Google Picker API in the same project. Consent scope: only `drive.file`; add the dedicated account as a test user if in Testing. Web OAuth origin: `https://zacks2512.github.io`. This browser token flow uses no redirect URI/client secret.

Restrict the browser key to Google Picker API and website referrers `https://zacks2512.github.io/*` plus `https://docs.google.com/*`. Sheets calls use a temporary OAuth token, not that key. The existing drive.file grant supports writing to the explicitly selected file; no wider permission is requested.

## Development and verification

No build is needed for static hosting. Install development tools with npm install, then:

```
npm test
npm run test:ui
npx playwright install chromium
npm run test:browser
```

The DOM suite (`test:ui`) uses the real accounting/store with a mocked Sheets transport to check the shortened form, cash preview, tags, drawer sections, focused search, filters, actual commissions, detailed-leg fill preservation, edits and recycle-bin recovery. It does not verify browser layout, native dialog focus or OAuth. Optional `JOURNAL_JSDOM_MODULE` selects an external jsdom installation.

The browser suite isolates Google OAuth/Picker/Sheets with fixtures, never a user's account. Chart.js 4.4.1 renders actual charts in the test. Coverage includes setup preserving All Data, both price modes, partial/final closes, marks, multi-account/default/filter, legacy adoption, linked roll, soft delete/restore, monthly P&L, mobile layout, XSS and disconnect. Node tests cover accounting/risk, validation, revisions, stale writes and lost-response recovery. Final live Google write permission must be checked by the signed-in user.

Optional browser-test variables: JOURNAL_PLAYWRIGHT_MODULE, JOURNAL_BROWSER_EXECUTABLE, JOURNAL_BROWSER_ARGS (JSON array) and JOURNAL_CHART_JS.
