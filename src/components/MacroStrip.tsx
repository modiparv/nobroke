import { useEffect, useState } from "react";
import { fetchMacro, type MacroData } from "../lib/macroApi";

/**
 * The macro numbers behind the plan's assumptions, as one quiet line in the
 * portfolio pane's footer. The full provenance lives in the hover. Renders
 * nothing until data exists.
 */
export default function MacroStrip() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  useEffect(() => {
    void fetchMacro().then(setMacro);
  }, []);
  if (!macro) return null;
  const source = [...new Set(macro.indicators.map((i) => i.source))].join(" \u00b7 ");
  return (
    <div
      className="border-t border-line px-4 py-2.5"
      title={`${source}. Inflation here sets your plan's default.`}
    >
      <p className="num truncate text-caption text-text-2">
        <span className="mr-2 text-index uppercase tracking-[0.13em] text-text-3">Macro</span>
        {macro.indicators.map((i, idx) => (
          <span key={i.key}>
            {idx > 0 && <span className="mx-1.5 text-text-3">·</span>}
            {i.label} <span className="font-medium text-text">{i.value}{i.unit}</span>
          </span>
        ))}
      </p>
    </div>
  );
}
