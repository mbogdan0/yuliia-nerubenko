import type { SymbolId } from "../types";

export function checkHorizontalWins(result: SymbolId[][]): number[] {
  const winRows: number[] = [];
  for (let row = 0; row < (result[0]?.length ?? 0); row++) {
    if (isHorizontalWin(result, row)) winRows.push(row);
  }
  return winRows;
}

export function checkHorizontalSymbolRows(result: SymbolId[][], symbolId: SymbolId): number[] {
  const rows: number[] = [];
  for (let row = 0; row < (result[0]?.length ?? 0); row++) {
    if (result.every((col) => col[row] === symbolId)) rows.push(row);
  }
  return rows;
}

function isHorizontalWin(result: SymbolId[][], row: number): boolean {
  const first = result[0][row];
  return result.every((col) => col[row] === first);
}
