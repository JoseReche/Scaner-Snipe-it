import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createReadStream, readFileSync } from 'node:fs';
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { isIP } from 'node:net';
import mysql from 'mysql2/promise';
import { google } from 'googleapis';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import snmp from 'net-snmp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envFile = join(__dirname, '.env');

loadDotEnv();

const port = Number(process.env.PORT || 3010);
const httpsEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.HTTPS || '').toLowerCase());
const sslCertPath = process.env.SSL_CERT || '';
const sslKeyPath = process.env.SSL_KEY || '';
const defaultSnipeUrl = 'https://equipamentos.censupeg.com.br';
const publicDir = join(__dirname, 'public');
const dataDir = join(__dirname, 'data');
const uploadsDir = join(__dirname, 'uploads');
const eventsFile = join(dataDir, 'events.json');
const usersFile = join(dataDir, 'users.json');
const settingsFile = join(dataDir, 'settings.json');
const termsDir = join(dataDir, 'terms');
const sessions = new Map();
const loginAttempts = new Map();
const storageClient = String(process.env.DB_CLIENT || 'json').toLowerCase();
let mysqlPool = null;
const censupegStatusLabels = [
  { id: 2, name: 'Pronto para implementar' },
  { id: 25, name: 'Em Uso' },
  { id: 20, name: 'No estoque' },
  { id: 21, name: 'Auditoria' },
  { id: 16, name: 'Manutencao Interna' },
  { id: 9, name: 'Manutencao Terceirizada' },
  { id: 24, name: 'Aguardando Retirada' },
  { id: 4, name: 'Aguardando Recebimento' },
  { id: 3, name: 'Arquivado' },
  { id: 19, name: 'Descarte' },
  { id: 23, name: 'Uso da TI' },
  { id: 1, name: 'Pendente' },
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

await mkdir(dataDir, { recursive: true });
await mkdir(uploadsDir, { recursive: true });
await mkdir(termsDir, { recursive: true });
await initStorage();
await ensureBootstrapSuperAdmin();

const requestHandler = (req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, error.status || 500, { error: error.publicMessage || 'Erro inesperado no servidor.' });
    } else {
      res.end();
    }
  });
};

const server = createAppServer(requestHandler);

