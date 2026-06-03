import { ROW_COUNT } from "./config";
import type { SymbolId } from "../types";

export function checkHorizontalWins(result: SymbolId[][]): number[] {
  const winRows: number[] = [];
  for (let row = 0; row < ROW_COUNT; row++) {
    if (isHorizontalWin(result, row)) winRows.push(row);
  }
  return winRows;
}

function isHorizontalWin(result: SymbolId[][], row: number): boolean {
  const first = result[0][row];
  return result.every((col) => col[row] === first);
}
