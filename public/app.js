const flows = {
  delivery: {
    title: 'Entrega de ativo',
    description: 'Registre a saida de um ativo para uma pessoa ou local.',
    needsAsset: true,
    needsDestination: true,
  },
  'inventory-delivery': {
    title: 'Saida de toner e periferico',
    description: 'Registre a saida de toner ou periferico para uma pessoa ou local.',
    needsConsumable: true,
    needsDestination: true,
  },
  loan: {
    title: 'Emprestimo com devolucao',
    description: 'Empreste um ativo e grave a data esperada de retorno.',
    needsAsset: true,
    needsDestination: true,
    needsReturnDate: true,
  },
  'asset-create': {
    title: 'Criacao de ativo',
    description: 'Cadastre um novo ativo no Snipe-IT conforme o padrao do sistema.',
    needsAssetCreate: true,
  },
  receiving: {
    title: 'Recebimento de toner e perifericos',
    description: 'Atualize quantidade de toner/perifericos ou crie um novo item quando necessario.',
    needsConsumable: true,
  },
  'return-audit': {
    title: 'Devolucao e auditoria',
    description: 'Baixe a devolucao de material e registre a conferencia.',
    needsAsset: true,
    needsAudit: true,
  },
};

const printerProfiles = [
  {
    id: 'impressora-ti-01',
    name: 'Impressora TI 01',
    asset: 'Perfil configuravel',
    description: 'Mapa dos toners e perifericos utilizados nesta impressora.',
    items: [
      { name: 'Toner preto', detail: 'Cartucho principal', quantity: '2 em estoque', side: 'left', direction: 'Entrada', low: false },
      { name: 'Toner colorido', detail: 'Kit de cores', quantity: '1 em estoque', side: 'left', direction: 'Entrada', low: true },
      { name: 'Cabo de energia', detail: 'Conexao eletrica', quantity: 'Disponivel', side: 'right', direction: 'Saida', low: false },
      { name: 'Bandeja de papel', detail: 'Papel A4', quantity: 'Reposicao', side: 'right', direction: 'Saida', low: true },
    ],
  },
  {
    id: 'impressora-recepcao',
    name: 'Impressora Recepcao',
    asset: 'Perfil configuravel',
    description: 'Suprimentos ligados ao equipamento da recepcao.',
    items: [
      { name: 'Toner preto', detail: 'Cartucho principal', quantity: '3 em estoque', side: 'left', direction: 'Entrada', low: false },
      { name: 'Papel A4', detail: 'Resma de papel', quantity: '4 resmas', side: 'right', direction: 'Saida', low: false },
    ],
  },
];

const $ = (selector) => document.querySelector(selector);
const form = $('#recordForm');
const tabs = document.querySelectorAll('[data-flow]');
const loginView = $('#loginView');
const appView = $('#appView');
const adminView = $('#adminView');
const printerView = $('#printerView');
const topActions = $('#topActions');
const statusEl = $('#syncStatus');
const configPanel = $('#configPanel');
const passwordPanel = $('#passwordPanel');
const configMessage = $('#configMessage');
const snipeItUrlInput = $('#snipeItUrl');
const snipeItTokenInput = $('#snipeItToken');
const flowTitle = $('#flowTitle');
const flowDescription = $('#flowDescription');
const assetFields = $('#assetFields');
const consumableFields = $('#consumableFields');
const assetCreateFields = $('#assetCreateFields');
const destinationFields = $('#destinationFields');
const checkoutStatusWrap = $('#checkoutStatusWrap');
const checkinStatusWrap = $('#checkinStatusWrap');
const returnDateWrap = $('#returnDateWrap');
const auditLocationWrap = $('#auditLocationWrap');
const nextAuditWrap = $('#nextAuditWrap');
const locationNameWrap = $('#locationNameWrap');
const photoInput = $('#photoInput');
const photoPreview = $('#photoPreview');
const historyList = $('#historyList');
const historyTemplate = $('#historyTemplate');
const scannerModal = $('#scannerModal');
const scannerVideo = $('#scannerVideo');
const scannerMessage = $('#scannerMessage');
const manualScanValue = $('#manualScanValue');
const assetCurrentInfo = $('#assetCurrentInfo');
const newInventoryFields = $('#newInventoryFields');
const damagedPeripheralWrap = $('#damagedPeripheralWrap');
const damagedPeripheralHelp = $('#damagedPeripheralHelp');
const printerSelector = $('#printerSelector');
const printerTitle = $('#printerTitle');
const printerDescription = $('#printerDescription');
const printerModel = $('#printerModel');
const printerAsset = $('#printerAsset');
const printerItemsLeft = $('#printerItemsLeft');
const printerItemsRight = $('#printerItemsRight');

