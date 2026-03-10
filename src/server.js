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
const CUSTOM_FIELD_PA = process.env.CUSTOM_FIELD_PA
const PORT = process.env.PORT || 3000

const hasValidConfig =
  !SNIPE_URL.includes("SEU-SNIPE") &&
  API_KEY !== "SEU_TOKEN_API"

const api = axios.create({
  baseURL: SNIPE_URL,
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  }
})

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

const validateId = (id) => !isNaN(id)

const customFieldValue = (asset, fieldName) => {
  const field = asset.custom_fields?.[fieldName]

  if (!field) return null

  if (typeof field === "object") return field.value ?? null

  return field
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
    Object.entries(asset.custom_fields || {}).map(([key, value]) => [
      key,
      typeof value === "object" ? value.value ?? null : value
    ])
  )
})

const fetchAssetById = async (id) => {
  const response = await api.get(`/hardware/${id}`)
  return response.data
}

app.use((req, res, next) => {
  if (!hasValidConfig) {
    return res.status(500).json({
      error:
        "Configure SNIPE_URL e SNIPE_API_KEY no arquivo .env"
    })
  }

  next()
})

app.get("/asset/:id", async (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "ID inválido" })
  }

  try {
    const asset = await fetchAssetById(req.params.id)

    res.json(mapAsset(asset))
  } catch (e) {
    console.error(e.response?.data || e.message)

    res.status(e.response?.status || 500).json({
      error: e.response?.data || "Erro ao buscar ativo"
    })
  }
})

app.get("/move-info", async (req, res) => {
  const { asset } = req.query

  if (!asset) {
    return res.status(400).json({
      error: "Informe o parâmetro asset"
    })
  }

  if (!validateId(asset)) {
    return res.status(400).json({ error: "ID inválido" })
  }

  try {
    const data = await fetchAssetById(asset)
    const mapped = mapAsset(data)

    res.json({
      id: mapped.id,
      name: mapped.name,
      currentPA: mapped.pa,
      rtdLocation: mapped.rtdLocation,
      status: mapped.status
    })
  } catch (e) {
    console.error(e.response?.data || e.message)

    res.status(500).json({
      error: "Erro ao buscar dados para movimentação"
    })
  }
})

app.post("/move", async (req, res) => {
  const { asset, pa } = req.body

  if (!asset || !pa) {
    return res.status(400).json({
      error: "Campos asset e pa são obrigatórios"
    })
  }

  try {
    const response = await api.patch(`/hardware/${asset}`, {
      rtd_location_id: pa
    })

    console.log("PAYLOAD MOVE:", { asset, pa })
    console.log("SNIPE RESPONSE:", response.data)

    if (response.data.status === "error") {
      return res.status(400).json(response.data)
    }

    res.json({
      success: true,
      apiResponse: response.data
    })
  } catch (e) {
    console.error(e.response?.data || e.message)

    res.status(e.response?.status || 500).json({
      error: e.response?.data || "Erro ao mover ativo"
    })
  }
})

app.patch("/asset/:id", async (req, res) => {
  const id = req.params.id

  if (!validateId(id)) {
    return res.status(400).json({ error: "ID inválido" })
  }

  try {
    const currentAsset = await fetchAssetById(id)

    const allowedFields = [
      "name",
      "serial",
      "notes",
      "location_id",
      "rtd_location_id",
      "status_id",
      "model_id",
      "company_id"
    ]

    const payload = {}

    for (const field of allowedFields) {

      if (req.body[field] === undefined || req.body[field] === "") {
        continue
      }

      if (field === "serial") {

        if (req.body.serial === currentAsset.serial) {
          continue
        }

      }

      payload[field] = req.body[field]

    }

    if (req.body.pa && CUSTOM_FIELD_PA) {
      payload._customfields = {
        [CUSTOM_FIELD_PA]: req.body.pa
      }
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        error: "Nenhum campo válido enviado"
      })
    }

    console.log("PAYLOAD UPDATE:", payload)

    const response = await api.patch(`/hardware/${id}`, payload)

    console.log("SNIPE UPDATE RESPONSE:", response.data)

    if (response.data.status === "error") {
      return res.status(400).json(response.data)
    }

    const updatedAsset = await fetchAssetById(id)

    res.json({
      success: true,
      apiResponse: response.data,
      asset: mapAsset(updatedAsset)
    })
  } catch (e) {
    console.error(e.response?.data || e.message)

    res.status(e.response?.status || 500).json({
      error: e.response?.data || "Erro ao atualizar ativo"
    })
  }
})

app.post("/checkout", async (req, res) => {
  const { asset, user } = req.body

  if (!asset || !user) {
    return res.status(400).json({
      error: "Campos asset e user são obrigatórios"
    })
  }

  try {
    const response = await api.post(`/hardware/${asset}/checkout`, {
      assigned_user: user
    })

    console.log("CHECKOUT RESPONSE:", response.data)

    if (response.data.status === "error") {
      return res.status(400).json(response.data)
    }

    res.json({
      success: true,
      apiResponse: response.data
    })
  } catch (e) {
    console.error(e.response?.data || e.message)

    res.status(e.response?.status || 500).json({
      error: e.response?.data || "Erro no checkout"
    })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
