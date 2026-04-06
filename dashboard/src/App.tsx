import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Memories from './pages/Memories'
import Validations from './pages/Validations'
import Quarantine from './pages/Quarantine'
import Connectors from './pages/Connectors'
import Analytics from './pages/Analytics'
import AuditLog from './pages/AuditLog'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/memories" element={<Memories />} />
        <Route path="/validations" element={<Validations />} />
        <Route path="/quarantine" element={<Quarantine />} />
        <Route path="/connectors" element={<Connectors />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
