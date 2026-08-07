import { useState } from "react";

/**
 * A password input with a show/hide toggle. Standard on every sign-in form:
 * people mistype hidden passwords, and letting them reveal it cuts failed
 * logins. The toggle is a real button (keyboard reachable) and never submits.
 */
export default function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  className: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Password"
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-text-2 transition hover:text-text"
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a17.7 17.7 0 0 1-3.3 4M6.6 6.6A17.7 17.7 0 0 0 1 12s4 7 11 7a10.9 10.9 0 0 0 4-.7" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
