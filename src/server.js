const express = require("express")
const axios = require("axios")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static("public"))

const SNIPE_URL = "https://SEU-SNIPE/api/v1"
const API_KEY = "SEU_TOKEN_API"

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json"
}

app.get("/asset/:id", async (req,res)=>{

  try{

    const response = await axios.get(
      `${SNIPE_URL}/hardware/${req.params.id}`,
      {headers}
    )

    const a = response.data

    res.json({
      empresa: a.company?.name,
      marca: a.manufacturer?.name,
      nome: a.name,
      status: a.status_label?.name,
      local: a.location?.name,
      pa: a.rtd_location?.name
    })

  }catch(e){
    res.status(500).json({error:"Erro ao buscar ativo"})
  }

})

app.post("/move", async (req,res)=>{

  const {asset, pa} = req.body

  try{

    await axios.patch(
      `${SNIPE_URL}/hardware/${asset}`,
      {
        rtd_location_id: pa
      },
      {headers}
    )

    res.json({success:true})

  }catch(e){

    res.status(500).json({error:"Erro ao mover ativo"})

  }

})

app.post("/checkout", async (req,res)=>{

  const {asset,user} = req.body

  try{

    await axios.post(
      `${SNIPE_URL}/hardware/${asset}/checkout`,
      {
        assigned_user: user
      },
      {headers}
    )

    res.json({success:true})

  }catch(e){

    res.status(500).json({error:"Erro no checkout"})

  }

})

app.listen(3000,()=>{

  console.log("Servidor rodando porta 3000")

})