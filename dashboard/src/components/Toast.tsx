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
  success: { bg: 'rgba(78, 222, 163, 0.12)', border: 'rgba(78, 222, 163, 0.25)', text: '#4edea3' },
  error: { bg: 'rgba(255, 180, 171, 0.12)', border: 'rgba(255, 180, 171, 0.25)', text: '#ffb4ab' },
  warning: { bg: 'rgba(255, 185, 95, 0.12)', border: 'rgba(255, 185, 95, 0.25)', text: '#ffb95f' },
  info: { bg: 'rgba(173, 198, 255, 0.12)', border: 'rgba(173, 198, 255, 0.25)', text: '#adc6ff' },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const c = colorMap[toast.type]
  return (
    <div
      className="pointer-events-auto flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-medium animate-slide-up shadow-ambient backdrop-blur-sm"
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
