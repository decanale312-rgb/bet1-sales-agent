const SIGNAL_TYPES = [
  {
    label: 'Expansion',
    terms: ['expanding', 'expansion', 'capacity', 'growth', 'new facility', 'new plant']
  },
  {
    label: 'Nearshoring',
    terms: ['nearshoring', 'reshoring', 'relocation', 'moving production']
  },
  {
    label: 'Plant investment',
    terms: ['investment', 'investing', 'plant', 'factory', 'manufacturing site']
  },
  {
    label: 'Maintenance / MRO',
    terms: ['maintenance', 'mro', 'repair', 'spares', 'replacement']
  },
  {
    label: 'Automation need',
    terms: ['automation', 'sensors', 'controls', 'plc', 'pneumatic', 'robotics']
  },
  {
    label: 'Supplier opportunity',
    terms: ['supplier', 'vendor', 'sourcing', 'procurement', 'supply chain']
  }
];

const REGION_TERMS = [
  'Mexico',
  'Monterrey',
  'Nuevo Leon',
  'Juarez',
  'Chihuahua',
  'Tijuana',
  'Queretaro',
  'Bajio',
  'Saltillo',
  'Coahuila',
  'Reynosa',
  'Matamoros',
  'Puebla',
  'San Luis Potosi'
];

const NEED_TERMS = [
  'automation support',
  'sensors',
  'controls',
  'MRO',
  'maintenance',
  'pneumatic valves',
  'spare parts',
  'cabinet assembly',
  'installation',
  'robotics',
  'PLC'
];

function includesTerm(text, term) {
  return text.toLowerCase().includes(term.toLowerCase());
}

function detectSignalType(rawText) {
  const match = SIGNAL_TYPES.find((signal) =>
    signal.terms.some((term) => includesTerm(rawText, term))
  );

  return match ? match.label : 'Unknown';
}

function detectPotentialTarget(rawText) {
  const match =
    rawText.match(/^([A-Z][A-Za-z0-9&.\- ]{2,50}?)(?=\s+(?:is|announced|plans|may|will|expands|expanding)\b)/) ||
    rawText.match(/\b([A-Z][A-Za-z0-9&.\- ]{2,50}?)(?=\s+(?:is expanding|announced|invested|opened)\b)/);

  return match ? match[1].trim() : 'unknown';
}

function detectRegion(rawText) {
  const region = REGION_TERMS.find((term) => includesTerm(rawText, term));
  return region || 'unknown';
}

function detectPossibleBusinessNeed(rawText) {
  const needs = NEED_TERMS.filter((term) => includesTerm(rawText, term));
  return needs.length ? needs.join(', ') : 'unknown';
}

function scoreMarketSignal({ signalType, potentialTarget, regionMarket, possibleBusinessNeed }) {
  let priorityScore = 3;

  if (signalType !== 'Unknown') {
    priorityScore += 2;
  }
  if (['Expansion', 'Nearshoring', 'Plant investment'].includes(signalType)) {
    priorityScore += 1;
  }
  if (potentialTarget !== 'unknown') {
    priorityScore += 1;
  }
  if (regionMarket !== 'unknown') {
    priorityScore += 1;
  }
  if (possibleBusinessNeed !== 'unknown') {
    priorityScore += 1;
  }

  return Math.max(0, Math.min(10, priorityScore));
}

function buildSuggestedOutboundAngle(signal) {
  if (signal.signalType === 'Expansion') {
    return 'Ask who manages automation purchasing or maintenance support for the expansion.';
  }
  if (signal.signalType === 'Nearshoring') {
    return 'Ask whether new Mexico operations need local automation, MRO, or controls support.';
  }
  if (signal.possibleBusinessNeed !== 'unknown') {
    return `Use the ${signal.possibleBusinessNeed} need as a reason for a practical first conversation.`;
  }

  return 'Qualify whether this signal creates an automation, maintenance, or supplier opportunity.';
}

function buildRecommendedNextAction(signal) {
  const target = signal.potentialTarget !== 'unknown' ? signal.potentialTarget : 'the target company';
  return `Research ${target} plant contacts and add a qualified contact to the outbound list.`;
}

function observeMarketSignal(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('observeMarketSignal(rawText) requires a non-empty string.');
  }

  const signal = {
    signalType: detectSignalType(rawText),
    potentialTarget: detectPotentialTarget(rawText),
    regionMarket: detectRegion(rawText),
    possibleBusinessNeed: detectPossibleBusinessNeed(rawText),
    originalNote: rawText,
    timestamp: new Date().toISOString()
  };

  signal.priorityScore = scoreMarketSignal(signal);
  signal.suggestedOutboundAngle = buildSuggestedOutboundAngle(signal);
  signal.recommendedNextAction = buildRecommendedNextAction(signal);

  return signal;
}

module.exports = { observeMarketSignal };
