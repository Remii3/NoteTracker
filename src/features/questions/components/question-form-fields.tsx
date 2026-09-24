import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTION_CONTENT_MAX_LENGTH,
  QUESTION_EXPLANATION_MAX_LENGTH,
  QUESTION_OPTION_MAX_COUNT,
  QUESTION_OPTION_MAX_LENGTH,
  setQuestionOptions,
  type QuestionFormValue,
} from "../model/question-form";

type Props = {
  value: QuestionFormValue;
  onChange: (value: QuestionFormValue) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function QuestionFormFields({
  value,
  onChange,
  disabled = false,
  idPrefix = "question",
}: Props) {
  function updateOption(
    index: number,
    update: Partial<(typeof value.options)[number]>,
  ) {
    onChange(
      setQuestionOptions(
        value,
        value.options.map((option, optionIndex) =>
          optionIndex === index ? { ...option, ...update } : option,
        ),
      ),
    );
  }

  function removeOption(index: number) {
    const options = value.options.filter(
      (_, optionIndex) => optionIndex !== index,
    );
    if (!options.some((option) => option.isCorrect) && options[0]) {
      options[0] = { ...options[0], isCorrect: true };
    }
    onChange(setQuestionOptions(value, options));
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-2">
        <span className="font-medium">Pytanie</span>
        <Textarea
          className="min-h-24"
          maxLength={QUESTION_CONTENT_MAX_LENGTH}
          value={value.content}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, content: event.target.value })
          }
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Odpowiedzi</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              disabled || value.options.length >= QUESTION_OPTION_MAX_COUNT
            }
            onClick={() =>
              onChange(
                setQuestionOptions(value, [
                  ...value.options,
                  { content: "", isCorrect: false },
                ]),
              )
            }
          >
            <Plus /> Dodaj odpowiedź
          </Button>
        </div>
        {value.options.map((option, index) => (
          <div key={index} className="flex items-start gap-2">
            <input
              className="mt-3"
              type="radio"
              name={`${idPrefix}-correct`}
              checked={option.isCorrect}
              disabled={disabled}
              aria-label={`Odpowiedź ${index + 1} jest poprawna`}
              onChange={() =>
                onChange(
                  setQuestionOptions(
                    value,
                    value.options.map((item, optionIndex) => ({
                      ...item,
                      isCorrect: optionIndex === index,
                    })),
                  ),
                )
              }
            />
            <Textarea
              className="min-h-20"
              maxLength={QUESTION_OPTION_MAX_LENGTH}
              aria-label={`Odpowiedź ${index + 1}`}
              value={option.content}
              disabled={disabled}
              onChange={(event) =>
                updateOption(index, { content: event.target.value })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled || value.options.length <= 1}
              aria-label={`Usuń odpowiedź ${index + 1}`}
              onClick={() => removeOption(index)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          {value.options.length >= 2
            ? "Materiał będzie dostępny jako fiszka i pytanie testowe."
            : "Materiał będzie dostępny tylko jako fiszka."}
        </p>
      </div>

      <label className="block space-y-2">
        <span className="font-medium">
          Wyjaśnienie{" "}
          <span className="text-muted-foreground">(opcjonalne)</span>
        </span>
        <Textarea
          className="min-h-20"
          maxLength={QUESTION_EXPLANATION_MAX_LENGTH}
          value={value.explanation}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, explanation: event.target.value })
          }
        />
      </label>
    </div>
  );
}
