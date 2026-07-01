const NOT_DETECTED = 'Not detected';

const fallbackData = {
  exportedAt: '2026-06-30T15:30:00.000Z',
  recordCount: 3,
  summary: {
    totalRecords: 3,
    salesNotes: 1,
    quoteRequests: 1,
    marketIntelligence: 1,
    highPriority: 3,
    quoteNeeded: 2,
    estimatedPipelineValue: '25000 MXN'
  },
  records: [
    {
      recordId: 'rec_sample_quote_1',
      recordType: 'Quote Request',
      createdAt: '2026-06-30T15:20:00.000Z',
      customer: 'Honeywell',
      contact: 'Carlos',
      mainIssueOrRequest: 'pneumatic valves',
      productOrServiceRequested: 'pneumatic valves',
      quantity: '20',
      deadlineOrUrgency: 'Friday',
      priorityScore: 10,
      priorityLevel: 'High',
      quoteNeeded: 'Yes',
      upsellOpportunity: 'Yes',
      estimatedPipelineValue: '25000 MXN',
      recommendedNextAction: 'Prepare quote for 20 pneumatic valves. Confirm specifications, sensors interest, and delivery deadline.',
      originalNote: 'Carlos from Honeywell needs a quote for 20 pneumatic valves. Budget maybe 25000 pesos. Needed by Friday. He also mentioned sensors.',
      signalType: NOT_DETECTED,
      regionOrMarket: NOT_DETECTED,
      suggestedOutboundAngle: NOT_DETECTED
    },
    {
      recordId: 'rec_sample_market_1',
      recordType: 'Market Intelligence',
      createdAt: '2026-06-30T15:22:00.000Z',
      customer: 'Bosch',
      contact: NOT_DETECTED,
      mainIssueOrRequest: 'automation support, sensors, controls, MRO',
      productOrServiceRequested: NOT_DETECTED,
      quantity: NOT_DETECTED,
      deadlineOrUrgency: NOT_DETECTED,
      priorityScore: 9,
      priorityLevel: 'High',
      quoteNeeded: 'No',
      upsellOpportunity: 'Yes',
      estimatedPipelineValue: NOT_DETECTED,
      recommendedNextAction: 'Research Bosch plant contacts and add a qualified contact to the outbound list.',
      originalNote: 'Bosch is expanding manufacturing capacity in Mexico and may need automation support for sensors, controls, and MRO.',
      signalType: 'Expansion',
      regionOrMarket: 'Mexico',
      suggestedOutboundAngle: 'Ask who manages automation purchasing or maintenance support for the expansion.'
    },
    {
      recordId: 'rec_sample_sales_1',
      recordType: 'Sales Note',
      createdAt: '2026-06-30T15:24:00.000Z',
      customer: NOT_DETECTED,
      contact: NOT_DETECTED,
      mainIssueOrRequest: 'replacement sensors and possible quote',
      productOrServiceRequested: NOT_DETECTED,
      quantity: NOT_DETECTED,
      deadlineOrUrgency: NOT_DETECTED,
      priorityScore: 7,
      priorityLevel: 'High',
      quoteNeeded: 'Yes',
      upsellOpportunity: 'Yes',
      estimatedPipelineValue: NOT_DETECTED,
      recommendedNextAction: 'Prepare quote for replacement sensors and possible quote. Ask about sensor models.',
      originalNote: 'Customer asked for replacement sensors and possible quote.',
      signalType: NOT_DETECTED,
      regionOrMarket: NOT_DETECTED,
      suggestedOutboundAngle: NOT_DETECTED
    }
  ]
};

let dashboardData = fallbackData;
let activeFilter = 'All';
let selectedRecordId = null;
let usingFallbackData = false;

const endpointByRecordType = {
  'sales-note': '/api/sales-note',
  'quote-request': '/api/quote-request',
  'market-signal': '/api/market-signal'
};

function valueOrFallback(value) {
  if (value === undefined || value === null || value === '' || value === 'unknown' || value === 'none') {
    return NOT_DETECTED;
  }

  return String(value);
}

function getSummary(data) {
  if (data.summary) {
    return data.summary;
  }

  const records = data.records || [];
  return {
    totalRecords: records.length,
    quoteRequests: records.filter((record) => record.recordType === 'Quote Request').length,
    marketIntelligence: records.filter((record) => record.recordType === 'Market Intelligence').length,
    highPriority: records.filter((record) => Number(record.priorityScore) >= 7).length,
    quoteNeeded: records.filter((record) => record.quoteNeeded === 'Yes').length,
    estimatedPipelineValue: NOT_DETECTED
  };
}

function getFilteredRecords() {
  const records = dashboardData.records || [];
  if (activeFilter === 'All') {
    return records;
  }

  return records.filter((record) => record.recordType === activeFilter);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = valueOrFallback(value);
  }
}

function renderKpis() {
  const summary = getSummary(dashboardData);

  setText('dataSourceLabel', usingFallbackData ? 'Fallback sample data' : 'Backend API');
  setText('exportedAt', dashboardData.exportedAt ? new Date(dashboardData.exportedAt).toLocaleString() : NOT_DETECTED);
  setText('kpiTotalRecords', summary.totalRecords);
  setText('kpiQuoteRequests', summary.quoteRequests);
  setText('kpiMarketSignals', summary.marketIntelligence);
  setText('kpiHighPriority', summary.highPriority);
  setText('kpiQuoteNeeded', summary.quoteNeeded);
  setText('kpiPipeline', summary.estimatedPipelineValue);
}