let activeFlow = 'delivery';
let photoData = '';
let scannerStream = null;
let scannerTimer = 0;
let zxingControls = null;
let scanTarget = 'asset';
let me = null;
let monthlyAssignmentsData = { month: '', rows: [], totalQuantity: 0 };
let replenishmentData = [];
let presets = {
  statusLabels: [],
  defaultCheckoutStatusId: 25,
  defaultCheckinStatusId: 2,
};

form.elements.date.value = new Date().toISOString().slice(0, 10);

$('#loginButton').addEventListener('click', login);
$('#logoutButton').addEventListener('click', logout);
$('#configToggle').addEventListener('click', () => configPanel.classList.toggle('hidden'));
$('#adminToggle').addEventListener('click', showAdmin);
$('#backToApp').addEventListener('click', showApp);
$('#saveConfig').addEventListener('click', saveConfig);
$('#testConnection').addEventListener('click', testConnection);
$('#changePassword').addEventListener('click', changePassword);
$('#printersToggle').addEventListener('click', showPrinters);
$('#backFromPrinters').addEventListener('click', showApp);
printerSelector.addEventListener('change', renderPrinterProfile);
$('#passwordToggle').addEventListener('click', () => passwordPanel.classList.toggle('hidden'));
$('#refreshHistory').addEventListener('click', loadHistory);
$('#createUser').addEventListener('click', createUser);
$('#viewOverdueAdmin').addEventListener('click', showAdmin);
$('#monthlyAssignmentsMonth').addEventListener('change', loadMonthlyAssignments);
$('#exportMonthlyAssignments').addEventListener('click', exportMonthlyAssignments);
$('#clearMonthlyAssignments').addEventListener('click', clearMonthlyAssignments);
$('#refreshReplenishment').addEventListener('click', loadReplenishment);
['Item', 'Recipient', 'CostCenter', 'Type'].forEach((name) => {
  $(`#monthlyAssignments${name}Filter`).addEventListener('input', renderMonthlyAssignments);
});
$('#monthlyAssignmentsBody').addEventListener('change', updateMonthlyPurchase);
$('#closeScanner').addEventListener('click', stopScanner);
$('#applyManualScan').addEventListener('click', () => applyScannedValue(manualScanValue.value));
document.querySelectorAll('[data-scan-target]').forEach((button) => {
  button.addEventListener('click', () => startScanner(button.dataset.scanTarget));
});

tabs.forEach((button) => button.addEventListener('click', () => setFlow(button.dataset.flow)));

form.elements.createLocation.addEventListener('change', () => {
  locationNameWrap.classList.toggle('hidden', !form.elements.createLocation.checked);
});

form.elements.createInventoryItem.addEventListener('change', () => {
  updateInventoryCreateMode();
});

photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  photoData = await resizeImage(file);
  photoPreview.src = photoData;
  photoPreview.classList.remove('hidden');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('.submit');
  submit.disabled = true;
  submit.textContent = 'Registrando...';

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.flow = activeFlow;
    payload.flowLabel = flows[activeFlow].title;
    payload.createLocation = form.elements.createLocation.checked;
    payload.createInventoryItem = form.elements.createInventoryItem.checked;
    payload.photoData = photoData;

    const response = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    form.reset();
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    photoData = '';
    photoPreview.classList.add('hidden');
    setFlow(activeFlow);
    await loadHistory();
    alert(response.term ? 'Registro salvo e termo gerado.' : 'Registro salvo.');
  } catch (error) {
    alert(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Registrar no Snipe-IT';
  }
});

setupSearch({
  input: $('#assetSearch'),
  results: $('#assetResults'),
  getType: () => 'hardware',
  onSelect: (item) => {
    form.elements.assetId.value = item.id || '';
    form.elements.assetTag.value = item.assetTag || '';
    showAssetCurrentInfo(item);
  },
});

