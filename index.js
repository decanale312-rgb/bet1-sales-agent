const agent = require('./agent');
const { scoreOpportunity } = require('./core');
const memory = require('./memory');

const rawNotes = [
  'Carlos from Honeywell asked for pneumatic valves. Needs quote by Friday. Budget maybe 25000 pesos. He also mentioned sensors.',
  'Ana from Bimbo needs tubing and fittings for a packaging line. Follow up this week. Around 12000 pesos.',
  'Roberto from Cemex requested maintenance for a control cabinet. Quote needed tomorrow. Value 35000 MXN. Also asked about cabinet assembly.'
];

const HIGH_PRIORITY_THRESHOLD = 7;
const WRAP_WIDTH = 86;

function formatSection(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function getPriorityLevel(priorityScore) {
  if (priorityScore >= HIGH_PRIORITY_THRESHOLD) {
    return 'High';
  }
  if (priorityScore >= 4) {
    return 'Medium';
  }
  return 'Low';
}

function shorten(text, maxLength = 120) {
  if (!text) {
    return 'none';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function wrapText(text, width = WRAP_WIDTH, indent = '') {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > width && currentLine) {
      lines.push(`${indent}${currentLine}`);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(`${indent}${currentLine}`);
  }

  return lines.length ? lines.join('\n') : `${indent}none`;
}

function formatNextAction(nextAction) {
  return String(nextAction || 'none')
    .replace(/\s+and ask about\s+/i, '. Ask about ')
    .replace(/\s+and qualify\s+/i, '. Qualify ');
}

function getCustomerName(observation) {
  const company = String(observation && observation.company ? observation.company : '').trim();
  if (!company || ['unknown', 'customer'].includes(company.toLowerCase())) {
    return 'Unknown / not detected';
  }

  return company;
}

function hasDetectedValue(record) {
  const value = Number(record.observation && record.observation.estimatedValueMxn);
  return Number.isFinite(value) && value > 0;
}

function formatPipelineValue(value, hasDetectedValues) {
  return hasDetectedValues ? `${value} MXN` : 'Not detected';
}

function getEstimatedPipelineValue(records) {
  return records.reduce((total, record) => {
    const value = Number(record.observation && record.observation.estimatedValueMxn);
    return Number.isFinite(value) && value > 0 ? total + value : total;
  }, 0);
}

function summarizeRecords(records) {
  const highPriority = records.filter(
    (record) => getScore(record).priorityScore >= HIGH_PRIORITY_THRESHOLD
  );
  const quoteNeeded = records.filter(
    (record) => record.observation.stage === 'quote_needed'
  );
  const upsellOpportunities = records.filter(
    (record) =>
      record.observation.upsellOpportunity &&
      record.observation.upsellOpportunity !== 'none'
  );

  return {
    highPriority,
    quoteNeeded,
    upsellOpportunities
  };
}

function getScore(record) {
  return record.scored || scoreOpportunity(record.observation, memory);
}

async function processSalesNote(rawNote) {
  const observation = await agent.observeSignal(rawNote);
  const scored = scoreOpportunity(observation, memory);
  const record = memory.addRecord({
    observation,
    recommendation: scored.nextAction,
    humanDecision: scored.priorityScore >= HIGH_PRIORITY_THRESHOLD ? 'pursued' : 'review'
  });

  return {
    observation,
    scored,
    record
  };
}

function printProcessedSalesNotes(processedRecords) {
  formatSection('Processed Sales Notes');

  processedRecords.forEach((item, index) => {
    const quoteNeeded = item.observation.stage === 'quote_needed';
    const hasUpsell =
      item.observation.upsellOpportunity &&
      item.observation.upsellOpportunity !== 'none';
    const nextAction = formatNextAction(item.scored.nextAction);

    console.log(`${index + 1}. Customer: ${getCustomerName(item.observation)}`);
    console.log(`   Request: ${item.observation.need}`);
    console.log(`   Priority: ${item.scored.priorityScore}/10 (${getPriorityLevel(item.scored.priorityScore)})`);
    console.log(`   Quote needed: ${yesNo(quoteNeeded)}`);
    console.log(`   Upsell opportunity: ${yesNo(hasUpsell)}`);
    console.log(`   Estimated pipeline value: ${formatPipelineValue(Number(item.observation.estimatedValueMxn), hasDetectedValue(item))}`);
    console.log('   Next action:');
    console.log(wrapText(nextAction, WRAP_WIDTH, '     '));
    console.log(`   Original note: ${shorten(item.observation.rawText)}`);
    console.log(`   Saved record id: ${item.record.id}`);
  });
}

function printRecordList(title, records, formatter) {
  formatSection(title);

  if (records.length === 0) {
    console.log('None in this run.');
    return;
  }

  records.forEach((item, index) => {
    console.log(`${index + 1}. ${formatter(item)}`);
  });
}

function printCurrentRunSummary(processedRecords) {
  const currentRun = summarizeRecords(processedRecords);
  const currentRunValue = getEstimatedPipelineValue(processedRecords);
  const hasValue = processedRecords.some(hasDetectedValue);

  formatSection('Current Run Summary');
  console.log(`Total processed in current run: ${processedRecords.length}`);
  console.log(`High-priority count in current run: ${currentRun.highPriority.length}`);
  console.log(`Quote-needed count in current run: ${currentRun.quoteNeeded.length}`);
  console.log(`Upsell-opportunity count in current run: ${currentRun.upsellOpportunities.length}`);
  console.log(`Estimated pipeline value in current run: ${formatPipelineValue(currentRunValue, hasValue)}`);
}

function printMemorySummary() {
  const memoryRecords = memory.data.records;
  const memorySummary = summarizeRecords(memoryRecords);
  const memoryValue = getEstimatedPipelineValue(memoryRecords);
  const hasValue = memoryRecords.some(hasDetectedValue);

  formatSection('Memory Summary');
  console.log(`Total records in memory: ${memoryRecords.length}`);
  console.log(`Total high-priority records in memory: ${memorySummary.highPriority.length}`);
  console.log(`Total quote-needed records in memory: ${memorySummary.quoteNeeded.length}`);
  console.log(`Total upsell-opportunity records in memory: ${memorySummary.upsellOpportunities.length}`);
  console.log(`Estimated pipeline value in memory: ${formatPipelineValue(memoryValue, hasValue)}`);
}

function printBusinessSummary(processedRecords) {
  const summary = summarizeRecords(processedRecords);

  console.log('Bet 1 Sales Agent - Demo Summary');
  console.log('Sales note -> Agent -> Core -> Memory -> Next action');

  printProcessedSalesNotes(processedRecords);
  printCurrentRunSummary(processedRecords);

  printRecordList(
    'High Priority Opportunities',
    summary.highPriority,
    (item) => `${getCustomerName(item.observation)}: ${getScore(item).priorityScore}/10`
  );

  printRecordList(
    'Quote Needed',
    summary.quoteNeeded,
    (item) => `${getCustomerName(item.observation)}: ${item.observation.need}`
  );

  printRecordList(
    'Upsell Opportunities',
    summary.upsellOpportunities,
    (item) => `${getCustomerName(item.observation)}: ${item.observation.upsellOpportunity}`
  );

  printRecordList(
    'Recommended Next Actions',
    processedRecords,
    (item) => `${getCustomerName(item.observation)}:\n${wrapText(formatNextAction(getScore(item).nextAction), WRAP_WIDTH, '   ')}`
  );

  printMemorySummary();
}

async function runOutcomeCommand() {
  const [, , command, recordId, outcome] = process.argv;
  if (command !== 'outcome') {
    return false;
  }

  const updated = memory.logOutcome(recordId, outcome);
  console.log(`Updated ${updated.id} to outcome "${updated.outcome}".`);
  return true;
}

async function runResetCommand() {
  const [, , command] = process.argv;
  if (command !== 'reset') {
    return false;
  }

  memory.reset();
  console.log('Memory reset.');
  return true;
}

async function runAddCommand() {
  const [, , command, ...noteParts] = process.argv;
  if (command !== 'add') {
    return false;
  }

  const rawNote = noteParts.join(' ').trim();
  if (!rawNote) {
    throw new Error('Usage: node index.js add "<sales note>"');
  }

  const processedRecord = await processSalesNote(rawNote);
  printBusinessSummary([processedRecord]);
  return true;
}

async function runDemo() {
  memory.data.records = memory.data.records.filter(
    (record) => !rawNotes.includes(record.observation && record.observation.rawText)
  );
  memory.write();

  const processedRecords = [];

  for (const rawNote of rawNotes) {
    processedRecords.push(await processSalesNote(rawNote));
  }

  printBusinessSummary(processedRecords);
  console.log('');
  console.log('Manual later outcome update: node index.js outcome <recordId> <converted|no_response|rejected|pending>');
}

(async () => {
  const handledResetCommand = await runResetCommand();
  const handledAddCommand = handledResetCommand || await runAddCommand();
  const handledOutcomeCommand = handledAddCommand || await runOutcomeCommand();
  if (!handledResetCommand && !handledAddCommand && !handledOutcomeCommand) {
    await runDemo();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
