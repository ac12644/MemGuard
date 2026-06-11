import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { Check, X, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const iconMap = {
  success: <Check size={14} />,
  error: <AlertTriangle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
}

const colorMap = {
  success: { bg: '#eaf3ec', border: 'rgba(30, 122, 76, 0.35)', text: '#1e7a4c' },
  error: { bg: '#f3dedc', border: 'rgba(168, 50, 45, 0.35)', text: '#a8322d' },
  warning: { bg: '#f5e7cf', border: 'rgba(166, 97, 2, 0.35)', text: '#a66102' },
  info: { bg: '#e7ecf7', border: 'rgba(35, 64, 142, 0.3)', text: '#23408e' },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const c = colorMap[toast.type]
  return (
    <div
      className="pointer-events-auto flex items-center gap-2.5 rounded-md px-4 py-3 text-sm font-semibold animate-slide-up shadow-lifted"
      style={{ backgroundColor: c.bg, border: `1px solid ${c.border}`, color: c.text, minWidth: 260 }}
    >
      {iconMap[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="opacity-50 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  )
}