setupSearch({
  input: $('#consumableSearch'),
  results: $('#consumableResults'),
  getType: () => form.elements.inventoryType.value,
  onSelect: (item) => {
    form.elements.inventoryItemId.value = item.id || '';
  },
});

form.elements.inventoryType.addEventListener('change', () => {
  $('#consumableSearch').value = '';
  form.elements.inventoryItemId.value = '';
  updateInventoryCreateMode();
  updateDamagedPeripheralVisibility();
});

form.elements.damagedPeripheral.addEventListener('change', updateDamagedPeripheralVisibility);


setupSearch({
  input: $('#destinationSearch'),
  results: $('#destinationResults'),
  getType: () => form.elements.destinationType.value === 'location' ? 'locations' : 'users',
  onSelect: (item) => {
    form.elements.destinationId.value = item.id || '';
    form.elements.destinationName.value = formatResultLabel(item);
  },
});

setupSearch({
  input: $('#auditLocationSearch'),
  results: $('#auditLocationResults'),
  getType: () => 'locations',
  onSelect: (item) => {
    form.elements.auditLocationId.value = item.id || '';
  },
});

setupSearch({
  input: $('#newAssetLocationSearch'),
  results: $('#newAssetLocationResults'),
  getType: () => 'locations',
  onSelect: (item) => {
    form.elements.newAssetLocationId.value = item.id || '';
  },
});

function setFlow(flow) {
  activeFlow = flow;
  const config = flows[flow];
  tabs.forEach((button) => button.classList.toggle('active', button.dataset.flow === flow));
  flowTitle.textContent = config.title;
  flowDescription.textContent = config.description;
  assetFields.classList.toggle('hidden', !config.needsAsset);
  consumableFields.classList.toggle('hidden', !config.needsConsumable);
  assetCreateFields.classList.toggle('hidden', !config.needsAssetCreate);
  destinationFields.classList.toggle('hidden', !config.needsDestination);
  checkoutStatusWrap.classList.toggle('hidden', !(flow === 'delivery' || flow === 'loan'));
  checkinStatusWrap.classList.toggle('hidden', flow !== 'return-audit');
  returnDateWrap.classList.toggle('hidden', !config.needsReturnDate);
  auditLocationWrap.classList.toggle('hidden', !config.needsAudit);
  nextAuditWrap.classList.toggle('hidden', !config.needsAudit);
  assetCurrentInfo.classList.add('hidden');
  updateInventoryCreateMode();
  updateDamagedPeripheralVisibility();
}

function showPrinters() {
  appView.classList.add('hidden');
  adminView.classList.add('hidden');
  printerView.classList.remove('hidden');
  printerSelector.innerHTML = printerProfiles.map((printer) => `<option value="${escapeHtml(printer.id)}">${escapeHtml(printer.name)}</option>`).join('');
  renderPrinterProfile();
}

function renderPrinterProfile() {
  const printer = printerProfiles.find((item) => item.id === printerSelector.value) || printerProfiles[0];
  if (!printer) return;
  printerTitle.textContent = printer.name;
  printerDescription.textContent = printer.description;
  printerModel.textContent = printer.name;
  printerAsset.textContent = printer.asset;
  const renderItems = (side) => printer.items
    .filter((item) => item.side === side)
    .map((item) => `<article class="printer-item${item.low ? ' low' : ''}">
      <h4>${escapeHtml(item.name)}</h4>
      <p>${escapeHtml(item.detail)}</p>
      <div class="printer-item-meta">
        <span class="printer-item-type">${escapeHtml(item.direction)}</span>
        <span>${escapeHtml(item.quantity)}</span>
      </div>
    </article>`).join('');
  printerItemsLeft.innerHTML = renderItems('left') || '<p class="empty">Nenhum item configurado.</p>';
  printerItemsRight.innerHTML = renderItems('right') || '<p class="empty">Nenhum item configurado.</p>';
}

function updateInventoryCreateMode() {
  const creating = form.elements.createInventoryItem.checked;
  newInventoryFields.classList.toggle('hidden', !creating);
  $('#consumableSearch').disabled = creating;
  if (creating) {
    $('#consumableSearch').value = '';
    form.elements.inventoryItemId.value = '';
  }
}

