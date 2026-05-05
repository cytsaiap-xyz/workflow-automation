import { useToastStore, Toast } from '../stores/toastStore';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Info from 'lucide-react/dist/esm/icons/info';
import X from 'lucide-react/dist/esm/icons/x';

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: '#22c55e',
    icon: '#22c55e',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: '#ef4444',
    icon: '#ef4444',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '#f59e0b',
    icon: '#f59e0b',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: '#3b82f6',
    icon: '#3b82f6',
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore();
  const Icon = iconMap[toast.type];
  const colors = colorMap[toast.type];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: 'var(--bg-secondary)',
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
        minWidth: '300px',
        maxWidth: '450px',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <Icon size={20} style={{ color: colors.icon, flexShrink: 0, marginTop: toast.details?.length ? '2px' : 0, alignSelf: toast.details?.length ? 'flex-start' : 'center' }} />
      <div style={{ flex: 1, fontSize: '14px', lineHeight: '1.4' }}>
        <span>{toast.message}</span>
        {toast.details && toast.details.length > 0 && (
          <ul style={{ margin: '6px 0 0 0', padding: 0, listStyle: 'none' }}>
            {toast.details.map((detail, i) => (
              <li key={i} style={{ display: 'flex', gap: '6px', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <span style={{ flexShrink: 0 }}>•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
