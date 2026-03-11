(function () {
  const QUEUE_KEY = "offline_request_queue_v1"
  let syncing = false

  function getQueue() {
    try {
      const data = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]")
      return Array.isArray(data) ? data : []
    } catch (_error) {
      return []
    }
  }

  function setQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  }

  // função reutilizável exigida.
  function salvarOffline(dados) {
    const queue = getQueue()
    queue.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...dados
    })
    setQueue(queue)
    return queue.length
  }

  // função reutilizável exigida.
  async function enviarParaAPI(dados) {
    if (dados.action === "updateAsset") {
      await window.SnipeApi.updateAsset(dados.assetId, dados.payload)
      return
    }

    if (dados.action === "checkout") {
      await window.SnipeApi.checkoutAsset(dados.assetId, dados.userId)
      return
    }

    throw new Error(`Ação offline não suportada: ${dados.action}`)
  }

  // função reutilizável exigida.
  async function sincronizarDados() {
    if (syncing || !navigator.onLine) {
      return
    }

    syncing = true
    const queue = getQueue()
    const pending = [...queue]

    for (const item of pending) {
      try {
        await enviarParaAPI(item)
        const latest = getQueue().filter((current) => current.id !== item.id)
        setQueue(latest)
      } catch (error) {
        console.warn("Falha ao sincronizar item offline:", item, error)
        break
      }
    }

    syncing = false
  }

  function monitorarConexao() {
    window.addEventListener("online", sincronizarDados)
    document.addEventListener("resume", sincronizarDados)
    document.addEventListener("deviceready", sincronizarDados)
  }

  window.OfflineSync = {
    getQueue,
    salvarOffline,
    sincronizarDados,
    enviarParaAPI,
    monitorarConexao
  }

  monitorarConexao()
})()
