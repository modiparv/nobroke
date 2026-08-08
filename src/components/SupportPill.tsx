/**
 * Floating "talk to a human" pill, WhatsApp-first because that is where our
 * people already are. Renders nothing until a number is configured: a dead
 * support link is worse than no pill. Hairline border, no shadow — the same
 * surface rules as every card.
 */
const WHATSAPP_NUMBER = ""; // Digits only, with country code, e.g. "919876543210".

export default function SupportPill() {
  if (!WHATSAPP_NUMBER) return null;
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full border border-line bg-surface py-2.5 pl-3.5 pr-4 text-support font-medium text-text transition hover:border-line-2"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--whatsapp)" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5s.8 1.9.8 2c.1.1.1.3 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.6 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4 0 .1 0 .7-.2 1.2z" />
      </svg>
      Need help? Talk to us.
    </a>
  );
}
