export const notFoundMiddleware = (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
}

export const errorMiddleware = (error, req, res, _next) => {
  req.log?.error({ err: error }, 'Unhandled error')

  const status = error.status || 500
  const message = error.message || 'Erro interno'

  res.status(status).json({ error: message })
}
