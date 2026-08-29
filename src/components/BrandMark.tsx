/**
 * The unlinkd brand mark: a severed chain link.
 * Inline SVG so it inherits currentColor and needs no asset request.
 */
export function BrandMark({ className = 'brand-mark' }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M37 22 l5 -5 a9 9 0 0 1 12.7 12.7 l-5 5"
        stroke="#3ecfc4"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 42 l-5 5 a9 9 0 0 1 -12.7 -12.7 l5 -5"
        stroke="#3ecfc4"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M29 25 l-3.5 -5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M25 29 l-5 -3.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M35 39 l3.5 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M39 35 l5 3.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