async function handleRequest(req, res) {
  try {
    const protocol = httpsEnabled || req.socket.encrypted ? 'https' : 'http';
    const url = new URL(req.url || '/', `${protocol}://${req.headers.host}`);
    setSecurityHeaders(res, url);

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      return handleLogin(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      return handleLogout(req, res);
    }

    const publicStatic = req.method === 'GET' && !url.pathname.startsWith('/api/');
    const user = publicStatic ? null : await requireAuth(req);

    if (req.method === 'GET' && url.pathname === '/api/me') {
      return sendJson(res, 200, publicUser(user));
    }

    if (req.method === 'POST' && url.pathname === '/api/change-password') {
      return handleChangePassword(req, res, user);
    }

    if (req.method === 'POST' && url.pathname === '/api/user-api-token') {
      return handleUserApiToken(req, res, user);
    }

    if (req.method === 'GET' && url.pathname === '/api/terms') {
      return sendJson(res, 200, (await readSettings()).terms);
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/summary') {
      requireAdmin(user);
      return handleAdminSummary(res);
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/monthly-assignments') {
      requireAdmin(user);
      return handleMonthlyAssignments(url, res);
    }

    if (req.method === 'DELETE' && url.pathname === '/api/admin/monthly-assignments') {
      requireAdmin(user);
      return handleClearMonthlyAssignments(url, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/monthly-assignment-purchase') {
      requireAdmin(user);
      return handleMonthlyAssignmentPurchase(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/replenishment') {
      requireAdmin(user);
      return handleReplenishment(res, user);
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/users') {
      requireAdmin(user);
      return handleAdminUsers(res);
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/users') {
      requireSuperAdmin(user);
      return handleAdminCreateUser(req, res);
    }

    const userDeleteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (req.method === 'DELETE' && userDeleteMatch) {
      requireSuperAdmin(user);
      return handleAdminDeleteUser(req, res, user, decodeURIComponent(userDeleteMatch[1]));
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/terms') {
      requireAdmin(user);
      return handleAdminTerms(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        snipeItConfigured: isSnipeConfigured(user),
        snipeItUrl: getSnipeUrl(),
        hasToken: Boolean(getUserToken(user)),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return sendJson(res, 200, {
        snipeItUrl: getSnipeUrl(),
        hasToken: Boolean(getUserToken(user)),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/presets') {
      return sendJson(res, 200, {
        statusLabels: censupegStatusLabels,
        inventoryTypes: [
          { id: 'consumables', name: 'Toner / consumivel' },
          { id: 'accessories', name: 'Periferico' },
        ],
        defaultCheckoutStatusId: Number(process.env.CENSUPEG_CHECKOUT_STATUS_ID || 25),
        defaultCheckinStatusId: Number(process.env.CENSUPEG_CHECKIN_STATUS_ID || 2),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/config') {
      return handleConfig(req, res, user);
    }

    if (req.method === 'POST' && url.pathname === '/api/test-connection') {
      return handleConnectionTest(res, user);
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      return sendJson(res, 200, await readEvents());
    }

    if (req.method === 'GET' && url.pathname === '/api/overdue-loans') {
      return sendJson(res, 200, getOverdueLoans(await readEvents()));
    }

    if (req.method === 'GET' && url.pathname === '/api/search') {
      return handleSearch(url, res, user);
    }

    if (req.method === 'GET' && url.pathname === '/api/asset-detail') {
      return handleAssetDetail(url, res, user);
    }

    if (req.method === 'GET' && url.pathname === '/api/printer-status') {
      return handlePrinterStatus(url, res, user);
    }

    if (req.method === 'POST' && url.pathname === '/api/events') {
      return handleEvent(req, res, user);
    }

    if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/terms/')) {
      await requireAuth(req);
    }
    await serveStatic(url.pathname, res);
  } catch (error) {
    throw error;
  }
}

server.listen(port, () => {
  const protocol = httpsEnabled ? 'https' : 'http';
  console.log(`Snipe-IT Mobile aberto em ${protocol}://localhost:${port}`);
});

function createAppServer(handler) {
  if (!httpsEnabled) return createHttpServer(handler);
  if (!sslCertPath || !sslKeyPath) {
    throw new Error('HTTPS=true exige SSL_CERT e SSL_KEY no .env.');
  }
  return createHttpsServer({
    cert: readFileSync(sslCertPath),
    key: readFileSync(sslKeyPath),
  }, handler);
}

async function handleLogin(req, res) {
  const clientKey = getClientKey(req);
  checkLoginRateLimit(clientKey);
  const payload = await readJson(req);
  const username = String(payload.username || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const users = await readUsers();
  const user = users.find((item) => item.username.toLowerCase() === username && item.active !== false);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordLoginFailure(clientKey);
    throw publicError('Usuario ou senha invalidos.', 401);
  }

  loginAttempts.delete(clientKey);
  const sessionId = randomUUID();
  sessions.set(sessionId, { userId: user.id, createdAt: Date.now() });
  res.setHeader('Set-Cookie', buildSessionCookie(sessionId, 28800));
  sendJson(res, 200, publicUser(user));
}

async function handleLogout(req, res) {
  const sessionId = getCookie(req, 'sid');
  if (sessionId) sessions.delete(sessionId);
  res.setHeader('Set-Cookie', buildSessionCookie('', 0));
  sendJson(res, 200, { ok: true });
}

async function handleChangePassword(req, res, user) {
  const payload = await readJson(req);
  if (!verifyPassword(String(payload.currentPassword || ''), user.passwordHash)) {
    throw publicError('Senha atual incorreta.', 400);
  }
  const newPassword = String(payload.newPassword || '');
  if (newPassword.length < 12) {
    throw publicError('A nova senha deve ter pelo menos 12 caracteres.', 400);
  }
  const users = await readUsers();
  const target = users.find((item) => item.id === user.id);
  target.passwordHash = hashPassword(newPassword);
  await writeUsers(users);
  for (const [sessionId, session] of sessions) {
    if (session.userId === user.id && sessionId !== getCookie(req, 'sid')) sessions.delete(sessionId);
  }
  sendJson(res, 200, { ok: true });
}

async function handleUserApiToken(req, res, user) {
  const payload = await readJson(req);
  const users = await readUsers();
  const target = users.find((item) => item.id === user.id);
  target.snipeItUrl = normalizeBaseUrl(payload.snipeItUrl || defaultSnipeUrl);
  if (payload.snipeItToken) target.snipeItToken = String(payload.snipeItToken).trim();
  await writeUsers(users);
  sendJson(res, 200, { ok: true, hasToken: Boolean(target.snipeItToken), snipeItUrl: target.snipeItUrl });
}

async function handleAdminSummary(res) {
  const [events, users, settings] = await Promise.all([readEvents(), readUsers(), readSettings()]);
  const byStatus = events.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const overdueLoans = getOverdueLoans(events);
  sendJson(res, 200, {
    totalEvents: events.length,
    synced: byStatus.synced || 0,
    errors: byStatus['sync-error'] || 0,
    users: users.length,
    overdueLoans: overdueLoans.length,
    overdue: overdueLoans.slice(0, 10),
    recent: events.slice(0, 8),
  });
}

async function handleMonthlyAssignments(url, res) {
  const requestedMonth = String(url.searchParams.get('month') || '').trim();
  const month = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : today().slice(0, 7);
  const settings = await readSettings();
  const purchased = settings.monthlyPurchases || {};
  const rows = (await readEvents())
    .filter((event) => event.flow === 'inventory-delivery')
    .filter((event) => String(event.createdAt || '').slice(0, 7) === month)
    .map((event) => ({
      date: event.date || String(event.createdAt || '').slice(0, 10),
      operator: event.operator?.name || event.operator?.username || '',
      recipient: event.destinationName || event.destinationId || '',
      costCenter: event.destinationCostCenter || event.costCenter || '',
      quantity: Number(event.quantity || 1),
      item: event.inventoryItemName || event.inventoryName || event.snipeIt?.item?.name || '',
      inventoryType: event.inventoryType === 'accessories' ? 'Periferico' : 'Toner / consumivel',
      status: event.status || 'local',
    }))
    .map((row) => {
      const purchaseKey = `${month}|${String(row.item || 'sem item').trim().toLocaleLowerCase()}`;
      return { ...row, purchaseKey, purchased: Boolean(purchased[purchaseKey]) };
    });

  sendJson(res, 200, {
    month,
    totalQuantity: rows.reduce((total, row) => total + row.quantity, 0),
    rows,
  });
}

async function handleMonthlyAssignmentPurchase(req, res) {
  const payload = await readJson(req);
  const month = String(payload.month || '').trim();
  const item = String(payload.item || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month) || !item) throw publicError('Mes e item sao obrigatorios.', 400);

  const settings = await readSettings();
  settings.monthlyPurchases ||= {};
  const key = `${month}|${item.toLocaleLowerCase()}`;
  if (payload.purchased) settings.monthlyPurchases[key] = true;
  else delete settings.monthlyPurchases[key];
  await writeSettings(settings);
  sendJson(res, 200, { month, item, purchased: Boolean(settings.monthlyPurchases[key]) });
}

async function handleReplenishment(res, user) {
  if (!isSnipeConfigured(user)) return sendJson(res, 200, { rows: [], offline: true });

  const [consumables, accessories] = await Promise.all([
    fetchInventoryForReplenishment('consumables', user),
    fetchInventoryForReplenishment('accessories', user),
  ]);
  const rows = [...consumables, ...accessories]
    .map((item) => normalizeReplenishmentItem(item.item, item.type))
    .filter((item) => item.minimum !== null && item.quantity < item.minimum);

  sendJson(res, 200, { rows });
}

async function fetchInventoryForReplenishment(type, user) {
  const path = inventoryEndpoint(type);
  const data = await snipeFetch(`${path}?limit=500`, {}, user);
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return rows.map((item) => ({ item, type }));
}

function normalizeReplenishmentItem(item, type) {
  const quantity = Number(item?.remaining ?? item?.remaining_qty ?? item?.qty ?? 0);
  const minimumValue = item?.min_amt ?? item?.minimum_quantity ?? item?.min_quantity;
  const minimum = minimumValue === null || minimumValue === undefined || minimumValue === ''
    ? null
    : Number(minimumValue);
  return {
    id: item?.id,
    item: item?.name || `ID ${item?.id || ''}`,
    type: type === 'accessories' ? 'Periferico' : 'Toner / consumivel',
    quantity,
    minimum: Number.isFinite(minimum) ? minimum : null,
    missing: Number.isFinite(minimum) ? Math.max(minimum - quantity, 0) : 0,
  };
}

async function handleClearMonthlyAssignments(url, res) {
  const requestedMonth = String(url.searchParams.get('month') || '').trim();
  const month = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : today().slice(0, 7);
  const events = await readEvents();
  const kept = events.filter((event) => !(
    event.flow === 'inventory-delivery'
    && String(event.createdAt || '').slice(0, 7) === month
  ));
  const removed = events.length - kept.length;
  await writeEvents(kept);
  const settings = await readSettings();
  for (const key of Object.keys(settings.monthlyPurchases || {})) {
    if (key.startsWith(`${month}|`)) delete settings.monthlyPurchases[key];
  }
  await writeSettings(settings);
  sendJson(res, 200, { month, removed });
}

async function handleAdminUsers(res) {
  const users = await readUsers();
  sendJson(res, 200, users.map(publicUser));
}

async function handleAdminCreateUser(req, res) {
  const payload = await readJson(req);
  const username = String(payload.username || '').trim().toLowerCase();
  const password = String(payload.password || '').trim();
  if (!username || !password) throw publicError('Informe usuario e senha.', 400);
  if (password.length < 12) throw publicError('A senha deve ter pelo menos 12 caracteres.', 400);
  const users = await readUsers();
  if (users.some((item) => item.username.toLowerCase() === username)) {
    throw publicError('Usuario ja existe.', 400);
  }
  const user = {
    id: randomUUID(),
    username,
    name: String(payload.name || username).trim(),
    role: ['operator', 'admin', 'superadmin'].includes(payload.role) ? payload.role : 'operator',
    active: true,
    snipeItUrl: defaultSnipeUrl,
    snipeItToken: '',
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  sendJson(res, 201, publicUser(user));
}

async function handleAdminDeleteUser(req, res, currentUser, userId) {
  if (String(currentUser.id) === String(userId)) {
    throw publicError('O superadmin nao pode excluir a propria conta.', 400);
  }
  const users = await readUsers();
  const target = users.find((item) => String(item.id) === String(userId));
  if (!target) throw publicError('Usuario nao encontrado.', 404);
  if (target.role === 'superadmin' && users.filter((item) => item.active !== false && item.role === 'superadmin').length <= 1) {
    throw publicError('Nao e possivel excluir o ultimo superadmin.', 400);
  }
  await writeUsers(users.filter((item) => String(item.id) !== String(userId)));
  sendJson(res, 200, { ok: true, deletedUserId: userId });
}

async function handleAdminTerms(req, res) {
  const payload = await readJson(req);
  const settings = await readSettings();
  settings.terms.delivery = String(payload.delivery || settings.terms.delivery);
  settings.terms.return = String(payload.return || settings.terms.return);
  await writeSettings(settings);
  sendJson(res, 200, settings.terms);
}

async function handleEvent(req, res, user) {
  const payload = await readJson(req);
  const now = new Date().toISOString();
  const photo = payload.photoData ? await savePhoto(payload.photoData, now) : null;
  const event = {
    id: randomUUID(),
    createdAt: now,
    status: 'local',
    snipeIt: null,
    photo,
    operator: { id: user.id, username: user.username, name: user.name },
    ...sanitizePayload(payload),
  };

  validateEvent(event);

  if (isSnipeConfigured(user)) {
    try {
      event.snipeIt = await pushToSnipeIt(event, user);
      enrichEventFromSnipeResult(event);
      event.status = event.snipeIt?.ok === false ? 'manual-review' : 'synced';
    } catch (error) {
      event.status = 'sync-error';
      event.snipeIt = { ok: false, error: error.message };
    }
  }

  const events = await readEvents();
  events.unshift(event);
  await writeEvents(events);
  if (event.flow === 'receiving') {
    event.receipt = await createReceivingReceipt(event);
    await attachReceivingReceiptIfNeeded(event, user);
    await writeEvents(events);
  }
  sendJson(res, 201, event);
}

async function handleConfig(req, res, user) {
  const payload = await readJson(req);
  const snipeItUrl = normalizeBaseUrl(payload.snipeItUrl || defaultSnipeUrl);
  const token = String(payload.snipeItToken || '').trim();

  if (!snipeItUrl) {
    throw publicError('Informe a URL do Snipe-IT.', 400);
  }

  const users = await readUsers();
  const target = users.find((item) => item.id === user.id);
  target.snipeItUrl = snipeItUrl;
  if (token) target.snipeItToken = token;
  await writeUsers(users);
  Object.assign(user, target);

  sendJson(res, 200, {
    ok: true,
    snipeItUrl,
    hasToken: Boolean(target.snipeItToken),
  });
}

async function handleConnectionTest(res, user) {
  if (!isSnipeConfigured(user)) {
    throw publicError('Configure a URL e o token de API antes de testar.', 400);
  }

  const data = await snipeFetch('/api/v1/hardware?limit=1', {}, user);
  sendJson(res, 200, {
    ok: true,
    message: 'Conexao com Snipe-IT confirmada.',
    totalAssets: data?.total ?? null,
  });
}

async function handleSearch(url, res, user) {
  const type = url.searchParams.get('type') || 'hardware';
  const query = url.searchParams.get('q') || '';

  if (!isSnipeConfigured(user)) {
    return sendJson(res, 200, { rows: [], offline: true });
  }

  const pathByType = {
    assets: '/api/v1/hardware',
    hardware: '/api/v1/hardware',
    users: '/api/v1/users',
    locations: '/api/v1/locations',
    consumables: '/api/v1/consumables',
    accessories: '/api/v1/accessories',
    components: '/api/v1/components',
  };

  const path = pathByType[type] || pathByType.hardware;
  const data = await snipeFetch(`${path}?limit=20&search=${encodeURIComponent(query)}`, {}, user);
  sendJson(res, 200, normalizeSearchResults(type, data));
}

async function handleAssetDetail(url, res, user) {
  if (!isSnipeConfigured(user)) {
    return sendJson(res, 200, { asset: null, offline: true });
  }

  const id = url.searchParams.get('id');
  const tag = url.searchParams.get('tag');
  if (!id && !tag) throw publicError('Informe o ativo.', 400);

  const data = id
    ? await snipeFetch(`/api/v1/hardware/${encodeURIComponent(id)}`, {}, user)
    : await snipeFetch(`/api/v1/hardware/bytag/${encodeURIComponent(tag)}`, {}, user);
  sendJson(res, 200, { asset: normalizeEntity(data) });
}

async function handlePrinterStatus(url, res, user) {
  const ip = String(url.searchParams.get('ip') || '').trim();
  validatePrinterIp(ip);
  const community = String(process.env.PRINTER_SNMP_COMMUNITY || '').trim();
  if (!community) throw publicError('Configure PRINTER_SNMP_COMMUNITY no .env.', 503);

  try {
    const status = await readPrinterSnmpStatus(ip, community);
    sendJson(res, 200, status);
  } catch (error) {
    throw publicError(`Nao foi possivel consultar a impressora: ${error.message}`, 502);
  }
}

async function readPrinterSnmpStatus(ip, community) {
  const timeout = Number(process.env.PRINTER_SNMP_TIMEOUT || 3500);
  const session = snmp.createSession(ip, community, {
    version: snmp.Version2c,
    timeout: Number.isFinite(timeout) ? timeout : 3500,
    retries: 1,
  });
  try {
    const system = await snmpGet(session, [
      '1.3.6.1.2.1.1.5.0',
      '1.3.6.1.2.1.1.1.0',
    ]);
    const descriptions = await snmpWalkOptional(session, '1.3.6.1.2.1.25.3.2.1.3');
    const levels = await snmpWalkOptional(session, '1.3.6.1.2.1.43.11.1.1.7');
    const maximums = await snmpWalkOptional(session, '1.3.6.1.2.1.43.11.1.1.8');
    const tonerNames = await snmpWalkOptional(session, '1.3.6.1.2.1.43.11.1.1.6');
    const alerts = await snmpWalkOptional(session, '1.3.6.1.2.1.43.18.1.1.8');
    const toners = buildTonerLevels(levels, maximums, tonerNames);
    return {
      ip,
      reachable: true,
      name: snmpText(system[0]?.value) || ip,
      description: snmpText(system[1]?.value),
      alerts: alerts.map((item) => snmpText(item.value)).filter(Boolean).slice(0, 8),
      toners,
      observedAt: new Date().toISOString(),
      source: 'SNMP v2c',
    };
  } finally {
    session.close();
  }
}

function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) return reject(error);
      resolve(varbinds.filter((item) => !snmp.isVarbindError(item)));
    });
  });
}

