export default function TackIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="32" height="32" rx="8" fill="#be123c"/>
      <circle cx="16" cy="11" r="9" fill="white" opacity="0.2"/>
      <path d="M10 15 L22 15 L17 30 L15 30 Z" fill="white" opacity="0.2"/>
      <circle cx="16" cy="10" r="7" fill="white"/>
      <path d="M11.5 13.5 L20.5 13.5 L16.5 28 L15.5 28 Z" fill="white"/>
    </svg>
  );
}
