const agent = require('./agent');
const { scoreOpportunity } = require('./core');
const memory = require('./memory');

const rawNotes = [
  'Carlos from Honeywell asked for pneumatic valves. Needs quote by Friday. Budget maybe 25000 pesos. He also mentioned sensors.',
  'Ana from Bimbo needs tubing and fittings for a packaging line. Follow up this week. Around 12000 pesos.',
  'Roberto from Cemex requested maintenance for a control cabinet. Quote needed tomorrow. Value 35000 MXN. Also asked about cabinet assembly.'
];

async function runOutcomeCommand() {
  const [, , command, recordId, outcome] = process.argv;
  if (command !== 'outcome') {
    return false;
  }

  const updated = memory.logOutcome(recordId, outcome);
  console.log(`Updated ${updated.id} to outcome "${updated.outcome}".`);
  return true;
}

async function runDemo() {
  memory.data.records = memory.data.records.filter(
    (record) => !rawNotes.includes(record.observation && record.observation.rawText)
  );
  memory.write();

  console.log('IACONSA Follow-Up + Upsell Memory Agent - Bet 1 Prototype\n');

  for (const rawNote of rawNotes) {
    const observation = await agent.observeSignal(rawNote);
    const scored = scoreOpportunity(observation, memory);
    const record = memory.addRecord({
      observation,
      recommendation: scored.nextAction,
      humanDecision: scored.priorityScore >= 7 ? 'pursued' : 'review'
    });

    console.log(`Company: ${observation.company}`);
    console.log(`Contact: ${observation.contact}`);
    console.log(`Need: ${observation.need}`);
    console.log(`Stage: ${observation.stage}`);
    console.log(`Estimated value: ${observation.estimatedValueMxn} MXN`);
    console.log(`Deadline: ${observation.deadline}`);
    console.log(`Upsell opportunity: ${observation.upsellOpportunity}`);
    console.log(`Priority score: ${scored.priorityScore}/10`);
    console.log(`Reasoning: ${scored.reasoning}`);
    console.log(`Risk: ${scored.risk}`);
    console.log(`Next action: ${scored.nextAction}`);
    console.log(`Saved memory record: ${record.id}\n`);
  }

  console.log(`Pending follow-ups: ${memory.getPendingFollowUps().length}`);
  console.log(`Quotes needed: ${memory.getQuoteNeeded().length}`);
  console.log(`Upsell opportunities: ${memory.getUpsellOpportunities().length}\n`);
  console.log('Manual later outcome update: node index.js outcome <recordId> <converted|no_response|rejected|pending>');
}

(async () => {
  const handledOutcomeCommand = await runOutcomeCommand();
  if (!handledOutcomeCommand) {
    await runDemo();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