function snmpWalk(session, oid) {
  return new Promise((resolve, reject) => {
    const values = [];
    session.subtree(oid, (varbinds) => {
      values.push(...varbinds.filter((item) => !snmp.isVarbindError(item)));
    }, (error) => error ? reject(error) : resolve(values));
  });
}

async function snmpWalkOptional(session, oid) {
  try {
    return await snmpWalk(session, oid);
  } catch {
    return [];
  }
}

function buildTonerLevels(levels, maximums, tonerNames) {
  const maxByIndex = new Map(maximums.map((item) => [snmpIndex(item.oid), Number(item.value)]));
  const namesByIndex = new Map(tonerNames.map((item) => [snmpIndex(item.oid), snmpText(item.value)]));
  return levels.map((item) => {
    const index = snmpIndex(item.oid);
    const level = Number(item.value);
    const maximum = maxByIndex.get(index) || 0;
    const percentage = maximum > 0 && level >= 0 ? Math.max(0, Math.min(100, Math.round((level / maximum) * 100))) : null;
    const name = namesByIndex.get(index) || `Suprimento ${index}`;
    return { name, level, maximum, percentage, low: percentage !== null && percentage <= 20 };
  }).filter((item) => item.percentage !== null || item.level >= 0);
}

function snmpIndex(oid) {
  const parts = String(oid).split('.');
  return parts.slice(-2).join('.');
}

function snmpText(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8').replace(/\0/g, '').trim();
  return value === undefined || value === null ? '' : String(value).trim();
}

function validatePrinterIp(ip) {
  if (isIP(ip) !== 4) throw publicError('Informe um IPv4 valido para a impressora.', 400);
  const parts = ip.split('.').map(Number);
  const isPrivate = parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
  const allowPublic = String(process.env.ALLOW_PUBLIC_PRINTER_IPS || '').toLowerCase() === 'true';
  if (!isPrivate && !allowPublic) throw publicError('Por seguranca, consulte apenas IPs privados da rede local.', 400);
}

