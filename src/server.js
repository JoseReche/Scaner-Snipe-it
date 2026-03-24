const path = require("path")
const dotenv = require("dotenv")
const express = require("express")
const axios = require("axios")
const cors = require("cors")
const { authRouter } = require("./routes/authRoutes")
const { sipeRouter } = require("./routes/sipeRoutes")
const { authMiddleware } = require("./middleware/authMiddleware")
const { findUserByMatricula } = require("./services/userStore")
const { decryptApiKey } = require("./auth/crypto")

dotenv.config({ path: path.join(__dirname, "..", ".env") })

const app = express()

app.disable("x-powered-by")
app.use(cors())
app.use(express.json({ limit: "10mb" }))

const publicDir = path.join(__dirname, "public")

const htmlRoutes = {
  "/": "login.html",
  "/login": "login.html",
  "/scanner": "scanner.html",
  "/scanner-pa": "scanner-pa.html",
  "/usuario": "usuario.html",
  "/dashboard": "dashboard.html",
  "/register": "register.html",
  "/change-password": "change-password.html",
  "/home-office": "home-office.html",
  "/retorno-home-office": "retorno-home-office.html"
}

for (const [routePath, fileName] of Object.entries(htmlRoutes)) {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(publicDir, fileName))
  })

  if (routePath !== "/") {
    app.get(`${routePath}.html`, (req, res) => {
      res.redirect(301, routePath)
    })
  }
}

app.use(express.static(publicDir))

app.use("/api/auth", authRouter)
app.use("/api/sipe", sipeRouter)

const SNIPE_URL = process.env.SNIPE_URL || "https://SEU-SNIPE/api/v1"
const PORT = process.env.PORT || 3000
const DEFAULT_PA_FIELD_KEY = process.env.SNIPE_PA_FIELD_KEY || "_snipeit_pa_6"

const hasValidConfig = !SNIPE_URL.includes("SEU-SNIPE")

const buildHeadersFromApiKey = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json"
})

const getUserHeaders = async (req) => {
  const user = await findUserByMatricula(req.user.matricula)

  if (!user) {
    const error = new Error("Usuário autenticado não encontrado")
    error.statusCode = 404
    throw error
  }

  if (user.api_key_encrypted) {
    return buildHeadersFromApiKey(decryptApiKey(user.api_key_encrypted))
  }

  const error = new Error("Usuário sem API Key cadastrada")
  error.statusCode = 400
  throw error
}

const customFieldValue = (asset, fieldName) => {
  const field = asset.custom_fields?.[fieldName]

  if (!field) {
    return null
  }

  if (typeof field.value === "string") {
    return field.value
  }

  return field.value ?? null
}

const mapAsset = (asset) => ({
  id: asset.id,
  assetTag: asset.asset_tag,
  serial: asset.serial,
  name: asset.name,
  model: asset.model?.name || null,
  status: asset.status_label?.name || null,
  statusId: asset.status_label?.id || null,
  company: asset.company?.name || null,
  companyId: asset.company?.id || null,
  manufacturer: asset.manufacturer?.name || null,
  assignedTo: asset.assigned_to?.name || null,
  assignedToId: asset.assigned_to?.id || null,
  assigned_to: asset.assigned_to
    ? {
      id: asset.assigned_to.id ?? null,
      username: asset.assigned_to.username ?? null,
      name: asset.assigned_to.name ?? null
    }
    : null,
  location: asset.location?.name || null,
  locationId: asset.location?.id || null,
  rtdLocation: asset.rtd_location?.name || null,
  rtdLocationId: asset.rtd_location?.id || null,
  notes: asset.notes || "",
  pa: customFieldValue(asset, "PA") || asset.rtd_location?.name || null,
  status_id: asset.status_label?.name || null,
  location_id: asset.location || null,
  custom_fields: {
    PA: customFieldValue(asset, "PA")
  },
  customFields: Object.fromEntries(
    Object.entries(asset.custom_fields || {}).map(([key, value]) => [key, value.value ?? null])
  )
})

