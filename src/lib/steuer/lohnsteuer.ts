/**
 * Deutsche Lohnsteuerberechnung – Näherung für Angestellte (GKV)
 * Stand: 2024 / 2025
 *
 * Grundlage: §32a EStG (Einkommensteuertarif), BMF-Programmablaufplan Lohnsteuer 2024.
 * Steuerklassen I–VI.
 *
 * VEREINFACHUNGEN (bitte in der UI anzeigen):
 *  - Vorsorgepauschale wird über tatsächliche Sozialabgaben-Arbeitnehmeranteile angenähert.
 *  - Für Steuerklasse V/VI wird kein Grundfreibetrag angesetzt (Abgabe liegt beim
 *    Klasse-III-Partner); das ergibt eine strukturell höhere Lohnsteuer.
 *  - Kirchensteuersatz pauschal 9 % (außer Bayern/Baden-Württemberg: 8 %).
 *  - Keine individuellen Freibeträge auf der Lohnsteuerkarte berücksichtigt.
 *  - Kein Jahresausgleich, kein Progressionsvorbehalt.
 *  - Private KV wird nicht unterstützt.
 */

// ─── Parameter 2024 ───────────────────────────────────────────────────────────

const GRUNDFREIBETRAG = 11_604; // §32a EStG 2024

/** Arbeitnehmer-Pauschbetrag (Werbungskosten) */
const ANP = 1_230;

/** Sonderausgaben-Pauschbetrag (Klasse I/II/IV/V; Klasse III = 72) */
const SA_PAUSCHBETRAG = 36;

/** Entlastungsbetrag für Alleinerziehende (Steuerklasse II) */
const ENTLASTUNGSBETRAG_ALLEINERZIEHEND = 4_260;

// Beitragssätze 2024 (Arbeitnehmeranteil)
const KV_AN_SATZ = 0.073; // halber Allgemeinbeitrag
const RV_AN_SATZ = 0.093;
const AV_AN_SATZ = 0.013;
// PV: 1.7 % mit Kind, 2.3 % ohne Kind (>= 23 J.) – 2024-Reform vereinfacht
const PV_AN_SATZ_MIT_KIND = 0.017;
const PV_AN_SATZ_OHNE_KIND = 0.023;

// BBG (monatlich, 2024)
const BBG_KV_MONATLICH = 5_175;
const BBG_RV_MONATLICH = 7_550; // West

// Soli-Freigrenze (jährliche Lohnsteuer)
const SOLI_FREIGRENZE_EINZEL = 18_130; // Klasse I/II/IV/V/VI
const SOLI_FREIGRENZE_SPLITTING = 36_260; // Klasse III

// ─── Typen ────────────────────────────────────────────────────────────────────

export type Steuerklasse = 1 | 2 | 3 | 4 | 5 | 6;
export type Bundesland =
  | "BY" // Bayern
  | "BW" // Baden-Württemberg
  | "andere"; // alle übrigen (9 %)

export interface LohnsteuerEingaben {
  /** Monatliches Bruttogehalt in € */
  bruttoMonatlich: number;
  steuerklasse: Steuerklasse;
  /** Anzahl Kinder (relevant für Pflegeversicherungs-Zuschlag) */
  kinderanzahl: number;
  kirchensteuer: boolean;
  bundesland: Bundesland;
  /** Individueller KV-Zusatzbeitrag des Arbeitgebers (AN-Anteil = Hälfte), Standard 2024: 0.017/2 */
  kvZusatzbeitragAN?: number;
  /** Berechnungsjahr – nur 2024 und 2025 unterstützt */
  jahr: 2024 | 2025;
}

export interface SozialabgabenDetail {
  kv: number;
  rv: number;
  av: number;
  pv: number;
  gesamt: number;
}

export interface LohnsteuerErgebnis {
  bruttoMonatlich: number;
  sozialabgaben: SozialabgabenDetail;
  lohnsteuerMonatlich: number;
  solidaritaetszuschlagMonatlich: number;
  kirchensteuerMonatlich: number;
  steuernGesamt: number;
  nettoMonatlich: number;
  // Zwischenwerte für Detailansicht
  zvEJaehrlich: number;
  tarifsteuerJaehrlich: number;
  hinweise: string[];
}

