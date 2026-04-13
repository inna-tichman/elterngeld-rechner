"use client";

import { useState, useMemo } from "react";
import {
  berechneElterngeld,
  type EingabenParams,
  type Modell,
  type Beschaeftigung,
} from "@/lib/berechnung";

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const pct = (n: number) => `${Math.round(n * 100)} %`;

type ToggleProps = {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
};

function Toggle({ options, value, onChange }: ToggleProps) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
            value === o.value
              ? "bg-sage text-white"
              : "bg-white border border-sage-mid text-ink-mid hover:border-sage"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="mb-5 last:mb-0">
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      {hint && <p className="text-xs text-ink-light mb-2">{hint}</p>}
      {children}
    </div>
  );
}

type NumberInputProps = {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
};

function NumberInput({ value, onChange, unit, min, max, placeholder }: NumberInputProps) {
  return (
    <div className="relative flex items-center">
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full py-3 pl-4 pr-16 border-2 border-sage-mid rounded-xl text-base font-medium text-ink bg-white focus:outline-none focus:border-sage transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && (
        <span className="absolute right-4 text-sm text-ink-light pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  );
}

export default function ElterngeldRechner() {
  const [netto, setNetto] = useState<number>(0);
  const [beschaeftigung, setBeschaeftigung] = useState<Beschaeftigung>("angestellt");
  const [modell, setModell] = useState<Modell>("basis");
  const [monateBasis, setMonateBasis] = useState(12);
  const [monatePlus, setMonatePlus] = useState(24);
  const [mixBasis, setMixBasis] = useState(4);
  const [mixPlus, setMixPlus] = useState(16);
  const [partnerschaftsbonus, setPartnerschaftsbonus] = useState(false);
  const [geschwisterbonus, setGeschwisterbonus] = useState(false);
  const [mehrlinge, setMehrlinge] = useState(0);
  const [steuerklasse, setSteuerklasse] = useState<1|2|3|4|5|6>(1);
  const [showDetails, setShowDetails] = useState(false);

  const params: EingabenParams = {
    nettoMonatlich: netto,
    beschaeftigung,
    modell,
    monateBasis,
    monatePlus,
    mixBasis,
    mixPlus,
    partnerschaftsbonus,
    geschwisterbonus,
    mehrlinge,
    steuerklasse,
  };

  const ergebnis = useMemo(() => {
    if (!netto || netto <= 0) return null;
    return berechneElterngeld(params);
  }, [netto, beschaeftigung, modell, monateBasis, monatePlus, mixBasis, mixPlus, partnerschaftsbonus, geschwisterbonus, mehrlinge, steuerklasse]);

  return (
    <div className="min-h-screen bg-sand px-4 py-10 pb-20">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-4xl text-ink leading-tight mb-2">
            <em className="italic text-sage not-italic">Elterngeld Rechner</em>
          </h1>
          <p className="text-sm text-ink-light font-light">
            Kostenlos · Schnell · Ohne Anmeldung
          </p>
        </div>

        {/* Einkommen */}
        <div className="bg-white rounded-2xl p-6 mb-3 border border-sage/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-sage mb-4">
            Dein Einkommen
          </p>

          <Field
            label="Durchschn. Nettoeinkommen"
            hint="Monatlicher Durchschnitt der letzten 12 Monate vor Geburt"
          >
            <NumberInput
              value={netto}
              onChange={setNetto}
              unit="€ / Mo."
              placeholder="3.200"
              min={0}
              max={20000}
            />
          </Field>

          <Field label="Steuerklasse">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map((sk) => (
                <button
                  key={sk}
                  onClick={() => setSteuerklasse(sk as 1|2|3|4|5|6)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    steuerklasse === sk
                      ? "bg-sage text-white"
                      : "bg-white border border-sage-mid text-ink-mid hover:border-sage"
                  }`}
                >
                  {sk}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Beschäftigungsart">
            <Toggle
              options={[
                { label: "Angestellt", value: "angestellt" },
                { label: "Selbstständig", value: "selbst" },
                { label: "Beamte/r", value: "beamte" },
              ]}
              value={beschaeftigung}
              onChange={(v) => setBeschaeftigung(v as Beschaeftigung)}
            />
          </Field>
        </div>

        {/* Modell */}
        <div className="bg-white rounded-2xl p-6 mb-3 border border-sage/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-sage mb-4">
            Elterngeld-Modell
          </p>

          <Field label="Welches Modell?">
            <Toggle
              options={[
                { label: "Basis", value: "basis" },
                { label: "Plus", value: "plus" },
                { label: "Mix", value: "mix" },
              ]}
              value={modell}
              onChange={(v) => setModell(v as Modell)}
            />
          </Field>

          {modell === "basis" && (
            <Field label="Monate Basiselterngeld" hint="Max. 14 Monate (bei 2 Elternteilen)">
              <NumberInput value={monateBasis} onChange={setMonateBasis} unit="Monate" min={1} max={14} />
            </Field>
          )}

          {modell === "plus" && (
            <Field label="Monate ElterngeldPlus" hint="Max. 28 Monate — halb so viel, doppelt so lang">
              <NumberInput value={monatePlus} onChange={setMonatePlus} unit="Monate" min={1} max={28} />
            </Field>
          )}

          {modell === "mix" && (
            <>
              <Field label="Basis-Monate">
                <NumberInput value={mixBasis} onChange={setMixBasis} unit="Monate" min={1} max={14} />
              </Field>
              <Field label="ElterngeldPlus-Monate">
                <NumberInput value={mixPlus} onChange={setMixPlus} unit="Monate" min={1} max={28} />
              </Field>
            </>
          )}

          <Field
            label="Partnerschaftsbonus?"
            hint="+4 Bonus-Monate wenn beide 25–32 Std./Woche arbeiten"
          >
            <Toggle
              options={[
                { label: "Ja", value: "ja" },
                { label: "Nein", value: "nein" },
              ]}
              value={partnerschaftsbonus ? "ja" : "nein"}
              onChange={(v) => setPartnerschaftsbonus(v === "ja")}
            />
          </Field>
        </div>

        {/* Extras */}
        <div className="bg-white rounded-2xl p-6 mb-4 border border-sage/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-sage mb-4">
            Besondere Umstände
          </p>

          <Field
            label="Geschwisterbonus?"
            hint="Weiteres Kind unter 3 Jahren im Haushalt → +10% Elterngeld"
          >
            <Toggle
              options={[
                { label: "Ja", value: "ja" },
                { label: "Nein", value: "nein" },
              ]}
              value={geschwisterbonus ? "ja" : "nein"}
              onChange={(v) => setGeschwisterbonus(v === "ja")}
            />
          </Field>

          <Field label="Mehrlinge?" hint="Anzahl zusätzlicher Kinder bei Mehrlingsgeburt">
            <Toggle
              options={[
                { label: "Kein", value: "0" },
                { label: "+1", value: "1" },
                { label: "+2", value: "2" },
                { label: "+3", value: "3" },
              ]}
              value={String(mehrlinge)}
              onChange={(v) => setMehrlinge(parseInt(v))}
            />
          </Field>
        </div>

        {/* Ergebnis */}
        {ergebnis && (
          <>
            <div className="bg-sage rounded-2xl p-6 mb-3 relative overflow-hidden">
              {/* Deko-Kreise */}
              <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5" />
              <div className="absolute -bottom-16 -left-6 w-56 h-56 rounded-full bg-white/5" />

              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-1">
                  {modell === "plus"
                    ? "ElterngeldPlus / Monat"
                    : "Basiselterngeld / Monat"}
                </p>
                <p className="font-serif text-5xl text-white leading-none mb-1">
                  {fmt(ergebnis.monatlichHaupt)}
                </p>
                {modell === "mix" && (
                  <p className="text-sm text-white/60 mb-3">
                    Plus-Phasen: {fmt(ergebnis.plusProMonat)} / Monat
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 mt-4">
                  {[
                    { label: "Gesamtbetrag", val: fmt(ergebnis.gesamtBetrag) },
                    { label: "Bezugsdauer", val: `${ergebnis.bezugsdauer} Monate` },
                    { label: "Ersatzrate", val: pct(ergebnis.ersatzrate) },
                    {
                      label: partnerschaftsbonus ? "inkl. Bonus" : "Bonus",
                      val: partnerschaftsbonus
                        ? `+${ergebnis.bonusMonate} Monate`
                        : "Nicht aktiv",
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/10 rounded-xl p-3">
                      <p className="text-xs text-white/55 mb-0.5">{item.label}</p>
                      <p className="text-base font-semibold text-white">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Detailaufschlüsselung */}
            <div className="bg-white rounded-2xl border border-sage/10 mb-3 overflow-hidden">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex justify-between items-center p-5 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-sage">
                  Berechnung im Detail
                </span>
                <span className="text-sage text-lg">{showDetails ? "−" : "+"}</span>
              </button>

              {showDetails && (
                <div className="px-5 pb-5 border-t border-sage/10">
                  {[
                    {
                      key: "Nettoeinkommen (bereinigt)",
                      val:
                        fmt(ergebnis.nettoKapped) +
                        (params.nettoMonatlich > 2770 ? " (Kappung bei 2.770 €)" : ""),
                    },
                    { key: "Ersatzrate", val: pct(ergebnis.ersatzrate) },
                    { key: "Basiselterngeld / Monat", val: fmt(ergebnis.basisProMonat) },
                    ...(modell !== "basis"
                      ? [{ key: "ElterngeldPlus / Monat", val: fmt(ergebnis.plusProMonat) }]
                      : []),
                    ...(geschwisterbonus
                      ? [{ key: "Geschwisterbonus", val: `+ ${fmt(ergebnis.geschwisterbonusBetrag)}` }]
                      : []),
                    ...(mehrlinge > 0
                      ? [{ key: `Mehrlingszuschlag (×${mehrlinge})`, val: `+ ${fmt(ergebnis.mehrlingszuschlag)}` }]
                      : []),
                    ...(partnerschaftsbonus
                      ? [{ key: "Partnerschaftsbonus", val: `+${ergebnis.bonusMonate} Monate` }]
                      : []),
                    { key: "Gesamtbetrag (Schätzung)", val: fmt(ergebnis.gesamtBetrag) },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="flex justify-between items-center py-3 border-b border-sage/8 last:border-0"
                    >
                      <span className="text-sm text-ink-mid">{row.key}</span>
                      <span className="text-sm font-semibold text-ink">{row.val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-ink-light text-center leading-relaxed px-4">
              Unverbindliche Schätzung nach §2 BEEG. Maßgeblich ist der Bescheid
              deiner zuständigen Elterngeldstelle. Steuerklassen-Anpassung ist eine
              Näherung — Sonderfälle wie Kranken- oder Kurzarbeitsgeld können
              abweichen.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
