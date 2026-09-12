import { network } from '@/lib/xrpl'

export default function App() {
  return (
    <main>
      <h1>AT1 Bond Marketplace on XRPL</h1>
      <p>Frontend template. Network: <code>{network.wss}</code></p>
    </main>
  )
}
