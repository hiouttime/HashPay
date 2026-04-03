import React from 'react'
import PageTitle from './PageTitle'

export function AppPage({ title, subtitle, actions, footer, className = '', children }) {
  return (
    <div className={`admin-page ${className}`.trim()}>
      {title ? <PageTitle title={title} subtitle={subtitle} actions={actions} /> : null}
      <div className="admin-page-body">{children}</div>
      {footer ? <div className="admin-footer">{footer}</div> : null}
    </div>
  )
}

export function AppGroup({ title, subtitle, footer, className = '', children }) {
  return (
    <div className={`admin-section ${className}`.trim()}>
      <section className="app-section-plain">
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
    </div>
  )
}

export function AppMetric({ label, value, tone = 'default' }) {
  return (
    <div className={`overview-card tone-${tone}`}>
      <span className="overview-label">{label}</span>
      <strong className="overview-value">{value}</strong>
    </div>
  )
}
