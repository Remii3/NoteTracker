export function calculateMovingAverage(
  values: number[],
  windowSize: number,
) {
  const size = Math.max(1, Math.floor(windowSize));
  let sum = 0;

  return values.map((value, index) => {
    sum += value;
    if (index >= size) sum -= values[index - size];

    return sum / Math.min(index + 1, size);
  });
}
