const path = require("path")
const dotenv = require("dotenv")
const express = require("express")
const axios = require("axios")
const cors = require("cors")

dotenv.config({ path: path.join(__dirname, "..", ".env") })

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

const SNIPE_URL = process.env.SNIPE_URL || "https://SEU-SNIPE/api/v1"
const API_KEY = process.env.SNIPE_API_KEY || "SEU_TOKEN_API"
const PORT = process.env.PORT || 3000

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json"
}

const hasValidConfig = !SNIPE_URL.includes("SEU-SNIPE") && API_KEY !== "SEU_TOKEN_API"

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
  manufacturer: asset.manufacturer?.name || null,
  location: asset.location?.name || null,
  locationId: asset.location?.id || null,
  rtdLocation: asset.rtd_location?.name || null,
  rtdLocationId: asset.rtd_location?.id || null,
  notes: asset.notes || "",
  pa: customFieldValue(asset, "PA") || asset.rtd_location?.name || null,
  customFields: Object.fromEntries(
    Object.entries(asset.custom_fields || {}).map(([key, value]) => [key, value.value ?? null])
  )
})

const fetchAssetById = async (id) => {
  const response = await axios.get(`${SNIPE_URL}/hardware/${id}`, { headers })

  return response.data
}

const fetchPaginatedRows = async (endpoint) => {
  const rows = []
  let offset = 0
  const limit = 500

  while (true) {
    const response = await axios.get(`${SNIPE_URL}/${endpoint}`, {
      headers,
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

const findPaCustomFieldKey = (asset) => {
  const entries = Object.entries(asset.custom_fields || {})

  for (const [label, config] of entries) {
    if (label.trim().toLowerCase() !== "pa") {
      continue
    }

    if (typeof config.field === "string" && config.field.trim()) {
      return config.field
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

    if (typeof config.field === "string" && config.field.trim()) {
      const fieldKey = config.field.trim()

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

const buildClientError = (error, fallback) => {
  const snipeRaw = error.response?.data?.messages || error.response?.data?.error || error.message
  const messages = normalizeSnipeMessages(snipeRaw)
  const composedMessage = messages.length > 0 ? `${fallback}: ${messages.join('; ')}` : fallback

  return {
    error: composedMessage,
    messages,
    status: error.response?.status || 500
  }
}

const buildAssetPayload = async (assetId, body) => {
  const allowedTextFields = ["name", "serial", "notes"]
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

  const currentAsset = await fetchAssetById(assetId)
  const customFields = { ...(body.custom_fields || {}) }
  const customFieldMapping = mapCustomFieldLabelToKey(currentAsset)

  if (body.pa !== undefined && body.pa !== "") {
    const paFieldKey = findPaCustomFieldKey(currentAsset)

    if (paFieldKey) {
      customFields[paFieldKey] = body.pa
    } else {
      customFields.PA = body.pa
    }
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

app.use((req, res, next) => {
  if (!hasValidConfig) {
    return res.status(500).json({
      error: "Configure as variáveis SNIPE_URL e SNIPE_API_KEY no arquivo .env antes de usar a API"
    })
  }

  return next()
})

app.get("/asset/:id", async (req, res) => {
  try {
    const asset = await fetchAssetById(req.params.id)

    return res.json(mapAsset(asset))
  } catch (e) {
    // Ponto de debug do endpoint de consulta de ativo.
    logApiError("GET /asset/:id", e)
    return res.status(500).json(buildClientError(e, "Erro ao buscar ativo"))
  }
})

app.get("/move-info", async (req, res) => {
  const { asset } = req.query

  if (!asset) {
    return res.status(400).json({ error: "Informe o parâmetro asset" })
  }

  try {
    const data = await fetchAssetById(asset)
    const mapped = mapAsset(data)

    return res.json({
      id: mapped.id,
      name: mapped.name,
      currentPA: mapped.pa,
      rtdLocation: mapped.rtdLocation,
      status: mapped.status
    })
  } catch (e) {
    // Ponto de debug para entender falhas ao carregar dados de movimentação.
    logApiError("GET /move-info", e)
    return res.status(500).json(buildClientError(e, "Erro ao buscar dados para movimentação"))
  }
})

app.get("/options", async (_req, res) => {
  try {
    const [statusRows, locationRows] = await Promise.all([
      fetchPaginatedRows("statuslabels"),
      fetchPaginatedRows("locations")
    ])

    const statuses = statusRows.map((item) => ({ id: item.id, name: item.name })).filter((item) => item.id && item.name)
    const locations = locationRows.map((item) => ({ id: item.id, name: item.name })).filter((item) => item.id && item.name)

    return res.json({ statuses, locations })
  } catch (e) {
    // Ponto de debug para capturar erro de listagem de opções auxiliares.
    logApiError("GET /options", e)
    return res.status(500).json(buildClientError(e, "Erro ao buscar listas de status e local"))
  }
})


app.post("/move", async (req, res) => {
  const { asset, pa } = req.body

  if (asset === undefined || asset === null || asset === "" || pa === undefined || pa === null || pa === "") {
    return res.status(400).json({ error: "Campos asset e pa são obrigatórios" })
  }

  try {
    await axios.patch(
      `${SNIPE_URL}/hardware/${asset}`,
      {
        rtd_location_id: pa
      },
      { headers }
    )

    return res.json({ success: true })
  } catch (e) {
    // Ponto de debug no fluxo de movimentação de ativo.
    logApiError("POST /move", e)
    return res.status(500).json(buildClientError(e, "Erro ao mover ativo"))
  }
})

app.patch("/asset/:id", async (req, res) => {
  let payload = {}

  try {
    payload = await buildAssetPayload(req.params.id, req.body)
  } catch (e) {
    // Ponto de debug na etapa de montagem do payload de atualização.
    logApiError("PATCH /asset/:id [build payload]", e)

    if (e.message === "Nenhum campo válido para atualizar foi enviado") {
      return res.status(400).json({ error: e.message })
    }

    return res.status(500).json(buildClientError(e, "Erro ao identificar o campo PA"))
  }

  try {
    await axios.patch(`${SNIPE_URL}/hardware/${req.params.id}`, payload, { headers })
    const updatedAsset = await fetchAssetById(req.params.id)

    return res.json({ success: true, asset: mapAsset(updatedAsset) })
  } catch (e) {
    // Ponto de debug na atualização do ativo no Snipe-IT.
    logApiError("PATCH /asset/:id", e)
    return res.status(500).json(buildClientError(e, "Erro ao atualizar ativo"))
  }
})

app.post("/checkout", async (req, res) => {
  const { asset, user } = req.body

  if (!asset || !user) {
    return res.status(400).json({ error: "Campos asset e user são obrigatórios" })
  }

  try {
    await axios.post(
      `${SNIPE_URL}/hardware/${asset}/checkout`,
      {
        assigned_user: user
      },
      { headers }
    )

    return res.json({ success: true })
  } catch (e) {
    // Ponto de debug para problemas no checkout do ativo.
    logApiError("POST /checkout", e)
    return res.status(500).json(buildClientError(e, "Erro no checkout"))
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