function updateDamagedPeripheralVisibility() {
  const visible = activeFlow === 'inventory-delivery' && form.elements.inventoryType.value === 'accessories';
  damagedPeripheralWrap.classList.toggle('hidden', !visible);
  damagedPeripheralHelp.classList.toggle('hidden', !visible || !form.elements.damagedPeripheral.checked);
  if (!visible) {
    form.elements.damagedPeripheral.checked = false;
  }
}

async function login() {
  try {
    me = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#loginUsername').value,
        password: $('#loginPassword').value,
      }),
    });
    await bootAuthenticated();
  } catch (error) {
    $('#loginMessage').textContent = error.message;
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
}

async function bootAuthenticated() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  topActions.classList.remove('hidden');
  const canAdmin = ['admin', 'superadmin'].includes(me.role);
  $('#adminToggle').classList.toggle('hidden', !canAdmin);
  $('#userManagementSection').classList.toggle('hidden', me.role !== 'superadmin');
  await Promise.all([loadPresets(), loadStatus(), loadHistory(), loadOverdueAlert()]);
  setFlow(activeFlow);
}

async function loadMe() {
  try {
    me = await api('/api/me');
    await bootAuthenticated();
  } catch {
    loginView.classList.remove('hidden');
  }
}

async function loadStatus() {
  const data = await api('/api/health');
  statusEl.textContent = data.snipeItConfigured ? 'API conectada' : data.hasToken ? 'Token pendente' : 'Sem token';
  statusEl.classList.toggle('online', data.snipeItConfigured);
  snipeItUrlInput.value = data.snipeItUrl || 'https://equipamentos.censupeg.com.br';
}

async function loadPresets() {
  presets = await api('/api/presets');
  fillStatusSelect(form.elements.checkoutStatusId, presets.defaultCheckoutStatusId);
  fillStatusSelect(form.elements.checkinStatusId, presets.defaultCheckinStatusId);
  fillStatusSelect(form.elements.newAssetStatusId, presets.defaultCheckinStatusId);
}

function fillStatusSelect(select, selectedId) {
  select.innerHTML = '<option value="">Manter padrao</option>';
  for (const status of presets.statusLabels || []) {
    const option = document.createElement('option');
    option.value = status.id;
    option.textContent = status.name;
    option.selected = Number(status.id) === Number(selectedId);
    select.append(option);
  }
}

async function saveConfig() {
  configMessage.textContent = 'Salvando...';
  const data = await api('/api/config', {
    method: 'POST',
    body: JSON.stringify({
      snipeItUrl: snipeItUrlInput.value,
      snipeItToken: snipeItTokenInput.value,
    }),
  });
  snipeItTokenInput.value = '';
  configMessage.textContent = data.hasToken ? 'Token salvo no seu usuario.' : 'URL salva. Cole seu token.';
  await loadStatus();
}

async function testConnection() {
  try {
    const data = await api('/api/test-connection', { method: 'POST' });
    configMessage.textContent = `${data.message} Ativos: ${data.totalAssets ?? 'ok'}.`;
  } catch (error) {
    configMessage.textContent = error.message;
  }
  await loadStatus();
}

async function changePassword() {
  try {
    await api('/api/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: $('#currentPassword').value,
        newPassword: $('#newPassword').value,
      }),
    });
    $('#passwordMessage').textContent = 'Senha alterada.';
  } catch (error) {
    $('#passwordMessage').textContent = error.message;
  }
}

async function loadHistory() {
  const events = await api('/api/events');
  historyList.innerHTML = '';
  if (!events.length) {
    historyList.innerHTML = '<p class="empty">Nenhum registro ainda.</p>';
    return;
  }
  for (const item of events.slice(0, 12)) {
    const node = historyTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('strong').textContent = item.flowLabel || item.flow;
    node.querySelector('p').textContent = describeEvent(item);
    const badge = node.querySelector('span');
    badge.textContent = statusLabel(item.status);
    badge.className = item.status;
    historyList.append(node);
  }
}

async function loadOverdueAlert() {
  const overdue = await api('/api/overdue-loans');
  const panel = $('#overdueAlert');
  if (!overdue.length) {
    panel.classList.add('hidden');
    return;
  }
  $('#overdueSummary').textContent = `${overdue.length} emprestimo(s) vencido(s). Mais antigo: ${overdue[0].asset} com ${overdue[0].daysLate} dia(s) de atraso.`;
  panel.classList.remove('hidden');
}

