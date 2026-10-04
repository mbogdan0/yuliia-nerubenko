import type { SymbolDefinition, SymbolId } from "../types";
import { JOKER_SYMBOL_ID } from "../symbols/jokerState";

export type SpinMode = "random" | "guaranteed-win";

let guaranteedWinCursor = 0;
let jokerWinPending = false;

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function nextGuaranteedWinSymbol(definitions: SymbolDefinition[], jokerWinEligible: boolean): SymbolId {
  if (jokerWinPending && jokerWinEligible && definitions.some((symbol) => symbol.id === JOKER_SYMBOL_ID)) {
    jokerWinPending = false;
    // If the cycle has already returned to Joker, consume that position too.
    if (definitions[guaranteedWinCursor % definitions.length].id === JOKER_SYMBOL_ID) guaranteedWinCursor++;
    return JOKER_SYMBOL_ID;
  }

  for (let checked = 0; checked < definitions.length; checked++) {
    const symbol = definitions[guaranteedWinCursor % definitions.length];
    guaranteedWinCursor++;
    if (symbol.id === JOKER_SYMBOL_ID && !jokerWinEligible) {
      jokerWinPending = true;
      continue;
    }
    return symbol.id;
  }
  throw new Error("No available symbol can receive the guaranteed prize.");
}

export function createRandomResult(
  definitions: SymbolDefinition[],
  reelCount: number,
  rowCount: number,
  jokerWinEligible: boolean
): SymbolId[][] {
  const otherSymbols = jokerWinEligible
    ? []
    : definitions.filter((symbol) => symbol.id !== JOKER_SYMBOL_ID);
  if (!jokerWinEligible && otherSymbols.length === 0) {
    throw new Error("No non-Joker symbols are available while the Joker prize is not ready.");
  }

  const result = Array.from({ length: reelCount }, () =>
    Array.from({ length: rowCount }, () => randomItem(definitions).id)
  );

  if (!jokerWinEligible) {
    for (let row = 0; row < rowCount; row++) {
      if (result.every((col) => col[row] === JOKER_SYMBOL_ID)) {
        const replacementColumn = Math.floor(Math.random() * reelCount);
        result[replacementColumn][row] = randomItem(otherSymbols).id;
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
  if (new Set(definitions.map((symbol) => symbol.id)).size < 2) {
    throw new Error("Guaranteed wins need at least two available symbols to keep other rows non-winning.");
  }

  const result = createRandomResult(definitions, reelCount, rowCount, jokerWinEligible);
  const winningSymbol = nextGuaranteedWinSymbol(definitions, jokerWinEligible);

  // Use the middle line, choosing the lower of the two middle lines for four rows.
  const winningRow = Math.floor(rowCount / 2);

  for (let col = 0; col < reelCount; col++) {
    result[col][winningRow] = winningSymbol;
  }

  // The demo order should show one prize at a time. Keep every symbol available
  // as a filler, but break accidental wins outside the chosen line.
  for (let row = 0; row < rowCount; row++) {
    if (row === winningRow) continue;
    const rowSymbol = result[0][row];
    if (!result.every((col) => col[row] === rowSymbol)) continue;

    const otherSymbols = definitions.filter((symbol) => symbol.id !== rowSymbol);
    const replacementColumn = Math.floor(Math.random() * reelCount);
    result[replacementColumn][row] = randomItem(otherSymbols).id;
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
