export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      flashcards: {
        Row: {
          id: string;
          user_id: string;
          topic_id: string;
          question: string;
          answer: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          topic_id: string;
          question: string;
          answer: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { question?: string; answer?: string; updated_at?: string };
        Relationships: [];
      };
      flashcard_sessions: {
        Row: {
          id: string;
          user_id: string;
          mode: "chapter" | "all" | "random_chapters" | "retry";
          status: "in_progress" | "completed" | "abandoned";
          configuration: Json;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          mode: "chapter" | "all" | "random_chapters" | "retry";
          status?: "in_progress" | "completed" | "abandoned";
          configuration?: Json;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          status?: "in_progress" | "completed" | "abandoned";
          completed_at?: string | null;
        };
        Relationships: [];
      };
      flashcard_session_items: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          flashcard_id: string | null;
          position: number;
          question_snapshot: string;
          answer_snapshot: string;
          result: "remembered" | "forgotten" | null;
          answered_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          flashcard_id?: string | null;
          position: number;
          question_snapshot: string;
          answer_snapshot: string;
          result?: "remembered" | "forgotten" | null;
          answered_at?: string | null;
        };
        Update: {
          result?: "remembered" | "forgotten" | null;
          answered_at?: string | null;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
        };
        Update: {
          id?: string;
          position?: number;
          slug?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          chapter_id: string;
          completed: boolean;
          content: Json;
          id: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
        };
        Insert: {
          chapter_id: string;
          completed?: boolean;
          content?: Json;
          id?: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
        };
        Update: {
          chapter_id?: string;
          completed?: boolean;
          content?: Json;
          id?: string;
          position?: number;
          slug?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_flashcard_session: {
        Args: {
          session_mode: string;
          selected_chapter_id?: string | null;
          random_chapter_count?: number;
          requested_card_count?: number | null;
        };
        Returns: string;
      };
      get_chapter_summaries: {
        Args: Record<never, never>;
        Returns: Json;
      };
      get_learning_summary: {
        Args: Record<never, never>;
        Returns: Json;
      };
      get_topic_navigation: {
        Args: { current_topic_id: string };
        Returns: Json;
      };
      move_topic: {
        Args: {
          moved_topic_id: string;
          source_chapter_id: string;
          source_topic_ids: string[];
          target_chapter_id: string;
          target_slug: string;
          target_topic_ids: string[];
        };
        Returns: undefined;
      };
      reorder_chapters: {
        Args: { chapter_ids: string[] };
        Returns: undefined;
      };
      reorder_topics: {
        Args: { target_chapter_id: string; topic_ids: string[] };
        Returns: undefined;
      };
      retry_flashcard_session: {
        Args: { source_session_id: string };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
