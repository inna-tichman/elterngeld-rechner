/**
 * Validierungslogik für den Elterngeld-Planer.
 *
 * Regeln nach BEEG 2024 (vereinfacht):
 *  - Basiselterngeld: Max. 14 Monate gesamt (12 für einen Elternteil allein).
 *  - ElterngeldPlus: 2 Plus-Monate = 1 Basis-Monat; max. 28 Plus-Monate.
 *  - Partnerschaftsbonus: Beide Elternteile arbeiten in mind. 4 aufeinander-
 *    folgenden Monaten 25–32 Std./Woche → je +4 Bonus-Monate ElterngeldPlus.
 *  - Gleich­zeitiger Bezug beider Elternteile ist bei Basiselterngeld möglich
 *    (Partnermonate: 2 der 14 Monate können gleichzeitig bezogen werden).
 *  - Monate werden bis Lebensmonat 14 (Basiselterngeld) bzw. 32 (Plus) gezählt.
 */

import type {
  PlanState,
  PlanStatistik,
  PlanValidierungsProblem,
} from "./types";

const MAX_BASIS_GESAMT = 14;
const MAX_BASIS_EIN_ELTERNTEIL = 12;
const MAX_PLUS_MONATE = 28;

// ─── Statistik ────────────────────────────────────────────────────────────────

export function berechnePlanStatistik(plan: PlanState): PlanStatistik {
  let basisA = 0,
    basisB = 0,
    plusA = 0,
    plusB = 0;

  plan.forEach((pm) => {
    if (pm.elternteilA) {
      if (pm.elternteilA.typ === "basis") basisA++;
      else plusA++;
    }
    if (pm.elternteilB) {
      if (pm.elternteilB.typ === "basis") basisB++;
      else plusB++;
    }
  });

  // Partnerschaftsbonus: 4 aufeinanderfolgende Monate, beide Elternteile
  // im Plus-Modus, beide mit 25–32 Std./Woche
  const monateGesamt = Array.from({ length: 36 }, (_, i) => i + 1);
  let pbBloeckeA = 0;
  let pbBloeckeB = 0;

  // Hilfsfunktion: suche consecutive Blöcke mit Partnerschaftsbonus-Bedingung
  function checkPBBloecke(parent: "A" | "B"): number {
    let streak = 0;
    let blocks = 0;
    for (const m of monateGesamt) {
      const pm = plan.get(m);
      const eintragA = pm?.elternteilA ?? null;
      const eintragB = pm?.elternteilB ?? null;
      const eintragSelf = parent === "A" ? eintragA : eintragB;
      const eintragOther = parent === "A" ? eintragB : eintragA;

      const selfQualifies =
        eintragSelf?.typ === "plus" &&
        (eintragSelf.stundenProWoche ?? 0) >= 25 &&
        (eintragSelf.stundenProWoche ?? 0) <= 32;
      const otherQualifies =
        eintragOther?.typ === "plus" &&
        (eintragOther.stundenProWoche ?? 0) >= 25 &&
        (eintragOther.stundenProWoche ?? 0) <= 32;

      if (selfQualifies && otherQualifies) {
        streak++;
        if (streak >= 4) {
          blocks++;
          streak = 0; // Zähle nicht-überlappend
        }
      } else {
        streak = 0;
      }
    }
    return blocks;
  }

  pbBloeckeA = checkPBBloecke("A");
  pbBloeckeB = checkPBBloecke("B");
  const bonusMonateGesamt = (pbBloeckeA + pbBloeckeB) * 4;

  return {
    basisMonateA: basisA,
    basisMonateB: basisB,
    plusMonateA: plusA,
    plusMonateB: plusB,
    gesamtMonateA: basisA + plusA,
    gesamtMonateB: basisB + plusB,
    partnerschaftsbonusBloeкeA: pbBloeckeA,
    partnerschaftsbonusBloeckeB: pbBloeckeB,
    bonusMonateGesamt,
  };
}

// ─── Validierung ──────────────────────────────────────────────────────────────

