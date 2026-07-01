const http = require('http');
const fs = require('fs');
const path = require('path');
const agent = require('./agent');
const { scoreOpportunity } = require('./core');
const { formatBusinessRecord, NOT_DETECTED } = require('./formatters/businessRecordFormatter');
const { observeMarketSignal } = require('./market');
const { observeQuoteRequest } = require('./quote');
const memory = require('./memory');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'dashboard');
const HIGH_PRIORITY_THRESHOLD = 7;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function getPipelineValueNumber(value) {
  const match = String(value || '').match(/^([\d,]+(?:\.\d+)?)\s+MXN$/i);
  return match ? Number(match[1].replace(/,/g, '')) : 0;
}

function getFormattedRecords() {
  return memory.data.records.map(formatBusinessRecord);
}

function getSummary(records) {
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

function getRecordsResponse() {
  const records = getFormattedRecords();
  return {
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    summary: getSummary(records),
    records
  };
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data, null, 2));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { ok: false, error: message });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    request.on('error', reject);
  });
}

function requireNote(body) {
  const note = String(body.note || '').trim();
  if (!note) {
    throw new Error('A non-empty note is required.');
  }

  return note;
}

async function addSalesNote(note) {
  const observation = await agent.observeSignal(note);
  const scored = scoreOpportunity(observation, memory);
  const record = memory.addRecord({
    recordType: 'sales_note',
    observation,
    recommendation: scored.nextAction,
    humanDecision: scored.priorityScore >= HIGH_PRIORITY_THRESHOLD ? 'pursued' : 'review'
  });

  return formatBusinessRecord(record);
}

function addQuoteRequest(note) {
  const quoteRequest = observeQuoteRequest(note);
  const record = memory.addRecord({
    recordType: 'quote_request',
    observation: quoteRequest,
    recommendation: quoteRequest.recommendedNextAction,
    humanDecision: quoteRequest.priorityScore >= HIGH_PRIORITY_THRESHOLD ? 'prepare_quote' : 'review'
  });

  return formatBusinessRecord(record);
}

function addMarketSignal(note) {
  const signal = observeMarketSignal(note);
  const record = memory.addRecord({
    recordType: 'market_intelligence',
    observation: signal,
    recommendation: signal.recommendedNextAction,
    humanDecision: signal.priorityScore >= HIGH_PRIORITY_THRESHOLD ? 'research' : 'monitor'
  });

  return formatBusinessRecord(record);
}

async function handleApiRequest(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/records') {
    sendJson(response, 200, getRecordsResponse());
    return;
  }

  if (request.method === 'POST' && pathname === '/api/reset') {
    memory.reset();
    sendJson(response, 200, { ok: true, message: 'Memory reset' });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/sales-note') {
    const body = await readRequestBody(request);
    const record = await addSalesNote(requireNote(body));
    sendJson(response, 200, { ok: true, record, summary: getSummary(getFormattedRecords()) });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/quote-request') {
    const body = await readRequestBody(request);
    const record = addQuoteRequest(requireNote(body));
    sendJson(response, 200, { ok: true, record, summary: getSummary(getFormattedRecords()) });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/market-signal') {
    const body = await readRequestBody(request);
    const record = addMarketSignal(requireNote(body));
    sendJson(response, 200, { ok: true, record, summary: getSummary(getFormattedRecords()) });
    return;
  }

  sendError(response, 404, 'API route not found.');
}

function serveStaticFile(response, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(requestPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(response, 403, 'Forbidden.');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendError(response, 404, 'File not found.');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream'
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApiRequest(request, response, url.pathname);
      return;
    }

    serveStaticFile(response, url.pathname);
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

server.listen(PORT, () => {
  console.log(`Bet 1 dashboard server running at http://localhost:${PORT}`);
});
