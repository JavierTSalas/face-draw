// Named MediaPipe face-mesh landmark indices and ordered contours.
// Full map: https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png
import {
  FACE_OVAL_EDGES,
  LEFT_EYE_EDGES,
  LIPS_EDGES,
  RIGHT_EYE_EDGES,
} from './topology';

/**
 * "Left"/"right" below are the SUBJECT's left/right (MediaPipe convention).
 * Face exposes screen-space helpers (eyeL/eyeR = screen left/right) so most
 * effects never need to think about mirroring.
 */
export const LM = {
  foreheadTop: 10,
  chin: 152,
  noseTip: 1,
  noseBridge: 168,
  betweenBrows: 9,
  upperLipInner: 13,
  lowerLipInner: 14,
  upperLipOuter: 0,
  lowerLipOuter: 17,
  mouthCornerRight: 61,
  mouthCornerLeft: 291,
  cheekRight: 234,
  cheekLeft: 454,
  irisRight: 468,
  irisLeft: 473,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  eyeRightTop: 159,
  eyeRightBottom: 145,
  eyeLeftTop: 386,
  eyeLeftBottom: 374,
  browRight: 105,
  browLeft: 334,
  templeRight: 127,
  templeLeft: 356,
} as const;

/** Turn an edge list that forms a closed loop into an ordered ring of indices. */
export function ringFromEdges(edges: Uint16Array): number[] {
  const next = new Map<number, number>();
  for (let i = 0; i < edges.length; i += 2) next.set(edges[i], edges[i + 1]);
  const start = edges[0];
  const ring = [start];
  let cur = next.get(start);
  while (cur !== undefined && cur !== start && ring.length <= next.size) {
    ring.push(cur);
    cur = next.get(cur);
  }
  return ring;
}

/** Ordered face outline, starting at the top of the forehead, going around. */
export const FACE_OVAL = ringFromEdges(FACE_OVAL_EDGES);

/** Outer lips ring (first half of the LIPS set forms the outer contour). */
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
export const RIGHT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const LEFT_EYE_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

export { FACE_OVAL_EDGES, LIPS_EDGES, LEFT_EYE_EDGES, RIGHT_EYE_EDGES };
