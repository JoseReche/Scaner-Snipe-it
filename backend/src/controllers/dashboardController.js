import { mockStore } from '../data/mockStore.js'

const countBy = (status) => mockStore.flows.filter((item) => item.internal_status === status).length

export const getSummary = (_req, res) => {
  res.json({
    prontos_para_implementar: countBy('pronto_para_implementar'),
    aguardando_retirada: countBy('aguardando_retirada'),
    em_uso: countBy('em_uso'),
    devolvidos_hoje: countBy('devolvido'),
    em_conferencia: countBy('em_conferencia'),
    em_backup: countBy('backup'),
    em_formatacao: countBy('formatacao'),
    em_manutencao: countBy('em_manutencao'),
    danificados: countBy('danificado')
  })
}

export const getPending = (_req, res) => {
  const rows = mockStore.flows
    .filter((item) => ['aguardando_retirada', 'devolvido', 'em_conferencia', 'backup', 'formatacao'].includes(item.internal_status))
    .slice(0, 30)

  res.json({ rows })
}

export const getMetrics = (_req, res) => {
  const byCostCenter = {}
  const byDepartment = {}
  const byLocation = {}

  for (const flow of mockStore.flows) {
    byCostCenter[flow.cost_center] = (byCostCenter[flow.cost_center] || 0) + 1
    byDepartment[flow.department] = (byDepartment[flow.department] || 0) + 1
    byLocation[flow.location] = (byLocation[flow.location] || 0) + 1
  }

  res.json({ byCostCenter, byDepartment, byLocation, totalIncidents: mockStore.incidents.length })
}