async function pushToSnipeIt(event, user) {
  validateEvent(event);
  const note = buildNote(event);
  const actions = [];
  let asset = null;

  if (event.createLocation && event.locationName) {
    const location = await snipeFetch('/api/v1/locations', {
      method: 'POST',
      body: {
        name: event.locationName,
        notes: event.note || 'Criado pelo app mobile de inventario.',
      },
    }, user);
    actions.push({ type: 'create-location', response: location });
    event.destinationId ||= location?.payload?.id || location?.id;
  }

  if (event.flow === 'delivery' || event.flow === 'loan') {
    if (event.inventoryItemId || event.consumableId || event.createInventoryItem) {
      const inventoryType = event.inventoryType || 'consumables';
      const itemId = event.inventoryItemId || event.consumableId;
      const endpoint = inventoryEndpoint(inventoryType);

      if (event.createInventoryItem) {
        const created = await snipeFetch(endpoint, {
          method: 'POST',
          body: buildInventoryCreateBody(event, note),
        }, user);
        actions.push({ type: `create-${inventoryType}`, response: created });
        return {
          ok: true,
          inventoryType,
          item: normalizeEntity(created?.payload || created, inventoryType),
          actions,
        };
      }

      if (inventoryType === 'consumables' && event.destinationType !== 'user') {
        return {
          ok: false,
          message: 'Consumivel pode ser entregue para pessoa. Para local, use ativo ou periferico.',
        };
      }

      const checkoutBody = inventoryType === 'accessories'
        ? {
            assigned_user: event.destinationType === 'user' ? event.destinationId : undefined,
            assigned_location: event.destinationType === 'location' ? event.destinationId : undefined,
            note,
          }
        : {
            assigned_to: event.destinationId,
            note,
          };
      const checkout = await snipeFetch(`${endpoint}/${itemId}/checkout`, {
        method: 'POST',
        body: checkoutBody,
      }, user);
      actions.push({ type: `checkout-${inventoryType}`, response: checkout });
      return {
        ok: true,
        inventoryType,
        item: normalizeEntity(checkout?.payload || checkout, inventoryType),
        actions,
      };
    }

    asset = await resolveAsset(event, user);
    const checkout = await snipeFetch(`/api/v1/hardware/${asset.id}/checkout`, {
      method: 'POST',
      body: {
        checkout_to_type: event.destinationType,
        assigned_user: event.destinationType === 'user' ? event.destinationId : undefined,
        assigned_location: event.destinationType === 'location' ? event.destinationId : undefined,
        status_id: event.checkoutStatusId || process.env.CENSUPEG_CHECKOUT_STATUS_ID || undefined,
        checkout_at: event.date || today(),
        expected_checkin: event.flow === 'loan' ? event.returnDate : undefined,
        note,
      },
    }, user);
    actions.push({ type: 'checkout', response: checkout });
    await attachPhotoIfNeeded(event, asset.id, actions, user);
    return { ok: true, asset, actions };
  }

  if (event.flow === 'inventory-delivery') {
    const inventoryType = event.inventoryType || 'consumables';
    const itemId = event.inventoryItemId || event.consumableId;
    const endpoint = inventoryEndpoint(inventoryType);
    const isDamagedPeripheral = event.damagedPeripheral === 'on' && inventoryType === 'accessories';

    if (event.createInventoryItem) {
      const created = await snipeFetch(endpoint, {
        method: 'POST',
        body: buildInventoryCreateBody(event, note),
      }, user);
      return {
        ok: true,
        inventoryType,
        item: normalizeEntity(created?.payload || created, inventoryType),
        actions: [{ type: `create-${inventoryType}`, response: created }],
      };
    }

    if (!itemId) {
      return { ok: false, message: 'Escolha o toner ou periferico para registrar a saida.' };
    }

    if (inventoryType === 'consumables' && event.destinationType !== 'user') {
      return { ok: false, message: 'Toner deve ser entregue para uma pessoa.' };
    }

    const current = await snipeFetch(`${endpoint}/${itemId}`, {}, user);
    const destinationInfo = await resolveDestinationInfo(event, user);
    const checkoutBody = inventoryType === 'accessories'
      ? {
          assigned_user: event.destinationType === 'user' ? event.destinationId : undefined,
          checkout_qty: Number(event.quantity || 1),
          note,
        }
      : {
          assigned_to: event.destinationId,
          note,
        };

    const checkout = await snipeFetch(`${endpoint}/${itemId}/checkout`, {
      method: 'POST',
      body: checkoutBody,
    }, user);

    const itemForSheet = normalizeEntity(current?.payload || current, inventoryType);
    event.inventoryItemName ||= itemForSheet.name || '';
    event.destinationCostCenter = destinationInfo.costCenter || '';
    if (isDamagedPeripheral) {
      const damageReport = await attachDamageReportIfNeeded(event, current?.payload || current, itemId, user);
      if (damageReport) actions.push({ type: 'attach-damage-report', response: damageReport });
    }
    const sheetResult = await appendPeripheralToSheet(event, user, itemForSheet, destinationInfo);
    actions.push({ type: 'google-sheet', response: sheetResult });

    return {
      ok: true,
      inventoryType,
      item: itemForSheet,
      actions: [...actions, { type: `checkout-${inventoryType}`, response: checkout }],
    };
  }

  if (event.flow === 'return-audit') {
    asset = await resolveAsset(event, user);
    const checkin = await snipeFetch(`/api/v1/hardware/${asset.id}/checkin`, {
      method: 'POST',
      body: {
        checkin_at: event.date || today(),
        status_id: event.checkinStatusId || process.env.CENSUPEG_CHECKIN_STATUS_ID || undefined,
        note,
      },
    }, user);
    actions.push({ type: 'checkin', response: checkin });
    const audit = await auditAsset(event, asset, note, user);
    actions.push({ type: 'audit', response: audit });
    await attachPhotoIfNeeded(event, asset.id, actions, user);
    return { ok: true, asset, actions };
  }

  if (event.flow === 'receiving') {
    const inventoryType = event.inventoryType || 'consumables';
    const itemId = event.inventoryItemId || event.consumableId;
    if (event.createInventoryItem) {
      const endpoint = inventoryEndpoint(inventoryType);
      const created = await snipeFetch(endpoint, {
        method: 'POST',
        body: buildInventoryCreateBody(event, note),
      }, user);
      return {
        ok: true,
        inventoryType,
        item: normalizeEntity(created?.payload || created, inventoryType),
        actions: [{ type: `create-${inventoryType}`, response: created }],
      };
    }

    if (itemId) {
      const endpoint = inventoryEndpoint(inventoryType);
      const current = await snipeFetch(`${endpoint}/${itemId}`, {}, user);
      const currentQty = Number(current?.qty || current?.remaining || 0);
      const receivedQty = Number(event.quantity || 1);
      const newQty = currentQty + receivedQty;
      const restockNote = buildRestockNote(event, current, currentQty, receivedQty, newQty);
      event.restock = {
        receivedQty,
        previousQty: currentQty,
        newQty,
      };
      const restock = await snipeFetch(`${endpoint}/${itemId}`, {
        method: 'PATCH',
        body: {
          qty: newQty,
          notes: restockNote,
        },
      }, user);
      return {
        ok: true,
        inventoryType,
        item: normalizeEntity(current, inventoryType),
        actions: [{ type: `restock-${inventoryType}`, response: restock }],
      };
    }

    return { ok: false, message: 'Recebimento registrado localmente. Vincule um item do Snipe-IT para sincronizar estoque.' };
  }

  if (event.flow === 'asset-create') {
    const created = await snipeFetch('/api/v1/hardware', {
      method: 'POST',
      body: {
        asset_tag: event.newAssetTag,
        name: event.newAssetName || undefined,
        serial: event.newAssetSerial || undefined,
        model_id: event.newAssetModelId,
        status_id: event.newAssetStatusId || process.env.CENSUPEG_CHECKIN_STATUS_ID || undefined,
        rtd_location_id: event.newAssetLocationId || undefined,
        notes: note,
      },
    }, user);
    const assetId = created?.payload?.id || created?.id;
    if (assetId) await attachPhotoIfNeeded(event, assetId, actions, user);
    actions.push({ type: 'create-asset', response: created });
    return { ok: true, asset: normalizeEntity(created?.payload || created), actions };
  }

  return { ok: false, message: 'Fluxo registrado localmente.' };
}

function buildInventoryCreateBody(event, note) {
  const body = {
    name: event.inventoryName,
    category_id: event.inventoryCategoryId || undefined,
    manufacturer_id: event.inventoryManufacturerId || undefined,
    model_number: event.inventoryModelNumber || undefined,
    qty: event.quantity || 1,
    notes: note,
  };

  if (event.inventoryType === 'accessories') {
    body.qty = event.quantity || 1;
  }

  return body;
}

function buildRestockNote(event, current, previousQty, receivedQty, newQty) {
  const existingNotes = extractNotes(current);
  const entry = [
    `[${event.date || today()}] Recebimento pelo app mobile`,
    `Quantidade recebida: +${receivedQty}`,
    `Estoque anterior: ${previousQty}`,
    `Estoque atualizado: ${newQty}`,
    event.note ? `Observacao: ${event.note}` : null,
    event.operator?.name ? `Operador: ${event.operator.name}` : null,
  ].filter(Boolean).join('\n');

  return existingNotes ? `${existingNotes}\n\n${entry}` : entry;
}

function extractNotes(item) {
  const value = item?.notes ?? item?.note ?? item?.payload?.notes ?? item?.payload?.note ?? '';
  if (typeof value === 'string') return value.trim();
  if (value?.value) return String(value.value).trim();
  return '';
}

function enrichEventFromSnipeResult(event) {
  const asset = event.snipeIt?.asset;
  if (asset) {
    event.resolvedAsset = {
      id: asset.id || '',
      name: asset.name || '',
      assetTag: asset.assetTag || event.assetTag || '',
      serial: asset.serial || '',
      location: asset.location || '',
      assignedTo: asset.assignedTo || '',
      status: asset.status || '',
    };
    event.assetTag ||= asset.assetTag || '';
    event.assetCurrentLocation = asset.location || '';
    event.assetCurrentAssignee = asset.assignedTo || '';
  }

  if (!event.signerName && event.destinationName) {
    event.signerName = event.destinationName;
  }
}

async function snipeFetch(path, options = {}, user = null) {
  const base = getSnipeUrl(user).replace(/\/$/, '');
  const token = getUserToken(user);
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  };
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(removeUndefined(options.body)) : undefined,
    redirect: 'manual',
  });
  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok) {
    throw publicError(formatSnipeError(data, response.status), response.status);
  }

  return data;
}

async function snipeUpload(path, fields = {}, user = null) {
  const base = getSnipeUrl(user).replace(/\/$/, '');
  const token = getUserToken(user);
  const formData = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    if (value?.buffer) {
      formData.append(name, new Blob([value.buffer], { type: value.mimeType }), value.filename);
    } else {
      formData.append(name, String(value));
    }
  }

  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    redirect: 'manual',
  });
  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok) {
    throw publicError(formatSnipeError(data, response.status), response.status);
  }

  return data;
}

async function snipeBinary(path, user = null) {
  const response = await fetch(`${getSnipeUrl(user)}${path}`, {
    headers: {
      Accept: 'application/octet-stream, application/pdf, */*',
      Authorization: `Bearer ${getUserToken(user)}`,
    },
    redirect: 'manual',
  });
  if (!response.ok) throw publicError(`Nao foi possivel baixar o arquivo anterior (${response.status}).`, response.status);
  return Buffer.from(await response.arrayBuffer());
}

async function snipeDelete(path, user = null) {
  const response = await fetch(`${getSnipeUrl(user)}${path}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${getUserToken(user)}`,
    },
    redirect: 'manual',
  });
  const text = await response.text();
  const data = parseJsonResponse(text);
  if (!response.ok) throw publicError(formatSnipeError(data, response.status), response.status);
  return data;
}

async function resolveAsset(event, user) {
  if (event.assetId) {
    return normalizeEntity(await snipeFetch(`/api/v1/hardware/${event.assetId}`, {}, user));
  }

  if (event.assetTag) {
    return normalizeEntity(await snipeFetch(`/api/v1/hardware/bytag/${encodeURIComponent(event.assetTag)}`, {}, user));
  }

  throw publicError('Informe o ID ou patrimonio do ativo.', 400);
}

