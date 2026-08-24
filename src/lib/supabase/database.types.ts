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
      questions: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string | null;
          topic_id: string | null;
          content: string;
          explanation: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id?: string | null;
          topic_id?: string | null;
          content: string;
          explanation?: string | null;
        };
        Update: {
          chapter_id?: string | null;
          topic_id?: string | null;
          content?: string;
          explanation?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      question_options: {
        Row: {
          id: string;
          user_id: string;
          question_id: string;
          content: string;
          is_correct: boolean;
          position: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          question_id: string;
          content: string;
          is_correct?: boolean;
          position: number;
        };
        Update: { content?: string; is_correct?: boolean; position?: number };
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      study_sessions: {
        Row: {
          id: string;
          user_id: string;
          mode: "flashcards" | "test";
          status: "in_progress" | "completed" | "abandoned";
          configuration: Json;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          mode: "flashcards" | "test";
          status?: "in_progress" | "completed" | "abandoned";
          configuration?: Json;
        };
        Update: {
          status?: "in_progress" | "completed" | "abandoned";
          completed_at?: string | null;
        };
        Relationships: [];
      };
      study_session_items: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          question_id: string | null;
          position: number;
          question_snapshot: string;
          options_snapshot: Json;
          explanation_snapshot: string | null;
          selected_option_id: string | null;
          result: "remembered" | "forgotten" | "correct" | "incorrect" | null;
          answered_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          question_id?: string | null;
          position: number;
          question_snapshot: string;
          options_snapshot: Json;
          explanation_snapshot?: string | null;
        };
        Update: {
          selected_option_id?: string | null;
          result?: "remembered" | "forgotten" | "correct" | "incorrect" | null;
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
      get_question_bank_availability: {
        Args: {
          selected_chapter_id?: string | null;
          selected_topic_id?: string | null;
          only_unassigned?: boolean;
        };
        Returns: Json;
      };
      create_study_session: {
        Args: {
          study_mode: string;
          scope_mode: string;
          selected_chapter_id?: string | null;
          selected_topic_id?: string | null;
          random_chapter_count?: number;
          requested_question_count?: number | null;
        };
        Returns: string;
      };
      save_question: {
        Args: {
          question_id: string | null;
          question_content: string;
          question_explanation: string;
          selected_chapter_id: string | null;
          selected_topic_id: string | null;
          options: Json;
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
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