const fetchAssetById = async (id, requestHeaders) => {
  const response = await axios.get(`${SNIPE_URL}/hardware/${id}`, { headers: requestHeaders })

  return response.data
}

const fetchPaginatedRows = async (endpoint, requestHeaders) => {
  const rows = []
  let offset = 0
  const limit = 500

  while (true) {
    const response = await axios.get(`${SNIPE_URL}/${endpoint}`, {
      headers: requestHeaders,
      params: { limit, offset }
    })
    const pageRows = Array.isArray(response.data?.rows) ? response.data.rows : []

    rows.push(...pageRows)

    if (pageRows.length < limit) {
      break
    }

    offset += limit
  }

  return rows
}

const parseIntegerField = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return undefined
  }

  return parsed
}

const sortOptionsByName = (items) => items.sort((a, b) =>
  String(a.name).localeCompare(String(b.name), "pt-BR", { numeric: true, sensitivity: "base" })
)

const getAssetCheckState = (asset) => (asset?.assigned_to?.id ? "checkout" : "checkin")

const updateAssetAssignment = async (assetId, assignedUserId, requestHeaders) => {
  const currentAsset = await fetchAssetById(assetId, requestHeaders)
  const currentState = getAssetCheckState(currentAsset)
  const currentAssignedUserId = parseIntegerField(currentAsset?.assigned_to?.id)
  const parsedUserId = parseIntegerField(assignedUserId)

  if (parsedUserId === undefined) {
    if (currentState === "checkout") {
      await axios.post(`${SNIPE_URL}/hardware/${assetId}/checkin`, {}, { headers: requestHeaders })
    }

    return
  }

  if (currentState === "checkout" && currentAssignedUserId === parsedUserId) {
    return
  }

  if (currentState === "checkout" && currentAssignedUserId !== parsedUserId) {
    await axios.post(`${SNIPE_URL}/hardware/${assetId}/checkin`, {}, { headers: requestHeaders })
  }

  await axios.post(
    `${SNIPE_URL}/hardware/${assetId}/checkout`,
    {
      checkout_to_type: "user",
      assigned_user: parsedUserId
    },
    { headers: requestHeaders }
  )
}

const findPaCustomFieldKey = (asset) => {
  const entries = Object.entries(asset.custom_fields || {})

  for (const [label, config] of entries) {
    if (label.trim().toLowerCase() !== "pa") {
      continue
    }

    if (typeof config.field === "string" && config.field.trim()) {
      return config.field
    }

    if (typeof config.db_column === "string" && config.db_column.trim()) {
      return config.db_column
    }

    return label
  }

  return null
}

const mapCustomFieldLabelToKey = (asset) => {
  const mapping = {}

  for (const [label, config] of Object.entries(asset.custom_fields || {})) {
    const normalizedLabel = label.trim()

    if (normalizedLabel) {
      mapping[normalizedLabel] = normalizedLabel
      mapping[normalizedLabel.toLowerCase()] = normalizedLabel
    }

    const rawFieldKey = config.field || config.db_column

    if (typeof rawFieldKey === "string" && rawFieldKey.trim()) {
      const fieldKey = rawFieldKey.trim()

      mapping[fieldKey] = fieldKey
      mapping[fieldKey.toLowerCase()] = fieldKey

      if (normalizedLabel) {
        mapping[normalizedLabel] = fieldKey
        mapping[normalizedLabel.toLowerCase()] = fieldKey
      }
    }
  }

  return mapping
}

