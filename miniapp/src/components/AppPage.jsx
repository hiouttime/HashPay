import React from 'react'
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/dashboard', label: '概览' },
  { to: '/orders', label: '订单' },
  { to: '/payments', label: '支付' },
  { to: '/merchants', label: '商户' },
  { to: '/settings', label: '设置' },
]

export function AppPage({ title, subtitle, actions, footer, className = '', children, hideNav = false }) {
  return (
    <div className={`app-shell ${className}`.trim()}>
      <div className="app-noise" />
      <div className="app-topbar">
        <div className="app-brand">
          <span className="brand-dot" />
          <div>
            <div className="brand-kicker">HashPay</div>
            <strong>Telegram Admin</strong>
          </div>
        </div>
        {!hideNav ? (
          <div className="app-tabs">
            {tabs.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `app-tab ${isActive ? 'is-active' : ''}`}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`app-page ${className}`.trim()}>
        <div className="app-page-head">
          <div>
            <p className="app-kicker">管理视图</p>
            <h1 className="app-page-title">{title}</h1>
            {subtitle ? <p className="app-page-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="app-page-actions">{actions}</div> : null}
        </div>
        <div className="app-page-body">{children}</div>
        {footer ? <div className="app-page-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export function AppGroup({ title, subtitle, footer, className = '', children }) {
  return (
    <section className={`app-section ${className}`.trim()}>
      {(title || subtitle || footer) ? (
        <div className="app-section-head">
          <div>
            {title ? <h2 className="app-section-title">{title}</h2> : null}
            {subtitle ? <p className="app-section-subtitle">{subtitle}</p> : null}
          </div>
          {footer ? <div className="app-section-side">{footer}</div> : null}
        </div>
      ) : null}
      <div className="app-section-body">{children}</div>
    </section>
  )
}

export function AppMetric({ label, value, tone = 'default' }) {
  return (
    <div className={`app-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