async function showAdmin() {
  appView.classList.add('hidden');
  printerView.classList.add('hidden');
  adminView.classList.remove('hidden');
  await Promise.all([
    loadAdminSummary(),
    me.role === 'superadmin' ? loadUsers() : Promise.resolve(),
    loadReplenishment(),
    loadMonthlyAssignments(),
  ]);
}

function showApp() {
  adminView.classList.add('hidden');
  printerView.classList.add('hidden');
  appView.classList.remove('hidden');
}

async function loadAdminSummary() {
  const summary = await api('/api/admin/summary');
  $('#adminCards').innerHTML = [
    ['Registros', summary.totalEvents],
    ['Sincronizados', summary.synced],
    ['Erros', summary.errors],
    ['Atrasos', summary.overdueLoans],
    ['Usuarios', summary.users],
  ].map(([label, value]) => `<article><strong>${value}</strong><span>${label}</span></article>`).join('');

  $('#overdueList').innerHTML = summary.overdue?.length
    ? `<h3>Emprestimos atrasados</h3>${summary.overdue.map((item) => `
      <article>
        <strong>${escapeHtml(item.asset)} - ${escapeHtml(item.borrower)}</strong>
        <span>Previsto: ${escapeHtml(item.returnDate)} - ${item.daysLate} dia(s) em atraso${item.email ? ` - ${escapeHtml(item.email)}` : ''}</span>
      </article>
    `).join('')}`
    : '<h3>Emprestimos atrasados</h3><p class="empty">Nenhum emprestimo atrasado.</p>';
}

async function loadMonthlyAssignments() {
  const monthInput = $('#monthlyAssignmentsMonth');
  if (!monthInput.value) monthInput.value = new Date().toISOString().slice(0, 7);
  const data = await api(`/api/admin/monthly-assignments?month=${encodeURIComponent(monthInput.value)}`);
  monthlyAssignmentsData = data;
  renderMonthlyAssignments();
}

