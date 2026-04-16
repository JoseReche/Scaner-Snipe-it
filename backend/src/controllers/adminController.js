import crypto from 'crypto'
import { INTERNAL_STATUSES } from '../utils/statusMap.js'

const checklistTemplates = [
  {
    id: 'notebook-default',
    asset_type: 'Notebook',
    checklist_json: [
      { item: 'Liga normalmente', required: true },
      { item: 'Tela sem avarias', required: true },
      { item: 'Teclado funcionando', required: true },
      { item: 'Bateria OK', required: false }
    ]
  }
]

const incidentTypes = [
  { id: 'dano-fisico', label: 'Dano físico' },
  { id: 'falha-hardware', label: 'Falha de hardware' },
  { id: 'acessorio-ausente', label: 'Acessório ausente' }
]

export const getChecklists = (_req, res) => res.json({ rows: checklistTemplates })

export const saveChecklist = (req, res) => {
  checklistTemplates.push({ id: crypto.randomUUID(), ...req.body })
  res.status(201).json({ success: true })
}

export const getInternalStatuses = (_req, res) => res.json({ rows: INTERNAL_STATUSES })

export const getIncidentTypes = (_req, res) => res.json({ rows: incidentTypes })
