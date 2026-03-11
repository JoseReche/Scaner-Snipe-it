async function carregarAtivo() {
  const params = new URLSearchParams(location.search)
  const assetId = params.get("id")

  if (!assetId) return

  const data = await window.SnipeApi.getAsset(assetId)
  document.getElementById("empresa").innerHTML = `<b>Empresa:</b> ${data.company || "-"}`
  document.getElementById("marca").innerHTML = `<b>Marca:</b> ${data.manufacturer || "-"}`
  document.getElementById("status").innerHTML = `<b>Situação:</b> ${data.status || "-"}`
  document.getElementById("local").innerHTML = `<b>Local:</b> ${data.location || "-"}`
  document.getElementById("pa").innerHTML = `<b>PA:</b> ${data.pa || "-"}`
}

async function mover() {
  const params = new URLSearchParams(location.search)
  const assetId = params.get("id")
  const pa = document.getElementById("novaPA").value

  const payload = { _snipeit_pa_6: pa }

  if (navigator.onLine) {
    await window.SnipeApi.updateAsset(assetId, payload)
    alert("Atualizado")
    carregarAtivo().catch((error) => alert(error.message))
    return
  }

  window.OfflineSync.salvarOffline({ action: "updateAsset", assetId, payload })
  alert("Sem internet. Movimento salvo no buffer offline.")
}

window.mover = () => mover().catch((error) => alert(error.message))
document.addEventListener("DOMContentLoaded", () => {
  carregarAtivo().catch((error) => alert(error.message))
})
