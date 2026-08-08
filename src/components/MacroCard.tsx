import { useEffect, useState } from "react";
import { fetchMacro, type MacroData } from "../lib/macroApi";
import { card, sectionLabel } from "../ui";

/** The macro backdrop: four numbers an advisor keeps on the desk, each with
 *  its own source and vintage. Renders nothing until data exists. */
function MacroCard() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  useEffect(() => {
    void fetchMacro().then(setMacro);
  }, []);
  if (!macro) return null;
  return (
    <section className={card}>
      <span className={sectionLabel}>Macro backdrop</span>
      <ul className="mt-1 divide-y divide-line">
        {macro.indicators.map((i) => (
          <li key={i.key} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-support text-text">{i.label}</span>
            <span className="num text-support font-medium">
              {i.value}
              {i.unit}
              <span className="ml-1.5 text-caption font-normal text-text-2">{i.as_of}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-text-2">
        {[...new Set(macro.indicators.map((i) => i.source))].join(" · ")}. Inflation here sets your plan's default.
      </p>
    </section>
  );
}

export default MacroCard;
