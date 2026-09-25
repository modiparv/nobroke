import { useEffect, useState } from "react";

const PHONE = "(max-width: 639px)";

/**
 * True below Tailwind's sm breakpoint. SVG charts use it to pick a narrower
 * drawing space on phones, so their labels render at a readable size instead
 * of shrinking with the viewBox.
 */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => (typeof window !== "undefined" ? window.matchMedia(PHONE).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
}
