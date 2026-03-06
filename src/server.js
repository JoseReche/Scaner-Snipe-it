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

const hasValidConfig =
  !SNIPE_URL.includes("SEU-SNIPE") &&
  API_KEY !== "SEU_TOKEN_API"

app.use((req, res, next) => {
  if (!hasValidConfig) {
    return res.status(500).json({
      error:
        "Configure as variáveis SNIPE_URL e SNIPE_API_KEY no arquivo .env antes de usar a API"
    })
  }

  return next()
})

app.get("/asset/:id", async (req, res) => {
  try {
    const response = await axios.get(`${SNIPE_URL}/hardware/${req.params.id}`, {
      headers
    })

    const a = response.data

    res.json({
      empresa: a.company?.name,
      marca: a.manufacturer?.name,
      nome: a.name,
      status: a.status_label?.name,
      local: a.location?.name,
      pa: a.rtd_location?.name
    })
  } catch (e) {
    res.status(500).json({ error: "Erro ao buscar ativo" })
  }
})

app.get("/move-info", async (req, res) => {
  const { asset } = req.query

  if (!asset) {
    return res.status(400).json({ error: "Informe o parâmetro asset" })
  }

  try {
    const response = await axios.get(`${SNIPE_URL}/hardware/${asset}`, { headers })

    return res.json({
      id: response.data.id,
      name: response.data.name,
      currentPA: response.data.rtd_location?.name || null
    })
  } catch (e) {
    return res.status(500).json({ error: "Erro ao buscar dados para movimentação" })
  }
})

app.post("/move", async (req, res) => {
  const { asset, pa } = req.body

  if (!asset || !pa) {
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

    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: "Erro ao mover ativo" })
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

    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: "Erro no checkout" })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
