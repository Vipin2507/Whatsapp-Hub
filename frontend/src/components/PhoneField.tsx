import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COUNTRIES,
  POPULAR_COUNTRY_ISOS,
  countryFlag,
  findCountryByDial,
  parsePastedNumber,
  type CountryDial,
} from "@/lib/countries";

interface PhoneFieldProps {
  countryCode: string;
  nationalNumber: string;
  onCountryCodeChange: (dial: string) => void;
  onNationalNumberChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function filterCountries(query: string) {
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  if (!q) return COUNTRIES;
  return COUNTRIES.filter((c) => {
    return (
      c.name.toLowerCase().includes(q) ||
      c.iso.toLowerCase().includes(q) ||
      c.dial.startsWith(q) ||
      `+${c.dial}`.includes(q)
    );
  });
}

function CountryRow({
  country,
  selected,
  onSelect,
}: {
  country: CountryDial;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-muted/70",
        selected && "bg-primary/10",
      )}
    >
      <span className="w-6 shrink-0 text-base leading-none">{countryFlag(country.iso)}</span>
      <span className="min-w-0 flex-1 truncate text-[13px]">{country.name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">+{country.dial}</span>
      {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
    </button>
  );
}

export function PhoneField({
  countryCode,
  nationalNumber,
  onCountryCodeChange,
  onNationalNumberChange,
  disabled,
  className,
  id,
}: PhoneFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = findCountryByDial(countryCode) || {
    iso: "",
    name: "Custom",
    dial: String(countryCode || "").replace(/\D/g, "") || "91",
  };

  const filtered = useMemo(() => filterCountries(query), [query]);
  const popular = useMemo(
    () => POPULAR_COUNTRY_ISOS.map((iso) => COUNTRIES.find((c) => c.iso === iso)).filter(Boolean) as CountryDial[],
    [],
  );

  const pick = (country: CountryDial) => {
    onCountryCodeChange(country.dial);
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      className={cn(
        "flex h-9 overflow-hidden rounded-lg border border-input bg-card focus-within:ring-2 focus-within:ring-primary/25",
        disabled && "opacity-50",
        className,
      )}
    >
      <Popover
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery("");
            requestAnimationFrame(() => searchRef.current?.focus());
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="flex shrink-0 items-center gap-1.5 border-r bg-muted/30 px-2.5 text-foreground hover:bg-muted/50"
            aria-label="Select country code"
          >
            <span className="text-base leading-none">{countryFlag(selected.iso)}</span>
            <span className="text-sm font-medium tabular-nums">+{selected.dial}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[400] w-[min(22rem,calc(100vw-2rem))] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code"
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25"
              />
            </div>
          </div>
          <div className="chat-scroll max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No countries match that search</p>
            ) : query.trim() ? (
              filtered.map((country) => (
                <CountryRow
                  key={`${country.iso}-${country.dial}`}
                  country={country}
                  selected={country.iso === selected.iso || (country.dial === selected.dial && !selected.iso)}
                  onSelect={() => pick(country)}
                />
              ))
            ) : (
              <>
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Popular
                </p>
                {popular.map((country) => (
                  <CountryRow
                    key={`p-${country.iso}`}
                    country={country}
                    selected={country.iso === selected.iso}
                    onSelect={() => pick(country)}
                  />
                ))}
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  All countries
                </p>
                {COUNTRIES.map((country) => (
                  <CountryRow
                    key={country.iso}
                    country={country}
                    selected={country.iso === selected.iso}
                    onSelect={() => pick(country)}
                  />
                ))}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <input
        ref={inputRef}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        value={nationalNumber}
        placeholder="Phone number"
        onChange={(e) => {
          const next = e.target.value;
          const parsed = parsePastedNumber(next, selected.dial);
          if (parsed) {
            onCountryCodeChange(parsed.dial);
            onNationalNumberChange(parsed.national);
            return;
          }
          onNationalNumberChange(next.replace(/[^\d\s-]/g, ""));
        }}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
