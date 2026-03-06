import type { Tile } from "@changshu-mahjong/shared";

const tileAssetModules = import.meta.glob("./assets/mahjong/*.{png,svg,webp,jpg,jpeg}", {
  eager: true,
  import: "default"
}) as Record<string, string>;

const tileAssetMap = new Map<string, string>();

for (const [modulePath, assetUrl] of Object.entries(tileAssetModules)) {
  const filename = modulePath.split("/").pop();
  if (!filename) {
    continue;
  }
  tileAssetMap.set(filename, assetUrl);
}

export function getTileAssetUrl(tile: Tile): string | null {
  for (const candidate of createTileAssetCandidates(tile)) {
    const assetUrl = tileAssetMap.get(candidate);
    if (assetUrl) {
      return assetUrl;
    }
  }

  return null;
}

function createTileAssetCandidates(tile: Tile): string[] {
  const baseNames = [getPrimaryAssetBaseName(tile), tile.code];
  const extensions = ["png", "svg", "webp", "jpg", "jpeg"];
  return baseNames.flatMap((baseName) => extensions.map((extension) => `${baseName}.${extension}`));
}

function getPrimaryAssetBaseName(tile: Tile): string {
  if (tile.suit === "wind") {
    return `wind-${["east", "south", "west", "north"][tile.rank - 1] ?? tile.rank}`;
  }

  if (tile.suit === "dragon") {
    return `dragon-${["red", "green", "white"][tile.rank - 1] ?? tile.rank}`;
  }

  return `${tile.suit}-${tile.rank}`;
}

