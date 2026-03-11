(function () {
  const config = window.APP_CONFIG || {}

  function validateConfig() {
    if (!config.API_BASE_URL || config.API_BASE_URL.includes("SEU-SNIPE")) {
      throw new Error("Configure APP_CONFIG.API_BASE_URL em www/js/config.js")
    }

    if (!config.API_TOKEN || config.API_TOKEN === "SEU_TOKEN_API") {
      throw new Error("Configure APP_CONFIG.API_TOKEN em www/js/config.js")
    }
  }

  function customFieldValue(asset, fieldName) {
    const field = asset.custom_fields?.[fieldName]
    return field?.value ?? null
  }

  function mapAsset(asset) {
    return {
      id: asset.id,
      assetTag: asset.asset_tag,
      name: asset.name,
      status: asset.status_label?.name || null,
      statusId: asset.status_label?.id || null,
      location: asset.location?.name || null,
      locationId: asset.location?.id || null,
      rtdLocation: asset.rtd_location?.name || null,
      rtdLocationId: asset.rtd_location?.id || null,
      notes: asset.notes || "",
      pa: customFieldValue(asset, "PA") || null,
      company: asset.company?.name || null,
      manufacturer: asset.manufacturer?.name || null,
      customFields: Object.fromEntries(
        Object.entries(asset.custom_fields || {}).map(([key, value]) => [key, value.value ?? null])
      )
    }
  }

  async function request(path, options = {}) {
    validateConfig()

    const response = await fetch(`${config.API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.API_TOKEN}`,
        ...(options.headers || {})
      }
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message = body.messages || body.error || `Falha na API (${response.status})`
      throw new Error(Array.isArray(message) ? message.join("; ") : String(message))
    }

    return body
  }

  async function fetchRows(endpoint) {
    const rows = []
    let offset = 0
    const limit = 500

    while (true) {
      const page = await request(`/${endpoint}?limit=${limit}&offset=${offset}`)
      const pageRows = Array.isArray(page.rows) ? page.rows : []
      rows.push(...pageRows)

      if (pageRows.length < limit) {
        return rows
      }

      offset += limit
    }
  }

  window.SnipeApi = {
    getAsset: async (id) => mapAsset(await request(`/hardware/${id}`)),
    updateAsset: async (id, payload) => {
      await request(`/hardware/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
      return mapAsset(await request(`/hardware/${id}`))
    },
    listOptions: async () => {
      const [statusRows, locationRows] = await Promise.all([fetchRows("statuslabels"), fetchRows("locations")])
      return {
        statuses: statusRows.map((item) => ({ id: item.id, name: item.name })),
        locations: locationRows.map((item) => ({ id: item.id, name: item.name }))
      }
    },
    checkoutAsset: async (asset, user) => request(`/hardware/${asset}/checkout`, {
      method: "POST",
      body: JSON.stringify({ assigned_user: user })
    })
  }
})()
