/**
 * Data-aggregation rails (from the API-integration plan). Scaffolded UI only —
 * these populate the user's real financials ("data 1") once wired to live APIs.
 */
export const AGGREGATION_PROVIDERS = [
    {
        id: "cas",
        name: "Investment Portfolio",
        providers: "CAMS · KFintech",
        description: "Auto-import every stock, mutual fund & bond from your Consolidated Account Statement.",
        icon: "📊",
    },
    {
        id: "aa",
        name: "Banking & Income",
        providers: "Finvu · OneMoney · CAMSFinserv",
        description: "Consent-based access to income & spending via the RBI Account Aggregator network.",
        icon: "🏦",
    },
    {
        id: "baas",
        name: "Trading & Execution",
        providers: "DhanHQ · HDFC Sec · AngelOne",
        description: "Place trades, track holdings and pull real-time market data — broking as a service.",
        icon: "📈",
    },
    {
        id: "kyc",
        name: "Identity & KYC",
        providers: "NSDL · KRA",
        description: "Verify PAN and complete KYC in seconds. Fully paperless onboarding.",
        icon: "🪪",
    },
];
//# sourceMappingURL=aggregation.js.map