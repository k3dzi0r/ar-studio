import { HashRouter, Route, Routes } from 'react-router-dom'
import LibraryPage from './features/library/LibraryPage'
import EditorPage from './features/editor/EditorPage'
import ScannerPage from './features/scanner/ScannerPage'
import './core/render'
import PrintPage from './features/print/PrintPage'
import DevBuildPage from './dev/DevBuildPage'

// HashRouter keeps the app deployable on any static host (no rewrite rules).
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/edit" element={<EditorPage />} />
        <Route path="/edit/:id" element={<EditorPage />} />
        <Route path="/print" element={<PrintPage />} />
        <Route path="/scan" element={<ScannerPage />} />
        <Route path="/scan/:id" element={<ScannerPage />} />
        {import.meta.env.DEV && <Route path="/dev/build-library" element={<DevBuildPage />} />}
      </Routes>
    </HashRouter>
  )
}
