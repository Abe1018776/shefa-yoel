import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Viewer from './pages/Viewer'
import Compare from './pages/Compare'

function Nav() {
  const { pathname } = useLocation()
  return (
    <nav style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '8px 24px', display: 'flex', gap: 16, alignItems: 'center', fontSize: 14
    }}>
      <Link to="/" style={{ fontWeight: pathname === '/' ? 700 : 400 }}>צפייה</Link>
      <Link to="/compare" style={{ fontWeight: pathname === '/compare' ? 700 : 400 }}>השוואה</Link>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Viewer />} />
        <Route path="/compare" element={<Compare />} />
      </Routes>
    </BrowserRouter>
  )
}
