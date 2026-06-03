import type { SymbolDefinition, SymbolId } from "../types";
import { symbolAsset } from "./assets";

function defineSymbol(
  id: SymbolId,
  label: string,
  emoji: string,
  fitSlots: string[]
): SymbolDefinition {
  return { id, label, emoji, fitSlots, fitSlotsSet: new Set(fitSlots), asset: symbolAsset(id) };
}

export const symbolDefinitions: SymbolDefinition[] = [
  defineSymbol("wild",       "Wild",       "🌶️", ["frame_chile", "chile", "chile_tail", "text_bg"]),
  defineSymbol("seven",      "Seven",      "7️⃣", ["7", "7_outline"]),
  defineSymbol("cherry",     "Cherry",     "🍒", ["cherry1", "cherry2", "tail_c", "leaf_c", "glare1_c", "glare2_c"]),
  defineSymbol("lemon",      "Lemon",      "🍋", ["lemon", "tail_l", "leaf_l", "glare_l"]),
  defineSymbol("orange",     "Orange",     "🍊", ["orange", "tail_o", "leaf_o", "glare_o"]),
  defineSymbol("plum",       "Plum",       "🟣", ["plum", "tail_p", "leaf_p", "glare_p"]),
  defineSymbol("star",       "Star",       "⭐", ["star", "star_outline"]),
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
