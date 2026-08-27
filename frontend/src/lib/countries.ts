export interface CountryDial {
  iso: string;
  name: string;
  dial: string;
}

/** Common calling codes, searchable by name, ISO, or +code. */
export const COUNTRIES: CountryDial[] = [
  { iso: "AF", name: "Afghanistan", dial: "93" },
  { iso: "AL", name: "Albania", dial: "355" },
  { iso: "DZ", name: "Algeria", dial: "213" },
  { iso: "AR", name: "Argentina", dial: "54" },
  { iso: "AM", name: "Armenia", dial: "374" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "AT", name: "Austria", dial: "43" },
  { iso: "AZ", name: "Azerbaijan", dial: "994" },
  { iso: "BH", name: "Bahrain", dial: "973" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "BY", name: "Belarus", dial: "375" },
  { iso: "BE", name: "Belgium", dial: "32" },
  { iso: "BO", name: "Bolivia", dial: "591" },
  { iso: "BA", name: "Bosnia and Herzegovina", dial: "387" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "BG", name: "Bulgaria", dial: "359" },
  { iso: "KH", name: "Cambodia", dial: "855" },
  { iso: "CM", name: "Cameroon", dial: "237" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "CL", name: "Chile", dial: "56" },
  { iso: "CN", name: "China", dial: "86" },
  { iso: "CO", name: "Colombia", dial: "57" },
  { iso: "CR", name: "Costa Rica", dial: "506" },
  { iso: "HR", name: "Croatia", dial: "385" },
  { iso: "CY", name: "Cyprus", dial: "357" },
  { iso: "CZ", name: "Czechia", dial: "420" },
  { iso: "DK", name: "Denmark", dial: "45" },
  { iso: "EG", name: "Egypt", dial: "20" },
  { iso: "EE", name: "Estonia", dial: "372" },
  { iso: "ET", name: "Ethiopia", dial: "251" },
  { iso: "FI", name: "Finland", dial: "358" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "GE", name: "Georgia", dial: "995" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "GH", name: "Ghana", dial: "233" },
  { iso: "GR", name: "Greece", dial: "30" },
  { iso: "HK", name: "Hong Kong", dial: "852" },
  { iso: "HU", name: "Hungary", dial: "36" },
  { iso: "IS", name: "Iceland", dial: "354" },
  { iso: "IN", name: "India", dial: "91" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "IR", name: "Iran", dial: "98" },
  { iso: "IQ", name: "Iraq", dial: "964" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "IL", name: "Israel", dial: "972" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "CI", name: "Ivory Coast", dial: "225" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "JO", name: "Jordan", dial: "962" },
  { iso: "KZ", name: "Kazakhstan", dial: "7" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "KW", name: "Kuwait", dial: "965" },
  { iso: "LV", name: "Latvia", dial: "371" },
  { iso: "LB", name: "Lebanon", dial: "961" },
  { iso: "LY", name: "Libya", dial: "218" },
  { iso: "LT", name: "Lithuania", dial: "370" },
  { iso: "LU", name: "Luxembourg", dial: "352" },
  { iso: "MO", name: "Macao", dial: "853" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "MV", name: "Maldives", dial: "960" },
  { iso: "MT", name: "Malta", dial: "356" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "MD", name: "Moldova", dial: "373" },
  { iso: "MA", name: "Morocco", dial: "212" },
  { iso: "MM", name: "Myanmar", dial: "95" },
  { iso: "NP", name: "Nepal", dial: "977" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "NO", name: "Norway", dial: "47" },
  { iso: "OM", name: "Oman", dial: "968" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "PS", name: "Palestine", dial: "970" },
  { iso: "PA", name: "Panama", dial: "507" },
  { iso: "PE", name: "Peru", dial: "51" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "PL", name: "Poland", dial: "48" },
  { iso: "PT", name: "Portugal", dial: "351" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "RO", name: "Romania", dial: "40" },
  { iso: "RU", name: "Russia", dial: "7" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "SN", name: "Senegal", dial: "221" },
  { iso: "RS", name: "Serbia", dial: "381" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "SK", name: "Slovakia", dial: "421" },
  { iso: "SI", name: "Slovenia", dial: "386" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "KR", name: "South Korea", dial: "82" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "SE", name: "Sweden", dial: "46" },
  { iso: "CH", name: "Switzerland", dial: "41" },
  { iso: "TW", name: "Taiwan", dial: "886" },
  { iso: "TZ", name: "Tanzania", dial: "255" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "TN", name: "Tunisia", dial: "216" },
  { iso: "TR", name: "Turkey", dial: "90" },
  { iso: "UG", name: "Uganda", dial: "256" },
  { iso: "UA", name: "Ukraine", dial: "380" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "UY", name: "Uruguay", dial: "598" },
  { iso: "UZ", name: "Uzbekistan", dial: "998" },
  { iso: "VE", name: "Venezuela", dial: "58" },
  { iso: "VN", name: "Vietnam", dial: "84" },
  { iso: "YE", name: "Yemen", dial: "967" },
  { iso: "ZM", name: "Zambia", dial: "260" },
  { iso: "ZW", name: "Zimbabwe", dial: "263" },
];

