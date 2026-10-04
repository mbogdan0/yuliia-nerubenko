import type { SymbolDefinition, SymbolId } from "../types";
import { JOKER_SYMBOL_ID } from "../symbols/jokerState";

export type SpinMode = "random" | "guaranteed-win";

let guaranteedWinCursor = 0;

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function nextGuaranteedWinSymbol(definitions: SymbolDefinition[], jokerWinEligible: boolean): SymbolId | null {
  // Advance through the same ordered set even while the optional Joker prize is
  // unavailable, so readiness changes do not shift the remaining demo sequence.
  for (let checked = 0; checked < definitions.length; checked++) {
    const symbol = definitions[guaranteedWinCursor % definitions.length];
    guaranteedWinCursor++;
    if (jokerWinEligible || symbol.id !== JOKER_SYMBOL_ID) return symbol.id;
  }
  return null;
}

export function createRandomResult(
  definitions: SymbolDefinition[],
  reelCount: number,
  rowCount: number,
  jokerWinEligible: boolean
): SymbolId[][] {
  const result = Array.from({ length: reelCount }, () =>
    Array.from({ length: rowCount }, () => randomItem(definitions).id)
  );

  if (!jokerWinEligible) {
    const otherSymbols = definitions.filter((symbol) => symbol.id !== JOKER_SYMBOL_ID);
    if (otherSymbols.length > 0) {
      for (let row = 0; row < rowCount; row++) {
        if (result.every((col) => col[row] === JOKER_SYMBOL_ID)) {
          const replacementColumn = Math.floor(Math.random() * reelCount);
          result[replacementColumn][row] = randomItem(otherSymbols).id;
        }
      }
    }
  }

  return result;
}

export function createGuaranteedWinResult(
  definitions: SymbolDefinition[],
  reelCount: number,
  rowCount: number,
  jokerWinEligible: boolean
): SymbolId[][] {
  const result = createRandomResult(definitions, reelCount, rowCount, jokerWinEligible);
  const winningSymbol = nextGuaranteedWinSymbol(definitions, jokerWinEligible);
  // A partial asset failure can leave only Joker available. The reels still
  // land normally; SlotTab skips the unavailable prize instead of blocking.
  if (winningSymbol === null) return result;

  // Use the middle line, choosing the lower of the two middle lines for four rows.
  const winningRow = Math.floor(rowCount / 2);

  for (let col = 0; col < reelCount; col++) {
    result[col][winningRow] = winningSymbol;
  }

  return result;
}

export function createSpinResult(
  mode: SpinMode,
  definitions: SymbolDefinition[],
  reelCount: number,
  rowCount: number,
  jokerWinEligible: boolean
): SymbolId[][] {
  return mode === "guaranteed-win"
    ? createGuaranteedWinResult(definitions, reelCount, rowCount, jokerWinEligible)
    : createRandomResult(definitions, reelCount, rowCount, jokerWinEligible);
}
