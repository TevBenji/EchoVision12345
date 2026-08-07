import { describe, it, expect } from 'vitest';
import {
  stabilizeDetections,
  prioritizeCenterDetections,
  normalizeObjectLabel,
} from './mobileDetectionHelper';
import type { DetectedObject } from '@/components/vision/ObjectDetection';

const obj = (
  id: number,
  label: string,
  x: number,
  y: number,
  confidence = 0.9,
): DetectedObject => ({
  id,
  label,
  confidence,
  bbox: { x, y, width: 0.1, height: 0.1 },
});

describe('stabilizeDetections', () => {
  it('passes detections through when there is no previous frame', () => {
    const current = [obj(1, 'person', 0.5, 0.5)];
    expect(stabilizeDetections(current, [])).toEqual(current);
    expect(stabilizeDetections(current)).toEqual(current);
  });

  it('blends position 60/40 with a matching previous detection', () => {
    const current = [obj(1, 'person', 0.5, 0.5)];
    const previous = [obj(1, 'person', 0.4, 0.4)];

    const [result] = stabilizeDetections(current, previous);

    // 0.5 * 0.6 + 0.4 * 0.4 = 0.46
    expect(result.bbox.x).toBeCloseTo(0.46);
    expect(result.bbox.y).toBeCloseTo(0.46);
  });

  it('does not blend across different labels', () => {
    const current = [obj(1, 'person', 0.5, 0.5)];
    const previous = [obj(2, 'chair', 0.5, 0.5)];

    expect(stabilizeDetections(current, previous)[0].bbox.x).toBe(0.5);
  });

  it('does not blend when the previous box is beyond the 0.15 tolerance', () => {
    const current = [obj(1, 'person', 0.5, 0.5)];
    const previous = [obj(1, 'person', 0.9, 0.9)];

    expect(stabilizeDetections(current, previous)[0].bbox.x).toBe(0.5);
  });

  it('keeps the higher confidence of the two frames', () => {
    const current = [obj(1, 'person', 0.5, 0.5, 0.6)];
    const previous = [obj(1, 'person', 0.5, 0.5, 0.95)];

    expect(stabilizeDetections(current, previous)[0].confidence).toBe(0.95);
  });
});

describe('prioritizeCenterDetections', () => {
  it('leaves three or fewer detections untouched', () => {
    const few = [obj(1, 'a', 0.9, 0.9), obj(2, 'b', 0.1, 0.1)];
    expect(prioritizeCenterDetections(few)).toEqual(few);
  });

  it('ranks the most central detection first', () => {
    const detections = [
      obj(1, 'far-corner', 0.95, 0.95),
      obj(2, 'edge', 0.8, 0.2),
      obj(3, 'centre', 0.45, 0.45),
      obj(4, 'other-edge', 0.1, 0.7),
    ];

    expect(prioritizeCenterDetections(detections)[0].label).toBe('centre');
  });
});

describe('normalizeObjectLabel', () => {
  it('falls back to "object" for empty or whitespace input', () => {
    expect(normalizeObjectLabel('')).toBe('object');
    expect(normalizeObjectLabel('   ')).toBe('object');
  });

  it('returns a non-empty label for known COCO classes', () => {
    for (const label of ['person', 'car', 'dog', 'chair']) {
      expect(normalizeObjectLabel(label)).toBeTruthy();
    }
  });

  it('does not throw on labels outside the map', () => {
    expect(() => normalizeObjectLabel('flux capacitor')).not.toThrow();
    expect(normalizeObjectLabel('flux capacitor')).toBeTruthy();
  });
});