async function auditAsset(event, asset, note, user) {
  const body = {
    asset_tag: asset.assetTag || event.assetTag,
    location_id: event.auditLocationId || event.destinationId || undefined,
    next_audit_date: event.nextAuditDate || undefined,
    notes: note,
  };

  return snipeFetch('/api/v1/hardware/audit', {
    method: 'POST',
    body,
  }, user);
}

async function attachPhotoIfNeeded(event, assetId, actions, user) {
  if (!event.photo?.filename) return;

  const filePath = join(uploadsDir, event.photo.filename);
  const buffer = await readFile(filePath);
  const filename = basename(event.photo.filename);
  const upload = await snipeUpload(`/api/v1/hardware/${assetId}/files`, {
    'file[]': {
      buffer,
      filename,
      mimeType: mimeTypes[extname(filename).toLowerCase()] || 'application/octet-stream',
    },
    notes: buildPhotoNote(event),
  }, user);
  actions.push({ type: 'attach-photo', response: upload });
}

async function attachSignedTermIfNeeded(event, user) {
  const assetId = event.resolvedAsset?.id || event.snipeIt?.asset?.id || event.assetId;
  if (!assetId || !event.term?.filename || !isSnipeConfigured(user)) return;

  const filePath = join(termsDir, event.term.filename);
  const buffer = await readFile(filePath);
  try {
    const upload = await snipeUpload(`/api/v1/hardware/${assetId}/files`, {
      'file[]': {
        buffer,
        filename: event.term.filename,
        mimeType: 'application/pdf',
      },
      notes: buildSignedTermNote(event),
    }, user);
    event.term.snipeItFile = { ok: true, itemType: 'hardware', itemId: assetId, response: upload };
  } catch (error) {
    event.term.snipeItFile = { ok: false, itemType: 'hardware', itemId: assetId, error: error.message };
  }
}

async function attachReceivingReceiptIfNeeded(event, user) {
  const inventoryId = event.snipeIt?.item?.id || event.inventoryItemId || event.consumableId || event.receipt?.itemId;
  const receiptType = event.receipt?.itemType || event.inventoryType || 'consumables';
  if (!inventoryId || !event.receipt?.filename || !isSnipeConfigured(user)) return;

  const endpoint = receiptType === 'accessories' ? `/api/v1/accessories/${inventoryId}/files` : `/api/v1/consumables/${inventoryId}/files`;
  const filePath = join(termsDir, event.receipt.filename);
  const buffer = await readFile(filePath);
  try {
    const upload = await snipeUpload(endpoint, {
      'file[]': {
        buffer,
        filename: event.receipt.filename,
        mimeType: 'application/pdf',
      },
      notes: buildReceivingNote(event),
    }, user);
    event.receipt.snipeItFile = { ok: true, itemType: receiptType, itemId: inventoryId, response: upload };
  } catch (error) {
    event.receipt.snipeItFile = { ok: false, itemType: receiptType, itemId: inventoryId, error: error.message };
  }
}

async function attachDamageReportIfNeeded(event, item, inventoryId, user) {
  if (!inventoryId || !isSnipeConfigured(user)) return null;

  let previousFile = null;
  try {
    previousFile = await findAccessoryDamagePdf(inventoryId, user);
  } catch (error) {
    console.error(`Nao foi possivel consultar o PDF anterior do acessorio: ${error.message}`);
  }

  const damagedPeople = await getDamagedPeople(event, inventoryId);
  const pdf = previousFile?.buffer
    ? await appendDamageReportPdf(previousFile.buffer, event, item)
    : await buildDamageReportPdf(event, item, damagedPeople);
  const filename = `${event.createdAt.replace(/[:.]/g, '-')}-${event.id}-item-estragado.pdf`;
  const filePath = join(termsDir, filename);
  await writeFile(filePath, pdf);

  try {
    const upload = await snipeUpload(`/api/v1/accessories/${inventoryId}/files`, {
      'file[]': {
        buffer: pdf,
        filename,
        mimeType: 'application/pdf',
      },
      notes: buildDamageReportNote(event, item),
    }, user);
    let deletedPrevious = false;
    if (previousFile?.file?.id) {
      try {
        await snipeDelete(`/api/v1/accessories/${inventoryId}/files/${previousFile.file.id}/delete`, user);
        deletedPrevious = true;
      } catch (error) {
        console.error(`PDF anterior nao foi removido: ${error.message}`);
      }
    }
    event.damageReport = {
      ok: true,
      filename,
      url: `/terms/${filename}`,
      itemId: inventoryId,
      replacedPrevious: Boolean(previousFile),
      deletedPrevious,
      response: upload,
    };
    return event.damageReport;
  } catch (error) {
    event.damageReport = {
      ok: false,
      filename,
      url: `/terms/${filename}`,
      itemId: inventoryId,
      error: error.message,
    };
    return event.damageReport;
  }
}

async function getDamagedPeople(event, inventoryId) {
  const events = await readEvents();
  const entries = events
    .filter((item) => item.flow === 'inventory-delivery')
    .filter((item) => item.inventoryType === 'accessories')
    .filter((item) => item.damagedPeripheral === 'on')
    .filter((item) => String(item.inventoryItemId || item.consumableId || '') === String(inventoryId))
    .map((item) => ({
      name: item.destinationName || item.destinationId || 'Nao informado',
      date: formatDamageDateTime(item),
    }));

  entries.push({
    name: event.destinationName || event.destinationId || 'Nao informado',
    date: formatDamageDateTime(event),
  });

  const uniquePeople = new Map();
  for (const entry of entries) {
    uniquePeople.set(entry.name.trim().toLocaleLowerCase(), entry);
  }
  return [...uniquePeople.values()];
}

function formatDamageDateTime(event) {
  const date = event.date || String(event.createdAt || '').slice(0, 10) || today();
  if (!event.createdAt) return date;
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(event.createdAt));
  return `${date} ${time}`;
}

async function findAccessoryDamagePdf(inventoryId, user) {
  const data = await snipeFetch(`/api/v1/accessories/${inventoryId}/files`, {}, user);
  const files = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
  const file = files.find((candidate) => /\.pdf$/i.test(candidate?.filename || candidate?.name || candidate?.file_name || ''));
  if (!file?.id) return null;
  const buffer = await snipeBinary(`/api/v1/accessories/${inventoryId}/files/${file.id}`, user);
  return { file, buffer };
}

function buildDamageReportNote(event, item) {
  return [
    'Descarte registrado pelo Snipe-IT Mobile.',
    `Item: ${item?.name || item?.payload?.name || event.inventoryItemName || event.inventoryName || 'Nao informado'}`,
    `Pessoa que danificou o item: ${event.destinationName || event.destinationId || 'Nao informado'}`,
    `Data: ${event.date || today()}`,
    event.operator?.name ? `Registrado por: ${event.operator.name}` : null,
    event.note ? `Observacao: ${event.note}` : null,
  ].filter(Boolean).join('\n');
}