export function validiereplan(
  plan: PlanState,
): PlanValidierungsProblem[] {
  const probleme: PlanValidierungsProblem[] = [];
  const stat = berechnePlanStatistik(plan);

  // 1. Basiselterngeld gesamt
  const basisGesamt = stat.basisMonateA + stat.basisMonateB;
  if (basisGesamt > MAX_BASIS_GESAMT) {
    probleme.push({
      typ: "fehler",
      code: "BASIS_MAX_UEBERSCHRITTEN",
      meldung: `Basiselterngeld: Maximal ${MAX_BASIS_GESAMT} Monate gesamt erlaubt (aktuell: ${basisGesamt}).`,
    });
  }

  // 2. Basis je Elternteil
  if (stat.basisMonateA > MAX_BASIS_EIN_ELTERNTEIL) {
    probleme.push({
      typ: "fehler",
      code: "BASIS_MAX_EIN_ELTERNTEIL_A",
      meldung: `Elternteil A: Max. ${MAX_BASIS_EIN_ELTERNTEIL} Monate Basiselterngeld (aktuell: ${stat.basisMonateA}).`,
    });
  }
  if (stat.basisMonateB > MAX_BASIS_EIN_ELTERNTEIL) {
    probleme.push({
      typ: "fehler",
      code: "BASIS_MAX_EIN_ELTERNTEIL_B",
      meldung: `Elternteil B: Max. ${MAX_BASIS_EIN_ELTERNTEIL} Monate Basiselterngeld (aktuell: ${stat.basisMonateB}).`,
    });
  }

  // 3. ElterngeldPlus
  if (stat.plusMonateA > MAX_PLUS_MONATE) {
    probleme.push({
      typ: "fehler",
      code: "PLUS_MAX_A",
      meldung: `Elternteil A: Max. ${MAX_PLUS_MONATE} Monate ElterngeldPlus (aktuell: ${stat.plusMonateA}).`,
    });
  }
  if (stat.plusMonateB > MAX_PLUS_MONATE) {
    probleme.push({
      typ: "fehler",
      code: "PLUS_MAX_B",
      meldung: `Elternteil B: Max. ${MAX_PLUS_MONATE} Monate ElterngeldPlus (aktuell: ${stat.plusMonateB}).`,
    });
  }

  // 4. Gleichzeitiger Basis-Bezug (Partnermonate): max. 2 Monate gleichzeitig
  const gleichzeitigBasis: number[] = [];
  plan.forEach((pm, m) => {
    if (pm.elternteilA?.typ === "basis" && pm.elternteilB?.typ === "basis") {
      gleichzeitigBasis.push(m);
    }
  });
  if (gleichzeitigBasis.length > 2) {
    probleme.push({
      typ: "fehler",
      code: "GLEICHZEITIG_BASIS_MAX",
      meldung: `Beide Elternteile können Basiselterngeld max. 2 Monate gleichzeitig beziehen (aktuell: ${gleichzeitigBasis.length} Monate).`,
      monate: gleichzeitigBasis,
    });
  }

  // 5. Basiselterngeld nur bis Lebensmonat 14
  const basisNachMonat14: number[] = [];
  plan.forEach((pm, m) => {
    if (m > 14) {
      if (pm.elternteilA?.typ === "basis") basisNachMonat14.push(m);
      if (pm.elternteilB?.typ === "basis") basisNachMonat14.push(m);
    }
  });
  if (basisNachMonat14.length > 0) {
    probleme.push({
      typ: "fehler",
      code: "BASIS_NACH_MONAT_14",
      meldung: `Basiselterngeld kann nur bis zum 14. Lebensmonat bezogen werden.`,
      monate: Array.from(new Set(basisNachMonat14)),
    });
  }

  // 6. Partnerschaftsbonus-Hinweis wenn Bedingung fast erfüllt
  if (stat.bonusMonateGesamt === 0) {
    // Prüfen ob Stunden fehlen
    let fastGut = false;
    plan.forEach((pm) => {
      const aPlus = pm.elternteilA?.typ === "plus";
      const bPlus = pm.elternteilB?.typ === "plus";
      if (aPlus && bPlus) fastGut = true;
    });
    if (fastGut) {
      probleme.push({
        typ: "info",
        code: "PARTNERSCHAFTSBONUS_TIPP",
        meldung:
          "Tipp: Für den Partnerschaftsbonus (+4 Monate je Elternteil) müssen " +
          "beide Elternteile in mind. 4 aufeinanderfolgenden Monaten 25–32 Std./Woche " +
          "arbeiten und ElterngeldPlus beziehen.",
      });
    }
  }

  // 7. Warnung: kein Bezug eingetragen
  if (plan.size === 0) {
    probleme.push({
      typ: "info",
      code: "KEIN_BEZUG",
      meldung:
        "Noch kein Monat geplant. Klicke auf einen Monat, um Bezug einzutragen.",
    });
  }

  return probleme;
}

// ─── Gesamtbetrag-Schätzung aus Plan ─────────────────────────────────────────

export interface PlanBetragsSchaetzung {
  gesamtA: number;
  gesamtB: number;
  gesamt: number;
}

export function schaeztePlanBetrag(
  plan: PlanState,
  basisProMonat: number,
  plusProMonat: number,
): PlanBetragsSchaetzung {
  let sumA = 0;
  let sumB = 0;

  plan.forEach((pm) => {
    if (pm.elternteilA) {
      sumA +=
        pm.elternteilA.typ === "basis" ? basisProMonat : plusProMonat;
    }
    if (pm.elternteilB) {
      sumB +=
        pm.elternteilB.typ === "basis" ? basisProMonat : plusProMonat;
    }
  });

  return { gesamtA: sumA, gesamtB: sumB, gesamt: sumA + sumB };
}
