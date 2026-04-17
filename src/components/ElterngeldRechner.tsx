"use client";

import { useState, useMemo, useRef, useCallback } from "react";
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
import { baueAuszahlungsMonate, erstelleAutoPlan } from "@/lib/planer/autofill";

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const pct = (n: number) => `${Math.round(n * 100)} %`;

type ErklaerSprache = "de" | "en";
type HilfeText = { de: string; en: string };

const toggleBtnClass = (active: boolean, extra = "px-3") =>
  `flex-1 py-2 ${extra} rounded-xl text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1 ${
    active
      ? "bg-sage text-white"
      : "bg-white border border-sage-mid text-ink-mid hover:border-sage"
  }`;

const numberInputClass =
  "w-full py-2.5 pl-4 pr-16 border-2 border-sage-mid rounded-xl text-base font-medium text-ink bg-white focus:outline-none focus:border-sage transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const monthInputClass =
  "w-full py-2.5 pl-4 pr-4 border-2 border-sage-mid rounded-xl text-base font-medium text-ink bg-white focus:outline-none focus:border-sage transition-colors";

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
  help: HilfeText;
  lang: ErklaerSprache;
  children: React.ReactNode;
  id?: string;
};

function HelpSheetButton({ label, help, lang }: { label: string; help: HilfeText; lang: ErklaerSprache }) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Hilfe zu ${label}`}
        aria-haspopup="dialog"
        onClick={() => setOffen(true)}
        className="inline-flex w-7 h-7 items-center justify-center rounded-full border border-sage/30 text-sage hover:bg-sage-light focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        i
      </button>
      {offen && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label={`Erklärung: ${label}`}
          onClick={() => setOffen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl px-5 pt-4 pb-6 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-sage/20 mx-auto mb-4" />
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-ink">{label}</p>
              <button
                type="button"
                onClick={() => setOffen(false)}
                className="text-sm text-ink-mid hover:text-ink"
              >
                Schließen
              </button>
            </div>
            <p className="text-sm text-ink-mid leading-relaxed whitespace-pre-line">
              {lang === "de" ? help.de : help.en}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, help, lang, children, id }: FieldProps) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-sm font-medium text-ink" htmlFor={id}>
          {label}
        </label>
        <HelpSheetButton label={label} help={help} lang={lang} />
      </div>
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = "einkommen" | "modell" | "extras" | "details";

const TABS: { id: TabId; label: string }[] = [
  { id: "einkommen", label: "Einkommen" },
  { id: "modell", label: "Modell" },
  { id: "extras", label: "Extras" },
  { id: "details", label: "Details" },
];

const help = {
  beschaeftigungsart: {
    de: "Wähle die Art deiner Beschäftigung. Das bestimmt, welche Eingaben für die Netto-Schätzung nötig sind.",
    en: "Choose your employment type. This determines which inputs are needed for the net income estimate.",
  },
  einkommensquelle: {
    de: "Du kannst dein Netto direkt eingeben oder es aus dem Bruttolohn ableiten lassen.",
    en: "You can enter net income directly or derive it from gross salary.",
  },
  netto: {
    de: "Monatliches Durchschnitts-Netto im Bemessungszeitraum vor der Geburt.",
    en: "Average monthly net income during the assessment period before birth.",
  },
  steuerklasse: {
    de: "Die Steuerklasse beeinflusst die Netto-Ableitung aus dem Bruttogehalt.",
    en: "Tax class affects the net-income calculation derived from gross salary.",
  },
  brutto: {
    de: "Monatliches Bruttogehalt für die Netto-Berechnung.",
    en: "Monthly gross salary used to estimate net income.",
  },
  kinderanzahl: {
    de: "Anzahl der Kinder beeinflusst den Pflegeversicherungsanteil.",
    en: "Number of children affects the long-term care insurance component.",
  },
  kirchensteuer: {
    de: "Falls Kirchensteuer anfällt, wird sie in der Netto-Schätzung berücksichtigt.",
    en: "If church tax applies, it is included in the net-income estimate.",
  },
  bundesland: {
    de: "In BY/BW gilt 8 %, in anderen Bundesländern 9 % Kirchensteuer.",
    en: "Church tax is 8% in BY/BW and 9% in other federal states.",
  },
  jahresgewinn: {
    de: "Nutze den Gewinn/Einkünfte-Wert aus dem letzten Steuerbescheid vor Steuern.",
    en: "Use the profit/income value from the latest tax assessment before taxes.",
  },
  kv: {
    de: "Dein monatlicher Krankenversicherungsbeitrag (GKV oder PKV).",
    en: "Your monthly health insurance contribution (public or private).",
  },
  rv: {
    de: "Dein monatlicher Rentenversicherungsbeitrag.",
    en: "Your monthly pension insurance contribution.",
  },
  modell: {
    de: "Wähle Basis, Plus oder Mix für die geplante Bezugsart.",
    en: "Choose Basis, Plus, or Mix for your planned benefit type.",
  },
  startmonat: {
    de: "Startmonat für die Monatsliste.",
    en: "Start month used for the monthly list.",
  },
  basisMonate: {
    de: "Anzahl der Basiselterngeld-Monate im Modell.",
    en: "Number of Basis Elterngeld months in your model.",
  },
  plusMonate: {
    de: "Anzahl der ElterngeldPlus-Monate im Modell.",
    en: "Number of ElterngeldPlus months in your model.",
  },
  partnerschaftsbonus: {
    de: "Optionaler Bonus bei erfüllten Voraussetzungen für beide Elternteile.",
    en: "Optional bonus if both parents meet the eligibility criteria.",
  },
  geschwisterbonus: {
    de: "Zuschlag bei weiterem jungen Kind im Haushalt.",
    en: "Additional amount if another young child lives in the household.",
  },
  mehrlinge: {
    de: "Zusätzliche Kinder bei Mehrlingsgeburt für Zuschlag.",
    en: "Additional children in a multiple birth for the supplement.",
  },
} satisfies Record<string, HilfeText>;

const aktuellerMonat = () => {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
};

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
  const [erklaerSprache, setErklaerSprache] = useState<ErklaerSprache>("de");
  const [startMonat, setStartMonat] = useState(aktuellerMonat);

  // Brutto mode
  const [brutto, setBrutto] = useState<number>(0);
  const [kinderanzahl, setKinderanzahl] = useState(0);
  const [kirchensteuer, setKirchensteuer] = useState(false);
  const [bundesland, setBundesland] = useState<Bundesland>("andere");

  // Selbstständig mode
  const [jahresgewinn, setJahresgewinn] = useState<number>(0);
  const [kvMonatsbeitrag, setKvMonatsbeitrag] = useState<number>(400);
  const [rvMonatsbeitrag, setRvMonatsbeitrag] = useState<number>(300);

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

  const autoPlan = useMemo(
    () =>
      erstelleAutoPlan({
        modell,
        monateBasis,
        monatePlus,
        mixBasis,
        mixPlus,
        partnerschaftsbonus,
      }),
    [modell, monateBasis, monatePlus, mixBasis, mixPlus, partnerschaftsbonus],
  );
  const auszahlungsMonate = useMemo(() => {
    if (!ergebnis) return [];
    const basisMitMehrlingen = ergebnis.basisProMonat + ergebnis.mehrlingszuschlag;
    const plusMitMehrlingen = ergebnis.plusProMonat + ergebnis.mehrlingszuschlag / 2;
    return baueAuszahlungsMonate(startMonat, autoPlan, basisMitMehrlingen, plusMitMehrlingen);
  }, [ergebnis, startMonat, autoPlan]);

  const handleBeschaeftigungChange = (v: string) => {
    const b = v as Beschaeftigung;
    setBeschaeftigung(b);
    if (b === "selbst") setNettoQuelle("selbststaendig");
    else if (nettoQuelle === "selbststaendig") setNettoQuelle("direkt");
  };

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-sand relative">
      <div className="absolute inset-0 pointer-events-none select-none opacity-[0.04] flex flex-col justify-around text-center font-semibold text-sage text-lg">
        <p>Kostenlos · Schnell · Ohne Anmeldung</p>
        <p>Kostenlos · Schnell · Ohne Anmeldung</p>
        <p>Kostenlos · Schnell · Ohne Anmeldung</p>
      </div>

      {/* Header */}
      <div className="shrink-0 text-center px-4 pt-3 pb-1 relative z-10">
        <div className="mt-2 inline-flex items-center gap-1 rounded-xl bg-white/80 border border-sage/10 p-1">
          {(["de", "en"] as ErklaerSprache[]).map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={erklaerSprache === lang}
              onClick={() => setErklaerSprache(lang)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                erklaerSprache === lang ? "bg-sage text-white" : "text-ink-mid hover:text-ink"
              }`}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 relative z-10">
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
                  <Field label="Beschäftigungsart" help={help.beschaeftigungsart} lang={erklaerSprache}>
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
                      help={help.einkommensquelle}
                      lang={erklaerSprache}
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
                      help={help.netto}
                      lang={erklaerSprache}
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
                    <Field label="Steuerklasse" help={help.steuerklasse} lang={erklaerSprache}>
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
                    <Field
                      label="Bruttogehalt (monatlich)"
                      help={help.brutto}
                      lang={erklaerSprache}
                      id="input-brutto"
                    >
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
                    <Field label="Anzahl Kinder" help={help.kinderanzahl} lang={erklaerSprache}>
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
                    <Field label="Kirchensteuer?" help={help.kirchensteuer} lang={erklaerSprache}>
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
                      <Field
                        label="Bundesland (Kirchensteuersatz)"
                        help={help.bundesland}
                        lang={erklaerSprache}
                      >
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
                      help={help.jahresgewinn}
                      lang={erklaerSprache}
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
                      help={help.kv}
                      lang={erklaerSprache}
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
                      help={help.rv}
                      lang={erklaerSprache}
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
                    <Field label="Anzahl Kinder" help={help.kinderanzahl} lang={erklaerSprache}>
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
                    <Field label="Kirchensteuer?" help={help.kirchensteuer} lang={erklaerSprache}>
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
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-sage/10 overflow-hidden">
                  <div className="px-5 py-2 bg-sage-light border-b border-sage/10">
                    <p className="text-xs font-semibold text-sage uppercase tracking-wide">
                      Plan-Zusammenfassung
                    </p>
                  </div>
                  {ergebnis ? (
                    <>
                      {[
                        { key: "Monatlich", val: fmt(ergebnis.monatlichHaupt) },
                        { key: "Gesamt", val: fmt(ergebnis.gesamtBetrag) },
                        { key: "Dauer", val: `${ergebnis.bezugsdauer} Monate` },
                        { key: "Ersatzrate", val: pct(ergebnis.ersatzrate) },
                        ...(partnerschaftsbonus
                          ? [{ key: "Bonusmonate", val: `+${ergebnis.bonusMonate}` }]
                          : []),
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

                <div className="bg-white rounded-2xl border border-sage/10 p-5">
                  <Field label="Welches Modell?" help={help.modell} lang={erklaerSprache}>
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
                    <Field
                      label="Monate Basiselterngeld"
                      help={help.basisMonate}
                      lang={erklaerSprache}
                    >
                      <NumberInput value={monateBasis} onChange={setMonateBasis} unit="Monate" min={1} max={14} />
                    </Field>
                  )}
                  {modell === "plus" && (
                    <Field
                      label="Monate ElterngeldPlus"
                      help={help.plusMonate}
                      lang={erklaerSprache}
                    >
                      <NumberInput value={monatePlus} onChange={setMonatePlus} unit="Monate" min={1} max={28} />
                    </Field>
                  )}
                  {modell === "mix" && (
                    <>
                      <Field label="Basis-Monate" help={help.basisMonate} lang={erklaerSprache}>
                        <NumberInput value={mixBasis} onChange={setMixBasis} unit="Monate" min={1} max={14} />
                      </Field>
                      <Field label="ElterngeldPlus-Monate" help={help.plusMonate} lang={erklaerSprache}>
                        <NumberInput value={mixPlus} onChange={setMixPlus} unit="Monate" min={1} max={28} />
                      </Field>
                    </>
                  )}
                  <Field label="Startmonat" help={help.startmonat} lang={erklaerSprache} id="input-startmonat">
                    <input
                      id="input-startmonat"
                      type="month"
                      value={startMonat}
                      onChange={(e) => setStartMonat(e.target.value)}
                      className={monthInputClass}
                    />
                  </Field>
                  <Field
                    label="Partnerschaftsbonus?"
                    help={help.partnerschaftsbonus}
                    lang={erklaerSprache}
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

                {ergebnis && (
                  <div className="bg-white rounded-2xl border border-sage/10 overflow-hidden">
                    <div className="px-5 py-2 bg-sage-light border-b border-sage/10">
                      <p className="text-xs font-semibold text-sage uppercase tracking-wide">
                        Monatsliste Auszahlung
                      </p>
                    </div>
                    <ul>
                      {auszahlungsMonate.map((monat) => (
                        <li key={`${monat.lebensmonat}-${monat.parent}`} className="px-5 py-3 border-b border-sage/10 last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-ink">
                              LM {monat.lebensmonat} · {monat.label}
                            </span>
                            <span className="text-sm font-semibold text-ink">{fmt(monat.betrag)}</span>
                          </div>
                          <p className="text-xs text-ink-mid mt-1">
                            Elternteil {monat.parent} · {monat.typ === "basis" ? "Basis" : "Plus"}
                            {monat.bonus ? " · Bonusmonat" : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                  help={help.geschwisterbonus}
                  lang={erklaerSprache}
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
                <Field label="Mehrlinge?" help={help.mehrlinge} lang={erklaerSprache}>
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

        </div>
      </div>

      {/* Tab bar directly above result */}
      <div className="shrink-0 px-4 pb-2 relative z-10">
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

      {/* Ergebnis at bottom */}
      <div className="shrink-0 px-4 pt-1 pb-3 relative z-10">
        <div className="max-w-lg mx-auto">
          {ergebnis ? (
            <div className="bg-sage rounded-2xl px-5 py-4 relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5" />
              <div className="absolute -bottom-12 -left-4 w-44 h-44 rounded-full bg-white/5" />
              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-0.5">
                  Elterngeld Rechner · {modell === "plus" ? "ElterngeldPlus / Monat" : "Basiselterngeld / Monat"}
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
              <p className="text-xs font-semibold uppercase tracking-wider text-sage mb-1">
                Elterngeld Rechner
              </p>
              <p className="text-sm text-ink-mid">
                Bitte Einkommen eingeben, um das Ergebnis zu sehen …
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
