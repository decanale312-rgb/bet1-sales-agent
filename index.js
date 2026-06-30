const fs = require('fs');
const path = require('path');
const agent = require('./agent');
const { scoreOpportunity } = require('./core');
const {
  NOT_DETECTED,
  formatBusinessRecord,
  formatNextAction,
  getPriorityLevel,
  yesNo
} = require('./formatters/businessRecordFormatter');
const { observeMarketSignal } = require('./market');
const { observeQuoteRequest } = require('./quote');
const memory = require('./memory');

const rawNotes = [
  'Carlos from Honeywell asked for pneumatic valves. Needs quote by Friday. Budget maybe 25000 pesos. He also mentioned sensors.',
  'Ana from Bimbo needs tubing and fittings for a packaging line. Follow up this week. Around 12000 pesos.',
  'Roberto from Cemex requested maintenance for a control cabinet. Quote needed tomorrow. Value 35000 MXN. Also asked about cabinet assembly.'
];

const HIGH_PRIORITY_THRESHOLD = 7;
const WRAP_WIDTH = 86;
const EXPORT_DIR = path.join(__dirname, 'exports');
const EXPORT_FILE = path.join(EXPORT_DIR, 'sales-memory-export.csv');
const JSON_EXPORT_FILE = path.join(EXPORT_DIR, 'sales-memory-export.json');

