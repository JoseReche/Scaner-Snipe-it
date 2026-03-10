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

const extractSnipeError = (error, fallback) => {
  const snipeError = error.response?.data?.messages || error.response?.data?.error

  if (typeof snipeError === "string" && snipeError.trim()) {
    return `${fallback}: ${snipeError}`
  }

  if (snipeError && typeof snipeError === "object") {
    const details = Object.values(snipeError).flat().filter(Boolean).join("; ")

    if (details) {
      return `${fallback}: ${details}`
    }
  }

  return fallback
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

  const customFields = { ...(body.custom_fields || {}) }

  if (body.pa !== undefined && body.pa !== "") {
    const currentAsset = await fetchAssetById(assetId)
    const paFieldKey = findPaCustomFieldKey(currentAsset)

    if (paFieldKey) {
      customFields[paFieldKey] = body.pa
    } else {
      customFields.PA = body.pa
    }
  }

  if (Object.keys(customFields).length > 0) {
    payload.custom_fields = customFields
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
    return res.status(500).json({ error: extractSnipeError(e, "Erro ao buscar ativo") })
    return res.status(500).json({ error: "Erro ao buscar ativo" })
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
    return res.status(500).json({ error: extractSnipeError(e, "Erro ao buscar dados para movimentação") })
  }
})

app.post("/move", async (req, res) => {
  const { asset, pa } = req.body
  const parsedPa = parseIntegerField(pa)

  if (!asset || !pa) {
    return res.status(400).json({ error: "Campos asset e pa são obrigatórios" })
  }

  if (parsedPa === undefined) {
    return res.status(400).json({ error: "PA deve ser um ID numérico de localização RTD" })
  }

  try {
    await axios.patch(
      `${SNIPE_URL}/hardware/${asset}`,
      {
        rtd_location_id: parsedPa
      },
      { headers }
    )

    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: extractSnipeError(e, "Erro ao mover ativo") })
    return res.status(500).json({ error: "Erro ao mover ativo" })
  }
})

app.patch("/asset/:id", async (req, res) => {
  let payload = {}

  try {
    payload = await buildAssetPayload(req.params.id, req.body)
  } catch (e) {
    return res.status(500).json({ error: extractSnipeError(e, "Erro ao identificar o campo PA") })
  }

  try {
    await axios.patch(`${SNIPE_URL}/hardware/${req.params.id}`, payload, { headers })
    const updatedAsset = await fetchAssetById(req.params.id)

    return res.json({ success: true, asset: mapAsset(updatedAsset) })
  } catch (e) {
    return res.status(500).json({ error: extractSnipeError(e, "Erro ao atualizar ativo") })
    return res.status(500).json({ error: "Erro ao atualizar ativo" })
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
    return res.status(500).json({ error: extractSnipeError(e, "Erro no checkout") })
    return res.status(500).json({ error: "Erro no checkout" })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
