import type { SymbolDefinition, SymbolId } from "../types";
import { ROW_COUNT } from "./config";

export type SpinMode = "random" | "guaranteed-win";

let guaranteedWinCursor = 0;

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function nextGuaranteedWinSymbol(definitions: SymbolDefinition[]): SymbolId {
  const symbol = definitions[guaranteedWinCursor % definitions.length];
  guaranteedWinCursor++;
  return symbol.id;
}

export function createRandomResult(definitions: SymbolDefinition[], reelCount: number): SymbolId[][] {
  return Array.from({ length: reelCount }, () =>
    Array.from({ length: ROW_COUNT }, () => randomItem(definitions).id)
  );
}

export function createGuaranteedWinResult(definitions: SymbolDefinition[], reelCount: number): SymbolId[][] {
  const result = createRandomResult(definitions, reelCount);
  // Guaranteed wins always land on the center line.
  const winningRow = Math.floor(ROW_COUNT / 2);
  const winningSymbol = nextGuaranteedWinSymbol(definitions);

  for (let col = 0; col < reelCount; col++) {
    result[col][winningRow] = winningSymbol;
  }

  return result;
}

export function createSpinResult(mode: SpinMode, definitions: SymbolDefinition[], reelCount: number): SymbolId[][] {
  return mode === "guaranteed-win"
    ? createGuaranteedWinResult(definitions, reelCount)
    : createRandomResult(definitions, reelCount);
}
