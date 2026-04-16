import { randomUUID } from 'crypto'

const now = () => new Date().toISOString()

export const mockStore = {
  users: [
    {
      id: 'u-admin',
      name: 'Operador Admin',
      email: 'admin@local',
      password_hash: '$2a$10$FKv11jP4bhfP2bXCkzkbeOYVgCWB1JVfI65w6s55fQ3n2vA6mVrSO',
      role: 'admin',
      active: true,
      created_at: now(),
      updated_at: now()
    }
  ],
  requests: [],
  flows: [],
  movements: [],
  checklists: [],
  incidents: [],
  attachments: [],
  auditLogs: [],
  syncErrors: []
}

export const createId = () => randomUUID()
