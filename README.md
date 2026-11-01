# Trading Journal — private Google Sheets connection

Static dashboard hosted on GitHub Pages. No backend or client secret is required.

## This change

- Removes embedded trade records, the published CSV address and third-party CORS proxies from the current source.
- Requests only `https://www.googleapis.com/auth/drive.file` through Google Identity Services.
- Uses Google Picker to grant access to a spreadsheet explicitly selected by the user, then reads its worksheets through the Sheets API.
- Reads only: all sheet requests use GET. Adding/editing trades is not implemented in this milestone.
- Holds access tokens and loaded trades only in page memory. Clears data on disconnect, expired authorization, failed reload or worksheet switch. Ignores stale responses after disconnect or a newer read.
- Sanitizes dynamic HTML with vendored DOMPurify; keeps trade-row and detail interactions through delegated listeners.

## Google Cloud setup

1. Enable Google Sheets API and Google Picker API in the same project.
2. Set up an external OAuth consent screen, add the dedicated account as a test user, and add only `drive.file` under Data Access.
3. Create a Web OAuth client with `https://zacks2512.github.io` as its authorized JavaScript origin. No redirect URI or client secret is used by this token flow.
4. Create a browser API key restricted to Google Picker API, with website referrers `https://zacks2512.github.io/*` and `https://docs.google.com/*`.
5. Open Settings in the dashboard, paste that restricted browser key, and click Save key on this browser. This key identifies the browser app; it does not authorize private file access. No key is committed to the repository.
6. Click Connect Google, select the dedicated account, grant file access, then click Choose private sheet and select Trading Journal. Choose the worksheet if needed. The tab ID supplied during setup is preferred if it exists; no spreadsheet URL is embedded.

The first row must contain the existing journal column headings. Dates should be formatted as DD/MM/YY or DD/MM/YYYY. After adjusting column mapping in Settings, refresh the worksheet. This is a view of the existing journal, not a broker connection.

The page itself is public. Private data is fetched only with the signed-in user's temporary OAuth token. Anyone else opening the page sees no trades by default. Their own authorization would only allow files they can access and select.

## Exposure that must be handled separately

This change does not erase trade records from previous Git commits, forks, caches, or already downloaded copies. It also does not stop Google Sheets publication. Stop publishing the original sheet, check sharing on the dedicated copy, and plan a separate history cleanup before considering previous exposure resolved. No force-push/history rewrite is part of this PR.

## Validation

Run `node tests/connection.cjs` from the repository root. The test uses a simulated DOM and mocked Google responses to verify scope, GET requests, worksheet selection, empty data handling, expired access, and in-flight disconnect. Inline and standalone JavaScript pass Node syntax checks.

Live OAuth consent, real worksheet formatting, visual layout and chart rendering still require browser verification. A Playwright browser run was attempted during preparation but Chromium installation failed in the execution environment.

DOMPurify is vendored from the upstream Cure53 distribution with its license included under `vendor/`.
