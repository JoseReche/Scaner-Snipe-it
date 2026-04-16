INSERT INTO users (name, email, password_hash, role)
VALUES ('Operador Admin', 'admin@local', '$2a$10$FKv11jP4bhfP2bXCkzkbeOYVgCWB1JVfI65w6s55fQ3n2vA6mVrSO', 'admin')
ON CONFLICT (email) DO NOTHING;
