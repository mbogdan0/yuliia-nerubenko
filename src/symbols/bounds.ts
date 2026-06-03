import { MeshAttachment, RegionAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import type { SymbolDefinition } from "../types";

const SKELETON_BOUNDS_VERTEX_CAPACITY = 4096;
const FALLBACK_VISIBLE_SKELETON_BOUNDS = { x: -150, y: -150, width: 300, height: 300 };
// Reused across every call. Safe because JS is single-threaded and this function never recurses.
const scratchVertices = new Float32Array(SKELETON_BOUNDS_VERTEX_CAPACITY);
const symbolBoundsCache = new Map<string, SkeletonBounds>();

export type SkeletonBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getVisibleSkeletonBounds(spine: Spine, fitSlots?: ReadonlySet<string>): SkeletonBounds {
  const vertices = scratchVertices;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const slot of spine.skeleton.slots) {
    if (fitSlots && !fitSlots.has(slot.data.name)) {
      continue;
    }

    const attachment = slot.appliedPose.attachment;
    if (!attachment) {
      continue;
    }

    let vertexCount = 0;

    if (attachment instanceof RegionAttachment) {
      attachment.computeWorldVertices(slot, attachment.getOffsets(slot.appliedPose), vertices, 0, 2);
      vertexCount = 8;
    } else if (attachment instanceof MeshAttachment) {
      if (attachment.worldVerticesLength > vertices.length) {
        continue;
      }
      attachment.computeWorldVertices(spine.skeleton, slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
      vertexCount = attachment.worldVerticesLength;
    }

    for (let index = 0; index < vertexCount; index += 2) {
      minX = Math.min(minX, vertices[index]);
      minY = Math.min(minY, vertices[index + 1]);
      maxX = Math.max(maxX, vertices[index]);
      maxY = Math.max(maxY, vertices[index + 1]);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { ...FALLBACK_VISIBLE_SKELETON_BOUNDS };
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getCachedSymbolBounds(symbol: SymbolDefinition, spine: Spine): SkeletonBounds {
  const cachedBounds = symbolBoundsCache.get(symbol.id);
  if (cachedBounds) {
    return cachedBounds;
  }

  const bounds = getVisibleSkeletonBounds(spine, symbol.fitSlotsSet);
  symbolBoundsCache.set(symbol.id, bounds);
  return bounds;
}