export const POPULAR_COUNTRY_ISOS = ["IN", "US", "GB", "AE", "SA", "NG", "PK", "BD", "KE", "ZA", "CA", "AU", "SG", "DE", "FR"];

const BY_DIAL_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function countryFlag(iso: string) {
  const code = (iso || "").trim().toUpperCase();
  if (code.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

const DIAL_DEFAULT_ISO: Record<string, string> = {
  "1": "US",
  "7": "RU",
};

export function findCountryByDial(dial: string, preferredIso?: string) {
  const code = String(dial || "").replace(/\D/g, "");
  const matches = COUNTRIES.filter((c) => c.dial === code);
  if (matches.length === 0) return undefined;
  if (preferredIso) {
    const preferred = matches.find((c) => c.iso === preferredIso);
    if (preferred) return preferred;
  }
  const mapped = DIAL_DEFAULT_ISO[code];
  if (mapped) {
    const hit = matches.find((c) => c.iso === mapped);
    if (hit) return hit;
  }
  const popular = matches.find((c) => POPULAR_COUNTRY_ISOS.includes(c.iso));
  return popular || matches[0];
}

export function findCountryByIso(iso: string) {
  const code = (iso || "").toUpperCase();
  return COUNTRIES.find((c) => c.iso === code);
}

export function splitPhoneNumber(full: string, fallbackDial = "91"): { dial: string; national: string; iso: string } {
  const digits = String(full || "").replace(/\D/g, "");
  const fallback = findCountryByDial(fallbackDial) || findCountryByIso("IN")!;
  if (!digits) return { dial: fallback.dial, national: "", iso: fallback.iso };

  for (const country of BY_DIAL_LENGTH) {
    if (digits.startsWith(country.dial) && digits.length > country.dial.length) {
      const popular = findCountryByDial(country.dial);
      const chosen = popular || country;
      return { dial: chosen.dial, national: digits.slice(chosen.dial.length), iso: chosen.iso };
    }
  }

  return { dial: fallback.dial, national: digits, iso: fallback.iso };
}

export function composeDialedNumber(countryDial: string, national: string): string {
  const raw = String(national || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const digits = raw.replace(/\D/g, "");
    return digits.startsWith("00") ? digits.slice(2) : digits;
  }
  const local = raw.replace(/\D/g, "");
  if (!local) return "";
  const cc = String(countryDial || "").replace(/\D/g, "");
  if (cc && local.startsWith(cc) && local.length > cc.length + 5) return local;
  return `${cc}${local}`;
}

export function parsePastedNumber(raw: string, currentDial: string): { dial: string; national: string } | null {
  const trimmed = raw.trim();
  if (!(trimmed.startsWith("+") || trimmed.startsWith("00"))) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const split = splitPhoneNumber(digits, currentDial);
  return { dial: split.dial, national: split.national };
}
