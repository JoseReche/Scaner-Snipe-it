const flows = {
  delivery: {
    title: 'Entrega de material',
    description: 'Registre a entrega para uma pessoa ou local.',
    needsAsset: true,
    needsDestination: true,
    needsTerm: true,
    termKey: 'delivery',
  },
  loan: {
    title: 'Emprestimo com devolucao',
    description: 'Empreste um ativo e grave a data esperada de retorno.',
    needsAsset: true,
    needsDestination: true,
    needsReturnDate: true,
    needsTerm: true,
    termKey: 'delivery',
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
    needsTerm: true,
    termKey: 'return',
  },
};

const $ = (selector) => document.querySelector(selector);
const form = $('#recordForm');
const tabs = document.querySelectorAll('[data-flow]');
const loginView = $('#loginView');
const appView = $('#appView');
const adminView = $('#adminView');
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
const termSection = $('#termSection');
const termTitle = $('#termTitle');
const termPreview = $('#termPreview');
const signaturePad = $('#signaturePad');
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

let activeFlow = 'delivery';
let photoData = '';
let signatureDirty = false;
let scannerStream = null;
let scannerTimer = 0;
let zxingControls = null;
let scanTarget = 'asset';
let me = null;
let terms = { delivery: '', return: '' };
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
$('#refreshHistory').addEventListener('click', loadHistory);
$('#clearSignature').addEventListener('click', clearSignature);
$('#saveTerms').addEventListener('click', saveTerms);
$('#createUser').addEventListener('click', createUser);
$('#viewOverdueAdmin').addEventListener('click', showAdmin);
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
    payload.signatureData = flows[activeFlow].needsTerm && signatureDirty ? signaturePad.toDataURL('image/png') : '';

    const response = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    form.reset();
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    photoData = '';
    photoPreview.classList.add('hidden');
    clearSignature();
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
});

setupSearch({
  input: $('#destinationSearch'),
  results: $('#destinationResults'),
  getType: () => form.elements.destinationType.value === 'location' ? 'locations' : 'users',
  onSelect: (item) => {
    form.elements.destinationId.value = item.id || '';
    form.elements.destinationName.value = formatResultLabel(item);
    form.elements.destinationEmail.value = item.email || '';
    form.elements.signerName.value = formatResultLabel(item);
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
  termSection.classList.toggle('hidden', !config.needsTerm);
  termTitle.textContent = config.termKey === 'return' ? 'Termo de devolucao' : 'Termo de entrega';
  termPreview.textContent = terms[config.termKey] || '';
  assetCurrentInfo.classList.add('hidden');
  updateInventoryCreateMode();
  clearSignature();
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
  $('#adminToggle').classList.toggle('hidden', me.role !== 'admin');
  await Promise.all([loadPresets(), loadTerms(), loadStatus(), loadHistory(), loadOverdueAlert()]);
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

async function loadTerms() {
  terms = await api('/api/terms');
  $('#deliveryTerm').value = terms.delivery || '';
  $('#returnTerm').value = terms.return || '';
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
  adminView.classList.remove('hidden');
  await Promise.all([loadAdminSummary(), loadUsers(), loadTerms()]);
}

function showApp() {
  adminView.classList.add('hidden');
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
    ['E-mails pendentes', summary.pendingEmails],
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

async function loadUsers() {
  const users = await api('/api/admin/users');
  $('#usersList').innerHTML = users.map((user) => `
    <article>
      <strong>${escapeHtml(user.name)} (${escapeHtml(user.username)})</strong>
      <span>${escapeHtml(user.role)} - API ${user.hasToken ? 'ok' : 'pendente'}</span>
    </article>
  `).join('');
}

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

async function saveTerms() {
  terms = await api('/api/admin/terms', {
    method: 'POST',
    body: JSON.stringify({
      delivery: $('#deliveryTerm').value,
      return: $('#returnTerm').value,
    }),
  });
  $('#adminMessage').textContent = 'Termos salvos.';
  setFlow(activeFlow);
}

function setupSignaturePad() {
  const ctx = signaturePad.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2933';
  let drawing = false;

  const point = (event) => {
    const rect = signaturePad.getBoundingClientRect();
    const touch = event.touches?.[0];
    return {
      x: ((touch?.clientX ?? event.clientX) - rect.left) * (signaturePad.width / rect.width),
      y: ((touch?.clientY ?? event.clientY) - rect.top) * (signaturePad.height / rect.height),
    };
  };

  const start = (event) => {
    event.preventDefault();
    drawing = true;
    signatureDirty = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (event) => {
    if (!drawing) return;
    event.preventDefault();
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { drawing = false; };

  signaturePad.addEventListener('mousedown', start);
  signaturePad.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  signaturePad.addEventListener('touchstart', start, { passive: false });
  signaturePad.addEventListener('touchmove', move, { passive: false });
  signaturePad.addEventListener('touchend', end);
}

function clearSignature() {
  const ctx = signaturePad.getContext('2d');
  ctx.clearRect(0, 0, signaturePad.width, signaturePad.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, signaturePad.width, signaturePad.height);
  signatureDirty = false;
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

setupSignaturePad();
clearSignature();
await loadMe();