function formatSection(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
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

function getCustomerName(observation) {
  const customer = formatBusinessRecord({ observation }).customer;
  if (customer === NOT_DETECTED) {
    return 'Unknown / not detected';
  }

  return customer;
}

function hasDetectedValue(record) {
  const value = Number(record.observation && record.observation.estimatedValueMxn);
  return Number.isFinite(value) && value > 0;
}

function formatPipelineValue(value, hasDetectedValues) {
  return hasDetectedValues ? `${value} MXN` : 'Not detected';
}

function formatPipelineValueForRecord(record) {
  const value = Number(record.observation && record.observation.estimatedValueMxn);
  return formatPipelineValue(value, hasDetectedValue(record));
}

function getEstimatedPipelineValue(records) {
  return records.reduce((total, record) => {
    const value = Number(record.observation && record.observation.estimatedValueMxn);
    return Number.isFinite(value) && value > 0 ? total + value : total;
  }, 0);
}

function isMarketRecord(record) {
  return record && record.recordType === 'market_intelligence';
}

function isSalesRecord(record) {
  return !isMarketRecord(record);
}

function summarizeRecords(records) {
  const salesRecords = records.filter(isSalesRecord);
  const highPriority = records.filter(
    (record) => formatBusinessRecord(record).priorityScore >= HIGH_PRIORITY_THRESHOLD
  );
  const quoteNeeded = salesRecords.filter(
    (record) => record.observation.stage === 'quote_needed'
  );
  const upsellOpportunities = salesRecords.filter(
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
  if (isMarketRecord(record)) {
    const businessRecord = formatBusinessRecord(record);
    return {
      priorityScore: businessRecord.priorityScore,
      nextAction: businessRecord.recommendedNextAction
    };
  }

  return record.scored || scoreOpportunity(record.observation, memory);
}

function getTimestampForFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}-${hours}${minutes}`;
}

function csvEscape(value) {
  const text = value === undefined || value === null
    ? NOT_DETECTED
    : String(value).replace(/\r?\n|\r/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

function getCsvRows(records) {
  const headers = [
    'Record Type',
    'Record ID',
    'Created At',
    'Customer',
    'Contact',
    'Main Issue / Request',
    'Priority Score',
    'Priority Level',
    'Quote Needed',
    'Upsell Opportunity',
    'Estimated Pipeline Value',
    'Quantity',
    'Deadline / Urgency',
    'Recommended Next Action',
    'Original Note'
  ];

  const rows = records.map((record) => {
    const businessRecord = formatBusinessRecord(record);

    return [
      businessRecord.recordType,
      businessRecord.recordId,
      businessRecord.createdAt,
      businessRecord.customer,
      businessRecord.contact,
      businessRecord.mainIssueOrRequest,
      businessRecord.priorityScore,
      businessRecord.priorityLevel,
      businessRecord.quoteNeeded,
      businessRecord.upsellOpportunity,
      businessRecord.estimatedPipelineValue,
      businessRecord.quantity,
      businessRecord.deadlineUrgency,
      businessRecord.recommendedNextAction,
      businessRecord.originalNote
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
}

function exportMemoryToCsv() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const timestampedFile = path.join(
    EXPORT_DIR,
    `sales-memory-export-${getTimestampForFilename()}.csv`
  );
  const csv = `${getCsvRows(memory.data.records)}\r\n`;

  fs.writeFileSync(EXPORT_FILE, csv);
  fs.writeFileSync(timestampedFile, csv);

  return {
    mainFilePath: path.relative(__dirname, EXPORT_FILE).replace(/\\/g, '/'),
    timestampedFilePath: path.relative(__dirname, timestampedFile).replace(/\\/g, '/'),
    count: memory.data.records.length
  };
}

function getPipelineValueNumber(value) {
  const match = String(value || '').match(/^([\d,]+(?:\.\d+)?)\s+MXN$/i);
  return match ? Number(match[1].replace(/,/g, '')) : 0;
}

function getJsonSummary(records) {
  const totalPipelineValue = records.reduce(
    (total, record) => total + getPipelineValueNumber(record.estimatedPipelineValue),
    0
  );

  return {
    totalRecords: records.length,
    salesNotes: records.filter((record) => record.recordType === 'Sales Note').length,
    quoteRequests: records.filter((record) => record.recordType === 'Quote Request').length,
    marketIntelligence: records.filter((record) => record.recordType === 'Market Intelligence').length,
    highPriority: records.filter((record) => Number(record.priorityScore) >= HIGH_PRIORITY_THRESHOLD).length,
    quoteNeeded: records.filter((record) => record.quoteNeeded === 'Yes').length,
    estimatedPipelineValue: totalPipelineValue > 0 ? `${totalPipelineValue} MXN` : NOT_DETECTED
  };
}

function getJsonExportRecords(records) {
  return records.map((record) => ({
    recordId: record.recordId,
    recordType: record.recordType,
    createdAt: record.createdAt,
    customer: record.customer,
    contact: record.contact,
    mainIssueOrRequest: record.mainIssueOrRequest,
    productOrServiceRequested: record.productOrServiceRequested,
    quantity: record.quantity,
    deadlineOrUrgency: record.deadlineUrgency,
    priorityScore: record.priorityScore,
    priorityLevel: record.priorityLevel,
    quoteNeeded: record.quoteNeeded,
    upsellOpportunity: record.upsellOpportunity === NOT_DETECTED ? 'No' : 'Yes',
    estimatedPipelineValue: record.estimatedPipelineValue,
    recommendedNextAction: record.recommendedNextAction,
    originalNote: record.originalNote,
    signalType: record.signalType,
    regionOrMarket: record.regionOrMarket,
    suggestedOutboundAngle: record.suggestedOutboundAngle
  }));
}

function exportMemoryToJson() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const exportedAt = new Date().toISOString();
  const businessRecords = memory.data.records.map(formatBusinessRecord);
  const exportData = {
    exportedAt,
    recordCount: businessRecords.length,
    summary: getJsonSummary(businessRecords),
    records: getJsonExportRecords(businessRecords)
  };
  const timestampedFile = path.join(
    EXPORT_DIR,
    `sales-memory-export-${getTimestampForFilename()}.json`
  );
  const json = `${JSON.stringify(exportData, null, 2)}\n`;

  fs.writeFileSync(JSON_EXPORT_FILE, json);
  fs.writeFileSync(timestampedFile, json);

  return {
    mainFilePath: path.relative(__dirname, JSON_EXPORT_FILE).replace(/\\/g, '/'),
    timestampedFilePath: path.relative(__dirname, timestampedFile).replace(/\\/g, '/'),
    count: businessRecords.length
  };
}

async function processSalesNote(rawNote) {
  const observation = await agent.observeSignal(rawNote);
  const scored = scoreOpportunity(observation, memory);
  const record = memory.addRecord({
    recordType: 'sales_note',
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

function processMarketSignal(rawNote) {
  const signal = observeMarketSignal(rawNote);
  const record = memory.addRecord({
    recordType: 'market_intelligence',
    observation: signal,
    recommendation: signal.recommendedNextAction,
    humanDecision: signal.priorityScore >= HIGH_PRIORITY_THRESHOLD ? 'research' : 'monitor'
  });

  return {
    signal,
    record
  };
}

function processQuoteRequest(rawNote) {
  const quoteRequest = observeQuoteRequest(rawNote);
  const record = memory.addRecord({
    recordType: 'quote_request',
    observation: quoteRequest,
    recommendation: quoteRequest.recommendedNextAction,
    humanDecision: quoteRequest.priorityScore >= HIGH_PRIORITY_THRESHOLD ? 'prepare_quote' : 'review'
  });

  return {
    quoteRequest,
    record
  };
}

function printProcessedSalesNotes(processedRecords) {
  formatSection('Processed Sales Notes');

  processedRecords.forEach((item, index) => {
    const businessRecord = formatBusinessRecord(item.record);
    const customer = businessRecord.customer === NOT_DETECTED
      ? 'Unknown / not detected'
      : businessRecord.customer;

    console.log(`${index + 1}. Customer: ${customer}`);
    console.log(`   Request: ${businessRecord.mainIssueOrRequest}`);
    console.log(`   Priority: ${businessRecord.priorityScore}/10 (${businessRecord.priorityLevel})`);
    console.log(`   Quote needed: ${businessRecord.quoteNeeded}`);
    console.log(`   Upsell opportunity: ${businessRecord.upsellOpportunity === NOT_DETECTED ? 'No' : 'Yes'}`);
    console.log(`   Estimated pipeline value: ${businessRecord.estimatedPipelineValue}`);
    console.log('   Next action:');
    console.log(wrapText(businessRecord.recommendedNextAction, WRAP_WIDTH, '     '));
    console.log(`   Original note: ${shorten(businessRecord.originalNote)}`);
    console.log(`   Saved record id: ${businessRecord.recordId}`);
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

function printMarketSignalAdded(processedSignal) {
  const businessRecord = formatBusinessRecord(processedSignal.record);

  console.log('Bet 1 Sales Agent — Market Signal Added');
  console.log('');
  console.log(`Potential Target: ${businessRecord.potentialTarget}`);
  console.log(`Signal Type: ${businessRecord.signalType}`);
  console.log(`Region / Market: ${businessRecord.regionOrMarket}`);
  console.log(`Possible Business Need: ${businessRecord.possibleBusinessNeed}`);
  console.log(`Priority: ${businessRecord.priorityScore}/10 ${businessRecord.priorityLevel}`);
  console.log('Suggested Outbound Angle:');
  console.log(wrapText(businessRecord.suggestedOutboundAngle, WRAP_WIDTH, '  '));
  console.log('');
  console.log('Recommended Next Action:');
  console.log(wrapText(businessRecord.recommendedNextAction, WRAP_WIDTH, '  '));
  console.log('');
  console.log(`Saved record id: ${businessRecord.recordId}`);
}

function printQuoteRequestAdded(processedQuoteRequest) {
  const businessRecord = formatBusinessRecord(processedQuoteRequest.record);

  console.log('Bet 1 Sales Agent — Quote Request Added');
  console.log('');
  console.log(`Customer: ${businessRecord.customer}`);
  console.log(`Contact: ${businessRecord.contact}`);
  console.log(`Product / Service Requested: ${businessRecord.productOrServiceRequested}`);
  console.log(`Quantity: ${businessRecord.quantity}`);
  console.log(`Estimated Value: ${businessRecord.estimatedPipelineValue}`);
  console.log(`Deadline / Urgency: ${businessRecord.deadlineUrgency}`);
  console.log(`Related Upsell Opportunity: ${businessRecord.relatedUpsellOpportunity}`);
  console.log(`Priority: ${businessRecord.priorityScore}/10 ${businessRecord.priorityLevel}`);
  console.log('');
  console.log('Recommended Next Action:');
  console.log(wrapText(businessRecord.recommendedNextAction, WRAP_WIDTH, '  '));
  console.log('');
  console.log(`Saved record id: ${businessRecord.recordId}`);
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

async function runExportCommand() {
  const [, , command] = process.argv;
  if (command !== 'export') {
    return false;
  }

  const exported = exportMemoryToCsv();

  console.log('Bet 1 Sales Agent — Export Complete');
  console.log('');
  console.log('Main export:');
  console.log(exported.mainFilePath);
  console.log('');
  console.log('Timestamped copy:');
  console.log(exported.timestampedFilePath);
  console.log('');
  console.log('Records exported:');
  console.log(exported.count);
  console.log('');
  console.log('Business use:');
  console.log('This CSV can be opened in Excel or Google Sheets to review follow-ups, quote needs, priorities, and opportunities.');
  return true;
}

async function runJsonExportCommand() {
  const [, , command] = process.argv;
  if (command !== 'export:json') {
    return false;
  }

  const exported = exportMemoryToJson();

  console.log('Bet 1 Sales Agent — JSON Export Complete');
  console.log('');
  console.log('Main export:');
  console.log(exported.mainFilePath);
  console.log('');
  console.log('Timestamped copy:');
  console.log(exported.timestampedFilePath);
  console.log('');
  console.log('Records exported:');
  console.log(exported.count);
  console.log('');
  console.log('Business use:');
  console.log('This JSON gives the future dashboard a clean data source without reading raw memory records.');
  return true;
}

async function runMarketCommand() {
  const [, , command, ...noteParts] = process.argv;
  if (command !== 'market') {
    return false;
  }

  const rawNote = noteParts.join(' ').trim();
  if (!rawNote) {
    throw new Error('Usage: node index.js market "<market intelligence note>"');
  }

  const processedSignal = processMarketSignal(rawNote);
  printMarketSignalAdded(processedSignal);
  return true;
}

async function runQuoteCommand() {
  const [, , command, ...noteParts] = process.argv;
  if (command !== 'quote') {
    return false;
  }

  const rawNote = noteParts.join(' ').trim();
  if (!rawNote) {
    throw new Error('Usage: node index.js quote "<quote request note>"');
  }

  const processedQuoteRequest = processQuoteRequest(rawNote);
  printQuoteRequestAdded(processedQuoteRequest);
  return true;
}

async function runViewCommand() {
  const [, , command] = process.argv;
  if (command !== 'view') {
    return false;
  }

  const businessRecords = memory.data.records.map(formatBusinessRecord);

  console.log('Bet 1 Sales Agent - Clean Business Records');

  if (businessRecords.length === 0) {
    console.log('');
    console.log('No records in memory.');
    return true;
  }

  businessRecords.forEach((record, index) => {
    console.log('');
    console.log(`${index + 1}. Record Type: ${record.recordType}`);

    if (record.recordType === 'Market Intelligence') {
      console.log(`   Potential Target: ${record.potentialTarget}`);
      console.log(`   Signal Type: ${record.signalType}`);
      console.log(`   Region / Market: ${record.regionOrMarket}`);
      console.log(`   Possible Business Need: ${record.possibleBusinessNeed}`);
      console.log(`   Priority: ${record.priorityScore}/10 ${record.priorityLevel}`);
      console.log('   Suggested Outbound Angle:');
      console.log(wrapText(record.suggestedOutboundAngle, WRAP_WIDTH, '     '));
      console.log('   Recommended Next Action:');
      console.log(wrapText(record.recommendedNextAction, WRAP_WIDTH, '     '));
      console.log(`   Original Note: ${shorten(record.originalNote)}`);
      return;
    }

    if (record.recordType === 'Quote Request') {
      console.log(`   Customer: ${record.customer}`);
      console.log(`   Contact: ${record.contact}`);
      console.log(`   Product / Service Requested: ${record.productOrServiceRequested}`);
      console.log(`   Quantity: ${record.quantity}`);
      console.log(`   Estimated Value: ${record.estimatedPipelineValue}`);
      console.log(`   Deadline / Urgency: ${record.deadlineUrgency}`);
      console.log(`   Related Upsell Opportunity: ${record.relatedUpsellOpportunity}`);
      console.log(`   Priority: ${record.priorityScore}/10 ${record.priorityLevel}`);
      console.log('   Recommended Next Action:');
      console.log(wrapText(record.recommendedNextAction, WRAP_WIDTH, '     '));
      console.log(`   Original Note: ${shorten(record.originalNote)}`);
      return;
    }

    console.log(`   Customer: ${record.customer}`);
    console.log(`   Contact: ${record.contact}`);
    console.log(`   Main Issue / Request: ${record.mainIssueOrRequest}`);
    console.log(`   Priority: ${record.priorityScore}/10 ${record.priorityLevel}`);
    console.log(`   Quote Needed: ${record.quoteNeeded}`);
    console.log(`   Upsell Opportunity: ${record.upsellOpportunity === NOT_DETECTED ? 'No' : 'Yes'}`);
    console.log(`   Estimated Pipeline Value: ${record.estimatedPipelineValue}`);
    console.log('   Next Action:');
    console.log(wrapText(record.recommendedNextAction, WRAP_WIDTH, '     '));
    console.log(`   Original Note: ${shorten(record.originalNote)}`);
  });

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
  const handledJsonExportCommand = handledResetCommand || await runJsonExportCommand();
  const handledExportCommand = handledJsonExportCommand || await runExportCommand();
  const handledMarketCommand = handledExportCommand || await runMarketCommand();
  const handledQuoteCommand = handledMarketCommand || await runQuoteCommand();
  const handledViewCommand = handledQuoteCommand || await runViewCommand();
  const handledAddCommand = handledViewCommand || await runAddCommand();
  const handledOutcomeCommand = handledAddCommand || await runOutcomeCommand();
  if (!handledResetCommand && !handledJsonExportCommand && !handledExportCommand && !handledMarketCommand && !handledQuoteCommand && !handledViewCommand && !handledAddCommand && !handledOutcomeCommand) {
    await runDemo();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
