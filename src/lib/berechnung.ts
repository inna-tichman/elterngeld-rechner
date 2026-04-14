/**
 * Elterngeld-Berechnung nach §2 BEEG (Bundeselterngeld- und Elternzeitgesetz)
 * Stand: 2024/2025
 *
 * Wichtig: Diese Berechnung ist eine Schätzung. Maßgeblich ist stets
 * der Bescheid der zuständigen Elterngeldstelle.
 */

export type Modell = "basis" | "plus" | "mix";
export type Beschaeftigung = "angestellt" | "selbst" | "beamte";

/**
 * Quelle des Nettoeinkommens:
 *  - "direkt"         → Nutzer gibt Netto direkt ein (bisheriger Modus)
 *  - "brutto"         → Netto wird aus Brutto per Steuerrechner berechnet
 *  - "selbststaendig" → Netto wird aus Jahresgewinn/-einkünften abgeleitet
 */
export type NettoQuelle = "direkt" | "brutto" | "selbststaendig";

export interface EingabenParams {
  nettoMonatlich: number;       // Durchschn. Netto der letzten 12 Monate
  beschaeftigung: Beschaeftigung;
  /**
   * Quelle des nettoMonatlich-Werts (optional, Standard: "direkt").
   * Wird von der UI befüllt, hat aber keinen Einfluss auf die Kernberechnung,
   * da alle Pfade zum gleichen nettoMonatlich führen.
   */
  nettoQuelle?: NettoQuelle;
  modell: Modell;
  monateBasis: number;          // 1–14
  monatePlus: number;           // 1–28
  mixBasis: number;
  mixPlus: number;
  partnerschaftsbonus: boolean;
  geschwisterbonus: boolean;    // weiteres Kind unter 3 J. im Haushalt
  mehrlinge: number;            // Anzahl zusätzlicher Mehrlinge (0 = kein Mehrling)
  steuerklasse: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface ErgebnisDetails {
  // Zwischenwerte
  nettoKapped: number;          // auf max. 2.770 € gekappt
  ersatzrate: number;           // 0.65–1.00
  basisProMonat: number;        // 300–1.800 €
  plusProMonat: number;         // 150–900 €
  geschwisterbonusBetrag: number;
  mehrlingszuschlag: number;

  // Ergebnis je Modell
  monatlichHaupt: number;       // Hauptbetrag (Basis oder Plus)
  bezugsdauer: number;          // Gesamtmonate inkl. Bonus
  gesamtBetrag: number;

  // Bonus
  bonusMonate: number;
}

/**
 * Kernberechnung Ersatzrate nach §2 Abs. 2 BEEG
 * - Unter 1.000 € Netto: 67%–100% (Geringverdiener-Bonus)
 * - 1.000–1.200 €: 67%
 * - Über 1.200 €: gleitend von 67% auf 65%
 */
function berechneErsatzrate(netto: number): number {
  if (netto < 1000) {
    // Gleitender Bonus: je 2 € unter 1.000 → +0,1 Prozentpunkt
    const bonus = Math.floor((1000 - netto) / 2) * 0.001;
    return Math.min(1.0, 0.67 + bonus);
  }
  if (netto <= 1200) return 0.67;
  // Gleitender Abbau von 67% auf 65% zwischen 1.200 und 2.770 €
  const abbau = ((netto - 1200) / (2770 - 1200)) * 0.02;
  return Math.max(0.65, 0.67 - abbau);
}

export function berechneElterngeld(p: EingabenParams): ErgebnisDetails {
  // 1. Kappung auf Berechnungsgrenze 2.770 €
  // Das übergebene nettoMonatlich stammt entweder aus direkter Eingabe,
  // aus dem Lohnsteuerrechner (Brutto→Netto) oder der Selbstständigen-Ableitung.
  const nettoKapped = Math.min(p.nettoMonatlich, 2770);

  // 2. Ersatzrate & Basis-Elterngeld
  const ersatzrate = berechneErsatzrate(nettoKapped);
  let basisRoh = nettoKapped * ersatzrate;

  // Mindest- und Höchstbetrag
  basisRoh = Math.max(300, Math.min(1800, basisRoh));

  // 4. Geschwisterbonus: +10% auf Basis (mind. 75 € Aufschlag)
  const geschwisterbonusBetrag = p.geschwisterbonus
    ? Math.max(75, basisRoh * 0.1)
    : 0;

  const basisProMonat = Math.min(1800, basisRoh + geschwisterbonusBetrag);

  // 5. ElterngeldPlus = halbes Basis
  const plusProMonat = Math.min(900, basisProMonat / 2);

  // 6. Mehrlingszuschlag: +300 € Basis / +150 € Plus pro weiteres Kind
  const mehrlingszuschlag =
    p.mehrlinge > 0
      ? p.mehrlinge *
        (p.modell === "plus" ? 150 : 300)
      : 0;

  // 7. Partnerschaftsbonus
  // Basis: +4 Monate je Elternteil (hier nur 1 Elternteil berechnet)
  // Plus: +8 Monate
  let bonusMonate = 0;
  if (p.partnerschaftsbonus) {
    bonusMonate = p.modell === "plus" ? 8 : 4;
  }

  // 8. Bezugsdauer & Gesamtbetrag je Modell
  let monatlichHaupt: number;
  let bezugsdauer: number;
  let gesamtBetrag: number;

  if (p.modell === "basis") {
    monatlichHaupt = basisProMonat + mehrlingszuschlag;
    bezugsdauer = p.monateBasis + bonusMonate;
    gesamtBetrag =
      (basisProMonat + mehrlingszuschlag) * p.monateBasis +
      (p.partnerschaftsbonus ? (plusProMonat + mehrlingszuschlag / 2) * bonusMonate : 0);
  } else if (p.modell === "plus") {
    monatlichHaupt = plusProMonat + mehrlingszuschlag;
    bezugsdauer = p.monatePlus + bonusMonate;
    gesamtBetrag =
      (plusProMonat + mehrlingszuschlag) * (p.monatePlus + bonusMonate);
  } else {
    // Mix: erst Basis, dann Plus
    monatlichHaupt = basisProMonat + mehrlingszuschlag;
    bezugsdauer = p.mixBasis + p.mixPlus + bonusMonate;
    gesamtBetrag =
      (basisProMonat + mehrlingszuschlag) * p.mixBasis +
      (plusProMonat + mehrlingszuschlag / 2) * p.mixPlus +
      (p.partnerschaftsbonus ? (plusProMonat) * bonusMonate : 0);
  }

  return {
    nettoKapped,
    ersatzrate,
    basisProMonat,
    plusProMonat,
    geschwisterbonusBetrag,
    mehrlingszuschlag,
    monatlichHaupt,
    bezugsdauer,
    gesamtBetrag,
    bonusMonate,
  };
}
