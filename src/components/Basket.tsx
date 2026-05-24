import { useEffect, useState } from "react";

interface Props {
  bands: { equity: number; debt: number; gold: number };
  pop: number;
}

const DARK = "#3A2E0A";
const TOP = 130;
const BOT = 256;
const H = BOT - TOP;
const BODY = "M66 128 L254 128 L234 252 Q231 266 217 266 L103 266 Q89 266 86 252 Z";

export default function Basket({ bands, pop }: Props) {
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (pop <= 0) return;
    setPopping(true);
    const t = window.setTimeout(() => setPopping(false), 320);
    return () => window.clearTimeout(t);
  }, [pop]);

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const debtH = (clamp(bands.debt) / 100) * H;
  const goldH = (clamp(bands.gold) / 100) * H;
  const equityH = (clamp(bands.equity) / 100) * H;
  const fillTotal = clamp(bands.equity + bands.debt + bands.gold);
  const fillY = BOT - (fillTotal / 100) * H;

  const debtY = BOT - debtH;
  const goldY = debtY - goldH;
  const equityY = goldY - equityH;

  const slats = Array.from({ length: 13 }, (_, i) => 66 + (188 / 13) * (i + 0.5));
  const rings = Array.from({ length: 7 }, (_, i) => TOP + (H / 7) * (i + 0.5));

  return (
    <svg viewBox="0 0 320 300" className="mx-auto block w-full max-w-[340px]" role="img" aria-label="Your portfolio basket">
      <defs>
        <clipPath id="basket-body">
          <path d={BODY} />
        </clipPath>
      </defs>

      <g className={`basket-sway ${popping ? "basket-pop" : ""}`}>
        {/* Handle */}
        <path d="M92 124 Q160 48 228 124" fill="none" stroke={DARK} strokeWidth="4" strokeLinecap="round" />
        <path d="M104 126 Q160 66 216 126" fill="none" stroke={DARK} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />

        <g clipPath="url(#basket-body)">
          <rect x="58" y={TOP} width="204" height={H} fill="#FFFDF6" />
          {debtH > 0 && <rect className="band-rise" style={{ animationDelay: "0s" }} x="58" y={debtY} width="204" height={debtH} fill="#1D9E75" opacity="0.9" />}
          {goldH > 0 && <rect className="band-rise" style={{ animationDelay: "0.35s" }} x="58" y={goldY} width="204" height={goldH} fill="#EF9F27" opacity="0.9" />}
          {equityH > 0 && <rect className="band-rise" style={{ animationDelay: "0.7s" }} x="58" y={equityY} width="204" height={equityH} fill="#7F77DD" opacity="0.9" />}

          {/* Woven texture over the bands */}
          {slats.map((x, i) => (
            <rect key={`s${i}`} x={x - 3} y={TOP} width="6" height={H} rx="3" fill={DARK} opacity="0.08" />
          ))}
          {rings.map((y, i) => (
            <line key={`r${i}`} x1="58" y1={y} x2="262" y2={y} stroke={DARK} strokeWidth="1.5" opacity="0.1" />
          ))}
        </g>

        {/* Body outline */}
        <path d={BODY} fill="none" stroke={DARK} strokeWidth="2" strokeLinejoin="round" />

        {/* Rim */}
        <rect x="60" y="116" width="200" height="16" rx="8" fill={DARK} />
        <circle cx="92" cy="124" r="3.5" fill={DARK} />
        <circle cx="228" cy="124" r="3.5" fill={DARK} />

        {/* Sparkle */}
        <g className="sparkle-anim" transform="translate(238 148)">
          <path d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z" fill="#FFCC00" />
          <circle cx="9" cy="-9" r="1.6" fill="#FFCC00" />
        </g>
      </g>

      {fillTotal > 0 && (
        <g>
          <line x1="40" y1={fillY} x2="64" y2={fillY} stroke="#8A7B53" strokeWidth="1" strokeDasharray="2 3" />
          <text x="36" y={fillY + 4} textAnchor="end" fontSize="11" fill="#8A7B53" fontFamily="inherit">
            {Math.round(fillTotal)}% full
          </text>
        </g>
      )}
    </svg>
  );
}
