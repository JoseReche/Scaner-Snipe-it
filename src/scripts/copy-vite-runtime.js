const fs = require('fs/promises')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const sourceAuthJs = path.join(rootDir, 'public', 'js', 'auth.js')
const distDir = path.join(rootDir, '..', 'dist-vite')
const targetDir = path.join(distDir, 'js')
const targetAuthJs = path.join(targetDir, 'auth.js')

const run = async () => {
  await fs.mkdir(targetDir, { recursive: true })
  await fs.copyFile(sourceAuthJs, targetAuthJs)
}

run().catch((error) => {
  console.error('Falha ao copiar runtime JS para o build Vite:', error)
  process.exit(1)
})