async function buildDamageReportPdf(event, item, damagedPeople = []) {
  const pdf = await PDFDocument.create();
  const people = damagedPeople.length ? damagedPeople : [{ name: 'Nao informado', date: today() }];
  const page = pdf.addPage([595, 90 + people.length * 18]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 32;
  let y = page.getHeight() - 34;

  const drawLine = (text, options = {}) => {
    const size = options.size || 11;
    page.drawText(String(text || ''), {
      x: margin,
      y,
      size,
      font: options.bold ? fontBold : fontRegular,
      color: rgb(0.12, 0.18, 0.24),
      maxWidth: 531,
      lineHeight: size + 3,
    });
    y -= options.step || size + 6;
  };

  drawLine('Descarte', { bold: true, size: 18, step: 30 });
  for (const person of people) {
    drawLine(`${person.name} - ${person.date}`, { size: 10.5, step: 18 });
  }

  return pdf.save();
}

async function appendDamageReportPdf(previousBuffer, event, item) {
  const source = await PDFDocument.load(previousBuffer);
  const pdf = await PDFDocument.create();
  const sourcePages = source.getPages();

  if (!sourcePages.length) {
    return buildDamageReportPdf(event, item, []);
  }

  for (let index = 0; index < sourcePages.length; index += 1) {
    const sourcePage = sourcePages[index];
    const { width, height } = sourcePage.getSize();
    const page = pdf.addPage([width, height + 18]);
    const embeddedPage = await pdf.embedPage(sourcePage);
    page.drawPage(embeddedPage, { x: 0, y: 18, width, height });

    if (index === sourcePages.length - 1) {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const name = event.destinationName || event.destinationId || 'Nao informado';
      page.drawText(`${name} - ${formatDamageDateTime(event)}`, {
        x: 32,
        y: 4,
        size: 10.5,
        font,
        color: rgb(0.12, 0.18, 0.24),
        maxWidth: width - 64,
      });
    }
  }

  return pdf.save();
}

async function appendPeripheralToSheet(event, user, item, destinationInfo) {
  if (!item || event.flow !== 'inventory-delivery' || event.inventoryType !== 'accessories') {
    return { ok: false, skipped: true };
  }
  if (!shouldWriteGoogleSheet()) return { ok: false, configured: false };

  const row = [
    event.createdAt || new Date().toISOString(),
    user?.name || user?.username || '',
    Number(event.quantity || 1),
    item.name || '',
    formatMoney(getPeripheralValue(item)),
    destinationInfo?.name || event.destinationName || '',
    destinationInfo?.costCenter || '',
  ];

  try {
    await appendSheetRow(row);
    return { ok: true };
  } catch (error) {
    console.error(`Falha ao registrar saida na planilha Google: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function shouldWriteGoogleSheet() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
    process.env.GOOGLE_SHEETS_TAB_NAME &&
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE)
  );
}

function getPeripheralValue(item) {
  const raw = item?.raw || item || {};
  const candidates = [
    raw.purchase_cost,
    raw.cost,
    raw.unit_price,
    raw.price,
    raw?.fields?.purchase_cost,
    raw?.fields?.cost,
  ];
  const found = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return found ?? '';
}

function formatMoney(value) {
  if (value === '' || value === null || value === undefined) return '';
  const numeric = Number(String(value).replace(',', '.'));
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function appendSheetRow(values) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_TAB_NAME;
  const auth = await getGoogleAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:G`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

let googleAuthClient = null;
async function getGoogleAuthClient() {
  if (googleAuthClient) return googleAuthClient;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? await readFile(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8')
    : process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  const credentials = JSON.parse(raw);
  googleAuthClient = new google.auth.JWT({
    email: credentials.client_email,
    key: String(credentials.private_key || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  await googleAuthClient.authorize();
  return googleAuthClient;
}

async function resolveDestinationInfo(event, user) {
  if (event.destinationType !== 'user' || !event.destinationId || !isSnipeConfigured(user)) {
    return {
      name: event.destinationName || '',
      costCenter: '',
    };
  }

  try {
    const info = await snipeFetch(`/api/v1/users/${encodeURIComponent(event.destinationId)}`, {}, user);
    const userInfo = info?.payload || info || {};
    return {
      name: userInfo?.name || userInfo?.username || event.destinationName || '',
      costCenter: extractCostCenter(userInfo),
    };
  } catch {
    return {
      name: event.destinationName || '',
      costCenter: '',
    };
  }
}

function extractCostCenter(userInfo) {
  const fields = userInfo?.custom_fields || userInfo?.customFields || {};
  const candidates = [
    userInfo?.department?.name,
    userInfo?.department?.department,
    userInfo?.department_name,
    userInfo?.department,
    fields?.cost_center?.value,
    fields?.centro_de_custo?.value,
    fields?.centro_custo?.value,
    fields?.department?.value,
  ];
  const found = candidates.find((value) => value && String(value).trim());
  return found ? String(found).trim() : '';
}

function validateEvent(event) {
  if ((event.flow === 'delivery' || event.flow === 'loan') && !event.destinationId) {
    throw publicError('Escolha uma pessoa ou local de destino.', 400);
  }

  if (event.flow === 'loan' && !event.returnDate) {
    throw publicError('Informe a data prevista de devolucao.', 400);
  }

  if ((event.flow === 'delivery' || event.flow === 'loan') && !event.assetId) {
    throw publicError('Escolha um ativo para registrar a saida.', 400);
  }

  if (event.flow === 'inventory-delivery' && !event.inventoryItemId && !event.consumableId && !event.createInventoryItem) {
    throw publicError('Escolha um toner ou periferico para registrar a saida.', 400);
  }

  if (event.flow === 'receiving' && event.inventoryType && !['consumables', 'accessories'].includes(event.inventoryType)) {
    throw publicError('Recebimento aceita apenas toner/consumivel ou periferico.', 400);
  }

  if (event.flow === 'receiving' && event.createInventoryItem && !event.inventoryName) {
    throw publicError('Informe o nome do novo toner/periferico.', 400);
  }

  if (event.flow === 'receiving' && !(event.createInventoryItem || event.inventoryItemId || event.consumableId)) {
    throw publicError('Escolha o item do Snipe-IT para atualizar o estoque.', 400);
  }

  if (event.flow === 'asset-create' && !(event.newAssetTag && event.newAssetModelId)) {
    throw publicError('Informe patrimonio e modelo para criar o ativo.', 400);
  }
}

function getOverdueLoans(events) {
  const todayDate = today();
  const returnedKeys = new Set(
    events
      .filter((event) => event.flow === 'return-audit')
      .map((event) => assetKey(event))
      .filter(Boolean)
  );

  return events
    .filter((event) => event.flow === 'loan' && event.returnDate && event.returnDate < todayDate)
    .filter((event) => !returnedKeys.has(assetKey(event)))
    .map((event) => ({
      id: event.id,
      asset: event.assetTag || event.assetId || 'sem patrimonio',
      assetId: event.assetId || '',
      assetTag: event.assetTag || '',
      borrower: event.destinationName || event.destinationId || 'sem destino',
      email: event.destinationEmail || '',
      returnDate: event.returnDate,
      daysLate: daysBetween(event.returnDate, todayDate),
      operator: event.operator?.name || event.operator?.username || '',
      createdAt: event.createdAt,
    }));
}

function assetKey(event) {
  return event.assetId ? `id:${event.assetId}` : event.assetTag ? `tag:${event.assetTag}` : '';
}

function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

function sanitizePayload(payload) {
  const copy = { ...payload };
  delete copy.photoData;
  return copy;
}

function buildNote(event) {
  const parts = [
    event.flowLabel || event.flow,
    event.note,
    event.damagedPeripheral === 'on' ? 'Substituicao por periferico estragado.' : null,
    event.returnDate ? `Devolucao prevista: ${event.returnDate}` : null,
    event.photo?.url ? `Foto: ${event.photo.url}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

function buildPhotoNote(event) {
  return [
    `Foto anexada pelo Snipe-IT Mobile no registro ${event.id}.`,
    event.flowLabel || event.flow,
    event.note || null,
  ].filter(Boolean).join('\n');
}

function buildSignedTermNote(event) {
  return [
    `Termo assinado pelo Snipe-IT Mobile no registro ${event.id}.`,
    event.flowLabel || event.flow,
    event.signerName ? `Assinado por: ${event.signerName}` : null,
    event.destinationName ? `Receptor: ${event.destinationName}` : null,
  ].filter(Boolean).join('\n');
}

function buildReceivingNote(event) {
  return [
    `Recebimento registrado pelo Snipe-IT Mobile no registro ${event.id}.`,
    `Quantidade: ${event.restock?.receivedQty || event.quantity || 1}`,
    event.note ? `Nota: ${event.note}` : null,
    event.operator?.name ? `Operador: ${event.operator.name}` : null,
  ].filter(Boolean).join('\n');
}

async function savePhoto(dataUrl, createdAt) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('Foto invalida.');

  const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
  const filename = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}.${ext}`;
  await writeFile(join(uploadsDir, filename), Buffer.from(match[2], 'base64'));
  return { filename, url: `/uploads/${filename}` };
}

async function serveStatic(pathname, res) {
  if (pathname === '/vendor/zxing-browser.min.js') {
    const vendorPath = join(__dirname, 'node_modules', '@zxing', 'browser', 'umd', 'zxing-browser.min.js');
    try {
      await access(vendorPath);
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      createReadStream(vendorPath).pipe(res);
    } catch {
      sendText(res, 404, 'Biblioteca de QR Code nao instalada. Execute npm install.');
    }
    return;
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const root = requested.startsWith('/uploads/') || requested.startsWith('/terms/') ? __dirname : publicDir;
  const filePath = normalize(join(root, requested.replace(/^\/+/, '')));

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    return sendText(res, 403, 'Acesso negado.');
  }

  try {
    await access(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, 'Arquivo nao encontrado.');
  }
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 12_000_000) throw new Error('Requisicao muito grande.');
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const error = new Error('JSON invalido.');
    error.status = 400;
    error.publicMessage = 'JSON invalido.';
    throw error;
  }
}

async function readEvents() {
  if (mysqlPool) {
    const [rows] = await mysqlPool.query('SELECT payload FROM app_events ORDER BY created_at DESC LIMIT 500');
    return rows.map((row) => parseDbJson(row.payload));
  }
  return JSON.parse(await readFile(eventsFile, 'utf8'));
}

async function writeEvents(events) {
  if (mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM app_events');
      for (const event of events.slice(0, 500)) {
        await conn.query(
          'INSERT INTO app_events (id, created_at, status, payload) VALUES (?, ?, ?, ?)',
          [event.id, toMysqlDate(event.createdAt), event.status || 'local', JSON.stringify(event)]
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    return;
  }

  await writeFile(eventsFile, JSON.stringify(events.slice(0, 500), null, 2));
}

async function initStorage() {
  if (storageClient === 'mysql' || storageClient === 'mariadb') {
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'snipe_mobile',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'snipe_mobile',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
      charset: 'utf8mb4',
    });
    await ensureMysqlStorage();
    return;
  }

  await ensureEventsFile();
  await ensureUsersFile();
  await ensureSettingsFile();
}

async function ensureMysqlStorage() {
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      name VARCHAR(180) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'operator',
      active TINYINT(1) NOT NULL DEFAULT 1,
      snipe_it_url VARCHAR(500) NOT NULL,
      snipe_it_token TEXT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS app_events (
      id VARCHAR(64) PRIMARY KEY,
      created_at DATETIME NOT NULL,
      status VARCHAR(40) NOT NULL,
      payload JSON NOT NULL,
      INDEX idx_app_events_created_at (created_at),
      INDEX idx_app_events_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id VARCHAR(80) PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  const [userRows] = await mysqlPool.query('SELECT COUNT(*) AS total FROM app_users');
  if (!Number(userRows[0]?.total || 0)) {
    await migrateJsonUsersToMysql();
  }

  const [settingsRows] = await mysqlPool.query('SELECT COUNT(*) AS total FROM app_settings WHERE id = ?', ['main']);
  if (!Number(settingsRows[0]?.total || 0)) {
    await migrateJsonSettingsToMysql();
  }

  const [eventRows] = await mysqlPool.query('SELECT COUNT(*) AS total FROM app_events');
  if (!Number(eventRows[0]?.total || 0)) {
    await migrateJsonEventsToMysql();
  }
}

async function migrateJsonUsersToMysql() {
  let users = [];
  try {
    users = JSON.parse(await readFile(usersFile, 'utf8'));
  } catch {
    users = [];
  }

  if (!users.length) {
    users = [createInitialAdmin()];
  }

  await writeUsers(users);
}

async function migrateJsonSettingsToMysql() {
  let settings = defaultSettings();
  try {
    settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  } catch {
    // Usa configuracao padrao.
  }
  await writeSettings(settings);
}

async function migrateJsonEventsToMysql() {
  let events = [];
  try {
    events = JSON.parse(await readFile(eventsFile, 'utf8'));
  } catch {
    events = [];
  }
  await writeEvents(events);
}

function defaultSettings() {
  return {
    terms: {
      delivery: 'Declaro que recebi o item {{asset}} em {{date}}, em bom estado de uso, e me responsabilizo pela guarda, zelo e devolucao quando solicitado.',
      return: 'Declaro que devolvi o item {{asset}} em {{date}}. A equipe de TI confirma o recebimento para conferencia e auditoria.',
    },
  };
}

function parseDbJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function toMysqlDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function fromMysqlDate(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

async function ensureEventsFile() {
  try {
    await readFile(eventsFile, 'utf8');
  } catch {
    await writeFile(eventsFile, '[]');
  }
}

async function ensureUsersFile() {
  try {
    await readFile(usersFile, 'utf8');
  } catch {
    await writeUsers([createInitialAdmin()]);
  }
}

async function ensureBootstrapSuperAdmin() {
  if (process.env.INITIAL_ADMIN_ROLE === 'admin') return;
  const username = String(process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
  if (!username) return;
  const users = await readUsers();
  if (users.some((item) => item.active !== false && item.role === 'superadmin')) return;
  const target = users.find((item) => item.username.toLowerCase() === username);
  if (!target) return;
  target.role = 'superadmin';
  await writeUsers(users);
}

function createInitialAdmin() {
  const username = String(process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
  const name = String(process.env.INITIAL_ADMIN_NAME || '').trim();
  const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
  if (!username || !name || password.length < 12) {
    throw new Error('Configure INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_NAME e INITIAL_ADMIN_PASSWORD (minimo 12 caracteres) no .env antes do primeiro inicio.');
  }
  return {
    id: randomUUID(),
    username,
    name,
    role: process.env.INITIAL_ADMIN_ROLE === 'admin' ? 'admin' : 'superadmin',
    active: true,
    snipeItUrl: process.env.SNIPEIT_URL || '',
    snipeItToken: process.env.SNIPEIT_TOKEN || '',
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
}

async function ensureSettingsFile() {
  try {
    await readFile(settingsFile, 'utf8');
  } catch {
    await writeSettings(defaultSettings());
  }
}

async function readUsers() {
  if (mysqlPool) {
    const [rows] = await mysqlPool.query('SELECT * FROM app_users ORDER BY created_at ASC');
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      active: Boolean(row.active),
      snipeItUrl: row.snipe_it_url,
      snipeItToken: row.snipe_it_token || '',
      passwordHash: row.password_hash,
      createdAt: fromMysqlDate(row.created_at),
    }));
  }
  return JSON.parse(await readFile(usersFile, 'utf8'));
}

async function writeUsers(users) {
  if (mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM app_users');
      for (const user of users) {
        await conn.query(
          `INSERT INTO app_users
            (id, username, name, role, active, snipe_it_url, snipe_it_token, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            user.username,
            user.name,
            user.role,
            user.active !== false ? 1 : 0,
            user.snipeItUrl || defaultSnipeUrl,
            user.snipeItToken || '',
            user.passwordHash,
            toMysqlDate(user.createdAt),
          ]
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    return;
  }

  await writeFile(usersFile, JSON.stringify(users, null, 2));
}

async function readSettings() {
  if (mysqlPool) {
    const [rows] = await mysqlPool.query('SELECT payload FROM app_settings WHERE id = ?', ['main']);
    if (rows[0]) return parseDbJson(rows[0].payload);
    const settings = defaultSettings();
    await writeSettings(settings);
    return settings;
  }
  return JSON.parse(await readFile(settingsFile, 'utf8'));
}

async function writeSettings(settings) {
  if (mysqlPool) {
    await mysqlPool.query(
      `INSERT INTO app_settings (id, payload)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
      ['main', JSON.stringify(settings)]
    );
    return;
  }

  await writeFile(settingsFile, JSON.stringify(settings, null, 2));
}

async function requireAuth(req) {
  const sessionId = getCookie(req, 'sid');
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session) throw publicError('Login necessario.', 401);
  const sessionTtl = Number(process.env.SESSION_TTL_SECONDS || 28800) * 1000;
  if (!Number.isFinite(sessionTtl) || Date.now() - session.createdAt > sessionTtl) {
    sessions.delete(sessionId);
    throw publicError('Sessao expirada. Entre novamente.', 401);
  }
  const users = await readUsers();
  const user = users.find((item) => item.id === session.userId && item.active !== false);
  if (!user) throw publicError('Login necessario.', 401);
  return user;
}

function requireAdmin(user) {
  if (!['admin', 'superadmin'].includes(user.role)) throw publicError('Acesso restrito ao administrador.', 403);
}

function requireSuperAdmin(user) {
  if (user.role !== 'superadmin') throw publicError('Acesso restrito ao superadmin.', 403);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    snipeItUrl: user.snipeItUrl || defaultSnipeUrl,
    hasToken: Boolean(user.snipeItToken),
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, 120000, 32, 'sha256');
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

function setSecurityHeaders(res, url) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (url.pathname.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (httpsEnabled) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function buildSessionCookie(sessionId, maxAge) {
  const secure = httpsEnabled ? '; Secure' : '';
  return `sid=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function getClientKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function checkLoginRateLimit(clientKey) {
  const now = Date.now();
  const entry = loginAttempts.get(clientKey);
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) {
    loginAttempts.set(clientKey, { startedAt: now, failures: 0 });
    return;
  }
  if (entry.failures >= 8) throw publicError('Muitas tentativas. Aguarde alguns minutos.', 429);
}

function recordLoginFailure(clientKey) {
  const entry = loginAttempts.get(clientKey) || { startedAt: Date.now(), failures: 0 };
  entry.failures += 1;
  loginAttempts.set(clientKey, entry);
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || '';
  const parts = cookie.split(';').map((item) => item.trim());
  const found = parts.find((item) => item.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}

async function createSignedTerm(event) {
  const settings = await readSettings();
  const termType = event.flow === 'return-audit' ? 'return' : 'delivery';
  const template = settings.terms[termType] || '';
  const signature = await saveSignature(event.signatureData, event.createdAt);
  const pdf = await buildTermPdf(event, template, signature);
  const filename = `${event.createdAt.replace(/[:.]/g, '-')}-${event.id}.pdf`;
  await writeFile(join(termsDir, filename), pdf);
  return { type: termType, filename, url: `/terms/${filename}`, signature };
}

async function saveSignature(dataUrl, createdAt) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl || '');
  if (!match) throw publicError('Assinatura invalida.', 400);
  const filename = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}-assinatura.png`;
  await writeFile(join(uploadsDir, filename), Buffer.from(match[1], 'base64'));
  return { filename, url: `/uploads/${filename}` };
}

function termAssetLabel(event) {
  return [
    event.resolvedAsset?.assetTag || event.assetTag || '',
    event.resolvedAsset?.name || '',
    event.resolvedAsset?.serial ? `Serial ${event.resolvedAsset.serial}` : '',
  ].filter(Boolean).join(' - ') || event.inventoryName || 'Item sem identificacao';
}

function termAllocationLabel(event) {
  return event.assetCurrentAssignee || event.assetCurrentLocation || event.resolvedAsset?.assignedTo || event.resolvedAsset?.location || '';
}

async function buildTermPdf(event, template, signature) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = page.getWidth();
  const margin = 44;
  let y = 792;

  const drawLine = (text, options = {}) => {
    const size = options.size || 11;
    page.drawText(String(text || ''), {
      x: options.x || margin,
      y,
      size,
      font: options.bold ? fontBold : fontRegular,
      color: options.color || rgb(0.12, 0.18, 0.24),
      maxWidth: options.maxWidth || width - margin * 2,
      lineHeight: options.lineHeight || size + 3,
    });
    y -= options.step || size + 8;
  };

  const assetLabel = termAssetLabel(event);
  const allocation = termAllocationLabel(event);
  const receiverLabel = event.destinationName || event.signerName || '';
  const replacements = {
    asset: assetLabel,
    date: event.date || today(),
    receiver: receiverLabel,
    email: event.destinationEmail || '',
    operator: event.operator?.name || event.operator?.username || '',
    note: event.note || '',
    allocation,
  };
  const termText = String(template || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => replacements[key] || '');

  drawLine(event.flow === 'return-audit' ? 'Termo de Devolucao' : 'Termo de Entrega', { bold: true, size: 18, step: 24 });
  drawLine(`Registro: ${event.id}`);
  drawLine(`Data: ${event.date || today()}`);
  drawLine(`Item: ${assetLabel}`);
  if (allocation) drawLine(`Alocacao atual: ${allocation}`);
  drawLine(`Receptor: ${receiverLabel}${event.destinationEmail ? ` <${event.destinationEmail}>` : ''}`);
  drawLine(`Operador: ${event.operator?.name || event.operator?.username || ''}`);
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.82, 0.84, 0.88) });
  y -= 16;

  for (const line of termText.split(/\r?\n/)) {
    drawLine(line, { size: 10.5, step: 14 });
  }

  drawLine(`Assinatura: ${event.signerName || receiverLabel}`, { bold: true, size: 11, step: 14 });

  const signatureImage = await embedImage(pdf, signature.filename);
  if (signatureImage) {
    const dims = signatureImage.scale(0.45);
    page.drawImage(signatureImage, {
      x: margin,
      y: Math.max(48, y - dims.height - 4),
      width: dims.width,
      height: dims.height,
    });
  }

  const photoImage = event.photo?.filename ? await embedImage(pdf, event.photo.filename) : null;
  if (photoImage) {
    const photoPage = pdf.addPage([595, 842]);
    const photoFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    photoPage.drawText('Foto do material', {
      x: 44,
      y: 792,
      size: 18,
      font: photoFont,
      color: rgb(0.12, 0.18, 0.24),
    });
    const maxWidth = 507;
    const maxHeight = 690;
    const scale = Math.min(maxWidth / photoImage.width, maxHeight / photoImage.height, 1);
    const width = photoImage.width * scale;
    const height = photoImage.height * scale;
    photoPage.drawImage(photoImage, {
      x: 44 + (maxWidth - width) / 2,
      y: 70 + (maxHeight - height) / 2,
      width,
      height,
    });
  }

  return pdf.save();
}

async function createReceivingReceipt(event) {
  const receipt = await buildReceivingPdf(event);
  const filename = `${event.createdAt.replace(/[:.]/g, '-')}-${event.id}-recebimento.pdf`;
  await writeFile(join(termsDir, filename), receipt);
  return {
    itemType: event.inventoryType || 'consumables',
    itemId: event.snipeIt?.item?.id || event.inventoryItemId || event.consumableId || '',
    filename,
    url: `/terms/${filename}`,
  };
}

async function buildReceivingPdf(event) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const margin = 44;
  let y = 792;

  const drawLine = (text, opts = {}) => {
    const size = opts.size || 11;
    page.drawText(String(text || ''), {
      x: opts.x || margin,
      y,
      size,
      font: opts.bold ? fontBold : fontRegular,
      color: opts.color || rgb(0.12, 0.18, 0.24),
      maxWidth: opts.maxWidth || width - margin * 2,
      lineHeight: opts.lineHeight || size + 3,
    });
    y -= opts.step || size + 8;
  };

  drawLine('Comprovante de Recebimento', { size: 18, bold: true, step: 26 });
  drawLine(`Registro: ${event.id}`);
  drawLine(`Data: ${event.date || today()}`);
  drawLine(`Item: ${event.inventoryName || event.receipt?.itemId || event.inventoryItemId || event.consumableId || ''}`);
  drawLine(`Tipo: ${event.inventoryType === 'accessories' ? 'Periferico' : 'Toner / consumivel'}`);
  drawLine(`Quantidade: ${event.restock?.receivedQty || event.quantity || 1}`);
  drawLine(`Operador: ${event.operator?.name || event.operator?.username || ''}`);
  if (event.note) drawLine(`Nota: ${event.note}`);
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.83, 0.87) });
  y -= 20;

  const photoImage = event.photo?.filename ? await embedImage(pdf, event.photo.filename) : null;
  if (photoImage) {
    const photoPage = pdf.addPage([595, 842]);
    const photoFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    photoPage.drawText('Foto do recebimento', {
      x: 44,
      y: 792,
      size: 18,
      font: photoFont,
      color: rgb(0.12, 0.18, 0.24),
    });
    const maxWidth = 507;
    const maxHeight = 690;
    const scale = Math.min(maxWidth / photoImage.width, maxHeight / photoImage.height, 1);
    const width = photoImage.width * scale;
    const height = photoImage.height * scale;
    photoPage.drawImage(photoImage, {
      x: 44 + (maxWidth - width) / 2,
      y: 70 + (maxHeight - height) / 2,
      width,
      height,
    });
  }

  return pdf.save();
}

async function embedImage(pdf, filename) {
  const filePath = join(uploadsDir, filename);
  const buffer = await readFile(filePath);
  const ext = extname(filename).toLowerCase();
  if (ext === '.png') return pdf.embedPng(buffer);
  if (ext === '.jpg' || ext === '.jpeg') return pdf.embedJpg(buffer);
  return null;
}

function escapeHtmlText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
}

function normalizeSearchResults(type, data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return {
    total: data?.total || rows.length,
    rows: rows.map((item) => normalizeEntity(item, type)),
  };
}

function normalizeEntity(item, fallbackType = '') {
  const id = item?.id || item?.payload?.id;
  return {
    id,
    type: fallbackType,
    name: item?.name || item?.payload?.name || item?.username || item?.asset_tag || String(id || ''),
    assetTag: item?.asset_tag || item?.payload?.asset_tag || null,
    serial: item?.serial || null,
    username: item?.username || null,
    email: item?.email || null,
    modelNumber: item?.model_number || item?.model?.model_number || null,
    location: item?.location?.name || item?.rtd_location?.name || null,
    assignedTo: item?.assigned_to?.name || item?.assigned_to?.username || null,
    status: item?.status_label?.name || item?.status?.name || null,
    category: item?.category?.name || null,
    qty: item?.qty ?? item?.remaining ?? item?.available_actions_count ?? null,
    remaining: item?.remaining ?? null,
    raw: item,
  };
}

function inventoryEndpoint(type) {
  const endpoints = {
    consumables: '/api/v1/consumables',
    accessories: '/api/v1/accessories',
    components: '/api/v1/components',
  };
  if (!endpoints[type]) {
    throw publicError('Tipo de estoque invalido.', 400);
  }
  return endpoints[type];
}

function parseJsonResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatSnipeError(data, status) {
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    return 'Snipe-IT redirecionou para login. Verifique se o token de API esta correto.';
  }
  if (typeof data?.messages === 'string') return data.messages;
  if (data?.messages && typeof data.messages === 'object') {
    return Object.values(data.messages).flat().join(' ');
  }
  return data?.message || data?.raw || `Snipe-IT respondeu ${status}`;
}

function publicError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function isSnipeConfigured(user = null) {
  return Boolean(getSnipeUrl(user) && getUserToken(user));
}

function getSnipeUrl(user = null) {
  return normalizeBaseUrl(user?.snipeItUrl || process.env.SNIPEIT_URL || defaultSnipeUrl);
}

function getUserToken(user = null) {
  return user?.snipeItToken || '';
}

function normalizeBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadDotEnv() {
  try {
    const text = readFileSync(envFile, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || match[1].startsWith('#')) continue;
      process.env[match[1]] ||= match[2].replace(/^"|"$/g, '');
    }
  } catch {
    // .env e opcional.
  }
}

async function persistEnv(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${escapeEnvValue(value)}`);
  await writeFile(envFile, `${lines.join('\n')}\n`);
}

function escapeEnvValue(value) {
  const text = String(value || '');
  return /[\s#"'=]/.test(text) ? JSON.stringify(text) : text;
}
