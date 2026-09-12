import '@testing-library/jest-dom/vitest'

// Stub matchMedia for JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Stub indexedDB for JSDOM
if (typeof window !== 'undefined' && !window.indexedDB) {
  const mockIdb = {
    open: () => ({
      addEventListener: () => {},
      removeEventListener: () => {},
      result: {},
    }),
  }
  Object.defineProperty(window, 'indexedDB', {
    writable: true,
    value: mockIdb,
  })
  ;(globalThis as any).indexedDB = mockIdb
}
