const LLM_PROVIDER = 'openai';
const OPENAI_MODEL = 'gpt-4.1-mini';

async function observeSignal(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('observeSignal(rawText) requires a non-empty string.');
  }

  const timestamp = new Date().toISOString();

  if (LLM_PROVIDER === 'openai' && process.env.OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: 'system',
            content:
              'Extract one industrial automation sales follow-up observation from messy sales notes. Return only valid JSON with company, contact, need, stage, estimatedValueMxn, deadline, upsellOpportunity, and summary.'
          },
          {
            role: 'user',
            content: rawText
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'observation',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: [
                'company',
                'contact',
                'need',
                'stage',
                'estimatedValueMxn',
                'deadline',
                'upsellOpportunity',
                'summary'
              ],
              properties: {
                company: { type: 'string' },
                contact: { type: 'string' },
                need: { type: 'string' },
                stage: {
                  type: 'string',
                  enum: ['quote_needed', 'follow_up', 'proposal_sent', 'closed', 'unknown']
                },
                estimatedValueMxn: { type: 'number' },
                deadline: { type: 'string' },
                upsellOpportunity: { type: 'string' },
                summary: { type: 'string' }
              }
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    const parsed = JSON.parse(result.output_text);

    return {
      company: parsed.company || 'unknown',
      contact: parsed.contact || 'unknown',
      need: parsed.need || 'unknown',
      stage: parsed.stage || 'unknown',
      estimatedValueMxn: Number(parsed.estimatedValueMxn) || 0,
      deadline: parsed.deadline || 'none',
      upsellOpportunity: parsed.upsellOpportunity || 'none',
      summary: parsed.summary || rawText.slice(0, 180),
      rawText,
      timestamp
    };
  }

  const lowered = rawText.toLowerCase();
  const companyMatch =
    rawText.match(/\bfrom\s+([A-Z][A-Za-z0-9&.\- ]{2,50}?)(?=\s+(?:asked|needs|requested|wants|mentioned)\b|\.|,|$)/i) ||
    rawText.match(/\b([A-Z][A-Za-z0-9&.\- ]{2,50}?)(?=\s+(?:asked|needs|requested|wants)\b)/);
  const contactMatch =
    rawText.match(/^([A-Z][A-Za-z]+)\s+from\s+/) ||
    rawText.match(/\bcontact[:\s]+([A-Z][A-Za-z]+)/i);
  const needMatch =
    rawText.match(/\basked for\s+([^.\n]+?)(?:\.|,|$)/i) ||
    rawText.match(/\bneeds?\s+([^.\n]+?)(?:\s+by\b|\.|,|$)/i) ||
    rawText.match(/\brequested\s+([^.\n]+?)(?:\.|,|$)/i);
  const valueMatch = rawText.match(/(?:budget maybe|budget|value|approx|around)?\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:mxn|pesos?)/i);
  const deadlineMatch = rawText.match(/\b(by\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|this week|next week|next month)\b/i);
  const upsellTerms = ['sensors', 'installation', 'fittings', 'tubing', 'maintenance', 'cabinet assembly'];
  const upsellOpportunity = upsellTerms.find((term) => lowered.includes(term)) || 'none';
  const stage = lowered.includes('quote') || lowered.includes('cotizacion') || lowered.includes('cotización')
    ? 'quote_needed'
    : lowered.includes('proposal sent') || lowered.includes('proposal')
      ? 'proposal_sent'
      : lowered.includes('closed') || lowered.includes('won')
        ? 'closed'
        : 'follow_up';

  return {
    company: companyMatch ? companyMatch[1].trim() : 'unknown',
    contact: contactMatch ? contactMatch[1].trim() : 'unknown',
    need: needMatch ? needMatch[1].trim() : 'unknown',
    stage,
    estimatedValueMxn: valueMatch ? Number(valueMatch[1].replace(/,/g, '')) : 0,
    deadline: deadlineMatch ? deadlineMatch[2] || deadlineMatch[0] : 'none',
    upsellOpportunity,
    summary: rawText.length > 180 ? `${rawText.slice(0, 177)}...` : rawText,
    rawText,
    timestamp
  };
}

module.exports = { observeSignal };