async function loadReplenishment() {
  try {
    const data = await api('/api/admin/replenishment');
    replenishmentData = data.rows || [];
    $('#replenishmentSummary').textContent = replenishmentData.length
      ? `${replenishmentData.length} item(ns) abaixo do minimo configurado.`
      : 'Nenhum item abaixo do minimo configurado no Snipe-IT.';
    $('#replenishmentBody').innerHTML = replenishmentData.length
      ? replenishmentData.map((row) => `<tr>
          <td>${escapeHtml(row.item)}</td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.quantity)}</td>
          <td>${escapeHtml(row.minimum)}</td>
          <td><strong>${escapeHtml(row.missing)}</strong></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty">Nenhum item precisa de reposicao.</td></tr>';
  } catch (error) {
    replenishmentData = [];
    $('#replenishmentSummary').textContent = error.message;
    $('#replenishmentBody').innerHTML = '<tr><td colspan="5" class="empty">Nao foi possivel consultar o estoque.</td></tr>';
  }
}

function renderMonthlyAssignments() {
  const rows = getFilteredMonthlyAssignments();
  const quantity = rows.reduce((total, row) => total + Number(row.quantity || 0), 0);
  $('#monthlyAssignmentsTotal').textContent = `${rows.length} lancamento(s) exibido(s) | ${quantity} item(ns)`;
  $('#monthlyAssignmentsBody').innerHTML = rows.length
    ? rows.map((row) => `<tr>
        <td><input class="monthly-purchase-flag" type="checkbox" data-item="${escapeHtml(row.item || 'sem item')}" ${row.purchased ? 'checked' : ''} aria-label="Marcar ${escapeHtml(row.item || 'item')} como comprado"></td>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.operator)}</td>
        <td>${escapeHtml(row.recipient)}</td>
        <td>${escapeHtml(row.costCenter || '-')}</td>
        <td>${escapeHtml(row.item || '-')}</td>
        <td>${escapeHtml(row.inventoryType)}</td>
        <td>${escapeHtml(row.quantity)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty">Nenhuma saida encontrada com esses filtros.</td></tr>';
}

function getFilteredMonthlyAssignments() {
  const itemFilter = $('#monthlyAssignmentsItemFilter').value.trim().toLocaleLowerCase();
  const recipientFilter = $('#monthlyAssignmentsRecipientFilter').value.trim().toLocaleLowerCase();
  const costCenterFilter = $('#monthlyAssignmentsCostCenterFilter').value.trim().toLocaleLowerCase();
  const typeFilter = $('#monthlyAssignmentsTypeFilter').value;
  return monthlyAssignmentsData.rows.filter((row) => (
    (!itemFilter || String(row.item).toLocaleLowerCase().includes(itemFilter))
    && (!recipientFilter || String(row.recipient).toLocaleLowerCase().includes(recipientFilter))
    && (!costCenterFilter || String(row.costCenter).toLocaleLowerCase().includes(costCenterFilter))
    && (!typeFilter || row.inventoryType === typeFilter)
  ));
}

async function updateMonthlyPurchase(event) {
  const checkbox = event.target.closest('.monthly-purchase-flag');
  if (!checkbox) return;
  try {
    await api('/api/admin/monthly-assignment-purchase', {
      method: 'POST',
      body: JSON.stringify({
        month: monthlyAssignmentsData.month,
        item: checkbox.dataset.item,
        purchased: checkbox.checked,
      }),
    });
    monthlyAssignmentsData.rows.forEach((row) => {
      if (row.item === checkbox.dataset.item) row.purchased = checkbox.checked;
    });
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    $('#monthlyAssignmentsTotal').textContent = error.message;
  }
}

function exportMonthlyAssignments() {
  const headers = ['Data', 'Quem entregou', 'Para quem foi', 'CC', 'Quantidade', 'Item', 'Tipo'];
  const values = getFilteredMonthlyAssignments().map((row) => [
    row.date,
    row.operator,
    row.recipient,
    row.costCenter || '',
    row.quantity,
    row.item || '',
    row.inventoryType,
  ]);
  const csv = [headers, ...values]
    .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `itens-atribuidos-${monthlyAssignmentsData.month || 'mes'}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function clearMonthlyAssignments() {
  const month = $('#monthlyAssignmentsMonth').value;
  const count = monthlyAssignmentsData.rows.length;
  if (!count) {
    $('#monthlyAssignmentsTotal').textContent = 'Nao ha registros para limpar neste mes.';
    return;
  }
  if (!window.confirm(`Limpar os ${count} lancamento(s) de ${month}? Esta acao nao pode ser desfeita.`)) return;
  try {
    const result = await api(`/api/admin/monthly-assignments?month=${encodeURIComponent(month)}`, { method: 'DELETE' });
    await loadMonthlyAssignments();
    $('#monthlyAssignmentsTotal').textContent = `${result.removed} lancamento(s) removido(s).`;
  } catch (error) {
    $('#monthlyAssignmentsTotal').textContent = error.message;
  }
}

async function loadUsers() {
  const users = await api('/api/admin/users');
  $('#usersList').innerHTML = users.map((user) => `
    <article>
      <strong>${escapeHtml(user.name)} (${escapeHtml(user.username)})</strong>
      <span>${escapeHtml(user.role)} - API ${user.hasToken ? 'ok' : 'pendente'}</span>
      <button type="button" class="danger-button user-delete" data-user-id="${escapeHtml(user.id)}" data-user-name="${escapeHtml(user.name)}">Excluir</button>
    </article>
  `).join('');
}

$('#usersList').addEventListener('click', async (event) => {
  const button = event.target.closest('.user-delete');
  if (!button) return;
  if (!window.confirm(`Excluir o usuario ${button.dataset.userName || ''}? Esta acao nao pode ser desfeita.`)) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(button.dataset.userId)}`, { method: 'DELETE' });
    $('#adminMessage').textContent = 'Usuario excluido.';
    await loadUsers();
  } catch (error) {
    $('#adminMessage').textContent = error.message;
  }
});

async function createUser() {
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#newUserUsername').value,
        name: $('#newUserName').value,
        password: $('#newUserPassword').value,
        role: $('#newUserRole').value,
      }),
    });
    $('#adminMessage').textContent = 'Usuario criado.';
    await loadUsers();
  } catch (error) {
    $('#adminMessage').textContent = error.message;
  }
}

