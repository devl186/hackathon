'use client';

import { usePathname } from 'next/navigation';

const ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M4 4H10V12H4V4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16H10V20H4V16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 12H20V20H14V12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 4H20V8H14V4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/findings',
    label: 'Findings',
    icon: (
      <svg viewBox="0 0 30 30" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M5 15H5.0125M5 7.5H5.0125M5 22.5H5.0125M10 22.5H12.5M10 15H12.5M10 7.5H12.5M17.5 7.5H25M17.5 15H25M17.5 22.5H25"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <nav className="lp-sidebar" aria-label="Primary" style={{ width: '100px' }}>
      <div className="lp-sidebar__header">
        <img src="/logo.svg" alt="Lepide" width={48} height={13} />
      </div>
      <ul className="lp-sidebar__items">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <a
                href={item.href}
                className={`lp-sidebar__item${active ? ' lp-sidebar__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="lp-sidebar__icon-box">{item.icon}</span>
                <span className="lp-sidebar__label">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