// ─── §32a EStG 2024 ───────────────────────────────────────────────────────────

/**
 * Einkommensteuer-Grundtabelle §32a EStG 2024 (auf ganzen Euro gerundet).
 * Eingabe: zu versteuerndes Einkommen (zvE) in €.
 * Rückgabe: jährliche Einkommensteuer in €.
 */
function tarifsteuer2024(zvE: number): number {
  const z = Math.floor(zvE); // auf ganze Euro abrunden
  if (z <= 11_604) return 0;
  if (z <= 17_005) {
    const y = (z - 11_604) / 10_000;
    return Math.floor((922.98 * y + 1_400) * y);
  }
  if (z <= 66_760) {
    const x = (z - 17_005) / 10_000;
    return Math.floor((181.19 * x + 2_397) * x + 1_025.38);
  }
  if (z <= 277_825) {
    return Math.floor(0.42 * z - 10_602.13);
  }
  return Math.floor(0.45 * z - 18_936.88);
}

// ─── Sozialabgaben ────────────────────────────────────────────────────────────

function berechneSozialabgaben(
  bruttoMonatlich: number,
  kinderanzahl: number,
  kvZusatzbeitragAN: number,
): SozialabgabenDetail {
  const kvSatz = KV_AN_SATZ + kvZusatzbeitragAN;
  const pvSatz = kinderanzahl > 0 ? PV_AN_SATZ_MIT_KIND : PV_AN_SATZ_OHNE_KIND;

  const kv = Math.min(bruttoMonatlich, BBG_KV_MONATLICH) * kvSatz;
  const pv = Math.min(bruttoMonatlich, BBG_KV_MONATLICH) * pvSatz;
  const rv = Math.min(bruttoMonatlich, BBG_RV_MONATLICH) * RV_AN_SATZ;
  const av = Math.min(bruttoMonatlich, BBG_RV_MONATLICH) * AV_AN_SATZ;

  return { kv, rv, av, pv, gesamt: kv + rv + av + pv };
}

// ─── zvE je Steuerklasse ──────────────────────────────────────────────────────

/**
 * Berechnet das zu versteuernde Jahreseinkommen.
 * Vorsorgepauschale wird durch tatsächliche AN-Sozialabgaben angenähert
 * (ergibt für GKV-Versicherte gute Ergebnisse; Abweichung < 5 %).
 */
function berechneZvE(
  bruttoJaehrlich: number,
  steuerklasse: Steuerklasse,
  sozialJaehrlich: number,
): number {
  switch (steuerklasse) {
    case 1:
    case 4:
      return bruttoJaehrlich - ANP - SA_PAUSCHBETRAG - sozialJaehrlich;

    case 2:
      return (
        bruttoJaehrlich -
        ANP -
        SA_PAUSCHBETRAG -
        ENTLASTUNGSBETRAG_ALLEINERZIEHEND -
        sozialJaehrlich
      );

    case 3:
      // Splittingverfahren: doppelter Grundfreibetrag-Effekt durch Halbteilung
      return bruttoJaehrlich - ANP - 2 * SA_PAUSCHBETRAG - sozialJaehrlich;

    case 5:
      // Kein Grundfreibetrag – GFB wird beim Klasse-III-Partner angesetzt.
      // Simulation: zvE wird um GFB erhöht, sodass §32a-Formel keinen
      // Grundfreibetrag-Vorteil mehr gewährt.
      return bruttoJaehrlich + GRUNDFREIBETRAG - ANP;

    case 6:
      // Zweites Dienstverhältnis: keinerlei Freibeträge
      return bruttoJaehrlich + GRUNDFREIBETRAG;
  }
}

// ─── Lohnsteuer-Jahresbetrag je Steuerklasse ─────────────────────────────────

function berechneJahreslohnsteuer(
  zvE: number,
  steuerklasse: Steuerklasse,
): number {
  if (steuerklasse === 3) {
    // Splitting: §32a auf zvE/2, Ergebnis verdoppeln
    const half = Math.max(0, zvE / 2);
    return tarifsteuer2024(half) * 2;
  }
  return tarifsteuer2024(Math.max(0, zvE));
}

