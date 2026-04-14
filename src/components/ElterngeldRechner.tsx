"use client";

import { useState, useMemo, useRef, useCallback, useReducer } from "react";
import {
  berechneElterngeld,
  type EingabenParams,
  type Modell,
  type Beschaeftigung,
  type NettoQuelle,
} from "@/lib/berechnung";
import {
  berechneLohnsteuer,
  berechneSelbststaendigenNetto,
  type LohnsteuerEingaben,
  type Steuerklasse,
  type Bundesland,
} from "@/lib/steuer/lohnsteuer";
import {
  berechnePlanStatistik,
  validierePlan,
  schaetzePlanBetrag,
  type PlanBetragsSchaetzung,
} from "@/lib/planer/validation";
import type {
  PlanState,
  PlanMonat,
  BezugsEintrag,
  BezugsTyp,
  ParentId,
  PlanStatistik,
  PlanValidierungsProblem,
} from "@/lib/planer/types";
import type { ErgebnisDetails } from "@/lib/berechnung";

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const pct = (n: number) => `${Math.round(n * 100)} %`;

const toggleBtnClass = (active: boolean, extra = "px-3") =>
  `flex-1 py-2 ${extra} rounded-xl text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1 ${
    active
      ? "bg-sage text-white"
      : "bg-white border border-sage-mid text-ink-mid hover:border-sage"
  }`;

const numberInputClass =
  "w-full py-2.5 pl-4 pr-16 border-2 border-sage-mid rounded-xl text-base font-medium text-ink bg-white focus:outline-none focus:border-sage transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type ToggleProps = {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
};

function Toggle({ options, value, onChange, ariaLabel }: ToggleProps) {
  return (
    <div className="flex gap-2" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={toggleBtnClass(value === o.value)}
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
  id?: string;
};

function Field({ label, hint, children, id }: FieldProps) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-sm font-medium text-ink mb-1" htmlFor={id}>
        {label}
      </label>
      {hint && <p className="text-xs text-ink-light mb-2">{hint}</p>}
      {children}
    </div>
  );
}

type NumberInputProps = {
  id?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
};

