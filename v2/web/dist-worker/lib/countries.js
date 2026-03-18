"use strict";
// ============================================================================
// COUNTRY NORMALIZATION & STORY COUNTRY DETECTION
//
// Two dimensions:
// 1. Source country — where the outlet is based (from bias.country)
// 2. Story country — what country a story is about (keyword detection)
//
// Canonical key throughout: ISO 3166-1 alpha-2 codes
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_PATTERNS = exports.ISO_TO_LABEL = exports.BIAS_COUNTRY_TO_ISO = void 0;
exports.normalizeBiasCountry = normalizeBiasCountry;
exports.detectStoryCountries = detectStoryCountries;
// ── Bias DB country names → ISO alpha-2 ────────────────────────────────────
exports.BIAS_COUNTRY_TO_ISO = {
    US: ["US"],
    UK: ["GB"],
    Canada: ["CA"],
    Qatar: ["QA"],
    Japan: ["JP"],
    India: ["IN"],
    Ukraine: ["UA"],
    Netherlands: ["NL"],
    International: [],
    France: ["FR"],
    Germany: ["DE"],
    Australia: ["AU"],
    "Hong Kong": ["HK"],
    "South Africa": ["ZA"],
    Kenya: ["KE"],
    Argentina: ["AR"],
    Mexico: ["MX"],
    Singapore: ["SG"],
    Thailand: ["TH"],
    Belgium: ["BE"],
    Ireland: ["IE"],
    "Isle of Man": ["IM"],
    "UK/US": ["GB", "US"],
    "US/Japan": ["US", "JP"],
};
/** Normalize a bias DB country string to ISO codes */
function normalizeBiasCountry(biasCountry) {
    if (!biasCountry)
        return [];
    return exports.BIAS_COUNTRY_TO_ISO[biasCountry] ?? [];
}
// ── ISO → display label ────────────────────────────────────────────────────
exports.ISO_TO_LABEL = {
    US: "US",
    GB: "UK",
    CA: "CA",
    QA: "QA",
    JP: "JP",
    IN: "IN",
    UA: "UA",
    NL: "NL",
    FR: "FR",
    DE: "DE",
    AU: "AU",
    HK: "HK",
    ZA: "ZA",
    KE: "KE",
    AR: "AR",
    MX: "MX",
    SG: "SG",
    TH: "TH",
    BE: "BE",
    IE: "IE",
    IM: "IM",
    CN: "CN",
    RU: "RU",
    BR: "BR",
    KR: "KR",
    IL: "IL",
    PS: "PS",
    IR: "IR",
    PK: "PK",
    NG: "NG",
    EG: "EG",
    SA: "SA",
    TR: "TR",
    PL: "PL",
    ES: "ES",
    IT: "IT",
    SE: "SE",
    NO: "NO",
    FI: "FI",
    NZ: "NZ",
    TW: "TW",
    PH: "PH",
    ID: "ID",
    MY: "MY",
    VN: "VN",
    CO: "CO",
    CL: "CL",
    PE: "PE",
    VE: "VE",
    CU: "CU",
    KP: "KP",
    AF: "AF",
    IQ: "IQ",
    SY: "SY",
    LB: "LB",
    YE: "YE",
    ET: "ET",
    SD: "SD",
    CD: "CD",
    SO: "SO",
    MM: "MM",
};
exports.COUNTRY_PATTERNS = [
    { iso: "US", pattern: /\b(united states|u\.?s\.?a?\.?|america(?:n)?|washington\s?d\.?c\.?|new york|california|texas|florida|pentagon|white house|congress(?:ional)?|capitol hill)\b/i },
    { iso: "GB", pattern: /\b(united kingdom|britain|british|u\.?k\.?|england|english|scotland|scottish|wales|welsh|london|westminster|downing street|nhs)\b/i },
    { iso: "CN", pattern: /\b(china|chinese|beijing|shanghai|xi jinping|ccp|prc|guangdong|shenzhen|tibet(?:an)?|uyghur|xinjiang)\b/i },
    { iso: "RU", pattern: /\b(russia(?:n)?|moscow|kremlin|putin|siberia|st\.?\s?petersburg)\b/i },
    { iso: "UA", pattern: /\b(ukrain(?:e|ian)|kyiv|kiev|zelensk[iy]|donbas|crimea|kherson|zaporizhzhia)\b/i },
    { iso: "FR", pattern: /\b(france|french(?:\s(?:president|government|election|parliament))|paris|macron|élysée|marseille)\b/i },
    { iso: "DE", pattern: /\b(german(?:y)?|berlin|bundestag|scholz|munich|frankfurt)\b/i },
    { iso: "JP", pattern: /\b(japan(?:ese)?|tokyo|osaka|hokkaido|okinawa)\b/i },
    { iso: "IN", pattern: /\b(india(?:n)?|new delhi|mumbai|modi|bangalore|chennai|kolkata)\b/i },
    { iso: "AU", pattern: /\b(australia(?:n)?|canberra|sydney|melbourne|queensland)\b/i },
    { iso: "CA", pattern: /\b(canada|canadian|ottawa|toronto|montreal|trudeau|quebec|vancouver|alberta)\b/i },
    { iso: "BR", pattern: /\b(brazil(?:ian)?|brasília|são paulo|rio de janeiro|lula|bolsonaro)\b/i },
    { iso: "IL", pattern: /\b(israel(?:i)?|tel aviv|jerusalem|netanyahu|idf)\b/i },
    { iso: "PS", pattern: /\b(palesti(?:ne|nian)|gaza|hamas|west bank|ramallah)\b/i },
    { iso: "IR", pattern: /\b(iran(?:ian)?|tehran|ayatollah|khamenei)\b/i },
    { iso: "KR", pattern: /\b(south korea(?:n)?|seoul|korean peninsula)\b/i },
    { iso: "KP", pattern: /\b(north korea(?:n)?|pyongyang|kim jong)\b/i },
    { iso: "SA", pattern: /\b(saudi(?:\s?arabia)?|riyadh|mohammed bin salman)\b/i },
    { iso: "TR", pattern: /\b(turkey|turkish|türkiye|ankara|istanbul|erdogan)\b/i },
    { iso: "MX", pattern: /\b(mexic(?:o|an)?|mexico city|guadalajara|tijuana)\b/i },
    { iso: "NG", pattern: /\b(nigeria(?:n)?|lagos|abuja)\b/i },
    { iso: "EG", pattern: /\b(egypt(?:ian)?|cairo|suez)\b/i },
    { iso: "PK", pattern: /\b(pakistan(?:i)?|islamabad|karachi|lahore)\b/i },
    { iso: "ZA", pattern: /\b(south africa(?:n)?|cape town|johannesburg|pretoria)\b/i },
    { iso: "PL", pattern: /\b(poland|polish|warsaw)\b/i },
    { iso: "ES", pattern: /\b(spain|spanish|madrid|barcelona|catalonia)\b/i },
    { iso: "IT", pattern: /\b(ital(?:y|ian)|rome|milan|meloni)\b/i },
    { iso: "NL", pattern: /\b(netherlands|dutch|amsterdam|the hague)\b/i },
    { iso: "SE", pattern: /\b(sweden|swedish|stockholm)\b/i },
    { iso: "NZ", pattern: /\b(new zealand|wellington|auckland)\b/i },
    { iso: "TW", pattern: /\b(taiwan(?:ese)?|taipei)\b/i },
    { iso: "AF", pattern: /\b(afghanistan|afghan|kabul|taliban)\b/i },
    { iso: "IQ", pattern: /\b(iraq(?:i)?|baghdad|kurdistan)\b/i },
    { iso: "SY", pattern: /\b(syria(?:n)?|damascus|assad)\b/i },
    { iso: "YE", pattern: /\b(yemen(?:i)?|houthi|sana'?a)\b/i },
    { iso: "LB", pattern: /\b(leban(?:on|ese)|beirut|hezbollah)\b/i },
    { iso: "MM", pattern: /\b(myanmar|burma|burmese|yangon|rohingya)\b/i },
    { iso: "ET", pattern: /\b(ethiopia(?:n)?|addis ababa|tigray)\b/i },
    { iso: "SD", pattern: /\b(sudan(?:ese)?|khartoum|darfur)\b/i },
    { iso: "VE", pattern: /\b(venezuela(?:n)?|caracas|maduro)\b/i },
    { iso: "CU", pattern: /\b(cuba(?:n)?|havana)\b/i },
    { iso: "CO", pattern: /\b(colombia(?:n)?|bogotá|bogota|medellín|medellin)\b/i },
    { iso: "AR", pattern: /\b(argentin(?:a|e|ian)|buenos aires|milei)\b/i },
    { iso: "ID", pattern: /\b(indonesia(?:n)?|jakarta|bali)\b/i },
    { iso: "PH", pattern: /\b(philippin(?:es|o)|manila|marcos)\b/i },
    { iso: "TH", pattern: /\b(thai(?:land)?|bangkok)\b/i },
    { iso: "SG", pattern: /\b(singapore(?:an)?)\b/i },
    { iso: "MY", pattern: /\b(malaysia(?:n)?|kuala lumpur)\b/i },
    { iso: "VN", pattern: /\b(vietnam(?:ese)?|hanoi|ho chi minh)\b/i },
    { iso: "IE", pattern: /\b(ireland|irish|dublin)\b/i },
    { iso: "BE", pattern: /\b(belgium|belgian|brussels)\b/i },
    { iso: "KE", pattern: /\b(kenya(?:n)?|nairobi)\b/i },
    { iso: "CD", pattern: /\b(congo(?:lese)?|kinshasa|drc)\b/i },
    { iso: "SO", pattern: /\b(somali(?:a)?|mogadishu)\b/i },
    { iso: "QA", pattern: /\b(qatar(?:i)?|doha)\b/i },
    { iso: "HK", pattern: /\b(hong kong)\b/i },
    { iso: "NO", pattern: /\b(norway|norwegian|oslo)\b/i },
    { iso: "FI", pattern: /\b(finland|finnish|helsinki)\b/i },
    { iso: "CL", pattern: /\b(chile(?:an)?|santiago)\b/i },
    { iso: "PE", pattern: /\b(peru(?:vian)?|lima)\b/i },
];
/** Detect which countries a story is about from title + description */
function detectStoryCountries(title, description) {
    const text = `${title} ${description}`;
    const matched = new Set();
    for (const { iso, pattern } of exports.COUNTRY_PATTERNS) {
        if (pattern.test(text)) {
            matched.add(iso);
        }
    }
    return Array.from(matched);
}
