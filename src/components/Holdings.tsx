import { useState } from "react";
import { UNSORTED_TYPE, categoryCode } from "../lib/holdings";
import { formatINR } from "../lib/format";
import { FOCUS, holdingFocus } from "../lib/links";
import type { Holding } from "../lib/types";
import { useFocus } from "../lib/useFocus";
import { actions, useStore } from "../store";
import { btnPrimary } from "../ui";
import AddInvestment from "./AddInvestment";

/**
 * One holding; a link from the Portfolio page can land on it. On a phone the
 * name sits over its type with the amount beside them. From the sm
 * breakpoint up there is room for name, type and amount on one line. The
 * square carries the colour of the holding's kind, the same one the
 * "Where it is" list above uses.
 */
function HoldingRow({ h }: { h: Holding }) {
  const focus = useFocus(holdingFocus(h.id));
  return (
    <li ref={focus.ref} className="relative flex items-center gap-2.5 py-1.5">
      {/* The ring a link lights up sits a little outside the row, clear of its text. */}
      {focus.active && <span aria-hidden className="focus-flash pointer-events-none absolute -inset-x-2 inset-y-0 rounded-control" />}
      <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: categoryCode(h.category).ink }} aria-hidden />
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-4">
        {/* Two lines on a phone: the end of a fund's name is what tells two plans of one fund apart. */}
        <div className="line-clamp-2 break-words text-row text-text sm:line-clamp-none sm:block sm:min-w-0 sm:flex-1 sm:truncate">{h.name}</div>
        <div className="truncate text-support text-text-2 sm:w-44 sm:flex-none">{h.type}</div>
      </div>
      <span className="num flex-none whitespace-nowrap text-row font-medium text-text sm:min-w-[5.5rem] sm:text-right">{formatINR(h.amount)}</span>
      <button
        type="button"
        onClick={() => actions.removeHolding(h.id)}
        aria-label={`Remove ${h.name}`}
        className="-mr-2.5 grid h-11 w-11 flex-none place-items-center rounded-control text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </li>
  );
}

export default function Holdings() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const focus = useFocus(FOCUS.investments);
  const sum = s.externalHoldings.reduce((acc, h) => acc + (h.amount > 0 ? h.amount : 0), 0);
  // The intake's one total, before it is split by type.
  const unsorted = s.externalHoldings.find((h) => h.type === UNSORTED_TYPE);

  return (
    <div ref={focus.ref} className="relative">
      {focus.active && <span aria-hidden className="focus-flash pointer-events-none absolute -inset-2 rounded-control" />}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-section font-medium text-text">Your investments</h2>
        {s.externalHoldings.length > 0 && <span className="num whitespace-nowrap text-row font-medium text-text">{formatINR(sum)}</span>}
      </div>

      {s.externalHoldings.length > 0 ? (
        <>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {s.externalHoldings.map((h) => (
              <HoldingRow key={h.id} h={h} />
            ))}
          </ul>
          {/* Adding an investment adds to the total, so the unsplit line has
              to go once its parts are in. */}
          {unsorted && (
            <p className="mt-3 text-pretty text-support text-text-2">
              To split {unsorted.name} by type, add each investment, then remove the {unsorted.name} line so nothing is counted twice.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-pretty text-support text-text-2">Nothing here yet. Add your stocks, mutual funds, FDs, EPF, PPF or anything else you hold.</p>
      )}

      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`${btnPrimary} mt-4 w-full sm:w-auto`}>
        Add an investment
      </button>

      {open && <AddInvestment onClose={() => setOpen(false)} />}
    </div>
  );
}
