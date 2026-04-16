import { z } from 'zod'
import { createId, mockStore } from '../data/mockStore.js'
import { mapInternalToSnipeStatus } from '../utils/statusMap.js'
import { writeAudit } from '../utils/audit.js'
import { snipeItService } from '../services/snipeItService.js'

const requestSchema = z.object({
  requester_name: z.string().min(2),
  requester_email: z.string().email().optional().or(z.literal('')),
  cost_center: z.string().min(2),
  department: z.string().min(2),
  location: z.string().min(2),
  asset_type: z.string().min(2),
  justification: z.string().min(3),
  notes: z.string().optional()
})

export const listRequests = (req, res) => {
  const { status, cost_center, department, location, requester } = req.query

  const rows = mockStore.requests.filter((item) => {
    if (status && item.status !== status) return false
    if (cost_center && item.cost_center !== cost_center) return false
    if (department && item.department !== department) return false
    if (location && item.location !== location) return false
    if (requester && !item.requester_name.toLowerCase().includes(String(requester).toLowerCase())) return false
    return true
  })

  res.json({ rows })
}

export const createRequest = (req, res) => {
  const input = requestSchema.parse(req.body)
  const now = new Date().toISOString()
  const row = { id: createId(), ...input, status: 'solicitado', created_by: req.user.sub, created_at: now, updated_at: now }

  mockStore.requests.push(row)
  writeAudit({ userId: req.user.sub, action: 'create_request', entityType: 'asset_requests', entityId: row.id, payload: row })

  res.status(201).json(row)
}

export const getRequestById = (req, res) => {
  const row = mockStore.requests.find((item) => item.id === req.params.id)

  if (!row) {
    return res.status(404).json({ error: 'Solicitação não encontrada' })
  }

  return res.json(row)
}

export const updateRequest = (req, res) => {
  const row = mockStore.requests.find((item) => item.id === req.params.id)

  if (!row) {
    return res.status(404).json({ error: 'Solicitação não encontrada' })
  }

  Object.assign(row, req.body, { updated_at: new Date().toISOString() })
  writeAudit({ userId: req.user.sub, action: 'update_request', entityType: 'asset_requests', entityId: row.id, payload: req.body })

  return res.json(row)
}

export const assignAsset = async (req, res) => {
  const schema = z.object({ snipe_asset_id: z.union([z.number(), z.string()]), asset_tag: z.string().optional(), serial: z.string().optional(), notes: z.string().optional() })
  const input = schema.parse(req.body)
  const request = mockStore.requests.find((item) => item.id === req.params.id)

  if (!request) {
    return res.status(404).json({ error: 'Solicitação não encontrada' })
  }

  const now = new Date().toISOString()
  const flow = {
    id: createId(),
    request_id: request.id,
    snipe_asset_id: Number(input.snipe_asset_id),
    asset_tag: input.asset_tag || null,
    serial: input.serial || null,
    internal_status: 'em_preparacao',
    snipe_status: mapInternalToSnipeStatus('em_preparacao'),
    assigned_user_name: request.requester_name,
    cost_center: request.cost_center,
    department: request.department,
    location: request.location,
    notes: input.notes || request.notes || null,
    delivered_at: null,
    returned_at: null,
    created_at: now,
    updated_at: now
  }

  mockStore.flows.push(flow)
  request.status = 'em_preparacao'
  request.updated_at = now

  writeAudit({ userId: req.user.sub, action: 'assign_asset', entityType: 'asset_flow', entityId: flow.id, payload: flow })

  return res.status(201).json(flow)
}

export const markPreparing = (req, res) => {
  const flow = mockStore.flows.find((item) => item.request_id === req.params.id)

  if (!flow) {
    return res.status(404).json({ error: 'Fluxo não encontrado' })
  }

  flow.internal_status = 'em_preparacao'
  flow.updated_at = new Date().toISOString()

  return res.json({ success: true, flow })
}

export const markAwaitingPickup = (req, res) => {
  const flow = mockStore.flows.find((item) => item.request_id === req.params.id)

  if (!flow) {
    return res.status(404).json({ error: 'Fluxo não encontrado' })
  }

  flow.internal_status = 'aguardando_retirada'
  flow.updated_at = new Date().toISOString()

  const request = mockStore.requests.find((item) => item.id === req.params.id)
  if (request) request.status = 'aguardando_retirada'

  return res.json({ success: true, flow })
}

export const deliver = async (req, res) => {
  const schema = z.object({ requester_name_confirmed: z.string().min(2), signature_base64: z.string().optional(), photo_url: z.string().optional() })
  const input = schema.parse(req.body)

  const flow = mockStore.flows.find((item) => item.request_id === req.params.id)
  const request = mockStore.requests.find((item) => item.id === req.params.id)

  if (!request || !flow) {
    return res.status(404).json({ error: 'Fluxo não encontrado' })
  }

  if (!request.requester_name) {
    return res.status(400).json({ error: 'Solicitante obrigatório para entrega' })
  }

  if (!flow.snipe_asset_id) {
    return res.status(400).json({ error: 'Ativo não selecionado para entrega' })
  }

  await snipeItService.checkoutAsset(flow.snipe_asset_id, {
    assigned_user: request.requester_name,
    note: `Entrega confirmada por ${input.requester_name_confirmed}`
  })

  flow.internal_status = 'em_uso'
  flow.snipe_status = mapInternalToSnipeStatus('em_uso')
  flow.delivered_at = new Date().toISOString()
  flow.updated_at = flow.delivered_at
  flow.notes = `${flow.notes || ''}\nEntrega por ${req.user.name}`.trim()
  request.status = 'em_uso'
  request.updated_at = flow.delivered_at

  const movement = {
    id: createId(),
    snipe_asset_id: flow.snipe_asset_id,
    movement_type: 'deliver',
    from_status: 'aguardando_retirada',
    to_status: 'em_uso',
    operator_id: req.user.sub,
    requester_name: request.requester_name,
    cost_center: request.cost_center,
    department: request.department,
    location: request.location,
    notes: 'Entrega confirmada',
    metadata_json: { signature_base64: input.signature_base64 || null, photo_url: input.photo_url || null },
    created_at: flow.delivered_at
  }

  mockStore.movements.push(movement)
  writeAudit({ userId: req.user.sub, action: 'deliver_asset', entityType: 'asset_movements', entityId: movement.id, payload: movement })

  return res.json({ success: true, flow, movement })
}
