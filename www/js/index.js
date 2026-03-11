let currentAssetId = null
let statusOptions = []
let locationOptions = []
let scanner = null
let scanning = false
let lastScan = null

const byId = (id) => document.getElementById(id)

function fillSelect(selectId, options, selectedValue, placeholder) {
  const select = byId(selectId)
  select.innerHTML = ""

  const empty = document.createElement("option")
  empty.value = ""
  empty.textContent = placeholder
  select.appendChild(empty)

  options.forEach((opt) => {
    const el = document.createElement("option")
    el.value = opt.id
    el.textContent = `${opt.id} - ${opt.name}`
    select.appendChild(el)
  })

  if (selectedValue) select.value = selectedValue
}

async function loadOptions() {
  const data = await window.SnipeApi.listOptions()
  statusOptions = data.statuses || []
  locationOptions = data.locations || []

  fillSelect("editStatus", statusOptions, null, "Selecione")
  fillSelect("editLocation", locationOptions, null, "Selecione")
  fillSelect("editRTD", locationOptions, null, "Selecione")
}

function parseAssetId(raw) {
  if (!raw) return null
  if (raw.includes("hardware/")) {
    return raw.split("hardware/")[1].trim()
  }
  return raw.trim()
}

function fillPanel(asset) {
  byId("emptyState").style.display = "none"
  byId("assetPanel").style.display = "block"

  byId("view-id").textContent = asset.id || "-"
  byId("view-tag").textContent = asset.assetTag || "-"
  byId("view-name").textContent = asset.name || "-"
  byId("view-status").textContent = asset.status || "-"
  byId("view-location").textContent = asset.location || "-"
  byId("view-rtd").textContent = asset.rtdLocation || "-"
  byId("view-pa").textContent = asset.pa || "-"
  byId("view-mac").textContent = asset.customFields?.["MAC Address"] || "-"

  byId("editPA").value = asset.pa || ""
  byId("editNotes").value = asset.notes || ""

  fillSelect("editStatus", statusOptions, asset.statusId, "Selecione")
  fillSelect("editLocation", locationOptions, asset.locationId, "Selecione")
  fillSelect("editRTD", locationOptions, asset.rtdLocationId, "Selecione")
}

async function loadAsset(assetId) {
  const data = await window.SnipeApi.getAsset(assetId)
  currentAssetId = data.id
  byId("manualAsset").value = data.id
  fillPanel(data)
}

function loadAssetFromInput() {
  const id = parseAssetId(byId("manualAsset").value)
  if (!id) return
  loadAsset(id).catch((error) => alert(error.message))
}

function onScanSuccess(decodedText) {
  const id = parseAssetId(decodedText)
  if (id === lastScan) return
  lastScan = id

  if (navigator.vibrate) navigator.vibrate(120)

  document.body.classList.add("scan-success")
  setTimeout(() => document.body.classList.remove("scan-success"), 500)

  loadAsset(id).catch((error) => alert(error.message))
}

function startScanner() {
  if (scanning) return
  byId("reader").style.display = "block"

  scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 220, height: 220 } })
  scanner.render(onScanSuccess)
  scanning = true
}

async function saveAsset() {
  if (!currentAssetId) return

  const payload = {
    _snipeit_pa_6: byId("editPA").value,
    status_id: byId("editStatus").value || undefined,
    location_id: byId("editLocation").value || undefined,
    rtd_location_id: byId("editRTD").value || undefined,
    notes: byId("editNotes").value
  }

  const btn = byId("saveButton")
  btn.disabled = true
  btn.textContent = "Salvando..."

  try {
    if (navigator.onLine) {
      const asset = await window.SnipeApi.updateAsset(currentAssetId, payload)
      fillPanel(asset)
      alert("Ativo atualizado")
    } else {
      window.OfflineSync.salvarOffline({
        action: "updateAsset",
        assetId: currentAssetId,
        payload
      })
      alert("Sem internet. Alteração salva no buffer offline.")
    }
  } catch (error) {
    alert(`Falha ao salvar: ${error.message}`)
  } finally {
    btn.disabled = false
    btn.textContent = "Salvar alterações"
  }
}

window.startScanner = startScanner
window.loadAssetFromInput = loadAssetFromInput
window.saveAsset = saveAsset

document.addEventListener("DOMContentLoaded", () => {
  loadOptions().catch((error) => alert(error.message))
  window.OfflineSync.sincronizarDados()
})
