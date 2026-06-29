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

Demo output:

The terminal summary separates processed sales notes, high-priority opportunities, quote-needed work, upsell opportunities, recommended next actions, and memory totals.

Current-run totals and total-memory totals are shown separately so demos are easier to explain after several notes have been saved.

This proves the small loop can turn rough sales notes into structured business memory without becoming a full product or replacing the main IACONSA proposal.
