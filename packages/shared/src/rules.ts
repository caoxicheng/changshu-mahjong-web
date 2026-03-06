import { ROOM_CAPACITY } from "./constants.js";
import type { Tile } from "./types.js";

const SUIT_BASE: Record<string, number> = {
  wan: 0,
  tong: 9,
  tiao: 18,
  wind: 27,
  dragon: 31
};

const INDEX_TO_CODE: Array<{ suit: Tile["suit"]; rank: number }> = [
  ...Array.from({ length: 9 }, (_, index) => ({ suit: "wan" as const, rank: index + 1 })),
  ...Array.from({ length: 9 }, (_, index) => ({ suit: "tong" as const, rank: index + 1 })),
  ...Array.from({ length: 9 }, (_, index) => ({ suit: "tiao" as const, rank: index + 1 })),
  ...Array.from({ length: 4 }, (_, index) => ({ suit: "wind" as const, rank: index + 1 })),
  ...Array.from({ length: 3 }, (_, index) => ({ suit: "dragon" as const, rank: index + 1 }))
];

export function createWall(): Tile[] {
  const tiles: Tile[] = [];
  let tileSerial = 0;

  for (const entry of INDEX_TO_CODE) {
    const code = `${entry.suit}-${entry.rank}`;
    for (let copy = 0; copy < ROOM_CAPACITY; copy += 1) {
      tileSerial += 1;
      tiles.push({
        id: `tile-${tileSerial}`,
        suit: entry.suit,
        rank: entry.rank,
        code
      });
    }
  }

  return shuffle(tiles);
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((left, right) => tileToIndex(left) - tileToIndex(right) || left.id.localeCompare(right.id));
}

export function canClaimPong(hand: Tile[], tile: Tile): boolean {
  return hand.filter((candidate) => candidate.code === tile.code).length >= 2;
}

export function canClaimMingKong(hand: Tile[], tile: Tile): boolean {
  return hand.filter((candidate) => candidate.code === tile.code).length >= 3;
}

export function canHuWithTile(hand: Tile[], tile: Tile): boolean {
  return canHu([...hand, tile]);
}

export function canHu(hand: Tile[]): boolean {
  if (hand.length % 3 !== 2) {
    return false;
  }

  const counts = Array.from({ length: 34 }, () => 0);
  for (const tile of hand) {
    counts[tileToIndex(tile)] += 1;
  }

  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] < 2) {
      continue;
    }

    counts[index] -= 2;
    if (canMakeMelds(counts, 0)) {
      counts[index] += 2;
      return true;
    }
    counts[index] += 2;
  }

  return false;
}

function canMakeMelds(counts: number[], startIndex: number): boolean {
  let index = startIndex;
  while (index < counts.length && counts[index] === 0) {
    index += 1;
  }

  if (index === counts.length) {
    return true;
  }

  if (counts[index] >= 3) {
    counts[index] -= 3;
    if (canMakeMelds(counts, index)) {
      counts[index] += 3;
      return true;
    }
    counts[index] += 3;
  }

  const tileInfo = INDEX_TO_CODE[index];
  const canSequence = tileInfo.suit === "wan" || tileInfo.suit === "tong" || tileInfo.suit === "tiao";

  if (canSequence && tileInfo.rank <= 7 && counts[index + 1] > 0 && counts[index + 2] > 0) {
    counts[index] -= 1;
    counts[index + 1] -= 1;
    counts[index + 2] -= 1;
    if (canMakeMelds(counts, index)) {
      counts[index] += 1;
      counts[index + 1] += 1;
      counts[index + 2] += 1;
      return true;
    }
    counts[index] += 1;
    counts[index + 1] += 1;
    counts[index + 2] += 1;
  }

  return false;
}

function tileToIndex(tile: Tile): number {
  return SUIT_BASE[tile.suit] + tile.rank - 1;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
