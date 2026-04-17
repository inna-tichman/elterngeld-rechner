import type { Modell } from "@/lib/berechnung";
import type { BezugsTyp, ParentId, PlanMonat, PlanState } from "./types";

export interface AutoPlanInput {
  modell: Modell;
  monateBasis: number;
  monatePlus: number;
  mixBasis: number;
  mixPlus: number;
  partnerschaftsbonus: boolean;
}

export interface AuszahlungsMonat {
  lebensmonat: number;
  label: string;
  betrag: number;
  typ: BezugsTyp;
  parent: ParentId;
  bonus: boolean;
}

const MONATE_DE = [
  "Jan.",
  "Feb.",
  "Mär.",
  "Apr.",
  "Mai",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Okt.",
  "Nov.",
  "Dez.",
];

const parseMonthValue = (value: string): Date => {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return new Date();
  return new Date(y, m - 1, 1);
};

const plusBonusMonate = (modell: Modell, partnerschaftsbonus: boolean): number => {
  if (!partnerschaftsbonus) return 0;
  return modell === "plus" ? 8 : 4;
};

const clonePlanMonat = (monat: number, parent: ParentId, typ: BezugsTyp, bonus = false): PlanMonat => ({
  monat,
  elternteilA: parent === "A" ? { typ, bonus } : null,
  elternteilB: parent === "B" ? { typ, bonus } : null,
});

export function erstelleAutoPlan(input: AutoPlanInput): PlanState {
  const plan = new Map<number, PlanMonat>();
  const bonus = plusBonusMonate(input.modell, input.partnerschaftsbonus);
  const addMonat = (monat: number, parent: ParentId, typ: BezugsTyp, isBonus = false) => {
    if (monat < 1 || monat > 36) return;
    plan.set(monat, clonePlanMonat(monat, parent, typ, isBonus));
  };
  const addSequenziell = (
    startMonat: number,
    anzahl: number,
    typ: BezugsTyp,
    maxA: number,
    isBonus = false,
  ): number => {
    let monat = startMonat;
    for (let i = 0; i < anzahl; i++) {
      const parent: ParentId = i < maxA ? "A" : "B";
      addMonat(monat, parent, typ, isBonus);
      monat++;
    }
    return monat;
  };
  const addBonus = (startMonat: number, bonusMonate: number): number => {
    let monat = startMonat;
    const bonusA = Math.ceil(bonusMonate / 2);
    const bonusB = Math.floor(bonusMonate / 2);
    for (let i = 0; i < bonusA; i++) {
      addMonat(monat, "A", "plus", true);
      monat++;
    }
    for (let i = 0; i < bonusB; i++) {
      addMonat(monat, "B", "plus", true);
      monat++;
    }
    return monat;
  };

  if (input.modell === "basis") {
    let monat = 1;
    monat = addSequenziell(monat, Math.min(Math.max(input.monateBasis, 0), 14), "basis", 12);
    addBonus(monat, bonus);
    return plan;
  }

  if (input.modell === "plus") {
    let monat = 1;
    monat = addSequenziell(monat, Math.min(Math.max(input.monatePlus, 0), 28), "plus", 24);
    addBonus(monat, bonus);
    return plan;
  }

  let monat = 1;
  monat = addSequenziell(monat, Math.min(Math.max(input.mixBasis, 0), 14), "basis", 12);
  monat = addSequenziell(monat, Math.min(Math.max(input.mixPlus, 0), 28), "plus", 24);
  addBonus(monat, bonus);
  return plan;
}

export function baueAuszahlungsMonate(
  startMonatWert: string,
  plan: PlanState,
  basisBetrag: number,
  plusBetrag: number,
): AuszahlungsMonat[] {
  const start = parseMonthValue(startMonatWert);
  const monate = Array.from(plan.keys()).sort((a, b) => a - b);

  return monate
    .map((lebensmonat) => {
      const eintragA = plan.get(lebensmonat)?.elternteilA ?? null;
      const eintragB = plan.get(lebensmonat)?.elternteilB ?? null;
      const eintrag = eintragA ?? eintragB;
      if (!eintrag) return null;
      const date = new Date(start.getFullYear(), start.getMonth() + lebensmonat - 1, 1);
      const typ = eintrag.typ;
      return {
        lebensmonat,
        label: `${MONATE_DE[date.getMonth()]} ${date.getFullYear()}`,
        betrag: typ === "basis" ? basisBetrag : plusBetrag,
        typ,
        parent: eintragA ? "A" : "B",
        bonus: !!eintrag.bonus,
      };
    })
    .filter((m): m is AuszahlungsMonat => !!m);
}
