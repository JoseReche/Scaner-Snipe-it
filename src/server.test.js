const test = require('node:test')
const assert = require('node:assert/strict')

process.env.SNIPE_URL = 'http://snipe.local/api/v1'
process.env.JWT_SECRET = 'test-secret'
process.env.ENCRYPTION_KEY = 'encryption-key-test'

const axios = require('axios')
const { generateAccessToken } = require('./auth/jwt')
const {
  app,
  buildAssetPayload,
  parseIntegerField,
  mapCustomFieldLabelToKey,
  findPaCustomFieldKey
} = require('./server')


const fs = require('fs/promises')
const usersPath = require('path').join(__dirname, 'data', 'users.json')
let originalUsersFile = '[]\n'

test.before(async () => {
  originalUsersFile = await fs.readFile(usersPath, 'utf8')

  const users = [
    {
      matricula: '12345',
      password_hash: '$2a$12$GF6lXBdL2ZG9zDM7wJRf3uK9r51PgUf8hX6HZv8vfUzqZJZXg5iAS',
      api_key: 'api-key-teste-12345',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ]

  await fs.writeFile(usersPath, `${JSON.stringify(users, null, 2)}\n`, 'utf8')
})

test.after(async () => {
  await fs.writeFile(usersPath, originalUsersFile, 'utf8')
})

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


const authHeader = () => ({ Authorization: `Bearer ${generateAccessToken({ matricula: '12345' })}` })
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

test('buildAssetPayload ignora name/serial e monta payload flat com custom fields', async () => {
  const originalGet = axios.get

  axios.get = async () => ({ data: baseAsset })

  const payload = await buildAssetPayload(10, {
    serial: 'S2',
    pa: 'PA-NEW',
    status_id: '5',
    custom_fields: { 'MAC Address': 'CC:DD' }
  })

  assert.equal(payload.name, undefined)
  assert.equal(payload.serial, undefined)
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



test('buildAssetPayload inclui company_id e assigned_to como inteiros', async () => {
  const originalGet = axios.get

  axios.get = async () => ({ data: baseAsset })

  const payload = await buildAssetPayload(10, {
    company_id: '11',
    assigned_to: '22'
  })

  assert.equal(payload.company_id, 11)
  assert.equal(payload.assigned_to, 22)

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
      headers: { 'Content-Type': 'application/json', ...authHeader() },
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
    const response = await fetch(`http://127.0.0.1:${port}/move-info?asset=10`, { headers: authHeader() })
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
      headers: { 'Content-Type': 'application/json', ...authHeader() },
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



test('POST /home-office/baixa realiza checkin opcional e atualiza status do ativo', async () => {
  const originalGet = axios.get
  const originalPost = axios.post
  const originalPatch = axios.patch

  const calls = []

  axios.post = async (url, payload) => {
    calls.push({ method: 'post', url, payload })
    return { data: { status: 'success' } }
  }

  axios.patch = async (url, payload) => {
    calls.push({ method: 'patch', url, payload })
    return { data: { status: 'success' } }
  }

  axios.get = async (url) => {
    if (url.endsWith('/hardware/10')) {
      return { data: baseAsset }
    }

    throw new Error(`URL inesperada no GET: ${url}`)
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/home-office/baixa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        asset: 10,
        status_id: '8',
        notes: 'Baixa de kit home office',
        do_checkin: true
      })
    })

    const data = await response.json()

    assert.equal(response.status, 200)
    assert.equal(data.success, true)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].method, 'post')
    assert.match(calls[0].url, /\/hardware\/10\/checkin$/)
    assert.equal(calls[1].method, 'patch')
    assert.match(calls[1].url, /\/hardware\/10$/)
    assert.equal(calls[1].payload.status_id, 8)
    assert.equal(calls[1].payload.notes, 'Baixa de kit home office')
  } finally {
    server.close()
    axios.get = originalGet
    axios.post = originalPost
    axios.patch = originalPatch
  }
})
test('POST /api/auth/register cria usuário e impede matrícula duplicada', async () => {
  const server = app.listen(0)
  const { port } = server.address()

  try {
    const uniqueMatricula = `u${Date.now()}`
    const payload = {
      matricula: uniqueMatricula,
      password: 'SenhaSuperForte!2026',
      apiKey: 'minha-chave-pessoal-123456'
    }

    const registerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const registerData = await registerResponse.json()

    assert.equal(registerResponse.status, 201)
    assert.equal(registerData.success, true)

    const usersAfterRegister = JSON.parse(await fs.readFile(usersPath, 'utf8'))
    const createdUser = usersAfterRegister.find((user) => user.matricula === uniqueMatricula)

    assert.ok(createdUser)
    assert.equal(createdUser.api_key, payload.apiKey)

    const duplicateResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const duplicateData = await duplicateResponse.json()

    assert.equal(duplicateResponse.status, 409)
    assert.equal(duplicateData.error, 'Matrícula já cadastrada')
  } finally {
    server.close()
  }
})



