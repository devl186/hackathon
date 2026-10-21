import type { ReactNode } from 'react';
import type { RiskLevel } from '../lib/scanner/types';
import { RISK_BADGE } from '../lib/findings/presentation';

// Markup below is copied from the canonical Lepidus anatomy in design.md §5; only content changes.

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label: string }) {
  return (
    <span className={`lp-spinner lp-spinner--${size}`} role="status">
      <svg className="lp-spinner__svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="lp-spinner__track" cx="12" cy="12" r="10" strokeWidth="3" />
        <circle
          className="lp-spinner__arc"
          cx="12"
          cy="12"
          r="10"
          strokeWidth="3"
          strokeLinecap="round"
          {...{ 'path-length': '100' }}
          strokeDasharray="28 72"
        />
      </svg>
      <span className="lp-spinner__visually-hidden">{label}</span>
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`lp-badge lp-badge--${RISK_BADGE[risk]}`}>
      <span className="lp-badge__dot"></span>
      {risk}
    </span>
  );
}

const MESSAGE_ICONS: Record<'error' | 'warning' | 'success' | 'info', ReactNode> = {
  error: (
    <>
      <rect x="2" y="2" width="41" height="41" rx="10" stroke="currentColor" strokeWidth="3" />
      <path d="M22.5 12 33 31.5H12L22.5 12Z" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 20v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22.5" cy="28.5" r="1.2" fill="currentColor" />
    </>
  ),
  warning: (
    <>
      <rect x="2" y="2" width="41" height="41" rx="10" stroke="currentColor" strokeWidth="3" />
      <path d="M22.5 12 33 31.5H12L22.5 12Z" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 20v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22.5" cy="28.5" r="1.2" fill="currentColor" />
    </>
  ),
  success: (
    <>
      <rect x="2" y="2" width="41" height="41" rx="10" stroke="currentColor" strokeWidth="3" />
      <path d="M14 23.5 20 29.5 31 17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  info: (
    <>
      <rect x="2" y="2" width="41" height="41" rx="10" stroke="currentColor" strokeWidth="3" />
      <path d="M22.5 20v11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22.5" cy="14.5" r="1.4" fill="currentColor" />
    </>
  ),
};

export function Message({
  variant,
  title,
  children,
  actions,
}: {
  variant: 'error' | 'warning' | 'success' | 'info';
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const urgent = variant === 'error' || variant === 'warning';
  return (
    <div className={`lp-message lp-message--${variant}`} role={urgent ? 'alert' : 'status'}>
      <span className="lp-message__icon">
        <svg viewBox="0 0 45 45" fill="none" aria-hidden="true">
          {MESSAGE_ICONS[variant]}
        </svg>
      </span>
      <div className="lp-message__content">
        <div className="lp-message__text">
          <h3 className="lp-message__title">{title}</h3>
          <p className="lp-message__body">{children}</p>
        </div>
        {actions ? <div className="lp-message__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="lp-empty-state">
      <span className="lp-empty-state__illustration">
        <svg
          width="120"
          height="70"
          viewBox="0 0 120 70"
          fill="none"
          stroke="var(--color-border-strong, #555766)"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="20" y="10" width="80" height="22" rx="4" />
          <rect x="20" y="38" width="80" height="22" rx="4" />
          <circle cx="32" cy="21" r="3" />
          <circle cx="32" cy="49" r="3" />
          <path d="M44 21h32M44 49h20" />
        </svg>
      </span>
      <p className="lp-empty-state__message">{message}</p>
      {action ? <div className="lp-empty-state__action">{action}</div> : null}
    </div>
  );
}

export function TableHeader({ labels }: { labels: string[] }) {
  return (
    <thead>
      <tr>
        {labels.map((label) => (
          <th key={label} className="lp-table__th" scope="col">
            <div className="lp-table__header-inner">
              <span className="lp-table__header-label">{label}</span>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TextCell({ children }: { children: ReactNode }) {
  return (
    <td className="lp-table__td">
      <div className="lp-table__cell-inner">
        <span className="lp-table__cell-text">{children}</span>
      </div>
    </td>
  );
}

export function NodeCell({ children }: { children: ReactNode }) {
  return (
    <td className="lp-table__td">
      <div className="lp-table__cell-inner">{children}</div>
    </td>
  );
}
