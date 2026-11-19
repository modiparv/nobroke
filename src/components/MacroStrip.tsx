import { useEffect, useState } from "react";
import { fetchMacro, type MacroData } from "../lib/macroApi";

/**
 * The published numbers behind the plan's assumptions (inflation, the RBI
 * rate and so on), as one quiet line of text. Where each number comes from
 * and its date are in the hover. It draws nothing at all while the numbers
 * are loading or when they cannot be fetched: there is no loading state to
 * get stuck on.
 */
export default function MacroStrip() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMacro().then((m) => {
      if (live) setMacro(m);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!macro || macro.indicators.length === 0) return null;
  const sources = macro.indicators.map((i) => `${i.label}: ${i.source}${i.as_of ? `, ${i.as_of}` : ""}`).join(". ");
  return (
    <p className="num flex flex-wrap gap-x-4 gap-y-0.5 border-t border-line px-4 py-2.5 text-support text-text-2" title={`${sources}. Inflation here sets your plan's default.`}>
      {macro.indicators.map((i) => (
        // Each figure stays on one line with its name, so a wrap never splits them.
        <span key={i.key} className="whitespace-nowrap">
          {i.label}{" "}
          <span className="font-medium text-text">
            {i.value}
            {i.unit}
          </span>
        </span>
      ))}
    </p>
  );
}