// Centraliza logs de debug para facilitar a identificação da causa raiz
// quando a API do Snipe-IT retornar uma falha.
const logApiError = (context, error) => {
  const status = error.response?.status
  const statusText = error.response?.statusText
  const method = error.config?.method?.toUpperCase()
  const url = error.config?.url
  const responseData = error.response?.data
  const requestPayload = error.config?.data

  console.error(`[${context}] Falha na API Snipe-IT`)

  if (method || url) {
    console.error(`[${context}] Requisição: ${method || "-"} ${url || "-"}`)
  }

  if (status || statusText) {
    console.error(`[${context}] Status: ${status || "-"} ${statusText || ""}`)
  }

  if (requestPayload) {
    console.error(`[${context}] Payload enviado:`, requestPayload)
  }

  if (responseData) {
    console.error(`[${context}] Resposta da API:`, responseData)
  } else {
    console.error(`[${context}] Mensagem original:`, error.message)
  }
}


const normalizeSnipeMessages = (raw) => {
  if (!raw) {
    return []
  }

  if (Array.isArray(raw)) {
    return raw.filter((item) => item !== undefined && item !== null).map((item) => String(item))
  }

  if (typeof raw === "string") {
    const message = raw.trim()

    return message ? [message] : []
  }

  if (typeof raw === "object") {
    return Object.entries(raw)
      .flatMap(([field, value]) => {
        if (Array.isArray(value)) {
          return value.map((item) => `${field}: ${item}`)
        }

        if (value === undefined || value === null || value === "") {
          return []
        }

        return [`${field}: ${value}`]
      })
      .filter(Boolean)
      .map((item) => String(item))
  }

  return [String(raw)]
}


const getErrorStatusCode = (error) => {
  const statusCode = error.statusCode || error.response?.status

  if (typeof statusCode === "number" && statusCode >= 400) {
    return statusCode
  }

  return 500
}

const getFriendlySnipeErrorMessage = (error, fallback) => {
  const statusCode = error.response?.status

  if (statusCode === 401) {
    return `${fallback}: API Key pessoal inválida, expirada ou sem permissão no Snipe-IT`
  }

  return null
}

const buildClientError = (error, fallback) => {
  const snipeRaw = error.response?.data?.messages || error.response?.data?.error || error.message
  const messages = normalizeSnipeMessages(snipeRaw)
  const friendlyMessage = getFriendlySnipeErrorMessage(error, fallback)
  const composedMessage = friendlyMessage || (messages.length > 0 ? `${fallback}: ${messages.join('; ')}` : fallback)

  return {
    error: composedMessage,
    messages,
    status: error.response?.status || 500
  }
}

const buildAssetPayload = async (assetId, body, requestHeaders) => {
  const allowedTextFields = ["notes"]
  const allowedIntegerFields = ["location_id", "rtd_location_id", "status_id", "model_id", "company_id"]
  const payload = {}

  for (const field of allowedTextFields) {
    if (body[field] !== undefined) {
      payload[field] = body[field]
    }
  }

  for (const field of allowedIntegerFields) {
    const parsed = parseIntegerField(body[field])

    if (parsed !== undefined) {
      payload[field] = parsed
    }
  }

  const currentAsset = await fetchAssetById(assetId, requestHeaders)
  const customFields = { ...(body.custom_fields || {}) }
  const customFieldMapping = mapCustomFieldLabelToKey(currentAsset)

  if (body.pa !== undefined && body.pa !== "") {
    const paFieldKey = findPaCustomFieldKey(currentAsset) || DEFAULT_PA_FIELD_KEY

    customFields[paFieldKey] = body.pa
  }

  for (const [fieldName, value] of Object.entries(customFields)) {
    const normalizedName = fieldName.trim()

    if (!normalizedName) {
      continue
    }

    const mappedField = customFieldMapping[normalizedName] || customFieldMapping[normalizedName.toLowerCase()] || normalizedName
    payload[mappedField] = value
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("Nenhum campo válido para atualizar foi enviado")
  }

  return payload
}

app.use(authMiddleware)

app.use((req, res, next) => {
  if (!hasValidConfig) {
    return res.status(500).json({
      error: "Configure a variável SNIPE_URL no arquivo .env antes de usar a API"
    })
  }

  return next()
})

