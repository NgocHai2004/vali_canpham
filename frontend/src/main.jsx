import React, { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.jsx'
import PreviewWindow from './PreviewWindow.jsx'
import { LanguageProvider } from './i18n'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ color: '#ef4444', margin: '0 0 12px 0', fontSize: '20px' }}>⚠️ Đã xảy ra lỗi giao diện</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 16px 0' }}>
              Ứng dụng gặp sự cố khi hiển thị. Bạn có thể nhấn Thử lại hoặc tải lại trang.
            </p>
            <div style={{
              background: '#0f172a',
              padding: '12px',
              borderRadius: '6px',
              color: '#fca5a5',
              fontFamily: 'monospace',
              fontSize: '12px',
              overflowX: 'auto',
              marginBottom: '16px',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error?.toString()}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔄 Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const isPreviewRoute = new URLSearchParams(window.location.search).get('preview') === '1'

/**
 * Kiosk: chặn zoom ngoài ý muốn.
 *
 * Electron bật zoom theo Ctrl+lăn chuột (và Ctrl +/-/0), rồi Chromium LƯU mức
 * zoom vào profile (`per_host_zoom_levels` trong Preferences) — nên chỉ một lần
 * lỡ tay là toàn bộ giao diện nhỏ đi VĨNH VIỄN, khởi động lại cũng không hết.
 * Với màn hình kiosk cố định thì zoom không có ích gì, chặn luôn cho chắc.
 */
window.addEventListener("wheel", (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey) return;
  if (e.key === "-" || e.key === "=" || e.key === "+" || e.key === "0") e.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        {isPreviewRoute ? <PreviewWindow /> : <App />}
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)