function setupSearch({ input, results, getType, onSelect }) {
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      results.classList.add('hidden');
      results.innerHTML = '';
      return;
    }
    timer = setTimeout(async () => {
      const data = await api(`/api/search?type=${encodeURIComponent(getType())}&q=${encodeURIComponent(query)}`);
      renderResults(results, data.rows || [], onSelect, input);
    }, 280);
  });
}

async function startScanner(target) {
  stopScanner();
  scanTarget = target || 'asset';
  manualScanValue.value = '';
  scannerMessage.textContent = 'Aponte a camera para o QR Code da etiqueta.';
  scannerModal.classList.remove('hidden');

  try {
    if (!canUseCamera()) {
      scannerMessage.textContent = 'A camera so funciona no celular com HTTPS ou localhost. Digite ou cole o codigo abaixo.';
      return;
    }

    if (window.ZXingBrowser?.BrowserMultiFormatReader) {
      const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      zxingControls = await reader.decodeFromVideoDevice(null, scannerVideo, (result, error, controls) => {
        if (result) {
          zxingControls = controls;
          applyScannedValue(result.getText());
        } else if (error?.name && !/NotFoundException/i.test(error.name)) {
          scannerMessage.textContent = 'Tentando reconhecer a etiqueta...';
        }
      });
      return;
    }

    if (!('BarcodeDetector' in window)) {
      scannerMessage.textContent = 'Leitura automatica nao suportada neste navegador. Abra em Chrome/Edge atualizado ou digite o codigo abaixo.';
      return;
    }

    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();
    const detector = new BarcodeDetector({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
    });
    scanLoop(detector);
  } catch (error) {
    scannerMessage.textContent = formatCameraError(error);
  }
}

async function scanLoop(detector) {
  try {
    const codes = await detector.detect(scannerVideo);
    if (codes.length) {
      applyScannedValue(codes[0].rawValue || '');
      return;
    }
  } catch {
    scannerMessage.textContent = 'Tentando reconhecer a etiqueta...';
  }
  scannerTimer = window.setTimeout(() => scanLoop(detector), 350);
}

function stopScanner() {
  window.clearTimeout(scannerTimer);
  scannerTimer = 0;
  if (zxingControls) {
    zxingControls.stop();
    zxingControls = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
  }
  scannerStream = null;
  scannerVideo.srcObject = null;
  scannerModal.classList.add('hidden');
}

function canUseCamera() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

function formatCameraError(error) {
  if (error?.name === 'NotAllowedError') {
    return 'Permissao da camera negada. Autorize a camera no navegador e tente novamente.';
  }
  if (error?.name === 'NotFoundError') {
    return 'Nenhuma camera foi encontrada neste aparelho.';
  }
  if (!window.isSecureContext) {
    return 'A camera foi bloqueada porque a pagina nao esta em HTTPS. Use HTTPS no celular ou digite o codigo abaixo.';
  }
  return `Nao foi possivel abrir a camera. ${error.message}`;
}

async function applyScannedValue(value) {
  const parsed = parseScannedCode(value);
  if (!parsed.value) {
    scannerMessage.textContent = 'Codigo vazio ou invalido.';
    return;
  }

  if (scanTarget === 'inventory') {
    form.elements.inventoryItemId.value = parsed.id || '';
    $('#consumableSearch').value = parsed.search;
    triggerSearch($('#consumableSearch'));
  } else {
    if (parsed.id) form.elements.assetId.value = parsed.id;
    form.elements.assetTag.value = parsed.assetTag || (parsed.id ? '' : parsed.search);
    $('#assetSearch').value = parsed.search;
    assetCurrentInfo.classList.add('hidden');
    await loadAssetDetail(parsed);
    triggerSearch($('#assetSearch'));
  }

  stopScanner();
}

async function loadAssetDetail(parsed) {
  try {
    const query = parsed.id ? `id=${encodeURIComponent(parsed.id)}` : `tag=${encodeURIComponent(parsed.assetTag || parsed.search)}`;
    const data = await api(`/api/asset-detail?${query}`);
    if (data.asset) showAssetCurrentInfo(data.asset);
  } catch {
    assetCurrentInfo.textContent = 'Ativo preenchido. Nao foi possivel carregar a alocacao atual agora.';
    assetCurrentInfo.classList.remove('hidden');
  }
}