app.get("/asset/:id", async (req, res) => {
  try {
    const requestHeaders = await getUserHeaders(req)
    const asset = await fetchAssetById(req.params.id, requestHeaders)

    return res.json(mapAsset(asset))
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug do endpoint de consulta de ativo.
    logApiError("GET /asset/:id", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao buscar ativo"))
  }
})

app.get("/move-info", async (req, res) => {
  const { asset } = req.query

  if (!asset) {
    return res.status(400).json({ error: "Informe o parâmetro asset" })
  }

  try {
    const requestHeaders = await getUserHeaders(req)
    const data = await fetchAssetById(asset, requestHeaders)

    return res.json(data)
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug para entender falhas ao carregar dados de movimentação.
    logApiError("GET /move-info", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao buscar dados para movimentação"))
  }
})

app.get("/options", async (req, res) => {
  try {
    const requestHeaders = await getUserHeaders(req)
    const [statusRows, locationRows, companyRows, userRows] = await Promise.all([
      fetchPaginatedRows("statuslabels", requestHeaders),
      fetchPaginatedRows("locations", requestHeaders),
      fetchPaginatedRows("companies", requestHeaders),
      fetchPaginatedRows("users", requestHeaders)
    ])

    const statuses = sortOptionsByName(statusRows
      .map((item) => ({ id: item.id, name: item.name }))
      .filter((item) => item.id && item.name))
    const locations = sortOptionsByName(locationRows
      .map((item) => ({ id: item.id, name: item.name }))
      .filter((item) => item.id && item.name))
    const companies = sortOptionsByName(companyRows
      .map((item) => ({ id: item.id, name: item.name }))
      .filter((item) => item.id && item.name))
    const users = sortOptionsByName(userRows
      .map((item) => ({ id: item.id, name: item.name || item.username || item.email }))
      .filter((item) => item.id && item.name))

    return res.json({ statuses, locations, companies, users })
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug para capturar erro de listagem de opções auxiliares.
    logApiError("GET /options", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao buscar listas de status e local"))
  }
})


app.post("/move", async (req, res) => {
  const { asset, pa } = req.body

  if (asset === undefined || asset === null || asset === "" || pa === undefined || pa === null || pa === "") {
    return res.status(400).json({ error: "Campos asset e pa são obrigatórios" })
  }

  try {
    const requestHeaders = await getUserHeaders(req)

    await axios.patch(
      `${SNIPE_URL}/hardware/${asset}`,
      {
        _snipeit_pa_6: pa
      },
      { headers: requestHeaders }
    )

    return res.json({ success: true })
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug no fluxo de movimentação de ativo.
    logApiError("POST /move", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao mover ativo"))
  }
})

app.patch("/asset/:id", async (req, res) => {
  let payload = {}
  let assignedTo = undefined
  let assignedToProvided = false
  let requestHeaders

  try {
    requestHeaders = await getUserHeaders(req)
    payload = await buildAssetPayload(req.params.id, req.body, requestHeaders)
    assignedTo = req.body.assigned_to
    assignedToProvided = Object.prototype.hasOwnProperty.call(req.body, "assigned_to")
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug na etapa de montagem do payload de atualização.
    logApiError("PATCH /asset/:id [build payload]", e)

    if (e.message === "Nenhum campo válido para atualizar foi enviado") {
      return res.status(400).json({ error: e.message })
    }

    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao identificar o campo PA"))
  }

  try {
    await axios.patch(`${SNIPE_URL}/hardware/${req.params.id}`, payload, { headers: requestHeaders })

    if (assignedToProvided) {
      await updateAssetAssignment(req.params.id, assignedTo, requestHeaders)
    }

    const updatedAsset = await fetchAssetById(req.params.id, requestHeaders)

    return res.json({ success: true, asset: mapAsset(updatedAsset) })
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug na atualização do ativo no Snipe-IT.
    logApiError("PATCH /asset/:id", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao atualizar ativo"))
  }
})


app.post("/home-office/baixa", async (req, res) => {
  const { asset, status_id: statusId, notes, do_checkin: doCheckin } = req.body

  if (asset === undefined || asset === null || asset === "" || statusId === undefined || statusId === null || statusId === "") {
    return res.status(400).json({ error: "Campos asset e status_id são obrigatórios" })
  }

  const parsedAsset = parseIntegerField(asset)
  const parsedStatusId = parseIntegerField(statusId)

  if (parsedAsset === undefined || parsedStatusId === undefined) {
    return res.status(400).json({ error: "asset e status_id devem ser números válidos" })
  }

  const payload = {
    status_id: parsedStatusId
  }

  if (notes !== undefined) {
    payload.notes = String(notes)
  }

  try {
    const requestHeaders = await getUserHeaders(req)

    if (doCheckin) {
      await axios.post(`${SNIPE_URL}/hardware/${parsedAsset}/checkin`, {}, { headers: requestHeaders })
    }

    await axios.patch(`${SNIPE_URL}/hardware/${parsedAsset}`, payload, { headers: requestHeaders })

    const updatedAsset = await fetchAssetById(parsedAsset, requestHeaders)

    return res.json({ success: true, asset: mapAsset(updatedAsset) })
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    logApiError("POST /home-office/baixa", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao realizar baixa do kit home office"))
  }
})

app.post("/home-office/termo", express.raw({ type: "application/pdf", limit: "10mb" }), async (req, res) => {
  const { asset, file_name: fileName, note } = req.query

  if (asset === undefined || asset === null || asset === "") {
    return res.status(400).json({ error: "Campo asset é obrigatório" })
  }

  const parsedAsset = parseIntegerField(asset)

  if (parsedAsset === undefined) {
    return res.status(400).json({ error: "asset deve ser um número válido" })
  }

  const pdfBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "")

  if (!pdfBuffer || pdfBuffer.length === 0) {
    return res.status(400).json({ error: "O PDF gerado está vazio" })
  }

  const maxFileSize = 2 * 1024 * 1024

  if (pdfBuffer.length > maxFileSize) {
    return res.status(413).json({ error: "O arquivo PDF excede o limite de 2MB do Snipe-IT" })
  }

  const safeFileName = typeof fileName === "string" && fileName.trim()
    ? fileName.trim()
    : `termo-home-office-${parsedAsset}.pdf`

  try {
    const requestHeaders = await getUserHeaders(req)
    const uploadHeaders = {
      Authorization: requestHeaders.Authorization,
      Accept: "application/json"
    }
    const formData = new FormData()
    const blob = new Blob([pdfBuffer], { type: "application/pdf" })
    formData.append("file[]", blob, safeFileName)

    if (note !== undefined && note !== null && String(note).trim() !== "") {
      formData.append("notes", String(note))
    }

    await axios.post(`${SNIPE_URL}/hardware/${parsedAsset}/files`, formData, {
      headers: uploadHeaders,
      validateStatus: (status) => status >= 200 && status < 300
    })

    return res.json({ success: true })
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    logApiError("POST /home-office/termo", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro ao anexar termo no ativo"))
  }
})

app.post("/checkout", async (req, res) => {
  const { asset, user } = req.body

  if (!asset || !user) {
    return res.status(400).json({ error: "Campos asset e user são obrigatórios" })
  }

  try {
    const requestHeaders = await getUserHeaders(req)

    await axios.post(
      `${SNIPE_URL}/hardware/${asset}/checkout`,
      {
        checkout_to_type: "user",
        assigned_user: user
      },
      { headers: requestHeaders }
    )

    return res.json({ success: true })
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message })
    }

    // Ponto de debug para problemas no checkout do ativo.
    logApiError("POST /checkout", e)
    return res.status(getErrorStatusCode(e)).json(buildClientError(e, "Erro no checkout"))
  }
})

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
  })
}

module.exports = {
  app,
  buildAssetPayload,
  mapCustomFieldLabelToKey,
  parseIntegerField,
  findPaCustomFieldKey
}
