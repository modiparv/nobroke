import { useEffect, useState } from "react";

interface Props {
  bands: { equity: number; debt: number; gold: number };
  pop: number;
}

const X = 72;
const W = 176;
const TOP = 136;
const BOT = 268;
const H = BOT - TOP;

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

  const weaveH = [];
  for (let i = 1; i <= 8; i++) weaveH.push(TOP + (H / 9) * i);
  const weaveV = [];
  for (let i = 1; i <= 6; i++) weaveV.push(X + (W / 7) * i);

  return (
    <svg viewBox="0 0 320 300" className="w-full" role="img" aria-label="Your portfolio basket">
      <defs>
        <clipPath id="basket-body">
          <path d={`M${X},${TOP} L${X + W},${TOP} L${X + W},${BOT - 18} Q${X + W},${BOT} ${X + W - 22},${BOT} L${X + 22},${BOT} Q${X},${BOT} ${X},${BOT - 18} Z`} />
        </clipPath>
      </defs>

      <g className={`basket-sway ${popping ? "basket-pop" : ""}`}>
        {/* Handle */}
        <path d="M95 130 Q160 44 225 130" fill="none" stroke="#04130F" strokeWidth="3" strokeLinecap="round" />
        <path d="M106 132 Q160 62 214 132" fill="none" stroke="#04130F" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

        {/* Bands (clipped to body) */}
        <g clipPath="url(#basket-body)">
          <rect x={X} y={TOP} width={W} height={H} fill="#ffffff" />
          {debtH > 0 && <rect className="band-rise" style={{ animationDelay: "0s" }} x={X} y={debtY} width={W} height={debtH} fill="#1D9E75" />}
          {goldH > 0 && <rect className="band-rise" style={{ animationDelay: "0.4s" }} x={X} y={goldY} width={W} height={goldH} fill="#EF9F27" />}
          {equityH > 0 && <rect className="band-rise" style={{ animationDelay: "0.8s" }} x={X} y={equityY} width={W} height={equityH} fill="#7F77DD" />}

          {/* Weave over the bands */}
          {weaveH.map((y, idx) => (
            <line key={`h${idx}`} x1={X} y1={y} x2={X + W} y2={y} stroke="#04130F" strokeWidth="1.5" opacity="0.16" />
          ))}
          {weaveV.map((x, idx) => (
            <line key={`v${idx}`} x1={x} y1={TOP} x2={x} y2={BOT} stroke="#04130F" strokeWidth="2" opacity="0.1" />
          ))}
        </g>

        {/* Body outline */}
        <path
          d={`M${X},${TOP} L${X + W},${TOP} L${X + W},${BOT - 18} Q${X + W},${BOT} ${X + W - 22},${BOT} L${X + 22},${BOT} Q${X},${BOT} ${X},${BOT - 18} Z`}
          fill="none"
          stroke="#04130F"
          strokeWidth="2"
        />

        {/* Rim */}
        <rect x={X - 4} y={TOP - 14} width={W + 8} height="16" rx="4" fill="#04130F" />
        <circle cx="95" cy={TOP - 6} r="4.5" fill="#04130F" />
        <circle cx="225" cy={TOP - 6} r="4.5" fill="#04130F" />

        {/* Sparkle */}
        <g className="sparkle-anim" transform="translate(236 150)">
          <path d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z" fill="#2CC295" />
          <circle cx="9" cy="-9" r="1.6" fill="#2CC295" />
        </g>
      </g>

      {/* Fill marker */}
      {fillTotal > 0 && (
        <g>
          <line x1="42" y1={fillY} x2={X} y2={fillY} stroke="#5B6B66" strokeWidth="1" strokeDasharray="2 3" />
          <text x="38" y={fillY + 4} textAnchor="end" fontSize="11" fill="#5B6B66" fontFamily="inherit">
            {Math.round(fillTotal)}% full
          </text>
        </g>
      )}
    </svg>
  );
}