function NumberInput({ id, value, onChange, unit, min, max, placeholder }: NumberInputProps) {
  return (
    <div className="relative flex items-center">
      <input
        id={id}
        type="number"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        placeholder={placeholder}
        className={numberInputClass}
      />
      {unit && (
        <span className="absolute right-4 text-sm text-ink-light pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  );
}

// ─── Planer reducer ───────────────────────────────────────────────────────────

type PlanerAktion =
  | { type: "SET_EINTRAG"; monat: number; parent: ParentId; eintrag: BezugsEintrag | null }
  | { type: "CLEAR_MONAT"; monat: number }
  | { type: "RESET" };

function planerReducer(state: PlanState, action: PlanerAktion): PlanState {
  const next = new Map(state);
  switch (action.type) {
    case "SET_EINTRAG": {
      const bestehend: PlanMonat = next.get(action.monat) ?? {
        monat: action.monat,
        elternteilA: null,
        elternteilB: null,
      };
      const updated: PlanMonat = {
        ...bestehend,
        ...(action.parent === "A"
          ? { elternteilA: action.eintrag }
          : { elternteilB: action.eintrag }),
      };
      if (!updated.elternteilA && !updated.elternteilB) {
        next.delete(action.monat);
      } else {
        next.set(action.monat, updated);
      }
      return next;
    }
    case "CLEAR_MONAT":
      next.delete(action.monat);
      return next;
    case "RESET":
      return new Map();
  }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = "einkommen" | "modell" | "extras" | "details" | "planer";

const TABS: { id: TabId; label: string }[] = [
  { id: "einkommen", label: "Einkommen" },
  { id: "modell", label: "Modell" },
  { id: "extras", label: "Extras" },
  { id: "details", label: "Details" },
  { id: "planer", label: "Planer" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ElterngeldRechner() {
  const [netto, setNetto] = useState<number>(0);
  const [beschaeftigung, setBeschaeftigung] = useState<Beschaeftigung>("angestellt");
  const [nettoQuelle, setNettoQuelle] = useState<NettoQuelle>("direkt");
  const [modell, setModell] = useState<Modell>("basis");
  const [monateBasis, setMonateBasis] = useState(12);
  const [monatePlus, setMonatePlus] = useState(24);
  const [mixBasis, setMixBasis] = useState(4);
  const [mixPlus, setMixPlus] = useState(16);
  const [partnerschaftsbonus, setPartnerschaftsbonus] = useState(false);
  const [geschwisterbonus, setGeschwisterbonus] = useState(false);
  const [mehrlinge, setMehrlinge] = useState(0);
  const [steuerklasse, setSteuerklasse] = useState<Steuerklasse>(1);
  const [activeTab, setActiveTab] = useState<TabId>("einkommen");

  // Brutto mode
  const [brutto, setBrutto] = useState<number>(0);
  const [kinderanzahl, setKinderanzahl] = useState(0);
  const [kirchensteuer, setKirchensteuer] = useState(false);
  const [bundesland, setBundesland] = useState<Bundesland>("andere");

  // Selbstständig mode
  const [jahresgewinn, setJahresgewinn] = useState<number>(0);
  const [kvMonatsbeitrag, setKvMonatsbeitrag] = useState<number>(400);
  const [rvMonatsbeitrag, setRvMonatsbeitrag] = useState<number>(300);

  // Planer
  const [planState, dispatch] = useReducer(planerReducer, new Map<number, PlanMonat>());
  const [editMonat, setEditMonat] = useState<number | null>(null);

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

  const lohnsteuerErgebnis = useMemo(() => {
    if (nettoQuelle !== "brutto" || !brutto || brutto <= 0) return null;
    const eingaben: LohnsteuerEingaben = {
      bruttoMonatlich: brutto,
      steuerklasse,
      kinderanzahl,
      kirchensteuer,
      bundesland,
      jahr: 2024,
    };
    return berechneLohnsteuer(eingaben);
  }, [nettoQuelle, brutto, steuerklasse, kinderanzahl, kirchensteuer, bundesland]);

  const selbstErgebnis = useMemo(() => {
    if (
      beschaeftigung !== "selbst" ||
      nettoQuelle !== "selbststaendig" ||
      !jahresgewinn ||
      jahresgewinn <= 0
    )
      return null;
    return berechneSelbststaendigenNetto({
      jahresgewinn,
      kinderanzahl,
      kirchensteuer,
      bundesland,
      kvMonatsbeitrag,
      rvMonatsbeitrag,
      jahr: 2024,
    });
  }, [
    beschaeftigung,
    nettoQuelle,
    jahresgewinn,
    kinderanzahl,
    kirchensteuer,
    bundesland,
    kvMonatsbeitrag,
    rvMonatsbeitrag,
  ]);

  const effektivNetto = useMemo(() => {
    if (nettoQuelle === "brutto" && lohnsteuerErgebnis) {
      return lohnsteuerErgebnis.nettoMonatlich;
    }
    if (nettoQuelle === "selbststaendig" && selbstErgebnis) {
      return selbstErgebnis.nettoMonatlich;
    }
    return netto;
  }, [nettoQuelle, lohnsteuerErgebnis, selbstErgebnis, netto]);

  const params: EingabenParams = {
    nettoMonatlich: effektivNetto,
    nettoQuelle,
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
    if (!effektivNetto || effektivNetto <= 0) return null;
    return berechneElterngeld(params);
  }, [
    effektivNetto,
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
  ]);

  const planStatistik = useMemo(() => berechnePlanStatistik(planState), [planState]);
  const planProbleme = useMemo(() => validierePlan(planState), [planState]);
  const planBetrag = useMemo(() => {
    if (!ergebnis) return null;
    return schaetzePlanBetrag(planState, ergebnis.basisProMonat, ergebnis.plusProMonat);
  }, [planState, ergebnis]);

  const handleBeschaeftigungChange = (v: string) => {
    const b = v as Beschaeftigung;
    setBeschaeftigung(b);
    if (b === "selbst") setNettoQuelle("selbststaendig");
    else if (nettoQuelle === "selbststaendig") setNettoQuelle("direkt");
  };

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
                    { label: "Bonus", val: partnerschaftsbonus ? `+${ergebnis.bonusMonate} Mo.` : "–" },
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
                Bitte Einkommen eingeben, um das Ergebnis zu sehen …
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
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1 ${
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
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-sage/10 p-5">
                  <Field label="Beschäftigungsart">
                    <Toggle
                      options={[
                        { label: "Angestellt", value: "angestellt" },
                        { label: "Selbstständig", value: "selbst" },
                        { label: "Beamte/r", value: "beamte" },
                      ]}
                      value={beschaeftigung}
                      onChange={handleBeschaeftigungChange}
                      ariaLabel="Beschäftigungsart"
                    />
                  </Field>

                  {beschaeftigung !== "selbst" && (
                    <Field
                      label="Wie möchtest du dein Einkommen eingeben?"
                      hint="Netto direkt eingeben oder aus dem Bruttogehalt berechnen lassen."
                    >
                      <Toggle
                        options={[
                          { label: "Netto direkt", value: "direkt" },
                          { label: "Aus Brutto", value: "brutto" },
                        ]}
                        value={nettoQuelle === "selbststaendig" ? "direkt" : nettoQuelle}
                        onChange={(v) => setNettoQuelle(v as NettoQuelle)}
                        ariaLabel="Einkommensquelle"
                      />
                    </Field>
                  )}

                  {nettoQuelle === "direkt" && (
                    <Field
                      label="Durchschn. Nettoeinkommen"
                      hint="Monatlicher Durchschnitt der letzten 12 Monate vor Geburt"
                      id="input-netto"
                    >
                      <NumberInput
                        id="input-netto"
                        value={netto}
                        onChange={setNetto}
                        unit="€ / Mo."
                        placeholder="3.200"
                        min={0}
                        max={20000}
                      />
                    </Field>
                  )}

                  {beschaeftigung !== "selbst" && (
                    <Field label="Steuerklasse">
                      <div className="flex gap-2" role="group" aria-label="Steuerklasse">
                        {([1, 2, 3, 4, 5, 6] as Steuerklasse[]).map((sk) => (
                          <button
                            key={sk}
                            type="button"
                            aria-pressed={steuerklasse === sk}
                            onClick={() => setSteuerklasse(sk)}
                            className={toggleBtnClass(steuerklasse === sk, "")}
                          >
                            {sk}
                          </button>
                        ))}
                      </div>
                    </Field>
                  )}
                </div>

                {/* Brutto-Modus Panel */}
                {nettoQuelle === "brutto" && (
                  <div className="bg-white rounded-2xl border border-sage/10 p-5">
                    <p className="text-xs font-semibold text-sage uppercase tracking-wide mb-3">
                      Netto aus Brutto berechnen
                    </p>
                    <Field label="Bruttogehalt (monatlich)" id="input-brutto">
                      <NumberInput
                        id="input-brutto"
                        value={brutto}
                        onChange={setBrutto}
                        unit="€ / Mo."
                        placeholder="4.500"
                        min={0}
                        max={50000}
                      />
                    </Field>
                    <Field label="Anzahl Kinder" hint="Relevant für Pflegeversicherungs-Beitrag">
                      <Toggle
                        options={[
                          { label: "0", value: "0" },
                          { label: "1", value: "1" },
                          { label: "2", value: "2" },
                          { label: "3+", value: "3" },
                        ]}
                        value={String(Math.min(kinderanzahl, 3))}
                        onChange={(v) => setKinderanzahl(parseInt(v))}
                        ariaLabel="Anzahl Kinder"
                      />
                    </Field>
                    <Field label="Kirchensteuer?">
                      <Toggle
                        options={[
                          { label: "Ja", value: "ja" },
                          { label: "Nein", value: "nein" },
                        ]}
                        value={kirchensteuer ? "ja" : "nein"}
                        onChange={(v) => setKirchensteuer(v === "ja")}
                        ariaLabel="Kirchensteuer"
                      />
                    </Field>
                    {kirchensteuer && (
                      <Field label="Bundesland (Kirchensteuersatz)">
                        <Toggle
                          options={[
                            { label: "BY / BW (8 %)", value: "BY" },
                            { label: "Andere (9 %)", value: "andere" },
                          ]}
                          value={bundesland === "BW" ? "BY" : bundesland}
                          onChange={(v) => setBundesland(v === "BY" ? "BY" : "andere")}
                          ariaLabel="Bundesland"
                        />
                      </Field>
                    )}
                    {lohnsteuerErgebnis && (
                      <div className="mt-3 bg-sage-light rounded-xl p-4 space-y-1.5">
                        <p className="text-xs font-semibold text-sage uppercase tracking-wide mb-2">
                          Berechnetes Netto
                        </p>
                        {[
                          { k: "Brutto", v: fmt(lohnsteuerErgebnis.bruttoMonatlich) },
                          { k: "Lohnsteuer", v: `– ${fmt(lohnsteuerErgebnis.lohnsteuerMonatlich)}` },
                          ...(lohnsteuerErgebnis.solidaritaetszuschlagMonatlich > 0
                            ? [{ k: "Solidaritätszuschlag", v: `– ${fmt(lohnsteuerErgebnis.solidaritaetszuschlagMonatlich)}` }]
                            : []),
                          ...(lohnsteuerErgebnis.kirchensteuerMonatlich > 0
                            ? [{ k: "Kirchensteuer", v: `– ${fmt(lohnsteuerErgebnis.kirchensteuerMonatlich)}` }]
                            : []),
                          { k: "KV / PV / RV / AV", v: `– ${fmt(lohnsteuerErgebnis.sozialabgaben.gesamt)}` },
                        ].map((row) => (
                          <div key={row.k} className="flex justify-between text-sm">
                            <span className="text-ink-mid">{row.k}</span>
                            <span className="text-ink font-medium">{row.v}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-bold border-t border-sage/20 pt-2 mt-2">
                          <span className="text-ink">Netto</span>
                          <span className="text-sage">{fmt(lohnsteuerErgebnis.nettoMonatlich)}</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-ink-light leading-relaxed mt-3">
                      <strong>Vereinfachungen:</strong> Gesetzliche Krankenversicherung (GKV), Standard-Zusatzbeitrag 2024 (1,7 %).
                      Keine individuellen Freibeträge. Berechnung nach §32a EStG. Abweichungen zum Lohnzettel möglich.
                    </p>
                  </div>
                )}

                {/* Selbstständigen-Modus Panel */}
                {beschaeftigung === "selbst" && (
                  <div className="bg-white rounded-2xl border border-sage/10 p-5">
                    <p className="text-xs font-semibold text-sage uppercase tracking-wide mb-3">
                      Einkünfte aus Einkommensteuerbescheid
                    </p>
                    <Field
                      label="Jahresgewinn / Einkünfte"
                      hint="§ 4 EStG-Gewinn oder Einkünfte lt. letztem Steuerbescheid (vor Steuern)"
                      id="input-gewinn"
                    >
                      <NumberInput
                        id="input-gewinn"
                        value={jahresgewinn}
                        onChange={setJahresgewinn}
                        unit="€ / Jahr"
                        placeholder="60.000"
                        min={0}
                        max={500000}
                      />
                    </Field>
                    <Field
                      label="Krankenversicherung (monatl.)"
                      hint="Freiwillige GKV oder PKV – eigener Beitrag"
                      id="input-kv"
                    >
                      <NumberInput
                        id="input-kv"
                        value={kvMonatsbeitrag}
                        onChange={setKvMonatsbeitrag}
                        unit="€ / Mo."
                        min={0}
                        max={2000}
                      />
                    </Field>
                    <Field
                      label="Rentenversicherung (monatl.)"
                      hint="Freiwillig oder Pflichtversicherung"
                      id="input-rv"
                    >
                      <NumberInput
                        id="input-rv"
                        value={rvMonatsbeitrag}
                        onChange={setRvMonatsbeitrag}
                        unit="€ / Mo."
                        min={0}
                        max={2000}
                      />
                    </Field>
                    <Field label="Anzahl Kinder">
                      <Toggle
                        options={[
                          { label: "0", value: "0" },
                          { label: "1", value: "1" },
                          { label: "2", value: "2" },
                          { label: "3+", value: "3" },
                        ]}
                        value={String(Math.min(kinderanzahl, 3))}
                        onChange={(v) => setKinderanzahl(parseInt(v))}
                        ariaLabel="Anzahl Kinder"
                      />
                    </Field>
                    <Field label="Kirchensteuer?">
                      <Toggle
                        options={[
                          { label: "Ja", value: "ja" },
                          { label: "Nein", value: "nein" },
                        ]}
                        value={kirchensteuer ? "ja" : "nein"}
                        onChange={(v) => setKirchensteuer(v === "ja")}
                        ariaLabel="Kirchensteuer"
                      />
                    </Field>
                    {selbstErgebnis && (
                      <div className="mt-3 bg-sage-light rounded-xl p-4 space-y-1.5">
                        <p className="text-xs font-semibold text-sage uppercase tracking-wide mb-2">
                          Abgeleitetes monatl. Netto
                        </p>
                        {[
                          { k: "Jahresgewinn", v: fmt(selbstErgebnis.jahresgewinn) },
                          { k: "Geschätzte ESt (Jahr)", v: `– ${fmt(selbstErgebnis.schaetzungESt)}` },
                          ...(selbstErgebnis.schaetzungSoli > 0
                            ? [{ k: "Soli", v: `– ${fmt(selbstErgebnis.schaetzungSoli)}` }]
                            : []),
                          ...(selbstErgebnis.schaetzungKiSt > 0
                            ? [{ k: "KiSt", v: `– ${fmt(selbstErgebnis.schaetzungKiSt)}` }]
                            : []),
                          { k: "KV + RV (Jahr)", v: `– ${fmt(selbstErgebnis.sozialabgabenJaehrlich)}` },
                          { k: "Netto-Jahr", v: fmt(selbstErgebnis.nettoJaehrlich) },
                        ].map((row) => (
                          <div key={row.k} className="flex justify-between text-sm">
                            <span className="text-ink-mid">{row.k}</span>
                            <span className="text-ink font-medium">{row.v}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-bold border-t border-sage/20 pt-2 mt-2">
                          <span className="text-ink">Netto / Monat</span>
                          <span className="text-sage">{fmt(selbstErgebnis.nettoMonatlich)}</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-ink-light leading-relaxed mt-3">
                      <strong>Hinweis:</strong> Elterngeld-Bemessungsgrundlage für Selbstständige ist das
                      Netto aus dem letzten Einkommensteuerbescheid. Diese Schätzung ersetzt keine Beratung.
                      Gewerbesteuer nicht berücksichtigt.
                    </p>
                  </div>
                )}
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
                    ariaLabel="Elterngeld-Modell"
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
                    ariaLabel="Partnerschaftsbonus"
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
                    ariaLabel="Geschwisterbonus"
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
                    ariaLabel="Mehrlinge"
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
                    <>
                      {nettoQuelle === "brutto" && lohnsteuerErgebnis && (
                        <>
                          <div className="px-5 py-2 bg-sage-light border-b border-sage/10">
                            <p className="text-xs font-semibold text-sage uppercase tracking-wide">
                              Netto-Herleitung (Lohnsteuerrechner §32a EStG 2024)
                            </p>
                          </div>
                          {[
                            { key: "Bruttogehalt", val: fmt(lohnsteuerErgebnis.bruttoMonatlich) },
                            { key: "Lohnsteuer / Mo.", val: `– ${fmt(lohnsteuerErgebnis.lohnsteuerMonatlich)}` },
                            ...(lohnsteuerErgebnis.solidaritaetszuschlagMonatlich > 0
                              ? [{ key: "Solidaritätszuschlag", val: `– ${fmt(lohnsteuerErgebnis.solidaritaetszuschlagMonatlich)}` }]
                              : []),
                            ...(lohnsteuerErgebnis.kirchensteuerMonatlich > 0
                              ? [{ key: "Kirchensteuer", val: `– ${fmt(lohnsteuerErgebnis.kirchensteuerMonatlich)}` }]
                              : []),
                            { key: "Krankenversicherung", val: `– ${fmt(lohnsteuerErgebnis.sozialabgaben.kv)}` },
                            { key: "Pflegeversicherung", val: `– ${fmt(lohnsteuerErgebnis.sozialabgaben.pv)}` },
                            { key: "Rentenversicherung", val: `– ${fmt(lohnsteuerErgebnis.sozialabgaben.rv)}` },
                            { key: "Arbeitslosenversicherung", val: `– ${fmt(lohnsteuerErgebnis.sozialabgaben.av)}` },
                            { key: "zvE (jährlich)", val: fmt(lohnsteuerErgebnis.zvEJaehrlich) },
                            { key: "Tarifsteuer (jährlich)", val: fmt(lohnsteuerErgebnis.tarifsteuerJaehrlich) },
                            { key: "Netto (berechnet)", val: fmt(lohnsteuerErgebnis.nettoMonatlich) },
                          ].map((row) => (
                            <div key={row.key} className="flex justify-between items-center px-5 py-2.5 border-b border-sage/10">
                              <span className="text-sm text-ink-mid">{row.key}</span>
                              <span className="text-sm font-semibold text-ink">{row.val}</span>
                            </div>
                          ))}
                        </>
                      )}

                      {nettoQuelle === "selbststaendig" && selbstErgebnis && (
                        <>
                          <div className="px-5 py-2 bg-sage-light border-b border-sage/10">
                            <p className="text-xs font-semibold text-sage uppercase tracking-wide">
                              Netto-Herleitung (Selbstständig)
                            </p>
                          </div>
                          {[
                            { key: "Jahresgewinn", val: fmt(selbstErgebnis.jahresgewinn) },
                            { key: "Geschätzte ESt (Jahr)", val: `– ${fmt(selbstErgebnis.schaetzungESt)}` },
                            ...(selbstErgebnis.schaetzungSoli > 0
                              ? [{ key: "Soli", val: `– ${fmt(selbstErgebnis.schaetzungSoli)}` }]
                              : []),
                            ...(selbstErgebnis.schaetzungKiSt > 0
                              ? [{ key: "KiSt", val: `– ${fmt(selbstErgebnis.schaetzungKiSt)}` }]
                              : []),
                            { key: "KV + RV (Jahr)", val: `– ${fmt(selbstErgebnis.sozialabgabenJaehrlich)}` },
                            { key: "Netto-Jahr", val: fmt(selbstErgebnis.nettoJaehrlich) },
                            { key: "Netto monatlich (÷12)", val: fmt(selbstErgebnis.nettoMonatlich) },
                          ].map((row) => (
                            <div key={row.key} className="flex justify-between items-center px-5 py-2.5 border-b border-sage/10">
                              <span className="text-sm text-ink-mid">{row.key}</span>
                              <span className="text-sm font-semibold text-ink">{row.val}</span>
                            </div>
                          ))}
                        </>
                      )}

                      <div className="px-5 py-2 bg-sage-light border-b border-sage/10">
                        <p className="text-xs font-semibold text-sage uppercase tracking-wide">
                          Elterngeld-Berechnung (§2 BEEG)
                        </p>
                      </div>
                      {[
                        {
                          key: "Nettoeinkommen (Bemessungsgrundlage)",
                          val:
                            fmt(ergebnis.nettoKapped) +
                            (effektivNetto > 2770 ? " (Kappung bei 2.770 €)" : ""),
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
                      ))}
                    </>
                  ) : (
                    <p className="px-5 py-4 text-sm text-ink-light text-center">
                      Bitte zuerst Einkommen eingeben.
                    </p>
                  )}
                </div>

                <p className="text-xs text-ink-light text-center leading-relaxed px-2">
                  Unverbindliche Schätzung nach §2 BEEG. Maßgeblich ist der Bescheid deiner
                  Elterngeldstelle. Lohnsteuer nach §32a EStG 2024 (Näherung für GKV-Versicherte).
                </p>
              </>
            )}
          </div>

          {/* Planer */}
          <div
            role="tabpanel"
            id="panel-planer"
            aria-labelledby="tab-planer"
            hidden={activeTab !== "planer"}
          >
            {activeTab === "planer" && (
              <PlanerPanel
                planState={planState}
                dispatch={dispatch}
                editMonat={editMonat}
                setEditMonat={setEditMonat}
                planStatistik={planStatistik}
                planProbleme={planProbleme}
                planBetrag={planBetrag}
                ergebnis={ergebnis}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Planer Panel ─────────────────────────────────────────────────────────────

interface PlanerPanelProps {
  planState: PlanState;
  dispatch: React.Dispatch<PlanerAktion>;
  editMonat: number | null;
  setEditMonat: (m: number | null) => void;
  planStatistik: PlanStatistik;
  planProbleme: PlanValidierungsProblem[];
  planBetrag: PlanBetragsSchaetzung | null;
  ergebnis: ErgebnisDetails | null;
}

const PARENT_LABELS: Record<ParentId, string> = { A: "Elternteil A", B: "Elternteil B" };
const TYP_LABELS: Record<BezugsTyp, string> = { basis: "Basis", plus: "Plus" };

function PlanerPanel({
  planState,
  dispatch,
  editMonat,
  setEditMonat,
  planStatistik,
  planProbleme,
  planBetrag,
  ergebnis,
}: PlanerPanelProps) {

  function toggleEintrag(monat: number, parent: ParentId, typ: BezugsTyp) {
    const pm = planState.get(monat);
    const aktuell: BezugsEintrag | null =
      parent === "A" ? (pm?.elternteilA ?? null) : (pm?.elternteilB ?? null);
    if (aktuell && aktuell.typ === typ) {
      dispatch({ type: "SET_EINTRAG", monat, parent, eintrag: null });
    } else {
      dispatch({
        type: "SET_EINTRAG",
        monat,
        parent,
        eintrag: { typ, stundenProWoche: aktuell?.stundenProWoche },
      });
    }
  }

  function setStunden(monat: number, parent: ParentId, stunden: number) {
    const pm = planState.get(monat);
    const aktuell: BezugsEintrag | null =
      parent === "A" ? (pm?.elternteilA ?? null) : (pm?.elternteilB ?? null);
    if (!aktuell) return;
    dispatch({
      type: "SET_EINTRAG",
      monat,
      parent,
      eintrag: { ...aktuell, stundenProWoche: stunden },
    });
  }

  const fehler = planProbleme.filter((p) => p.typ === "fehler");
  const warnungen = planProbleme.filter((p) => p.typ === "warnung");
  const infos = planProbleme.filter((p) => p.typ === "info");

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-sage/10 p-4">
        <p className="text-xs font-semibold text-sage uppercase tracking-wide mb-3">
          Plan-Zusammenfassung
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(["A", "B"] as ParentId[]).map((p) => (
            <div key={p} className="bg-sage-light rounded-xl p-3">
              <p className="text-xs text-ink-mid mb-1">{PARENT_LABELS[p]}</p>
              <p className="font-semibold text-ink">
                {p === "A"
                  ? `${planStatistik.basisMonateA}× Basis, ${planStatistik.plusMonateA}× Plus`
                  : `${planStatistik.basisMonateB}× Basis, ${planStatistik.plusMonateB}× Plus`}
              </p>
              <p className="text-xs text-ink-mid mt-0.5">
                = {p === "A" ? planStatistik.gesamtMonateA : planStatistik.gesamtMonateB} Monate gesamt
              </p>
            </div>
          ))}
        </div>
        {planBetrag && ergebnis ? (
          <div className="mt-3 flex justify-between items-center bg-sage/10 rounded-xl px-4 py-3">
            <span className="text-sm text-ink-mid">Geplanter Gesamtbetrag</span>
            <span className="text-base font-bold text-sage">
              {fmt(planBetrag.gesamt)}
            </span>
          </div>
        ) : (
          !ergebnis && (
            <p className="text-xs text-ink-light mt-2 text-center">
              Einkommen eingeben, um Beträge zu berechnen.
            </p>
          )
        )}
        {planStatistik.bonusMonateGesamt > 0 && (
          <p className="text-xs text-sage mt-2 text-center font-medium">
            🎉 Partnerschaftsbonus erkannt: +{planStatistik.bonusMonateGesamt} Monate
          </p>
        )}
      </div>

      {/* Validierungsmeldungen */}
      {(fehler.length > 0 || warnungen.length > 0 || infos.length > 0) && (
        <div className="space-y-2">
          {fehler.map((p) => (
            <div key={p.code} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">
              <p className="text-xs font-semibold text-red-700 mb-0.5">Fehler</p>
              <p className="text-xs text-red-600">{p.meldung}</p>
            </div>
          ))}
          {warnungen.map((p) => (
            <div key={p.code} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-yellow-700 mb-0.5">Hinweis</p>
              <p className="text-xs text-yellow-600">{p.meldung}</p>
            </div>
          ))}
          {infos.map((p) => (
            <div key={p.code} className="bg-sage-light border border-sage/20 rounded-xl px-4 py-3">
              <p className="text-xs text-ink-mid">{p.meldung}</p>
            </div>
          ))}
        </div>
      )}

      {planState.size > 0 && (
        <button
          type="button"
          onClick={() => dispatch({ type: "RESET" })}
          className="w-full py-2 rounded-xl text-sm font-medium border border-sage-mid text-ink-mid hover:border-sage hover:text-ink transition-all"
        >
          Plan zurücksetzen
        </button>
      )}

      {/* Kalender */}
      <div className="bg-white rounded-2xl border border-sage/10 p-4">
        <p className="text-xs font-semibold text-sage uppercase tracking-wide mb-3">
          Monatskalender (Lebensmonat 1–36)
        </p>
        <div className="flex gap-3 mb-3 text-xs text-ink-mid flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-sage" />
            A – Basis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-sage/40 border border-sage/30" />
            A – Plus
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-500" />
            B – Basis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-300 border border-amber-400" />
            B – Plus
          </span>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 36 }, (_, i) => i + 1).map((m) => {
            const pm = planState.get(m);
            const aE = pm?.elternteilA ?? null;
            const bE = pm?.elternteilB ?? null;
            const isEdit = editMonat === m;
            const hasBezug = aE || bE;

            let cellBg = "bg-sage/5 border border-sage/10 text-ink-light";
            if (aE && !bE)
              cellBg =
                aE.typ === "basis"
                  ? "bg-sage border-sage text-white"
                  : "bg-sage/40 border-sage/30 text-ink";
            else if (!aE && bE)
              cellBg =
                bE.typ === "basis"
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "bg-amber-300 border-amber-300 text-ink";
            else if (aE && bE)
              cellBg = "bg-gradient-to-br from-sage to-amber-400 border-sage/30 text-white";

            return (
              <div key={m} className="relative">
                <button
                  type="button"
                  aria-label={`Monat ${m}${hasBezug ? " (belegt)" : ""}`}
                  aria-expanded={isEdit}
                  onClick={() => setEditMonat(isEdit ? null : m)}
                  className={`w-full aspect-square rounded-lg text-xs font-semibold flex items-center justify-center transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${cellBg} ${
                    isEdit ? "ring-2 ring-offset-1 ring-ink" : ""
                  }`}
                >
                  {m}
                </button>

                {isEdit && (
                  <div
                    className="absolute top-full left-0 z-20 mt-1 bg-white rounded-xl shadow-lg border border-sage/20 p-3 w-48"
                    role="dialog"
                    aria-label={`Bezug für Monat ${m} bearbeiten`}
                  >
                    <p className="text-xs font-semibold text-ink mb-2">Monat {m}</p>
                    {(["A", "B"] as ParentId[]).map((parent) => {
                      const eintrag = parent === "A" ? aE : bE;
                      const color = parent === "A" ? "text-sage" : "text-amber-600";
                      const activeColor =
                        parent === "A"
                          ? "bg-sage text-white border-sage"
                          : "bg-amber-500 text-white border-amber-500";
                      return (
                        <div key={parent} className="mb-3 last:mb-0">
                          <p className={`text-[11px] font-semibold ${color} mb-1`}>
                            {PARENT_LABELS[parent]}
                          </p>
                          <div className="flex gap-1 mb-1.5">
                            {(["basis", "plus"] as BezugsTyp[]).map((typ) => (
                              <button
                                key={typ}
                                type="button"
                                aria-pressed={eintrag?.typ === typ}
                                onClick={() => toggleEintrag(m, parent, typ)}
                                className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                                  eintrag?.typ === typ
                                    ? activeColor
                                    : "bg-white text-ink-mid border-sage-mid hover:border-sage"
                                }`}
                              >
                                {TYP_LABELS[typ]}
                              </button>
                            ))}
                          </div>
                          {eintrag?.typ === "plus" && (
                            <div>
                              <p className="text-[10px] text-ink-light mb-1">
                                Std./Woche (Partnerschaftsbonus)
                              </p>
                              <input
                                type="number"
                                value={eintrag.stundenProWoche ?? ""}
                                onChange={(e) =>
                                  setStunden(m, parent, parseFloat(e.target.value) || 0)
                                }
                                placeholder="25–32"
                                min={0}
                                max={40}
                                className="w-full border border-sage-mid rounded-lg px-2 py-1 text-xs text-ink focus:outline-none focus:border-sage"
                                aria-label="Wochenstunden für Partnerschaftsbonus-Prüfung"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "CLEAR_MONAT", monat: m });
                        setEditMonat(null);
                      }}
                      className="w-full mt-1 py-1 text-[11px] text-ink-light hover:text-ink border border-sage/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                    >
                      Monat leeren
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-ink-light text-center leading-relaxed px-2">
        Klicke auf einen Monat, um Bezug einzutragen. Für den Partnerschaftsbonus
        beide Elternteile mit Plus-Bezug und 25–32 Std./Woche in mind. 4 aufeinanderfolgenden Monaten.
      </p>
    </div>
  );
}
