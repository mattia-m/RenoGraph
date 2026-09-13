# Project walkthrough: changes, delivery and forecasts

Use a temporary demo data directory for a recording so the working project stays intact. Start with a valid license in an ignored `.env` or exported environment variable. Run `npm run verify`, then `npm run build` before exploring the workflows.

1. Open the same project in two browser tabs. Show the Live indicator and the baseline finish date.
2. Select Bathroom tiles. Expand the Wavebinder inspector: the selected option, delivery fact and availability are visible. Open the Bathroom room to show the structured material LIST.
3. Open Operations and create a purchase linked to Bathroom tiles. Mark it RECEIVED. Show delivery changing in both tabs, the room LIST updating and the forecast shifting. Explain the shared plumber edge when the remaining driving path changes; completed work is historical.
4. Use Undo to restore the pending delivery and its forecast together.
5. Select Bathroom tiles and **Update quote**. Explain that this is a reproducible local HTTP supplier fixture, loaded through a native Wavebinder GET, rather than a real supplier integration. Show the selected option changing to three days and €1,250 and the forecast updating.
6. Test outage. The baseline stays unchanged. Retry and show recovery. Change option while a quote is loading to demonstrate stale-result rejection.
7. Run a delay scenario. Inspect the captured scenario state and propagation details; switch back to baseline to show isolation. Change the baseline in the other tab and show the obsolete scenario clearing.
8. Expand a propagation event to connect its source and mutation ID to before/after values. Explain that the graph's runtime counts include actual registered nodes, while the diagnostic log retains only 100 events.

The supplier uses sample data. The narrated tour and this walkthrough cover the current application.
