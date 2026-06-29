const STAGE_SCORES = {
  quote_needed: 6,
  follow_up: 4,
  proposal_sent: 5,
  closed: 1,
  unknown: 3
};

function scoreOpportunity(observation, memory) {
  if (!observation || !observation.stage) {
    throw new Error('scoreOpportunity requires an observation with a stage.');
  }
  if (!memory) {
    throw new Error('scoreOpportunity requires a memory object.');
  }

  const stage = String(observation.stage || 'unknown').toLowerCase();
  let priorityScore = STAGE_SCORES[stage] ?? STAGE_SCORES.unknown;
  const reasons = [`stage "${stage}" starts at ${priorityScore}/10`];

  if (observation.deadline && observation.deadline !== 'none') {
    priorityScore += 2;
    reasons.push(`deadline "${observation.deadline}" adds urgency`);
  }

  if (Number(observation.estimatedValueMxn) >= 20000) {
    priorityScore += 1;
    reasons.push(`estimated value ${observation.estimatedValueMxn} MXN is meaningful`);
  }

  if (observation.upsellOpportunity && observation.upsellOpportunity !== 'none') {
    priorityScore += 1;
    reasons.push(`upsell opportunity "${observation.upsellOpportunity}" increases value`);
  }

  priorityScore = Math.max(0, Math.min(10, priorityScore));

  const risk = observation.deadline && observation.deadline !== 'none'
    ? 'Missing the stated deadline could delay or lose the quote.'
    : 'No clear deadline; risk is losing momentum if follow-up is delayed.';
  const upsellDetail = observation.upsellOpportunity === 'sensors'
    ? 'sensor models'
    : `${observation.upsellOpportunity} details`;

  const nextAction = stage === 'quote_needed'
    ? `Prepare quote for ${observation.need} and ask about ${observation.upsellOpportunity !== 'none' ? upsellDetail : 'missing technical details'}.`
    : observation.upsellOpportunity !== 'none'
      ? `Follow up with ${observation.contact} about ${observation.need} and qualify ${observation.upsellOpportunity}.`
      : `Follow up with ${observation.contact} about ${observation.need}.`;

  return {
    priorityScore,
    reasoning: `Rules used: ${reasons.join('; ')}.`,
    nextAction,
    risk
  };
}

module.exports = { scoreOpportunity };
