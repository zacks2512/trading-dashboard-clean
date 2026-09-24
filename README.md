# Trading Journal Dashboard

A static trading journal dashboard. It uses Chart.js and needs no build step. Open `index.html` in a browser, or host the folder on any static host, such as GitHub Pages.

## Structure

```
index.html            Page markup; loads the stylesheet and scripts below
css/styles.css        All styles
data/sample-data.js   Bundled trade data (RAW_DATA) loaded on startup
js/config.js          Column mapping defaults, shared state, chart colours
js/utils.js           Number/date/emotion helpers
js/settings.js        Settings tab: column mapping UI
js/data.js            CSV parsing, Google Sheets / file loading, JSON export
js/overview.js        Overview tab
js/emotions.js        Emotion Analysis tab (heatmap, insights, day of week)
js/confidence.js      Confidence Analysis tab
js/performance.js     Performance tab (periods, time efficiency, DTE, comparison)
js/goals.js           Goals tab
js/log.js             Trade Log tab (search, sort, filters, detail panel)
js/streak.js          Win/loss streak tracker (Overview)
js/app.js             renderAll(), tab switching, startup
```

The scripts are plain (non-module) scripts that share globals, so the page still works when opened directly from disk (`file://`). They load in the order listed in `index.html`, and `app.js` must stay last because it starts the app.
