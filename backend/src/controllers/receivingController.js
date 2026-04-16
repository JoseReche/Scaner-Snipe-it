import { z } from 'zod'
import { createId, mockStore } from '../data/mockStore.js'
import { mapInternalToSnipeStatus } from '../utils/statusMap.js'
import { snipeItService } from '../services/snipeItService.js'
import { writeAudit } from '../utils/audit.js'

export const searchReceiving = async (req, res) => {
  const q = String(req.query.q || '')
  const assets = await snipeItService.listAssets(q)
  res.json({ rows: assets })
}

export const checkinReceiving = async (req, res) => {
  const schema = z.object({ notes: z.string().optional() })
  const input = schema.parse(req.body)
  const assetId = Number(req.params.assetId)

  await snipeItService.checkinAsset(assetId, { note: input.notes || 'Devolução recebida no app interno' })

  const flow = mockStore.flows.find((item) => Number(item.snipe_asset_id) === assetId)
  if (flow) {
    flow.internal_status = 'devolvido'
    flow.snipe_status = mapInternalToSnipeStatus('devolvido')
    flow.returned_at = new Date().toISOString()
    flow.updated_at = flow.returned_at
  }

  res.json({ success: true, flow })
}

export const inspectionReceiving = async (req, res) => {
  const schema = z.object({
    result: z.enum(['OK', 'NOK']),
    checklist_type: z.string(),
    items_json: z.array(z.object({ item: z.string(), required: z.boolean().default(true), status: z.enum(['ok', 'nok', 'na']) })),
    notes: z.string().optional(),
    severity: z.enum(['baixo', 'medio', 'alto', 'critico']).optional()
  })

  const input = schema.parse(req.body)
  const assetId = Number(req.params.assetId)

  if (input.result === 'NOK' && !input.notes) {
    return res.status(400).json({ error: 'Observação obrigatória para conferência NOK' })
  }

  const movement = {
    id: createId(),
    snipe_asset_id: assetId,
    movement_type: 'inspection',
    from_status: 'devolvido',
    to_status: input.result === 'OK' ? 'estoque' : 'em_manutencao',
    operator_id: req.user.sub,
    requester_name: null,
    cost_center: null,
    department: null,
    location: null,
    notes: input.notes || null,
    metadata_json: { result: input.result, severity: input.severity || null },
    created_at: new Date().toISOString()
  }

  mockStore.movements.push(movement)

  const checklist = {
    id: createId(),
    snipe_asset_id: assetId,
    movement_id: movement.id,
    checklist_type: input.checklist_type,
    result: input.result,
    items_json: input.items_json,
    notes: input.notes || null,
    created_by: req.user.sub,
    created_at: new Date().toISOString()
  }

  mockStore.checklists.push(checklist)

  if (input.result === 'NOK') {
    await snipeItService.updateAsset(assetId, {
      notes: `Conferência NOK: ${input.notes}`
    })

    const incident = {
      id: createId(),
      snipe_asset_id: assetId,
      movement_id: movement.id,
      incident_type: 'avaria',
      severity: input.severity || 'medio',
      description: input.notes,
      photos_json: [],
      resolved: false,
      resolved_at: null,
      created_by: req.user.sub,
      created_at: new Date().toISOString()
    }

    mockStore.incidents.push(incident)

    if (incident.severity === 'critico') {
      return res.json({ success: true, blocked_for_deploy: true, checklist, incident })
    }
  }

  writeAudit({ userId: req.user.sub, action: 'inspection', entityType: 'asset_checklists', entityId: checklist.id, payload: checklist })

  return res.json({ success: true, checklist })
}

export const createIncident = (req, res) => {
  const schema = z.object({ incident_type: z.string(), severity: z.enum(['baixo', 'medio', 'alto', 'critico']), description: z.string().min(5), photos_json: z.array(z.string()).default([]) })
  const input = schema.parse(req.body)

  const incident = {
    id: createId(),
    snipe_asset_id: Number(req.params.assetId),
    movement_id: req.body.movement_id || null,
    ...input,
    resolved: false,
    resolved_at: null,
    created_by: req.user.sub,
    created_at: new Date().toISOString()
  }

  mockStore.incidents.push(incident)
  res.status(201).json(incident)
}

export const sendToMaintenance = (req, res) => {
  const flow = mockStore.flows.find((item) => Number(item.snipe_asset_id) === Number(req.params.assetId))

  if (flow) {
    flow.internal_status = 'em_manutencao'
    flow.snipe_status = mapInternalToSnipeStatus('em_manutencao')
    flow.updated_at = new Date().toISOString()
  }

  return res.json({ success: true, flow })
}

export const sendToStock = (req, res) => {
  const flow = mockStore.flows.find((item) => Number(item.snipe_asset_id) === Number(req.params.assetId))

  if (!flow) {
    return res.status(404).json({ error: 'Fluxo não encontrado' })
  }

  const hasInspection = mockStore.movements.some((mv) => Number(mv.snipe_asset_id) === Number(req.params.assetId) && mv.movement_type === 'inspection')

  if (!hasInspection) {
    return res.status(400).json({ error: 'Não é permitido retornar ao estoque sem conferência concluída' })
  }

  flow.internal_status = 'estoque'
  flow.snipe_status = mapInternalToSnipeStatus('estoque')
  flow.updated_at = new Date().toISOString()

  return res.json({ success: true, flow })
}
