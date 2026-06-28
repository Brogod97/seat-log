import { useState } from 'react'
import SeatMapForm from './components/SeatMapForm'
import SeatMapPreview from './components/SeatMapPreview'
import type { SeatMapConfig } from './types'

const DEFAULT_CONFIG: SeatMapConfig = {
  rows: 10,
  cols: 20,
  rowAisles: [],
  colAisles: [],
}

function App() {
  const [config, setConfig] = useState<SeatMapConfig>(DEFAULT_CONFIG)

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-80 shrink-0 bg-white border-r border-gray-200 p-6 overflow-y-auto">
        <h1 className="text-lg font-bold text-gray-800 mb-6">좌석표 생성기</h1>
        <SeatMapForm config={config} onChange={setConfig} />
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <SeatMapPreview config={config} />
      </main>
    </div>
  )
}

export default App
