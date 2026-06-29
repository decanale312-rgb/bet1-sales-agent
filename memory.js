const fs = require('fs');
const path = require('path');

const MEMORY_PATH = path.join(__dirname, 'memory.json');
const FINAL_OUTCOMES = new Set(['converted', 'no_response', 'rejected']);
const VALID_OUTCOMES = new Set(['converted', 'no_response', 'rejected', 'pending']);

class Memory {
  constructor(filePath = MEMORY_PATH) {
    this.filePath = filePath;
    this.data = this.read();
  }

  read() {
    if (!fs.existsSync(this.filePath)) {
      return { records: [] };
    }

    const raw = fs.readFileSync(this.filePath, 'utf8');
    const cleaned = raw.replace(/^\uFEFF/, '');
    return cleaned.trim() ? JSON.parse(cleaned) : { records: [] };
  }

  write() {
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`);
  }

  addRecord({ observation, recommendation, humanDecision, outcome = 'pending' }) {
    if (!VALID_OUTCOMES.has(outcome)) {
      throw new Error(`Invalid outcome "${outcome}".`);
    }

    const record = {
      id: `rec_${Date.now()}_${this.data.records.length + 1}`,
      observation,
      recommendation,
      humanDecision,
      outcome,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.records.push(record);
    this.write();
    return record;
  }

  logOutcome(recordId, outcome) {
    if (!VALID_OUTCOMES.has(outcome)) {
      throw new Error(`Invalid outcome "${outcome}".`);
    }

    const record = this.data.records.find((item) => item.id === recordId);

    if (!record) {
      throw new Error(`No memory record found for id "${recordId}".`);
    }

    record.outcome = outcome;
    record.updatedAt = new Date().toISOString();
    this.write();
    return record;
  }

  getPendingFollowUps() {
    return this.data.records.filter((record) => record.outcome === 'pending');
  }

  getUpsellOpportunities() {
    return this.data.records.filter(
      (record) =>
        record.observation &&
        record.observation.upsellOpportunity &&
        record.observation.upsellOpportunity !== 'none'
    );
  }

  getQuoteNeeded() {
    return this.data.records.filter(
      (record) =>
        record.observation &&
        record.observation.stage === 'quote_needed'
    );
  }

  getConfidenceForSignalType(signalType) {
    const normalizedType = String(signalType || '').toLowerCase();

    const matchingRecords = this.data.records.filter(
      (record) =>
        record.observation &&
        String(record.observation.signalType || '').toLowerCase() === normalizedType
    );

    if (matchingRecords.length < 3) {
      return 0.5;
    }

    const finalRecords = matchingRecords.filter((record) =>
      FINAL_OUTCOMES.has(record.outcome)
    );

    if (finalRecords.length === 0) {
      return 0.5;
    }

    const converted = finalRecords.filter(
      (record) => record.outcome === 'converted'
    ).length;

    return converted / finalRecords.length;
  }
}

module.exports = new Memory();
module.exports.Memory = Memory;