function createCell(content, className) {
  const cell = document.createElement('td');
  if (className) {
    cell.className = className;
  }
  cell.textContent = valueOrFallback(content);
  return cell;
}

function renderRecordsTable() {
  const tableBody = document.getElementById('recordsTableBody');
  const recordCountLabel = document.getElementById('recordCountLabel');
  const records = getFilteredRecords();

  tableBody.replaceChildren();
  recordCountLabel.textContent = `${records.length} record${records.length === 1 ? '' : 's'} shown`;

  if (!records.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'No records match this filter.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    renderDetail(null);
    return;
  }

  if (!records.some((record) => record.recordId === selectedRecordId)) {
    selectedRecordId = records[0].recordId;
  }

  records.forEach((record) => {
    const row = document.createElement('tr');
    row.dataset.recordId = record.recordId;
    if (record.recordId === selectedRecordId) {
      row.classList.add('active');
    }

    const typeCell = document.createElement('td');
    const typePill = document.createElement('span');
    typePill.className = 'type-pill';
    typePill.textContent = valueOrFallback(record.recordType);
    typeCell.appendChild(typePill);
    row.appendChild(typeCell);

    row.appendChild(createCell(record.customer));
    row.appendChild(createCell(record.contact));
    row.appendChild(createCell(record.mainIssueOrRequest));

    const priorityCell = document.createElement('td');
    const priorityPill = document.createElement('span');
    priorityPill.className = `priority-pill ${record.priorityLevel === 'High' ? 'high' : ''}`;
    priorityPill.textContent = `${valueOrFallback(record.priorityScore)}/10 ${valueOrFallback(record.priorityLevel)}`;
    priorityCell.appendChild(priorityPill);
    row.appendChild(priorityCell);

    row.appendChild(createCell(record.quoteNeeded));
    row.appendChild(createCell(record.estimatedPipelineValue));
    row.appendChild(createCell(record.recommendedNextAction, 'next-action-cell'));

    row.addEventListener('click', () => {
      selectedRecordId = record.recordId;
      renderRecordsTable();
      renderDetail(record);
    });

    tableBody.appendChild(row);
  });

  renderDetail(records.find((record) => record.recordId === selectedRecordId) || records[0]);
}

function getDetailRows(record) {
  return [
    ['Record Type', record.recordType],
    ['Customer / Target', record.customer],
    ['Contact', record.contact],
    ['Product / Service Requested', record.productOrServiceRequested],
    ['Quantity', record.quantity],
    ['Deadline / Urgency', record.deadlineOrUrgency],
    ['Possible Business Need', record.recordType === 'Market Intelligence' ? record.mainIssueOrRequest : NOT_DETECTED],
    ['Suggested Outbound Angle', record.suggestedOutboundAngle],
    ['Recommended Next Action', record.recommendedNextAction],
    ['Original Note', record.originalNote]
  ];
}

function renderDetail(record) {
  const detailList = document.getElementById('detailList');
  const selectedRecordLabel = document.getElementById('selectedRecordLabel');
  detailList.replaceChildren();

  if (!record) {
    selectedRecordLabel.textContent = 'No record selected';
    return;
  }

  selectedRecordLabel.textContent = `${valueOrFallback(record.recordType)} - ${valueOrFallback(record.customer)}`;

  getDetailRows(record).forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = valueOrFallback(value);
    wrapper.appendChild(term);
    wrapper.appendChild(description);
    detailList.appendChild(wrapper);
  });
}

function setupFilters() {
  document.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      selectedRecordId = null;

      document.querySelectorAll('.filter-button').forEach((item) => {
        item.classList.toggle('active', item === button);
      });

      renderRecordsTable();
    });
  });
}

function renderDashboard() {
  renderKpis();
  renderRecordsTable();
}

function setStatus(message) {
  setText('formStatus', message);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

async function refreshRecords() {
  const data = await fetchJson('/api/records', { cache: 'no-store' });
  dashboardData = data;
  usingFallbackData = false;
  renderDashboard();
}

async function submitRecord(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const recordType = form.recordType.value;
  const note = form.note.value.trim();
  const endpoint = endpointByRecordType[recordType];

  if (!note) {
    setStatus('Enter a note before adding a record.');
    return;
  }

  try {
    setStatus('Saving record...');
    await fetchJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    form.note.value = '';
    selectedRecordId = null;
    await refreshRecords();
    setStatus('Record saved.');
  } catch (error) {
    setStatus(error.message);
  }
}

async function resetDemoData() {
  try {
    setStatus('Resetting memory...');
    await fetchJson('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    selectedRecordId = null;
    await refreshRecords();
    setStatus('Memory reset.');
  } catch (error) {
    setStatus(error.message);
  }
}

function setupInputForm() {
  const form = document.getElementById('recordForm');
  const resetButton = document.getElementById('resetDemoButton');

  form.addEventListener('submit', submitRecord);
  resetButton.addEventListener('click', resetDemoData);
}

async function loadDashboardData() {
  try {
    await refreshRecords();
  } catch (apiError) {
    try {
      const response = await fetch('sample-records.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Could not load sample-records.json: ${response.status}`);
      }
      dashboardData = await response.json();
    } catch (sampleError) {
      dashboardData = fallbackData;
    }

    usingFallbackData = true;
    renderDashboard();
    setStatus('Backend unavailable. Showing sample data.');
  }
}

setupFilters();
setupInputForm();
loadDashboardData();
