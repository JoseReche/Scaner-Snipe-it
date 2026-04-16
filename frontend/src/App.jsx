import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { RequestsPage } from './pages/RequestsPage'
import { DispatchPage } from './pages/DispatchPage'
import { ReceivingPage } from './pages/ReceivingPage'
import { ProcessingPage } from './pages/ProcessingPage'
import { AssetHistoryPage } from './pages/AssetHistoryPage'
import { AdminPage } from './pages/AdminPage'
import { apiClient } from './api/client'

function ProtectedRoute({ children }) {
  if (!apiClient.token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="dispatch" element={<DispatchPage />} />
          <Route path="receiving" element={<ReceivingPage />} />
          <Route path="processing" element={<ProcessingPage />} />
          <Route path="assets" element={<AssetHistoryPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
