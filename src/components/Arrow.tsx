export default function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="10"
      viewBox="0 0 16 10"
      className={`inline-block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="1" y1="5" x2="14" y2="5" />
      <polyline points="10,1 14,5 10,9" />
    </svg>
  );
}
