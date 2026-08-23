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
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
