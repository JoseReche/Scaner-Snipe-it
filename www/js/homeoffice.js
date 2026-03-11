async function checkout(assetId, userId) {
  if (!assetId) return

  if (navigator.onLine) {
    await window.SnipeApi.checkoutAsset(assetId, userId)
    return
  }

  window.OfflineSync.salvarOffline({ action: "checkout", assetId, userId })
}

async function entregar() {
  const user = document.getElementById("usuario").value

  await checkout(document.getElementById("mouse").value, user)
  await checkout(document.getElementById("teclado").value, user)
  await checkout(document.getElementById("headset").value, user)

  if (navigator.onLine) {
    alert("Kit entregue")
    return
  }

  alert("Sem internet. Checkouts adicionados ao buffer offline.")
}

window.entregar = () => entregar().catch((error) => alert(error.message))
