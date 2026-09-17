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
      modules: {
        Row: {
          id: string;
          is_pinned: boolean;
          user_id: string;
          slug: string;
          name: string;
          position: number;
          created_at: string;
          exam_date: string | null;
          trash_id: string | null;
        };
        Insert: {
          id?: string;
          is_pinned?: boolean;
          user_id: string;
          slug?: string;
          name: string;
          position: number;
          created_at?: string;
          exam_date?: string | null;
          trash_id?: string | null;
        };
        Update: {
          is_pinned?: boolean;
          slug?: string;
          name?: string;
          position?: number;
          exam_date?: string | null;
          trash_id?: string | null;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          user_id: string;
          module_id: string;
          chapter_id: string | null;
          topic_id: string | null;
          content: string;
          explanation: string | null;
          created_at: string;
          updated_at: string;
          trash_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          module_id: string;
          chapter_id?: string | null;
          topic_id?: string | null;
          content: string;
          explanation?: string | null;
          trash_id?: string | null;
        };
        Update: {
          module_id?: string;
          chapter_id?: string | null;
          topic_id?: string | null;
          content?: string;
          explanation?: string | null;
          updated_at?: string;
          trash_id?: string | null;
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
          module_id: string;
          mode: "flashcards" | "test";
          status: "in_progress" | "completed" | "abandoned";
          configuration: Json;
          started_at: string;
          completed_at: string | null;
          trash_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          module_id: string;
          mode: "flashcards" | "test";
          status?: "in_progress" | "completed" | "abandoned";
          configuration?: Json;
          trash_id?: string | null;
        };
        Update: {
          status?: "in_progress" | "completed" | "abandoned";
          completed_at?: string | null;
          trash_id?: string | null;
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
          chapter_id_snapshot: string | null;
          topic_id_snapshot: string | null;
          chapter_title_snapshot: string | null;
          topic_title_snapshot: string | null;
          active_duration_seconds: number;
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
          chapter_id_snapshot?: string | null;
          topic_id_snapshot?: string | null;
          chapter_title_snapshot?: string | null;
          topic_title_snapshot?: string | null;
          active_duration_seconds?: number;
        };
        Update: {
          selected_option_id?: string | null;
          result?: "remembered" | "forgotten" | "correct" | "incorrect" | null;
          answered_at?: string | null;
          active_duration_seconds?: number;
        };
        Relationships: [];
      };
      study_goals: {
        Row: {
          last_review_reminder_at: string | null;
          review_reminder_interval_days: number;
          review_reminders_enabled: boolean;
          user_id: string;
          weekly_minutes: number;
          weekly_topics: number;
          weekly_topics_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          last_review_reminder_at?: string | null;
          review_reminder_interval_days?: number;
          review_reminders_enabled?: boolean;
          user_id: string;
          weekly_minutes?: number;
          weekly_topics?: number;
          weekly_topics_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          last_review_reminder_at?: string | null;
          review_reminder_interval_days?: number;
          review_reminders_enabled?: boolean;
          weekly_minutes?: number;
          weekly_topics?: number;
          weekly_topics_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      study_task_deferrals: {
        Row: {
          user_id: string;
          task_type: "question" | "topic";
          task_id: string;
          deferred_until: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          task_type: "question" | "topic";
          task_id: string;
          deferred_until: string;
          updated_at?: string;
        };
        Update: {
          deferred_until?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          module_id: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
          trash_id: string | null;
        };
        Insert: {
          id?: string;
          module_id: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
          trash_id?: string | null;
        };
        Update: {
          id?: string;
          module_id?: string;
          position?: number;
          slug?: string;
          title?: string;
          user_id?: string;
          trash_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_module_owner_fkey";
            columns: ["module_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      topics: {
        Row: {
          chapter_id: string;
          completed: boolean;
          first_completed_at: string | null;
          content: Json;
          id: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
          trash_id: string | null;
        };
        Insert: {
          chapter_id: string;
          completed?: boolean;
          first_completed_at?: string | null;
          content?: Json;
          id?: string;
          position: number;
          slug: string;
          title: string;
          user_id: string;
          trash_id?: string | null;
        };
        Update: {
          chapter_id?: string;
          completed?: boolean;
          first_completed_at?: string | null;
          content?: Json;
          id?: string;
          position?: number;
          slug?: string;
          title?: string;
          user_id?: string;
          trash_id?: string | null;
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
      trash_items: {
        Row: {
          id: string;
          user_id: string;
          item_type:
            | "module"
            | "chapter"
            | "topic"
            | "image"
            | "question"
            | "study_session";
          item_id: string;
          title: string;
          deleted_at: string;
          purge_after: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_chapter_with_topics: {
        Args: {
          target_module_id: string;
          new_chapter: Json;
          new_topics: Json;
        };
        Returns: undefined;
      };
      import_docx_module: {
        Args: {
          imported_chapters: Json;
          target_name: string;
          target_position: number;
        };
        Returns: string;
      };
      get_module_summaries: {
        Args: {
          target_module_id?: string | null;
          target_module_slug?: string | null;
        };
        Returns: {
          id: string;
          is_pinned: boolean;
          slug: string;
          name: string;
          module_position: number;
          chapters_count: number;
          completed_chapters_count: number;
          topics_count: number;
          completed_topics_count: number;
        }[];
      };
      get_progress_statistics: {
        Args: {
          target_module_id?: string | null;
          range_days?: number;
          timezone_name?: string;
        };
        Returns: Json;
      };
      get_progress_overview_statistics: {
        Args: {
          target_module_id?: string | null;
          range_days?: number;
          timezone_name?: string;
        };
        Returns: Json;
      };
      get_progress_topics_page: {
        Args: {
          target_module_id: string;
          sort_mode?: string;
          page_size?: number;
          after_sort_rank?: number;
          after_chapter_position?: number;
          after_topic_position?: number;
          after_topic_id?: string;
          completion_filter?: string;
        };
        Returns: {
          topic_id: string;
          chapter_id: string;
          chapter_title: string;
          title: string;
          completed: boolean;
          first_completed_at: string | null;
          sort_rank: number;
          chapter_position: number;
          topic_position: number;
        }[];
      };
      move_to_trash: {
        Args: { target_type: string; target_id: string };
        Returns: string;
      };
      move_notes_to_trash: {
        Args: { chapter_ids: string[]; topic_ids: string[] };
        Returns: undefined;
      };
      restore_trash_item: {
        Args: { target_trash_id: string };
        Returns: undefined;
      };
      purge_trash_item: {
        Args: { target_trash_id: string };
        Returns: undefined;
      };
      get_trash_image_keys: {
        Args: { target_trash_id: string };
        Returns: { storage_key: string }[];
      };
      list_trash_items_page: {
        Args: {
          page_cursor_deleted_at?: string | null;
          page_cursor_id?: string | null;
          requested_page_size?: number;
        };
        Returns: Array<{
          id: string;
          item_type:
            | "module"
            | "chapter"
            | "topic"
            | "image"
            | "question"
            | "study_session";
          item_id: string;
          title: string;
          deleted_at: string;
          purge_after: string;
          source_path: string[];
          tree: Json;
          total_count: number;
        }>;
      };
      restore_trash_node: {
        Args: {
          target_trash_id: string;
          target_node_type: string;
          target_node_id: string;
        };
        Returns: undefined;
      };
      delete_notes_bulk: {
        Args: {
          chapter_ids: string[];
          topic_ids: string[];
        };
        Returns: Json;
      };
      delete_empty_module: {
        Args: { target_module_id: string };
        Returns: undefined;
      };
      delete_module_cascade: {
        Args: { target_module_id: string };
        Returns: undefined;
      };
      get_module_image_keys: {
        Args: { target_module_id: string };
        Returns: { storage_key: string }[];
      };
      get_module_gallery_images: {
        Args: {
          target_module_id: string;
          sort_mode: string;
          page_offset?: number;
          page_limit?: number;
        };
        Returns: Array<{
          id: string;
          topic_id: string;
          storage_key: string;
          original_filename: string;
          format: string;
          width: number;
          height: number;
          bytes: number;
          image_position: number;
          topic_title: string;
          topic_slug: string;
          chapter_id: string;
          chapter_title: string;
          chapter_slug: string;
        }>;
      };
      get_module_gallery_sections: {
        Args: {
          target_module_id: string;
          sort_mode: string;
          per_chapter_limit?: number;
          chapter_offset?: number;
          chapter_limit?: number;
        };
        Returns: Json;
      };
      get_chapter_gallery_images: {
        Args: {
          target_module_id: string;
          target_chapter_id: string;
          page_offset?: number;
          page_limit?: number;
        };
        Returns: Json;
      };
      get_question_bank_availability: {
        Args: {
          target_module_id: string;
          selected_chapter_id?: string | null;
          selected_topic_id?: string | null;
          only_unassigned?: boolean;
        };
        Returns: Json;
      };
      create_study_session: {
        Args: {
          target_module_id: string;
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
          target_module_id: string;
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
        Args: { target_module_id: string };
        Returns: Json;
      };
      get_learning_summary: {
        Args: { target_module_id: string };
        Returns: Json;
      };
      get_study_statistics: {
        Args: {
          target_module_id?: string | null;
          range_days?: number;
          study_mode?: string | null;
          timezone_name?: string;
        };
        Returns: Json;
      };
      get_topic_navigation: {
        Args: { target_module_id: string; current_topic_id: string };
        Returns: Json;
      };
      get_today_dashboard: {
        Args: { timezone_name?: string };
        Returns: Json;
      };
      save_topic_content: {
        Args: {
          target_chapter_id: string;
          target_topic_id: string;
          new_content: Json;
          expected_content: Json;
        };
        Returns: boolean;
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
      reorder_modules: {
        Args: { module_ids: string[] };
        Returns: undefined;
      };
      reorder_topic_images: {
        Args: { target_topic_id: string; image_ids: string[] };
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
