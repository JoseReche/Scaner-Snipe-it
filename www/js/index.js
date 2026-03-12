let currentAssetId = null
let statusOptions = []
let locationOptions = []
let scanner = null
let scanning = false
let lastScan = null
let scanLock = false

const byId = (id) => document.getElementById(id)

function setScanStatus(message, isError = false) {
  const statusEl = byId("scanStatus")
  if (!statusEl) return

  statusEl.textContent = message
  statusEl.style.color = isError ? "#dc2626" : ""
}

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

async function onScanSuccess(decodedText) {
  const id = parseAssetId(decodedText)
  if (!id || id === lastScan || scanLock) return

  scanLock = true
  lastScan = id

  if (navigator.vibrate) navigator.vibrate(120)

  document.body.classList.add("scan-success")
  setTimeout(() => document.body.classList.remove("scan-success"), 500)

  try {
    await loadAsset(id)
    setScanStatus(`Leitura OK: ativo ${id}`)
  } catch (error) {
    setScanStatus(`Falha ao carregar ativo ${id}`, true)
    alert(error.message)
  } finally {
    setTimeout(() => {
      scanLock = false
    }, 700)
  }
}

function getScannerConfig() {
  const smallScreen = window.matchMedia("(max-width: 820px)").matches

  return {
    fps: smallScreen ? 6 : 10,
    qrbox: smallScreen ? { width: 190, height: 190 } : { width: 220, height: 220 },
    aspectRatio: smallScreen ? 1.333334 : undefined,
    rememberLastUsedCamera: true,
    ...(typeof Html5QrcodeScanType !== "undefined"
      ? { supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] }
      : {})
  }
}

function startScanner() {
  if (scanning) return

  byId("reader").style.display = "block"
  setScanStatus("Solicitando acesso à câmera...")

  if (typeof Html5Qrcode === "undefined") {
    setScanStatus("Leitor de QR Code não carregado", true)
    alert("Não foi possível iniciar o leitor de QR Code.")
    return
  }

  scanner = new Html5Qrcode("reader")

  const config = getScannerConfig()
  const cameraPreference = { facingMode: "environment" }

  scanner
    .start(cameraPreference, config, onScanSuccess)
    .then(() => {
      scanning = true
      setScanStatus("Câmera iniciada. Aponte para o QR Code.")
    })
    .catch((error) => {
      const message = String(error?.message || error || "")

      if (message.includes("NotReadableError")) {
        setScanStatus(
          "A câmera está ocupada por outro app. Feche o app da câmera/WhatsApp e tente novamente.",
          true
        )
        return
      }

      if (message.includes("NotAllowedError") || message.includes("Permission")) {
        setScanStatus("Permissão da câmera negada. Autorize o app nas configurações.", true)
        return
      }

      setScanStatus(`Falha ao iniciar câmera: ${message}`, true)
    })
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
  setScanStatus("Toque em ESCANEAR QR CODE para abrir a câmera.")
  loadOptions().catch((error) => alert(error.message))
  window.OfflineSync.sincronizarDados()
})
