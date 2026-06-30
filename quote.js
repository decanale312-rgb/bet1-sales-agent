const UPSELL_TERMS = ['sensors', 'controls', 'installation', 'fittings', 'tubing', 'maintenance', 'MRO'];

function detectCustomer(rawText) {
  const match =
    rawText.match(/\bfrom\s+([A-Z][A-Za-z0-9&.\- ]{2,50}?)(?=\s+(?:needs|asked|requested|wants|mentioned)\b|\.|,|$)/i) ||
    rawText.match(/\b([A-Z][A-Za-z0-9&.\- ]{2,50}?)(?=\s+(?:needs|asked|requested|wants)\b)/);

  return match ? match[1].trim() : 'unknown';
}

function detectContact(rawText) {
  const match =
    rawText.match(/^([A-Z][A-Za-z]+)\s+from\s+/) ||
    rawText.match(/\bcontact[:\s]+([A-Z][A-Za-z]+)/i);

  return match ? match[1].trim() : 'unknown';
}

function detectQuantity(rawText) {
  const match =
    rawText.match(/\b(?:for\s+)?(\d+)\s+([A-Za-z][A-Za-z0-9\- ]{2,60}?)(?=\.|,|\s+budget|\s+needed|\s+by|$)/i) ||
    rawText.match(/\bqty[:\s]+(\d+)\b/i);

  return match ? Number(match[1]) : null;
}

function detectProductOrService(rawText) {
  const match =
    rawText.match(/\bquote\s+for\s+(?:\d+\s+)?([^.\n]+?)(?:\.|,|\s+budget|\s+needed|\s+by|$)/i) ||
    rawText.match(/\bneeds?\s+(?:a\s+)?quote\s+for\s+(?:\d+\s+)?([^.\n]+?)(?:\.|,|\s+budget|\s+needed|\s+by|$)/i) ||
    rawText.match(/\basked for\s+(?:a\s+)?quote\s+for\s+(?:\d+\s+)?([^.\n]+?)(?:\.|,|\s+budget|\s+needed|\s+by|$)/i);

  return match ? match[1].trim() : 'unknown';
}

function detectEstimatedValue(rawText) {
  const match = rawText.match(/(?:budget maybe|budget|value|estimated|around|approx)?\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:mxn|pesos?)/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function detectDeadline(rawText) {
  const match = rawText.match(/\b(?:needed\s+)?(?:by\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|this week|next week|next month)\b/i);
  return match ? match[1] : 'unknown';
}

function detectUpsell(rawText) {
  const lowered = rawText.toLowerCase();
  const term = UPSELL_TERMS.find((item) => lowered.includes(item.toLowerCase()));
  return term || 'unknown';
}

function scoreQuoteRequest(quoteRequest) {
  let priorityScore = 6;

  if (quoteRequest.deadlineUrgency !== 'unknown') {
    priorityScore += 2;
  }
  if (Number(quoteRequest.estimatedValueMxn) >= 20000) {
    priorityScore += 1;
  }
  if (quoteRequest.relatedUpsellOpportunity !== 'unknown') {
    priorityScore += 1;
  }

  return Math.max(0, Math.min(10, priorityScore));
}

function buildRecommendedNextAction(quoteRequest) {
  const quantityText = quoteRequest.quantity ? `${quoteRequest.quantity} ` : '';
  const productText = quoteRequest.productOrServiceRequested !== 'unknown'
    ? quoteRequest.productOrServiceRequested
    : 'the requested product or service';
  const upsellText = quoteRequest.relatedUpsellOpportunity !== 'unknown'
    ? `, ${quoteRequest.relatedUpsellOpportunity} interest`
    : '';

  return `Prepare quote for ${quantityText}${productText}. Confirm specifications${upsellText}, and delivery deadline.`;
}

function observeQuoteRequest(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('observeQuoteRequest(rawText) requires a non-empty string.');
  }

  const quoteRequest = {
    customer: detectCustomer(rawText),
    contact: detectContact(rawText),
    productOrServiceRequested: detectProductOrService(rawText),
    quantity: detectQuantity(rawText),
    estimatedValueMxn: detectEstimatedValue(rawText),
    deadlineUrgency: detectDeadline(rawText),
    relatedUpsellOpportunity: detectUpsell(rawText),
    originalNote: rawText,
    stage: 'quote_needed',
    timestamp: new Date().toISOString()
  };

  quoteRequest.priorityScore = scoreQuoteRequest(quoteRequest);
  quoteRequest.recommendedNextAction = buildRecommendedNextAction(quoteRequest);

  return quoteRequest;
}

module.exports = { observeQuoteRequest };
