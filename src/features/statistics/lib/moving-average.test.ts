import { expect, it } from "vitest";

import { calculateMovingAverage } from "./moving-average";

it("calculates a trailing average from the last seven days", () => {
  expect(calculateMovingAverage([1, 0, 0, 0, 0, 0, 6, 2], 7)).toEqual([
    1,
    0.5,
    1 / 3,
    0.25,
    0.2,
    1 / 6,
    1,
    8 / 7,
  ]);
});

it("uses only available days before the window is full", () => {
  expect(calculateMovingAverage([2, 4], 7)).toEqual([2, 3]);
});

it("supports a one-day window", () => {
  expect(calculateMovingAverage([1, 0, 6], 1)).toEqual([1, 0, 6]);
});
