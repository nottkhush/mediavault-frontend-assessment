import type { ReactNode } from 'react';
import { statusLabel } from '@/lib/format';
import type { AssetStatus } from '@/lib/types';

/**
 * Four icons that read as a progression: empty, half, full, put away.
 * The label is always present, so colour is never the only carrier.
 */
const ICONS: Record<AssetStatus, ReactNode> = {
  draft: (
    <circle
      cx="7" cy="7" r="5.25" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeDasharray="2.4 2"
    />
  ),
  in_review: (
    <>
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 1.75A5.25 5.25 0 0 1 7 12.25Z" fill="currentColor" />
    </>
  ),
  approved: (
    <>
      <circle cx="7" cy="7" r="6" fill="currentColor" />
      <path
        d="M4.2 7.2l2 2 3.6-4" fill="none" stroke="var(--st-approved-bg)"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  ),
  archived: (
    <>
      <rect
        x="1.75" y="2" width="10.5" height="3.25" rx="0.8"
        fill="none" stroke="currentColor" strokeWidth="1.4"
      />
      <path
        d="M2.75 5.25v5.4c0 .5.4.9.9.9h6.7c.5 0 .9-.4.9-.9v-5.4M5.6 8h2.8"
        fill="none" stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  ),
};

export function StatusPill({ status }: { status: AssetStatus }) {
  return (
    <span className={`pill pill--${status}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        {ICONS[status]}
      </svg>
      {statusLabel(status)}
    </span>
  );
}