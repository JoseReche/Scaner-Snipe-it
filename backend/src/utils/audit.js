import { mockStore, createId } from '../data/mockStore.js'

export const writeAudit = ({ userId, action, entityType, entityId, payload }) => {
  mockStore.auditLogs.push({
    id: createId(),
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload_json: payload,
    created_at: new Date().toISOString()
  })
}
