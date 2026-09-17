import { initOptimizer } from "@open-spaced-repetition/binding/dynamic-wasi";
import wasmUrl from "@open-spaced-repetition/binding-wasm32-wasi/fsrs-binding.wasm32-wasi.wasm?url";
import WasiWorker from "@open-spaced-repetition/binding-wasm32-wasi/wasi-worker-browser.mjs?worker";

type ReviewRow = { question_id: string; reviewed_at: string; rating: number };

export async function optimizeFsrsParameters(rows: ReviewRow[]) {
  const binding = await initOptimizer({
    wasm: wasmUrl,
    worker: () => new WasiWorker(),
  });
  const grouped = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const reviews = grouped.get(row.question_id) ?? [];
    reviews.push(row);
    grouped.set(row.question_id, reviews);
  }
  const items = [...grouped.values()].map((reviews) => {
    let previous: Date | null = null;
    return new binding.FSRSBindingItem(
      reviews.map((review) => {
        const current = new Date(review.reviewed_at);
        const delta = previous
          ? Math.max(
              0,
              Math.round((current.getTime() - previous.getTime()) / 86_400_000),
            )
          : 0;
        previous = current;
        return new binding.FSRSBindingReview(review.rating, delta);
      }),
    );
  });
  return binding.computeParameters(items, {
    enableShortTerm: true,
    numRelearningSteps: 1,
    timeout: 120_000,
  });
}
