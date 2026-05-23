const inrGroup = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function trim(n) {
    return (Math.round(n * 100) / 100).toString();
}
/** Indian-style currency. Compact uses Lakh/Crore; full uses 12,34,567 grouping. */
export function formatINR(value, opts = {}) {
    const { compact = true } = opts;
    if (!isFinite(value))
        return "—";
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    if (!compact)
        return sign + "₹" + inrGroup.format(Math.round(abs));
    if (abs >= 1e7)
        return `${sign}₹${trim(abs / 1e7)} Cr`;
    if (abs >= 1e5)
        return `${sign}₹${trim(abs / 1e5)} L`;
    if (abs >= 1e3)
        return sign + "₹" + inrGroup.format(Math.round(abs));
    return sign + "₹" + Math.round(abs).toString();
}
export function formatPct(decimal, digits = 1) {
    if (!isFinite(decimal))
        return "—";
    return (decimal * 100).toFixed(digits) + "%";
}
export function formatYears(years) {
    if (!isFinite(years))
        return "—";
    if (years <= 0)
        return "now";
    if (years < 1)
        return `${Math.round(years * 12)} mo`;
    const whole = Math.floor(years);
    const months = Math.round((years - whole) * 12);
    if (months === 0 || months === 12) {
        const y = months === 12 ? whole + 1 : whole;
        return `${y} yr${y > 1 ? "s" : ""}`;
    }
    return `${whole}y ${months}m`;
}
//# sourceMappingURL=format.js.map