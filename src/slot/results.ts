import type { SymbolDefinition, SymbolId } from "../types";
import { REEL_COUNT, ROW_COUNT } from "./config";

export type SpinMode = "random" | "guaranteed-win";

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function createRandomResult(definitions: SymbolDefinition[]): SymbolId[][] {
  return Array.from({ length: REEL_COUNT }, () =>
    Array.from({ length: ROW_COUNT }, () => randomItem(definitions).id)
  );
}

export function createGuaranteedWinResult(definitions: SymbolDefinition[]): SymbolId[][] {
  const result = createRandomResult(definitions);
  const winningRow = Math.floor(Math.random() * ROW_COUNT);
  const winningSymbol = randomItem(definitions).id;

  for (let col = 0; col < REEL_COUNT; col++) {
    result[col][winningRow] = winningSymbol;
  }

  return result;
}

export function createSpinResult(mode: SpinMode, definitions: SymbolDefinition[]): SymbolId[][] {
  return mode === "guaranteed-win"
    ? createGuaranteedWinResult(definitions)
    : createRandomResult(definitions);
}