test('POST /api/auth/register bloqueia cadastro quando o usuário já está autenticado', async () => {
  const server = app.listen(0)
  const { port } = server.address()

  try {
    const payload = {
      matricula: `u${Date.now()}`,
      password: 'SenhaSuperForte!2026',
      apiKey: 'api-key-do-usuario-123456'
    }

    const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    assert.equal(response.status, 403)
    assert.equal(data.error, 'Usuário autenticado não pode criar novo cadastro')
  } finally {
    server.close()
  }
})

test('GET /asset/:id propaga 401 quando API key do usuário é rejeitada pelo Snipe-IT', async () => {
  const originalGet = axios.get

  axios.get = async () => {
    const error = new Error('Unauthorized or unauthenticated.')
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Unauthorized or unauthenticated.' }
    }
    error.config = {
      method: 'get',
      url: 'https://snipe.schulze.com.br/api/v1/hardware/1'
    }
    throw error
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/asset/1`, { headers: authHeader() })
    const data = await response.json()

    assert.equal(response.status, 401)
    assert.match(data.error, /Erro ao buscar ativo/)
    assert.match(data.error, /API Key pessoal inválida, expirada ou sem permissão no Snipe-IT/)
  } finally {
    server.close()
    axios.get = originalGet
  }
})


test('GET /options propaga 401 com mensagem amigável quando a API key do usuário é inválida', async () => {
  const originalGet = axios.get

  axios.get = async () => {
    const error = new Error('Unauthorized or unauthenticated.')
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Unauthorized or unauthenticated.' }
    }
    error.config = {
      method: 'get',
      url: 'https://snipe.schulze.com.br/api/v1/statuslabels'
    }
    throw error
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/options`, { headers: authHeader() })
    const data = await response.json()

    assert.equal(response.status, 401)
    assert.match(data.error, /Erro ao buscar listas de status e local/)
    assert.match(data.error, /API Key pessoal inválida, expirada ou sem permissão no Snipe-IT/)
  } finally {
    server.close()
    axios.get = originalGet
  }
})


test('POST /api/auth/register e POST /api/auth/login não consultam API do Snipe-IT', async () => {
  const originalGet = axios.get
  const originalPost = axios.post
  const originalPatch = axios.patch

  let externalCalls = 0

  axios.get = async () => {
    externalCalls += 1
    throw new Error('Não deveria chamar Snipe no login/cadastro')
  }

  axios.post = async () => {
    externalCalls += 1
    throw new Error('Não deveria chamar Snipe no login/cadastro')
  }

  axios.patch = async () => {
    externalCalls += 1
    throw new Error('Não deveria chamar Snipe no login/cadastro')
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const matricula = `u${Date.now()}`
    const registerPayload = {
      matricula,
      password: 'SenhaSuperForte!2026',
      apiKey: 'api-key-do-usuario-123456'
    }

    const registerResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerPayload)
    })

    const registerData = await registerResponse.json()

    assert.equal(registerResponse.status, 201)
    assert.equal(registerData.success, true)

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matricula,
        password: registerPayload.password
      })
    })

    const loginData = await loginResponse.json()

    assert.equal(loginResponse.status, 200)
    assert.equal(typeof loginData.token, 'string')
    assert.equal(loginData.expiresIn, '3h')
    assert.equal(externalCalls, 0)
  } finally {
    server.close()
    axios.get = originalGet
    axios.post = originalPost
    axios.patch = originalPatch
  }
})


test('GET /options retorna status, locais, empresas e usuários', async () => {
  const originalGet = axios.get

  axios.get = async (url) => {
    if (url.endsWith('/statuslabels')) {
      return { data: { rows: [{ id: 1, name: 'Ativo' }] } }
    }

    if (url.endsWith('/locations')) {
      return { data: { rows: [{ id: 2, name: 'Matriz' }] } }
    }

    if (url.endsWith('/companies')) {
      return { data: { rows: [{ id: 3, name: 'Empresa A' }] } }
    }

    if (url.endsWith('/users')) {
      return { data: { rows: [{ id: 4, name: 'Usuário A' }] } }
    }

    throw new Error(`URL inesperada no GET: ${url}`)
  }

  const server = app.listen(0)
  const { port } = server.address()

  try {
    const response = await fetch(`http://127.0.0.1:${port}/options`, { headers: authHeader() })
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(data.statuses, [{ id: 1, name: 'Ativo' }])
    assert.deepEqual(data.locations, [{ id: 2, name: 'Matriz' }])
    assert.deepEqual(data.companies, [{ id: 3, name: 'Empresa A' }])
    assert.deepEqual(data.users, [{ id: 4, name: 'Usuário A' }])
  } finally {
    server.close()
    axios.get = originalGet
  }
})


test('Rotas públicas usam URLs limpas e redirecionam .html', async () => {
  const server = app.listen(0)
  const { port } = server.address()

  try {
    const cleanResponse = await fetch(`http://127.0.0.1:${port}/scanner`)
    assert.equal(cleanResponse.status, 200)
    const cleanHtml = await cleanResponse.text()
    assert.match(cleanHtml, /Scanner de Ativos/)

    const legacyResponse = await fetch(`http://127.0.0.1:${port}/scanner.html`, { redirect: 'manual' })
    assert.equal(legacyResponse.status, 301)
    assert.equal(legacyResponse.headers.get('location'), '/scanner')
  } finally {
    server.close()
  }
})
