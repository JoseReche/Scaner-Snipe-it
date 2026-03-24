const path = require('path')
const { defineConfig } = require('vite')

module.exports = defineConfig({
  root: path.resolve(__dirname, 'public'),
  publicDir: false,
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '..', 'dist-vite'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'public/index.html'),
        login: path.resolve(__dirname, 'public/login.html'),
        register: path.resolve(__dirname, 'public/register.html'),
        usuario: path.resolve(__dirname, 'public/usuario.html'),
        scanner: path.resolve(__dirname, 'public/scanner.html'),
        scannerPa: path.resolve(__dirname, 'public/scanner-pa.html'),
        dashboard: path.resolve(__dirname, 'public/dashboard.html'),
        changePassword: path.resolve(__dirname, 'public/change-password.html'),
        homeOffice: path.resolve(__dirname, 'public/home-office.html'),
        retornoHomeOffice: path.resolve(__dirname, 'public/retorno-home-office.html')
      }
    }
  }
})
