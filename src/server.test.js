const test = require('node:test')
const assert = require('node:assert/strict')

process.env.SNIPE_URL = 'http://snipe.local/api/v1'
process.env.SNIPE_API_KEY = 'token-valido'

const axios = require('axios')
const {
  app,
  buildAssetPayload,
  parseIntegerField,
  mapCustomFieldLabelToKey,
  findPaCustomFieldKey
} = require('./server')

const baseAsset = {
  id: 10,
  asset_tag: 'AT-10',
  serial: 'S1',
  name: 'Notebook',
  status_label: { id: 2, name: 'Ativo' },
  location: { id: 3, name: 'Matriz' },
  rtd_location: { id: 4, name: 'PA-OLD' },
  custom_fields: {
    PA: { field: '_snipeit_pa_1', value: 'PA-OLD' },
    'MAC Address': { field: '_snipeit_mac_address_2', value: 'AA:BB' }
  }
}

test('parseIntegerField converte inteiros e ignora inválidos', () => {
  assert.equal(parseIntegerField('20'), 20)
  assert.equal(parseIntegerField(33), 33)
  assert.equal(parseIntegerField(''), undefined)
  assert.equal(parseIntegerField('abc'), undefined)
})

test('mapCustomFieldLabelToKey cria mapeamento por label e key interno', () => {
  const mapping = mapCustomFieldLabelToKey(baseAsset)
  assert.equal(mapping.PA, '_snipeit_pa_1')
  assert.equal(mapping.pa, '_snipeit_pa_1')
  assert.equal(mapping['_snipeit_pa_1'], '_snipeit_pa_1')
})

test('findPaCustomFieldKey identifica o field key real do PA', () => {
  assert.equal(findPaCustomFieldKey(baseAsset), '_snipeit_pa_1')
})

test('buildAssetPayload monta payload flat com custom fields no formato aceito pelo Snipe-IT', async () => {
  const originalGet = axios.get

  axios.get = async () => ({ data: baseAsset })

  const payload = await buildAssetPayload(10, {
    name: 'Notebook Atualizado',
    pa: 'PA-NEW',
    status_id: '5',
    custom_fields: { 'MAC Address': 'CC:DD' }
  })

  assert.equal(payload.name, 'Notebook Atualizado')
  assert.equal(payload.status_id, 5)
  assert.equal(payload._snipeit_pa_1, 'PA-NEW')
  assert.equal(payload._snipeit_mac_address_2, 'CC:DD')
  assert.equal(payload.custom_fields, undefined)

  axios.get = originalGet
})

test('buildAssetPayload usa db_column quando o custom field não expõe a propriedade field', async () => {
  const originalGet = axios.get

  axios.get = async () => ({
    data: {
      ...baseAsset,
      custom_fields: {
        PA: { db_column: '_snipeit_pa_6', value: 'PA-OLD' }
      }
    }
  })

  const payload = await buildAssetPayload(10, {
    pa: 'PA-NEW'
  })

  assert.equal(payload._snipeit_pa_6, 'PA-NEW')

  axios.get = originalGet
})

test('PATCH /asset/:id aplica atualização e devolve ativo mapeado', async () => {
  const originalGet = axios.get
  const originalPatch = axios.patch
  const requests = []

  axios.get = async (url) => {
    if (url.endsWith('/hardware/10')) {
      return { data: baseAsset }
    }

    throw new Error(`URL inesperada no GET: ${url}`)
  }

  axios.patch = async (url, payload) => {
    requests.push({ url, payload })
    return { data: { status: 'success' } }
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/asset/10`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pa: 'PA-API', status_id: '7' })
    })
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.success, true)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].payload._snipeit_pa_1, 'PA-API')
    assert.equal(requests[0].payload.status_id, 7)
    assert.equal(requests[0].payload.custom_fields, undefined)
  } finally {
    server.close()
    axios.get = originalGet
    axios.patch = originalPatch
  }
})

test('GET /move-info retorna o payload bruto do Snipe-IT', async () => {
  const originalGet = axios.get

  axios.get = async (url) => {
    if (url.endsWith('/hardware/10')) {
      return { data: baseAsset }
    }

    throw new Error(`URL inesperada no GET: ${url}`)
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/move-info?asset=10`)
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.id, 10)
    assert.equal(data.custom_fields.PA.value, 'PA-OLD')
  } finally {
    server.close()
    axios.get = originalGet
  }
})

test('POST /move atualiza o campo customizado _snipeit_pa_6', async () => {
  const originalPatch = axios.patch
  const requests = []

  axios.patch = async (url, payload) => {
    requests.push({ url, payload })
    return { data: { status: 'success' } }
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 10, pa: 'PA-NOVO' })
    })
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.success, true)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].payload._snipeit_pa_6, 'PA-NOVO')
    assert.equal(requests[0].payload.rtd_location_id, undefined)
  } finally {
    server.close()
    axios.patch = originalPatch
  }
})
