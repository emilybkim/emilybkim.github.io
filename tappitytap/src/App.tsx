import { useState, useEffect } from 'react'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import { preloadStream, streamDb } from './db/stream'
import { TT } from './game/lifecycle'
import { GamePage } from './GamePage'

// Expose test functions on window for console testing
declare global {
  interface Window {
    TT: typeof TT
    streamDb: typeof streamDb
  }
}
window.TT = TT
window.streamDb = streamDb

function App() {
  const [streamReady, setStreamReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    preloadStream()
      .then(() => {
        setStreamReady(true)
        console.log('[TT] Stream connected and ready!')
        console.log('[TT] Test in console: await TT.join("Alice")')
      })
      .catch((err) => {
        console.error('[TT] Stream failed to connect:', err)
        setError(err.message || 'Failed to connect to stream')
      })
  }, [])

  if (error) {
    return (
      <Theme appearance="dark" accentColor="red">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h1>Connection Error</h1>
          <p>{error}</p>
          <p style={{ color: '#888' }}>Check that the Vite proxy is configured correctly.</p>
        </div>
      </Theme>
    )
  }

  if (!streamReady) {
    return (
      <Theme appearance="dark" accentColor="cyan">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2>Connecting to stream...</h2>
        </div>
      </Theme>
    )
  }

  return (
    <Theme appearance="dark" accentColor="cyan">
      <GamePage />
    </Theme>
  )
}

export default App
