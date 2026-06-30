# Bet 1 Sales Agent

Small prototype for an industrial automation sales process.

Flow:

Sales note -> Agent -> Core -> Memory -> Next action

Run:

node index.js

Reset memory before demos or publishing:

node index.js reset

Add one sales note:

node index.js add "Carlos from Honeywell asked for pneumatic valves. Needs quote by Friday. Budget maybe 25000 pesos. He also mentioned sensors."

Add a quote request:

node index.js quote "Carlos from Honeywell needs a quote for 20 pneumatic valves. Budget maybe 25000 pesos. Needed by Friday. He also mentioned sensors."

Quote request records support IACONSA-style cotizaciones by capturing quote intake details and follow-up discipline: customer, contact, requested product or service, quantity, value, urgency, upsell opportunity, and next action. This is not a full pricing system yet.

Export saved sales memory:

node index.js export

CSV reports are saved to:

exports/sales-memory-export.csv
exports/sales-memory-export-YYYY-MM-DD-HHMM.csv

Export files are generated demo artifacts and are ignored by Git.

Inspect clean business records:

node index.js view

The business-record formatter converts raw memory records into a stable shape for terminal output, CSV export, and future UI work. It normalizes missing values, customer/contact fields, priority labels, quote flags, upsell fields, pipeline value, and next actions before any presentation layer uses the data.

Add a manual market intelligence note:

node index.js market "Bosch is expanding manufacturing capacity in Mexico and may need automation support for sensors, controls, and MRO."

Market intelligence records capture commercial signals such as expansion, nearshoring, plant investment, maintenance/MRO, automation needs, and supplier opportunities. This is manual-first commercial intelligence for the demo; it does not use Google News, GDELT, RSS, scraping, or external APIs yet.

Demo output:

The terminal summary separates processed sales notes, high-priority opportunities, quote-needed work, upsell opportunities, recommended next actions, and memory totals.

Current-run totals and total-memory totals are shown separately so demos are easier to explain after several notes have been saved.

This proves the small loop can turn rough sales notes into structured business memory without becoming a full product or replacing the main IACONSA proposal.

The CSV export proves the saved memory can become a simple Excel or Google Sheets report for a salesperson, manager, or owner to review follow-ups, quote needs, priorities, and opportunities.