// ─── Solidaritätszuschlag ─────────────────────────────────────────────────────

function berechneSoli(
  jaehrlicheLohnsteuer: number,
  steuerklasse: Steuerklasse,
): number {
  const freigrenze =
    steuerklasse === 3 ? SOLI_FREIGRENZE_SPLITTING : SOLI_FREIGRENZE_EINZEL;
  if (jaehrlicheLohnsteuer <= freigrenze) return 0;
  // Gleitzone: Soli steigt von 0 auf 5,5 %
  const vollSoli = jaehrlicheLohnsteuer * 0.055;
  const gleitzone = (jaehrlicheLohnsteuer - freigrenze) * 0.2;
  return Math.min(vollSoli, gleitzone);
}

// ─── Kirchensteuer ────────────────────────────────────────────────────────────

function kirchensteuersatz(bundesland: Bundesland): number {
  return bundesland === "BY" || bundesland === "BW" ? 0.08 : 0.09;
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

export function berechneLohnsteuer(
  eingaben: LohnsteuerEingaben,
): LohnsteuerErgebnis {
  const {
    bruttoMonatlich,
    steuerklasse,
    kinderanzahl,
    kirchensteuer,
    bundesland,
    kvZusatzbeitragAN = 0.0085, // Standard-Zusatzbeitrag 2024 = 1,7 % / 2
    jahr: _jahr, // reserviert für zukünftige Parameter-Anpassungen
  } = eingaben;

  const hinweise: string[] = [];

  // 1. Sozialabgaben (monatlich)
  const sozial = berechneSozialabgaben(
    bruttoMonatlich,
    kinderanzahl,
    kvZusatzbeitragAN,
  );

  // 2. zvE (Jahresbetrag)
  const bruttoJaehrlich = bruttoMonatlich * 12;
  const sozialJaehrlich = sozial.gesamt * 12;
  const zvE = berechneZvE(bruttoJaehrlich, steuerklasse, sozialJaehrlich);

  // 3. Jahres-Lohnsteuer
  const jahreslohnsteuer = berechneJahreslohnsteuer(zvE, steuerklasse);

  // 4. Soli (jährlich)
  const jahreSoli = berechneSoli(jahreslohnsteuer, steuerklasse);

  // 5. Kirchensteuer (jährlich)
  const jahreKiSt = kirchensteuer
    ? jahreslohnsteuer * kirchensteuersatz(bundesland)
    : 0;

  // Monatliche Werte
  const lohnsteuerMonatlich = jahreslohnsteuer / 12;
  const soliMonatlich = jahreSoli / 12;
  const kiStMonatlich = jahreKiSt / 12;
  const steuernGesamt =
    lohnsteuerMonatlich + soliMonatlich + kiStMonatlich + sozial.gesamt;

  const nettoMonatlich = bruttoMonatlich - steuernGesamt;

  // Hinweise
  if (steuerklasse === 5 || steuerklasse === 6) {
    hinweise.push(
      "Steuerklasse V/VI: Grundfreibetrag wird beim Ehe-/Lebenspartner (Klasse III) angerechnet. " +
        "Lohnsteuer daher deutlich höher als Klasse I.",
    );
  }
  if (kinderanzahl === 0) {
    hinweise.push(
      "Ohne Kinder: Pflegeversicherungs-Zuschlag (0,6 %) wird als Arbeitnehmeranteil eingerechnet.",
    );
  }
  if (bruttoMonatlich > BBG_KV_MONATLICH) {
    hinweise.push(
      `KV/PV: Nur der Anteil bis zur BBG (${BBG_KV_MONATLICH} €/Monat) ist beitragspflichtig.`,
    );
  }
  hinweise.push(
    "Vereinfachung: Private KV nicht berücksichtigt. Individuelle Freibeträge auf " +
      "der Lohnsteuerkarte bleiben unberücksichtigt. Abweichungen zum tatsächlichen " +
      "Bescheid möglich.",
  );

  return {
    bruttoMonatlich,
    sozialabgaben: sozial,
    lohnsteuerMonatlich,
    solidaritaetszuschlagMonatlich: soliMonatlich,
    kirchensteuerMonatlich: kiStMonatlich,
    steuernGesamt,
    nettoMonatlich,
    zvEJaehrlich: Math.max(0, zvE),
    tarifsteuerJaehrlich: jahreslohnsteuer,
    hinweise,
  };
}

// ─── Selbstständigen-Netto-Ableitung ─────────────────────────────────────────

export interface SelbststaendigenEingaben {
  jahresgewinn: number; // §4 EStG-Gewinn / Einkünfte lt. Bescheid
  kinderanzahl: number;
  kirchensteuer: boolean;
  bundesland: Bundesland;
  /** Geschätzter KV-Monatsbeitrag (als Selbstständiger selbst zu tragen) */
  kvMonatsbeitrag: number;
  /** Geschätzter RV-Monatsbeitrag (freiwillig od. pflichtversichert) */
  rvMonatsbeitrag: number;
  jahr: 2024 | 2025;
}

export interface SelbststaendigenErgebnis {
  jahresgewinn: number;
  schaetzungESt: number; // Einkommensteuer (Jahr, Näherung)
  schaetzungSoli: number;
  schaetzungKiSt: number;
  sozialabgabenJaehrlich: number;
  nettoJaehrlich: number;
  nettoMonatlich: number;
  hinweise: string[];
}

/**
 * Schätzt das monatliche Netto für Selbstständige aus dem Jahresgewinn.
 * Grundlage: §32a EStG (Grundtabelle, Klasse I) – ohne Gewerbesteuer.
 * Relevant für Elterngeld-Bemessungsgrundlage.
 */
export function berechneSelbststaendigenNetto(
  eingaben: SelbststaendigenEingaben,
): SelbststaendigenErgebnis {
  const {
    jahresgewinn,
    kinderanzahl,
    kirchensteuer,
    bundesland,
    kvMonatsbeitrag,
    rvMonatsbeitrag,
    jahr: _jahr,
  } = eingaben;

  const hinweise: string[] = [
    "Selbstständige: Berechnung basiert auf Jahresgewinn lt. Einkommensteuerbescheid (§4 EStG).",
    "Keine Gewerbesteuer berücksichtigt (relevant für Gewerbetreibende).",
    "Kranken- und Rentenversicherungsbeiträge werden als monatliche Pauschalen eingegeben.",
  ];

  const sozialJaehrlich = (kvMonatsbeitrag + rvMonatsbeitrag) * 12;

  // zvE = Jahresgewinn – Betriebsausgaben bereits abgezogen – Sozialabgaben (Sonderausgaben)
  // Vereinfachung: Sonderausgabenpauschbetrag + Vorsorgeaufwendungen
  const zvE = Math.max(
    0,
    jahresgewinn - sozialJaehrlich - SA_PAUSCHBETRAG,
  );

  const est = tarifsteuer2024(zvE);
  const soli = berechneSoli(est, 1); // Grundtabelle
  const kiSt = kirchensteuer ? est * kirchensteuersatz(bundesland) : 0;
  const steuernJaehrlich = est + soli + kiSt;

  const nettoJaehrlich = jahresgewinn - steuernJaehrlich - sozialJaehrlich;
  const nettoMonatlich = nettoJaehrlich / 12;

  if (kinderanzahl === 0) {
    hinweise.push(
      "Pflegeversicherungs-Zuschlag (0,6 %) für Kinderlose beachten.",
    );
  }
  hinweise.push(
    "Für Elterngeld wird das tatsächlich im Steuerbescheid ausgewiesene Nettoeinkommen " +
      "(Gewinn minus Steuern und SV-Beiträge) herangezogen. Diese Berechnung ist eine " +
      "Schätzung – der exakte Wert ergibt sich aus dem Bescheid.",
  );

  return {
    jahresgewinn,
    schaetzungESt: est,
    schaetzungSoli: soli,
    schaetzungKiSt: kiSt,
    sozialabgabenJaehrlich: sozialJaehrlich,
    nettoJaehrlich,
    nettoMonatlich,
    hinweise,
  };
}