function parseScannedCode(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { value: '', search: '' };

  const directHardwareMatch = raw.match(/(?:^|\/)hardware\/(\d+)(?:\D|$)/i);
  if (directHardwareMatch) {
    return { value: raw, id: directHardwareMatch[1], search: directHardwareMatch[1] };
  }

  try {
    const url = new URL(raw);
    const hardwareMatch = url.pathname.match(/\/hardware\/(\d+)/i);
    if (hardwareMatch) {
      return { value: raw, id: hardwareMatch[1], search: hardwareMatch[1] };
    }
    const tag = url.searchParams.get('assetTag') || url.searchParams.get('asset_tag') || url.searchParams.get('tag');
    if (tag) return { value: raw, assetTag: tag, search: tag };
  } catch {
    // Nao era URL, segue como texto de etiqueta.
  }

  const cleaned = raw
    .replace(/^asset[_\s-]*tag[:=]?/i, '')
    .replace(/^patrimonio[:=]?/i, '')
    .trim();
  const idMatch = cleaned.match(/^#?(\d{1,8})$/);
  return {
    value: raw,
    id: idMatch ? idMatch[1] : '',
    assetTag: idMatch ? '' : cleaned,
    search: cleaned,
  };
}

function triggerSearch(input) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderResults(container, rows, onSelect, input) {
  container.innerHTML = '';
  if (!rows.length) {
    container.innerHTML = '<button type="button" disabled>Nenhum resultado</button>';
    container.classList.remove('hidden');
    return;
  }
  for (const item of rows.slice(0, 8)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<strong>${escapeHtml(formatResultLabel(item))}</strong><small>${escapeHtml(formatResultMeta(item))}</small>`;
    button.addEventListener('click', () => {
      onSelect(item);
      input.value = formatResultLabel(item);
      container.classList.add('hidden');
    });
    container.append(button);
  }
  container.classList.remove('hidden');
}

function showAssetCurrentInfo(item) {
  const parts = [
    item.assetTag ? `Patrimonio: ${item.assetTag}` : null,
    item.status ? `Status: ${item.status}` : null,
    item.location ? `Alocado agora em: ${item.location}` : 'Sem local atual no Snipe-IT',
    item.assignedTo ? `Responsavel atual: ${item.assignedTo}` : null,
  ].filter(Boolean);
  assetCurrentInfo.textContent = parts.join(' | ');
  assetCurrentInfo.classList.remove('hidden');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || 'Falha na requisicao.');
  return data;
}

function describeEvent(item) {
  const asset = item.assetTag || item.assetId || item.inventoryItemId || 'sem codigo';
  const dest = item.destinationName || item.locationName || item.destinationId || 'registro interno';
  if (item.flow === 'receiving' && item.restock) {
    return `${asset} - recebido +${item.restock.receivedQty} | estoque ${item.restock.previousQty} -> ${item.restock.newQty} - ${new Date(item.createdAt).toLocaleString('pt-BR')}`;
  }
  return `${asset} - ${dest} - ${new Date(item.createdAt).toLocaleString('pt-BR')}`;
}

function statusLabel(status) {
  return { synced: 'sincronizado', local: 'local', 'sync-error': 'erro', 'manual-review': 'revisar' }[status] || status;
}

function formatResultLabel(item) {
  return item.name || item.assetTag || item.username || `ID ${item.id}`;
}

function formatResultMeta(item) {
  return [
    item.assetTag ? `Patrimonio ${item.assetTag}` : null,
    item.serial ? `Serial ${item.serial}` : null,
    item.modelNumber ? `Modelo ${item.modelNumber}` : null,
    item.status ? `Status ${item.status}` : null,
    item.category || null,
    item.location ? `Alocado em ${item.location}` : null,
    item.assignedTo ? `Com ${item.assignedTo}` : null,
    item.email || item.username || null,
    item.qty !== null && item.qty !== undefined ? `Qtd ${item.qty}` : null,
    item.remaining !== null && item.remaining !== undefined ? `Restante ${item.remaining}` : null,
  ].filter(Boolean).join(' - ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

async function resizeImage(file) {
  const image = await createImageBitmap(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

await loadMe();
