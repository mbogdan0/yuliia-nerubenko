import type { SymbolAnimationVariants, SymbolDefinition, SymbolId } from "../types";
import { symbolAsset } from "./assets";

const defaultAnimationVariants: SymbolAnimationVariants = {
  Idle: ["Idle"],
  Win: ["Win"]
};

type SymbolOptions = {
  animationVariants?: Partial<SymbolAnimationVariants>;
  slotFillFactor?: number;
};

function defineSymbol(
  id: SymbolId,
  label: string,
  emoji: string,
  fitSlots: string[],
  options: SymbolOptions = {}
): SymbolDefinition {
  return {
    id,
    label,
    emoji,
    fitSlots,
    fitSlotsSet: new Set(fitSlots),
    animationVariants: {
      Idle: options.animationVariants?.Idle ?? defaultAnimationVariants.Idle,
      Win: options.animationVariants?.Win ?? defaultAnimationVariants.Win
    },
    slotFillFactor: options.slotFillFactor,
    asset: symbolAsset(id)
  };
}

export const symbolDefinitions: SymbolDefinition[] = [
  defineSymbol("joker",      "Joker",      "🃏", [
    "frame", "background", "shoulders", "neck", "hat", "hat_center",
    "eyeball_right", "eyeball_left", "iris_left", "iris_right", "head",
    "eyelid_eft2", "eyelid_right2", "eyelid_eft", "eyelid_right",
    "lips_open", "lips_bottom", "lips_top", "eyebrow_left", "nose", "eyebrow_right",
    "card_4", "card_3", "card_2", "card_1", "hand_shadow", "hand"
  ], {
    animationVariants: { Idle: ["idle_1", "idle_2", "idle_3"], Win: ["win_1", "win_2"] },
    slotFillFactor: 0.94
  }),
  defineSymbol("wild",       "Wild",       "🌶️", ["frame_chile", "chile", "chile_tail", "text_bg"]),
  defineSymbol("seven",      "Seven",      "7️⃣", ["7_body", "7_outline"]),
  defineSymbol("star",       "Star",       "⭐", ["star2", "star_outline2"]),
  defineSymbol("cherry",     "Cherry",     "🍒", ["cherry1", "cherry2", "tail_c", "leaf_c", "glare1_c", "glare2_c"]),
  defineSymbol("lemon",      "Lemon",      "🍋", ["lemon", "tail_l", "leaf_l", "glare_l"]),
  defineSymbol("plum",       "Plum",       "🟣", ["plum", "tail_p", "leaf_p", "glare_p"]),
  defineSymbol("orange",     "Orange",     "🍊", ["orange", "tail_o", "leaf_o", "glare_o"]),
  defineSymbol("watermelon", "Watermelon", "🍉", ["watermelon", "seed_1", "seed_2", "seed_3", "glare_w"]),
];

export const symbolsById = new Map<SymbolId, SymbolDefinition>(
  symbolDefinitions.map((symbol) => [symbol.id, symbol])
);

export function getDefaultSymbol(): SymbolDefinition {
  const firstSymbol = symbolDefinitions[0];
  if (!firstSymbol) {
    throw new Error("At least one symbol definition is required.");
  }
  return firstSymbol;
}
