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
      get_learning_summary: {
        Args: Record<never, never>;
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
