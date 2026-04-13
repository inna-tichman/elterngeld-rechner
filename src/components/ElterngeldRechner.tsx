"use client";

import { useState, useMemo, useRef, useCallback } from "react";
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
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1 ${
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
    <div className="mb-4 last:mb-0">
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
        className="w-full py-2.5 pl-4 pr-16 border-2 border-sage-mid rounded-xl text-base font-medium text-ink bg-white focus:outline-none focus:border-sage transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && (
        <span className="absolute right-4 text-sm text-ink-light pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  );
}

type TabId = "einkommen" | "modell" | "extras" | "details";

const TABS: { id: TabId; label: string }[] = [
  { id: "einkommen", label: "Einkommen" },
  { id: "modell", label: "Modell" },
  { id: "extras", label: "Extras" },
  { id: "details", label: "Details" },
];

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
  const [activeTab, setActiveTab] = useState<TabId>("einkommen");

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let next = index;
      if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = TABS.length - 1;
      else return;
      e.preventDefault();
      setActiveTab(TABS[next].id);
      tabRefs.current[next]?.focus();
    },
    [],
  );

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
    <div className="h-dvh flex flex-col overflow-hidden bg-sand">

      {/* Header */}
      <div className="shrink-0 text-center px-4 pt-3 pb-1">
        <h1 className="font-serif text-2xl text-ink leading-tight">
          <em className="italic text-sage not-italic">Elterngeld Rechner</em>
        </h1>
        <p className="text-xs text-ink-light font-light">
          Kostenlos · Schnell · Ohne Anmeldung
        </p>
      </div>

      {/* Ergebnis — always pinned */}
      <div className="shrink-0 px-4 pt-2 pb-2">
        <div className="max-w-lg mx-auto">
          {ergebnis ? (
            <div className="bg-sage rounded-2xl px-5 py-4 relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5" />
              <div className="absolute -bottom-12 -left-4 w-44 h-44 rounded-full bg-white/5" />

              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-0.5">
                  {modell === "plus" ? "ElterngeldPlus / Monat" : "Basiselterngeld / Monat"}
                </p>
                <div className="flex items-baseline gap-3 mb-1">
                  <p className="font-serif text-4xl text-white leading-none">
                    {fmt(ergebnis.monatlichHaupt)}
                  </p>
                  {modell === "mix" && (
                    <p className="text-sm text-white/60">
                      Plus: {fmt(ergebnis.plusProMonat)} / Mo.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[
                    { label: "Gesamt", val: fmt(ergebnis.gesamtBetrag) },
                    { label: "Dauer", val: `${ergebnis.bezugsdauer} Mo.` },
                    { label: "Ersatz", val: pct(ergebnis.ersatzrate) },
                    {
                      label: partnerschaftsbonus ? "Bonus" : "Bonus",
                      val: partnerschaftsbonus
                        ? `+${ergebnis.bonusMonate} Mo.`
                        : "–",
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/10 rounded-xl p-2">
                      <p className="text-[10px] text-white/55 mb-0.5">{item.label}</p>
                      <p className="text-sm font-semibold text-white leading-tight">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-sage/10 border border-sage/20 rounded-2xl px-5 py-4 text-center">
              <p className="text-sm text-ink-mid">
                Bitte Nettoeinkommen eingeben, um das Ergebnis zu sehen …
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 px-4 pb-2">
        <div className="max-w-lg mx-auto">
          <div
            role="tablist"
            aria-label="Eingabebereiche"
            className="flex gap-1 bg-white rounded-2xl p-1 border border-sage/10"
          >
            {TABS.map((tab, i) => (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                ref={(el) => { tabRefs.current[i] = el; }}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1 ${
                  activeTab === tab.id
                    ? "bg-sage text-white shadow-sm"
                    : "text-ink-mid hover:text-ink hover:bg-sage-light"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab panels */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        <div className="max-w-lg mx-auto">

          {/* Einkommen */}
          <div
            role="tabpanel"
            id="panel-einkommen"
            aria-labelledby="tab-einkommen"
            hidden={activeTab !== "einkommen"}
          >
            {activeTab === "einkommen" && (
              <div className="bg-white rounded-2xl border border-sage/10 p-5">
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
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1 ${
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
            )}
          </div>

          {/* Modell */}
          <div
            role="tabpanel"
            id="panel-modell"
            aria-labelledby="tab-modell"
            hidden={activeTab !== "modell"}
          >
            {activeTab === "modell" && (
              <div className="bg-white rounded-2xl border border-sage/10 p-5">
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
            )}
          </div>

          {/* Extras */}
          <div
            role="tabpanel"
            id="panel-extras"
            aria-labelledby="tab-extras"
            hidden={activeTab !== "extras"}
          >
            {activeTab === "extras" && (
              <div className="bg-white rounded-2xl border border-sage/10 p-5">
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
            )}
          </div>

          {/* Details */}
          <div
            role="tabpanel"
            id="panel-details"
            aria-labelledby="tab-details"
            hidden={activeTab !== "details"}
          >
            {activeTab === "details" && (
              <>
                <div className="bg-white rounded-2xl border border-sage/10 overflow-hidden mb-3">
                  {ergebnis ? (
                    [
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
                        className="flex justify-between items-center px-5 py-3 border-b border-sage/10 last:border-0"
                      >
                        <span className="text-sm text-ink-mid">{row.key}</span>
                        <span className="text-sm font-semibold text-ink">{row.val}</span>
                      </div>
                    ))
                  ) : (
                    <p className="px-5 py-4 text-sm text-ink-light text-center">
                      Bitte zuerst Nettoeinkommen unter „Einkommen" eingeben.
                    </p>
                  )}
                </div>

                <p className="text-xs text-ink-light text-center leading-relaxed px-2">
                  Unverbindliche Schätzung nach §2 BEEG. Maßgeblich ist der Bescheid
                  deiner zuständigen Elterngeldstelle. Steuerklassen-Anpassung ist eine
                  Näherung — Sonderfälle wie Kranken- oder Kurzarbeitsgeld können
                  abweichen.
                </p>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
