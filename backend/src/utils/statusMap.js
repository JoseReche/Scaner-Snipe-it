export const INTERNAL_STATUSES = [
  'solicitado',
  'em_triagem',
  'em_preparacao',
  'aguardando_retirada',
  'entregue',
  'em_uso',
  'devolvido',
  'em_conferencia',
  'estoque',
  'backup',
  'formatacao',
  'pronto_para_implementar',
  'em_manutencao',
  'danificado',
  'descartado'
]

export const SNIPE_STATUS_BY_INTERNAL = {
  solicitado: 'em estoque',
  em_triagem: 'em estoque',
  em_preparacao: 'em estoque',
  aguardando_retirada: 'em estoque',
  entregue: 'em uso',
  em_uso: 'em uso',
  devolvido: 'em estoque',
  em_conferencia: 'em estoque',
  estoque: 'em estoque',
  backup: 'em estoque',
  formatacao: 'em estoque',
  pronto_para_implementar: 'pronto para uso',
  em_manutencao: 'em manutenção',
  danificado: 'danificado',
  descartado: 'danificado'
}

export const mapInternalToSnipeStatus = (internalStatus) => SNIPE_STATUS_BY_INTERNAL[internalStatus] || 'em estoque'
