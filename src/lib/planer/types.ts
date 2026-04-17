/**
 * Datentypen für den Elterngeld-Planer (Monatskalender für zwei Elternteile).
 */

export type ParentId = "A" | "B";
export type BezugsTyp = "basis" | "plus";

/** Einzelner Bezugseintrag eines Elternteils für einen Monat */
export interface BezugsEintrag {
  typ: BezugsTyp;
  bonus?: boolean;
  /**
   * Wochenarbeitsstunden während des Bezugs.
   * Relevant für Partnerschaftsbonus-Prüfung (25–32 Std/Woche).
   */
  stundenProWoche?: number;
}

/**
 * Eintrag für einen Kalendermonat im Elterngeld-Plan.
 * month = 1 … 36 (Lebensmonat des Kindes).
 */
export interface PlanMonat {
  monat: number; // 1–36
  elternteilA: BezugsEintrag | null;
  elternteilB: BezugsEintrag | null;
}

/** Kompakte Map für schnellen Zugriff: key = monat (1-36) */
export type PlanState = Map<number, PlanMonat>;

/** Aggregierte Statistiken über den gesamten Plan */
export interface PlanStatistik {
  /** Gesamtmonate Basiselterngeld (beide Elternteile) */
  basisMonateA: number;
  basisMonateB: number;
  /** Gesamtmonate ElterngeldPlus (beide Elternteile) */
  plusMonateA: number;
  plusMonateB: number;
  /** Gesamtbezugsmonate je Elternteil */
  gesamtMonateA: number;
  gesamtMonateB: number;
  /** Partnerschaftsbonus-Blöcke (je 4 Monate consecutive) */
  partnerschaftsbonusBloeckeA: number;
  partnerschaftsbonusBloeckeB: number;
  /** Bonus-Monate aus Partnerschaftsbonus gesamt */
  bonusMonateGesamt: number;
}

/** Validierungsfehler / -warnungen für den Planer */
export interface PlanValidierungsProblem {
  typ: "fehler" | "warnung" | "info";
  code: string;
  meldung: string;
  monate?: number[]; // betroffene Monate
}
