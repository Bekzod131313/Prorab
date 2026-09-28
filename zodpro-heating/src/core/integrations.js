// Integration / API layer — abstractions, not hard-wired vendors.
//  • ExchangeRateProvider: manual (default) or any provider registered at runtime.
//  • ErpConnector: SAP (or other ERP) — article mapping, stock query, order creation.
//    Ships with a LocalWarehouse implementation (stock table stored in the project) so the
//    BOM → stock → shortage → procurement chain works offline; a real SAP OData/RFC adapter
//    implements the same interface (backlog INT-SAP-ADAPTER).
//  • Messenger: Telegram Bot API adapter (user-provided token/chat id) + text builders.
//  • Plugin system: manifest, permissions, events, commands, UI extension points.
//  • Roles / permissions: granular permission matrix.

export const ROLES = {
  manager: { name: 'Project Manager', perms: ['*'] },
  engineer: { name: 'Engineer', perms: ['model.edit', 'calc.run', 'docs.export', 'issues.edit', 'settings.edit'] },
  designer: { name: 'Designer', perms: ['model.edit', 'docs.export', 'issues.edit'] },
  estimator: { name: 'Estimator', perms: ['cost.edit', 'docs.export', 'procurement.edit'] },
  installer: { name: 'Installer', perms: ['asbuilt.edit', 'issues.edit'] },
  client: { name: 'Client', perms: ['view'] },
};

export function can(role, perm) {
  const r = ROLES[role] ?? ROLES.client;
  return r.perms.includes('*') || r.perms.includes(perm) || perm === 'view';
}

// ---------------- ERP / SAP ----------------
export class ErpConnector {
  // eslint-disable-next-line no-unused-vars
  async stock(articles) {
    throw new Error('not implemented');
  }
  // eslint-disable-next-line no-unused-vars
  async createOrder(lines) {
    throw new Error('not implemented');
  }
}

export class LocalWarehouse extends ErpConnector {
  constructor(project) {
    super();
    this.project = project;
  }
  async stock(articles) {
    const table = this.project.warehouse ?? {};
    return Object.fromEntries(articles.map((a) => [a, table[a] ?? 0]));
  }
  async createOrder(lines) {
    const id = `PO-${Date.now().toString(36).toUpperCase()}`;
    return { id, lines, status: 'draft', created: new Date().toISOString() };
  }
}

/** Required vs warehouse → shortage per BOM row (e.g. Required 840 m, Warehouse 620 m, Shortage 220 m). */
export async function procurement(bomRows, erp) {
  const stock = await erp.stock(bomRows.map((r) => r.sapArticle || r.article));
  return bomRows.map((r) => {
    const have = stock[r.sapArticle || r.article] ?? 0;
    const shortage = Math.max(0, r.purchase - have);
    return { ...r, warehouse: have, shortage };
  });
}

// ---------------- Messenger ----------------
export function materialListText(project, res) {
  const lines = res.bom.rows.map((r) => `• ${r.name} — ${+r.purchase.toFixed(2)} ${r.unit}`);
  return `📋 ${project.meta.name} (${project.meta.number})\nMateriallar ro‘yxati:\n${lines.join('\n')}\n\nJami: ${Math.round(res.cost.total).toLocaleString('ru-RU')} ${res.cost.currency}`;
}

export function statusText(project, res) {
  const v = res.validation.counts;
  return `📊 ${project.meta.name}\nIssiqlik yo‘qotish: ${Math.round(res.totals.heatLoss)} W\nQozon: ${res.boiler.product?.model ?? '—'}\nNasos: ${res.pump.product?.model ?? '—'}\nTekshiruv: OK ${v.ok} · ⚠ ${v.warning} · ✖ ${v.error} · ‼ ${v.critical}\nOchiq muammolar: ${project.issues.filter((i) => i.status !== 'closed').length}`;
}

export async function sendTelegram({ token, chatId, text }) {
  if (!token || !chatId) throw new Error('Telegram token va chat id kerak');
  const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Telegram xatosi');
  return j;
}

// ---------------- Plugins ----------------
export const PLUGIN_API_VERSION = '1.0';
export class PluginHost {
  constructor(app) {
    this.app = app;
    this.plugins = new Map();
    this.handlers = new Map();
  }
  /**
   * manifest: { id, name, version, apiVersion, permissions: ['model.read','model.write','ui.panel','net'] }
   * activate(api) receives a permission-filtered API.
   */
  register(manifest, activate) {
    if (!manifest?.id) throw new Error('manifest.id required');
    const [maj] = String(manifest.apiVersion ?? '').split('.');
    if (maj !== PLUGIN_API_VERSION.split('.')[0]) throw new Error(`Plugin ${manifest.id}: incompatible API ${manifest.apiVersion}`);
    const perms = new Set(manifest.permissions ?? []);
    const need = (p) => {
      if (!perms.has(p)) throw new Error(`Plugin ${manifest.id} lacks permission ${p}`);
    };
    const api = {
      version: PLUGIN_API_VERSION,
      getProject: () => (need('model.read'), JSON.parse(JSON.stringify(this.app.store.project))),
      getResults: () => (need('model.read'), this.app.store.results),
      apply: (cs, label) => (need('model.write'), this.app.store.apply(cs, `plugin:${manifest.id}:${label ?? ''}`)),
      addCommand: (cmd) => (need('ui.command'), this.app.registerCommand({ ...cmd, id: `${manifest.id}.${cmd.id}` })),
      on: (evt, fn) => {
        if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
        this.handlers.get(evt).add(fn);
      },
      toast: (m) => this.app.toast(`[${manifest.name}] ${m}`),
    };
    this.plugins.set(manifest.id, { manifest, api });
    activate(api);
    return api;
  }
  emit(evt, payload) {
    for (const fn of this.handlers.get(evt) ?? []) {
      try {
        fn(payload);
      } catch (err) {
        console.error('[plugin]', err);
      }
    }
  }
}

// ---------------- REST API contract (server side is backlog; client uses the same shapes) ----------------
export const API_ROUTES = [
  'GET /api/v1/projects', 'POST /api/v1/projects', 'GET /api/v1/projects/:id', 'PUT /api/v1/projects/:id',
  'GET /api/v1/projects/:id/rooms', 'GET /api/v1/projects/:id/elements', 'PATCH /api/v1/projects/:id/elements/:eid',
  'POST /api/v1/projects/:id/calculate', 'GET /api/v1/projects/:id/schedules/:key', 'GET /api/v1/projects/:id/materials',
  'GET /api/v1/products', 'GET /api/v1/suppliers', 'GET /api/v1/stock', 'GET /api/v1/users', 'GET /api/v1/projects/:id/issues',
  'POST /api/v1/projects/:id/issues', 'GET /api/v1/projects/:id/documents',
];
