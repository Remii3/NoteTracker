import type { Chapter, NoteContent } from "../model/types";

function textDocument(text: string): NoteContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      },
    ],
  };
}

export const initialChapters: Chapter[] = [
  {
    id: "chapter-python",
    slug: "python",
    title: "Python",
    position: 1000,
    topicsCount: 3,
    completedTopicsCount: 2,
    firstIncompleteTopicId: "topic-async",
    firstIncompleteTopicSlug: "async-i-await",
    topicsStatus: "loaded",
    topics: [
      {
        id: "topic-basics",
        slug: "podstawy",
        title: "Podstawy",
        content: textDocument("Typy danych, instrukcje warunkowe i pętle."),
        completed: true,
        position: 1000,
      },
      {
        id: "topic-functions",
        slug: "funkcje",
        title: "Funkcje",
        content: textDocument(
          "Argumenty pozycyjne, nazwane oraz wartości domyślne.",
        ),
        completed: true,
        position: 2000,
      },
      {
        id: "topic-async",
        slug: "async-i-await",
        title: "Async i await",
        content: textDocument(
          "Async/await pozwala zapisywać kod asynchroniczny w czytelnej formie. Tutaj pojawią się właściwe notatki użytkownika.",
        ),
        completed: false,
        position: 3000,
      },
    ],
  },
  {
    id: "chapter-sql",
    slug: "sql",
    title: "SQL",
    position: 2000,
    topicsCount: 2,
    completedTopicsCount: 0,
    firstIncompleteTopicId: "topic-select",
    firstIncompleteTopicSlug: "select",
    topicsStatus: "loaded",
    topics: [
      {
        id: "topic-select",
        slug: "select",
        title: "SELECT",
        content: textDocument("Wybieranie i filtrowanie danych."),
        completed: false,
        position: 1000,
      },
      {
        id: "topic-joins",
        slug: "join",
        title: "JOIN",
        content: textDocument("Łączenie rekordów z wielu tabel."),
        completed: false,
        position: 2000,
      },
    ],
  },
];
