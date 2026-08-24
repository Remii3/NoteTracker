import { Layers3 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FlashcardsRepository } from "../data/flashcards-repository";
import type { FlashcardMode } from "../model/types";
import type { Chapter } from "@/features/notes/model/types";

type Props = {
  chapters: Chapter[];
  repository: FlashcardsRepository;
  onOpenSession: (id: string) => void;
};

export function FlashcardsHome({ chapters, repository, onOpenSession }: Props) {
  const [mode, setMode] = useState<FlashcardMode>("chapter");
  const [chapterId, setChapterId] = useState(chapters[0]?.id ?? "");
  const [randomCount, setRandomCount] = useState("3");
  const [cardCount, setCardCount] = useState("20");
  const [creating, setCreating] = useState(false);

  async function start() {
    setCreating(true);
    try {
      const id = await repository.createSession({
        mode,
        chapterId: mode === "chapter" ? chapterId : undefined,
        randomChapterCount: Number(randomCount),
        cardCount: cardCount === "all" ? null : Number(cardCount),
      });
      onOpenSession(id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udało się rozpocząć sesji.",
      );
      setCreating(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-sm font-medium text-primary">MVP2 · Fiszki</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Rozpocznij naukę
        </h1>
        <p className="mt-3 text-muted-foreground">
          Wybierz zakres, odsłaniaj odpowiedzi i oznaczaj to, co już pamiętasz.
        </p>

        <section className="mt-8 space-y-6 rounded-2xl border p-6 sm:p-8">
          <div className="space-y-2">
            <span className="text-sm font-medium">Tryb pytań</span>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as FlashcardMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chapter">Pytania z rozdziału</SelectItem>
                <SelectItem value="all">
                  Pytania ze wszystkich rozdziałów
                </SelectItem>
                <SelectItem value="random_chapters">
                  Pytania z losowych rozdziałów
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "chapter" && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Rozdział</span>
              <Select
                value={chapterId}
                onValueChange={(value) => setChapterId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Wybierz rozdział" />
                </SelectTrigger>
                <SelectContent>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "random_chapters" && (
            <Choice
              label="Liczba losowych rozdziałów"
              value={randomCount}
              values={["1", "3", "5", "10"]}
              onChange={setRandomCount}
            />
          )}
          <Choice
            label="Liczba fiszek"
            value={cardCount}
            values={["10", "20", "50", "all"]}
            onChange={setCardCount}
          />

          <Button
            size="lg"
            className="w-full"
            disabled={creating || (mode === "chapter" && !chapterId)}
            onClick={() => void start()}
          >
            <Layers3 /> {creating ? "Tworzenie sesji…" : "Rozpocznij sesję"}
          </Button>
        </section>
      </div>
    </main>
  );
}

function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {values.map((item) => (
          <Button
            key={item}
            type="button"
            variant={value === item ? "default" : "outline"}
            onClick={() => onChange(item)}
          >
            {item === "all" ? "Wszystkie" : item}
          </Button>
        ))}
      </div>
    </div>
  );
}
