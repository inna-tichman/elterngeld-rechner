import type { Modell } from "@/lib/berechnung";
import type { BezugsTyp, PlanMonat, PlanState } from "./types";

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

const clonePlanMonat = (monat: number, typ: BezugsTyp): PlanMonat => ({
  monat,
  elternteilA: { typ },
  elternteilB: null,
});

export function erstelleAutoPlan(input: AutoPlanInput): PlanState {
  const plan = new Map<number, PlanMonat>();
  const bonus = plusBonusMonate(input.modell, input.partnerschaftsbonus);
  const addMonat = (monat: number, typ: BezugsTyp) => {
    if (monat < 1 || monat > 36) return;
    plan.set(monat, clonePlanMonat(monat, typ));
  };

  if (input.modell === "basis") {
    for (let i = 1; i <= input.monateBasis; i++) addMonat(i, "basis");
    for (let i = input.monateBasis + 1; i <= input.monateBasis + bonus; i++) addMonat(i, "plus");
    return plan;
  }

  if (input.modell === "plus") {
    const gesamtPlus = input.monatePlus + bonus;
    for (let i = 1; i <= gesamtPlus; i++) addMonat(i, "plus");
    return plan;
  }

  const basisEnde = input.mixBasis;
  const plusEnde = input.mixBasis + input.mixPlus + bonus;
  for (let i = 1; i <= basisEnde; i++) addMonat(i, "basis");
  for (let i = basisEnde + 1; i <= plusEnde; i++) addMonat(i, "plus");
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
      const eintrag = plan.get(lebensmonat)?.elternteilA;
      if (!eintrag) return null;
      const date = new Date(start.getFullYear(), start.getMonth() + lebensmonat - 1, 1);
      const typ = eintrag.typ;
      return {
        lebensmonat,
        label: `${MONATE_DE[date.getMonth()]} ${date.getFullYear()}`,
        betrag: typ === "basis" ? basisBetrag : plusBetrag,
        typ,
      };
    })
    .filter((m): m is AuszahlungsMonat => !!m);
}
