const { scoreOpportunity } = require('../core');

const NOT_DETECTED = 'Not detected';
const HIGH_PRIORITY_THRESHOLD = 7;

function detectedOrFallback(value) {
  const text = String(value || '').trim();
  if (!text || ['unknown', 'none'].includes(text.toLowerCase())) {
    return NOT_DETECTED;
  }

  return text;
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

function formatNextAction(nextAction) {
  return detectedOrFallback(nextAction)
    .replace(/\s+and ask about\s+/i, '. Ask about ')
    .replace(/\s+and qualify\s+/i, '. Qualify ');
}

function getCustomer(observation) {
  const company = String(observation && observation.company ? observation.company : '').trim();
  if (!company || ['unknown', 'customer'].includes(company.toLowerCase())) {
    return NOT_DETECTED;
  }

  return company;
}

function getContact(observation) {
  const contact = String(observation && observation.contact ? observation.contact : '').trim();
  if (!contact || contact.toLowerCase() === 'unknown') {
    return NOT_DETECTED;
  }

  return contact;
}

function formatPipelineValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return NOT_DETECTED;
  }

  return `${numericValue} MXN`;
}

function getRecordType(record) {
  if (record && record.recordType === 'market_intelligence') {
    return 'Market Intelligence';
  }
  if (record && record.recordType === 'quote_request') {
    return 'Quote Request';
  }

  return 'Sales Note';
}

function getPriorityFromMarketSignal(signal) {
  const priorityScore = Number(signal.priorityScore);
  if (!Number.isFinite(priorityScore)) {
    return 3;
  }

  return Math.max(0, Math.min(10, priorityScore));
}

function formatMarketRecord(record) {
  const signal = record && record.observation ? record.observation : {};
  const priorityScore = getPriorityFromMarketSignal(signal);

  return {
    recordId: detectedOrFallback(record && record.id),
    createdAt: detectedOrFallback(record && record.createdAt),
    recordType: 'Market Intelligence',
    customer: detectedOrFallback(signal.potentialTarget),
    contact: NOT_DETECTED,
    mainIssueOrRequest: detectedOrFallback(signal.possibleBusinessNeed),
    priorityScore,
    priorityLevel: getPriorityLevel(priorityScore),
    quoteNeeded: 'No',
    upsellOpportunity: detectedOrFallback(signal.signalType),
    estimatedPipelineValue: NOT_DETECTED,
    recommendedNextAction: detectedOrFallback(signal.recommendedNextAction),
    originalNote: detectedOrFallback(signal.originalNote || signal.rawText),
    potentialTarget: detectedOrFallback(signal.potentialTarget),
    signalType: detectedOrFallback(signal.signalType),
    regionOrMarket: detectedOrFallback(signal.regionMarket),
    possibleBusinessNeed: detectedOrFallback(signal.possibleBusinessNeed),
    suggestedOutboundAngle: detectedOrFallback(signal.suggestedOutboundAngle),
    productOrServiceRequested: NOT_DETECTED,
    quantity: NOT_DETECTED,
    deadlineUrgency: NOT_DETECTED,
    relatedUpsellOpportunity: NOT_DETECTED
  };
}

function getPriorityFromQuoteRequest(quoteRequest) {
  const priorityScore = Number(quoteRequest.priorityScore);
  if (!Number.isFinite(priorityScore)) {
    return 6;
  }

  return Math.max(0, Math.min(10, priorityScore));
}

function formatQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NOT_DETECTED;
  }

  return String(quantity);
}

function formatQuoteRequestRecord(record) {
  const quoteRequest = record && record.observation ? record.observation : {};
  const priorityScore = getPriorityFromQuoteRequest(quoteRequest);

  return {
    recordId: detectedOrFallback(record && record.id),
    createdAt: detectedOrFallback(record && record.createdAt),
    recordType: 'Quote Request',
    customer: getCustomer({ company: quoteRequest.customer }),
    contact: getContact(quoteRequest),
    mainIssueOrRequest: detectedOrFallback(quoteRequest.productOrServiceRequested),
    priorityScore,
    priorityLevel: getPriorityLevel(priorityScore),
    quoteNeeded: 'Yes',
    upsellOpportunity: detectedOrFallback(quoteRequest.relatedUpsellOpportunity),
    estimatedPipelineValue: formatPipelineValue(quoteRequest.estimatedValueMxn),
    recommendedNextAction: detectedOrFallback(quoteRequest.recommendedNextAction),
    originalNote: detectedOrFallback(quoteRequest.originalNote || quoteRequest.rawText),
    potentialTarget: NOT_DETECTED,
    signalType: NOT_DETECTED,
    regionOrMarket: NOT_DETECTED,
    possibleBusinessNeed: NOT_DETECTED,
    suggestedOutboundAngle: NOT_DETECTED,
    productOrServiceRequested: detectedOrFallback(quoteRequest.productOrServiceRequested),
    quantity: formatQuantity(quoteRequest.quantity),
    deadlineUrgency: detectedOrFallback(quoteRequest.deadlineUrgency),
    relatedUpsellOpportunity: detectedOrFallback(quoteRequest.relatedUpsellOpportunity)
  };
}

function formatBusinessRecord(record) {
  if (record && record.recordType === 'market_intelligence') {
    return formatMarketRecord(record);
  }
  if (record && record.recordType === 'quote_request') {
    return formatQuoteRequestRecord(record);
  }

  const observation = record && record.observation ? record.observation : {};
  const normalizedObservation = {
    ...observation,
    stage: observation.stage || 'unknown'
  };
  const scored = scoreOpportunity(normalizedObservation, {});

  return {
    recordId: detectedOrFallback(record && record.id),
    createdAt: detectedOrFallback(record && record.createdAt),
    recordType: getRecordType(record),
    customer: getCustomer(normalizedObservation),
    contact: getContact(normalizedObservation),
    mainIssueOrRequest: detectedOrFallback(normalizedObservation.need),
    priorityScore: scored.priorityScore,
    priorityLevel: getPriorityLevel(scored.priorityScore),
    quoteNeeded: yesNo(normalizedObservation.stage === 'quote_needed'),
    upsellOpportunity: detectedOrFallback(normalizedObservation.upsellOpportunity),
    estimatedPipelineValue: formatPipelineValue(normalizedObservation.estimatedValueMxn),
    recommendedNextAction: formatNextAction(scored.nextAction),
    originalNote: detectedOrFallback(normalizedObservation.rawText),
    potentialTarget: NOT_DETECTED,
    signalType: NOT_DETECTED,
    regionOrMarket: NOT_DETECTED,
    possibleBusinessNeed: NOT_DETECTED,
    suggestedOutboundAngle: NOT_DETECTED,
    productOrServiceRequested: NOT_DETECTED,
    quantity: NOT_DETECTED,
    deadlineUrgency: NOT_DETECTED,
    relatedUpsellOpportunity: NOT_DETECTED
  };
}

module.exports = {
  NOT_DETECTED,
  formatBusinessRecord,
  formatNextAction,
  getPriorityLevel,
  yesNo
};
