export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          content_es: string | null
          created_at: string | null
          created_by: string | null
          display_order: number | null
          guide_file_id: string | null
          id: string
          is_active: boolean | null
          link: string | null
          message: string | null
          priority: string | null
          thumbnail_shape: string | null
          thumbnail_url: string | null
          title: string
          title_es: string | null
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          content: string
          content_es?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          guide_file_id?: string | null
          id?: string
          is_active?: boolean | null
          link?: string | null
          message?: string | null
          priority?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          title: string
          title_es?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          content?: string
          content_es?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          guide_file_id?: string | null
          id?: string
          is_active?: boolean | null
          link?: string | null
          message?: string | null
          priority?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          title?: string
          title_es?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_guide_file_id_fkey"
            columns: ["guide_file_id"]
            isOneToOne: false
            referencedRelation: "guides_and_training"
            referencedColumns: ["id"]
          },
        ]
      }
      bartender_checklist_categories: {
        Row: {
          checklist_type: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          checklist_type: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          checklist_type?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bartender_checklist_items: {
        Row: {
          category_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          text: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          text: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bartender_checklist_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "bartender_checklist_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_categories: {
        Row: {
          checklist_type: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          checklist_type: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          checklist_type?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          category_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          text: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          text: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "checklist_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cocktails: {
        Row: {
          alcohol_type: string
          created_at: string | null
          created_by: string | null
          display_order: number | null
          id: string
          ingredients: string
          is_active: boolean | null
          name: string
          procedure: string | null
          procedure_es: string | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          alcohol_type: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          ingredients: string
          is_active?: boolean | null
          name: string
          procedure?: string | null
          procedure_es?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          alcohol_type?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          ingredients?: string
          is_active?: boolean | null
          name?: string
          procedure?: string | null
          procedure_es?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cocktails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_images: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          display_order: number
          id: string
          image_url: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          display_order?: number
          id?: string
          image_url: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          display_order?: number
          id?: string
          image_url?: string
        }
        Relationships: []
      }
      custom_notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          sent_by: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          sent_by: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          sent_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_notifications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          id: string
          start_time: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          id?: string
          start_time?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          id?: string
          start_time?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          bonus_bucks_value: number | null
          bucks_value: number | null
          category_label: string | null
          correct_option: string
          created_at: string | null
          exam_id: string
          id: string
          is_bonus: boolean
          option_a: string
          option_a_es: string | null
          option_b: string
          option_b_es: string | null
          option_c: string
          option_c_es: string | null
          option_d: string
          option_d_es: string | null
          question_image_url: string | null
          question_order: number
          question_text: string
          question_text_es: string | null
          source_table: string | null
          source_type: string
        }
        Insert: {
          bonus_bucks_value?: number | null
          bucks_value?: number | null
          category_label?: string | null
          correct_option: string
          created_at?: string | null
          exam_id: string
          id?: string
          is_bonus?: boolean
          option_a: string
          option_a_es?: string | null
          option_b: string
          option_b_es?: string | null
          option_c: string
          option_c_es?: string | null
          option_d: string
          option_d_es?: string | null
          question_image_url?: string | null
          question_order: number
          question_text: string
          question_text_es?: string | null
          source_table?: string | null
          source_type?: string
        }
        Update: {
          bonus_bucks_value?: number | null
          bucks_value?: number | null
          category_label?: string | null
          correct_option?: string
          created_at?: string | null
          exam_id?: string
          id?: string
          is_bonus?: boolean
          option_a?: string
          option_a_es?: string | null
          option_b?: string
          option_b_es?: string | null
          option_c?: string
          option_c_es?: string | null
          option_d?: string
          option_d_es?: string | null
          question_image_url?: string | null
          question_order?: number
          question_text?: string
          question_text_es?: string | null
          source_table?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          answers: Json
          bucks_awarded: number
          completed_at: string | null
          correct_count: number
          exam_id: string
          id: string
          is_timed_out: boolean
          started_at: string | null
          time_seconds: number
          total_questions: number
          user_id: string
        }
        Insert: {
          answers?: Json
          bucks_awarded?: number
          completed_at?: string | null
          correct_count?: number
          exam_id: string
          id?: string
          is_timed_out?: boolean
          started_at?: string | null
          time_seconds?: number
          total_questions?: number
          user_id: string
        }
        Update: {
          answers?: Json
          bucks_awarded?: number
          completed_at?: string | null
          correct_count?: number
          exam_id?: string
          id?: string
          is_timed_out?: boolean
          started_at?: string | null
          time_seconds?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_reward_dismissals: {
        Row: {
          dismissed_at: string | null
          exam_result_id: string
          id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          exam_result_id: string
          id?: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          exam_result_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_reward_dismissals_exam_result_id_fkey"
            columns: ["exam_result_id"]
            isOneToOne: false
            referencedRelation: "exam_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_reward_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          activated_at: string | null
          close_at: string | null
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          cycle_key: string
          exam_type: string
          id: string
          notify_on_activate: boolean | null
          rewards_enabled: boolean
          status: string
          time_limit_seconds: number
        }
        Insert: {
          activated_at?: string | null
          close_at?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          cycle_key: string
          exam_type: string
          id?: string
          notify_on_activate?: boolean | null
          rewards_enabled?: boolean
          status?: string
          time_limit_seconds?: number
        }
        Update: {
          activated_at?: string | null
          close_at?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          cycle_key?: string
          exam_type?: string
          id?: string
          notify_on_activate?: boolean | null
          rewards_enabled?: boolean
          status?: string
          time_limit_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string
          id: string
          is_deleted: boolean | null
          sender_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          is_deleted?: boolean | null
          sender_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_deleted?: boolean | null
          sender_id?: string
          title?: string
        }
        Relationships: []
      }
      game_scores: {
        Row: {
          completed: boolean
          created_at: string | null
          difficulty: number
          game_mode: string
          id: string
          lives_remaining: number
          pairs_matched: number
          play_mode: string
          score: number
          time_seconds: number | null
          total_pairs: number
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string | null
          difficulty?: number
          game_mode: string
          id?: string
          lives_remaining?: number
          pairs_matched: number
          play_mode?: string
          score?: number
          time_seconds?: number | null
          total_pairs: number
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string | null
          difficulty?: number
          game_mode?: string
          id?: string
          lives_remaining?: number
          pairs_matched?: number
          play_mode?: string
          score?: number
          time_seconds?: number | null
          total_pairs?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_reviews: {
        Row: {
          created_at: string | null
          created_by: string | null
          display_order: number | null
          guest_name: string
          id: string
          is_active: boolean | null
          rating: number
          review_date: string
          review_text: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          guest_name: string
          id?: string
          is_active?: boolean | null
          rating: number
          review_date: string
          review_text: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          guest_name?: string
          id?: string
          is_active?: boolean | null
          rating?: number
          review_date?: string
          review_text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guides_and_training: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          description_es: string | null
          display_order: number | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          is_active: boolean | null
          thumbnail_url: string | null
          title: string
          title_es: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          display_order?: number | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title: string
          title_es?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          display_order?: number | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title?: string
          title_es?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guides_and_training_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      libation_recipes: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          display_order: number | null
          garnish: string | null
          glassware: string | null
          id: string
          ingredients: Json | null
          is_active: boolean | null
          name: string
          price: string
          procedure: string | null
          procedure_es: string | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          garnish?: string | null
          glassware?: string | null
          id?: string
          ingredients?: Json | null
          is_active?: boolean | null
          name: string
          price: string
          procedure?: string | null
          procedure_es?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          garnish?: string | null
          glassware?: string | null
          id?: string
          ingredients?: Json | null
          is_active?: boolean | null
          name?: string
          price?: string
          procedure?: string | null
          procedure_es?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "libation_recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available_for_dinner: boolean | null
          available_for_lunch: boolean | null
          bottle_price: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          description_es: string | null
          display_order: number | null
          flavor_profile: string | null
          flavor_profile_es: string | null
          glass_price: string | null
          id: string
          is_active: boolean | null
          is_gluten_free: boolean | null
          is_gluten_free_available: boolean | null
          is_vegetarian: boolean | null
          is_vegetarian_available: boolean | null
          location: string | null
          location_es: string | null
          member_bottle_price: string | null
          name: string
          name_es: string | null
          price: string
          subcategory: string | null
          thumbnail_shape: string | null
          thumbnail_url: string | null
          unique_selling_points: string | null
          unique_selling_points_es: string | null
          updated_at: string | null
        }
        Insert: {
          available_for_dinner?: boolean | null
          available_for_lunch?: boolean | null
          bottle_price?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          display_order?: number | null
          flavor_profile?: string | null
          flavor_profile_es?: string | null
          glass_price?: string | null
          id?: string
          is_active?: boolean | null
          is_gluten_free?: boolean | null
          is_gluten_free_available?: boolean | null
          is_vegetarian?: boolean | null
          is_vegetarian_available?: boolean | null
          location?: string | null
          location_es?: string | null
          member_bottle_price?: string | null
          name: string
          name_es?: string | null
          price: string
          subcategory?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          unique_selling_points?: string | null
          unique_selling_points_es?: string | null
          updated_at?: string | null
        }
        Update: {
          available_for_dinner?: boolean | null
          available_for_lunch?: boolean | null
          bottle_price?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_es?: string | null
          display_order?: number | null
          flavor_profile?: string | null
          flavor_profile_es?: string | null
          glass_price?: string | null
          id?: string
          is_active?: boolean | null
          is_gluten_free?: boolean | null
          is_gluten_free_available?: boolean | null
          is_vegetarian?: boolean | null
          is_vegetarian_available?: boolean | null
          location?: string | null
          location_es?: string | null
          member_bottle_price?: string | null
          name?: string
          name_es?: string | null
          price?: string
          subcategory?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          unique_selling_points?: string | null
          unique_selling_points_es?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_recipients: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          is_read: boolean | null
          message_id: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_read?: boolean | null
          message_id: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_read?: boolean | null
          message_id?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_recipients_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string | null
          deleted_by_sender: boolean | null
          file_name: string | null
          file_url: string | null
          id: string
          image_url: string | null
          parent_message_id: string | null
          sender_id: string
          subject: string | null
          thread_id: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          deleted_by_sender?: boolean | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          parent_message_id?: string | null
          sender_id: string
          subject?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          deleted_by_sender?: boolean | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          parent_message_id?: string | null
          sender_id?: string
          subject?: string | null
          thread_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          body: string
          data: Json | null
          id: string
          is_read: boolean | null
          notification_type: string
          read_at: string | null
          sent_at: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          notification_type: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          notification_type?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          announcements_enabled: boolean | null
          created_at: string | null
          custom_notifications_enabled: boolean | null
          events_enabled: boolean | null
          game_hub_enabled: boolean
          id: string
          messages_enabled: boolean | null
          quiz_notifications_enabled: boolean | null
          rewards_enabled: boolean | null
          special_features_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          announcements_enabled?: boolean | null
          created_at?: string | null
          custom_notifications_enabled?: boolean | null
          events_enabled?: boolean | null
          game_hub_enabled?: boolean
          id?: string
          messages_enabled?: boolean | null
          quiz_notifications_enabled?: boolean | null
          rewards_enabled?: boolean | null
          special_features_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          announcements_enabled?: boolean | null
          created_at?: string | null
          custom_notifications_enabled?: boolean | null
          events_enabled?: boolean | null
          game_hub_enabled?: boolean
          id?: string
          messages_enabled?: boolean | null
          quiz_notifications_enabled?: boolean | null
          rewards_enabled?: boolean | null
          special_features_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      picture_this_scores: {
        Row: {
          bonus_points: number
          category: string
          completed: boolean
          created_at: string
          difficulty: string
          id: string
          lives_remaining: number
          play_mode: string
          questions_correct: number
          questions_total: number
          score: number
          time_seconds: number | null
          user_id: string
        }
        Insert: {
          bonus_points?: number
          category: string
          completed?: boolean
          created_at?: string
          difficulty: string
          id?: string
          lives_remaining?: number
          play_mode: string
          questions_correct?: number
          questions_total?: number
          score?: number
          time_seconds?: number | null
          user_id: string
        }
        Update: {
          bonus_points?: number
          category?: string
          completed?: boolean
          created_at?: string
          difficulty?: string
          id?: string
          lives_remaining?: number
          play_mode?: string
          questions_correct?: number
          questions_total?: number
          score?: number
          time_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picture_this_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      puree_syrup_recipes: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          display_order: number | null
          id: string
          ingredients: Json | null
          is_active: boolean | null
          name: string
          procedure: string | null
          procedure_es: string | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          ingredients?: Json | null
          is_active?: boolean | null
          name: string
          procedure?: string | null
          procedure_es?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          ingredients?: Json | null
          is_active?: boolean | null
          name?: string
          procedure?: string | null
          procedure_es?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "puree_syrup_recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          device_type: string
          id: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_type: string
          id?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_type?: string
          id?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_notification_dismissals: {
        Row: {
          dismissed_at: string | null
          exam_id: string
          id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          exam_id: string
          id?: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          exam_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_notification_dismissals_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_notification_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      redemption_requests: {
        Row: {
          bucks_amount: number
          comment: string | null
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          item_name_snapshot: string | null
          menu_item_id: string | null
          request_type: string
          shift_date: string | null
          shift_period: string | null
          status: string
          user_id: string
          weekly_special_id: string | null
        }
        Insert: {
          bucks_amount: number
          comment?: string | null
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          item_name_snapshot?: string | null
          menu_item_id?: string | null
          request_type: string
          shift_date?: string | null
          shift_period?: string | null
          status?: string
          user_id: string
          weekly_special_id?: string | null
        }
        Update: {
          bucks_amount?: number
          comment?: string | null
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          item_name_snapshot?: string | null
          menu_item_id?: string | null
          request_type?: string
          shift_date?: string | null
          shift_period?: string | null
          status?: string
          user_id?: string
          weekly_special_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemption_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_requests_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_requests_weekly_special_id_fkey"
            columns: ["weekly_special_id"]
            isOneToOne: false
            referencedRelation: "weekly_specials"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards_transactions: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          is_visible: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          is_visible?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          is_visible?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_uploads: {
        Row: {
          created_at: string | null
          error_message: string | null
          file_name: string
          file_url: string
          id: string
          parsed_shifts_count: number | null
          status: string
          unmatched_employees: Json | null
          updated_at: string | null
          uploaded_by: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          file_name: string
          file_url: string
          id?: string
          parsed_shifts_count?: number | null
          status?: string
          unmatched_employees?: Json | null
          updated_at?: string | null
          uploaded_by: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          file_name?: string
          file_url?: string
          id?: string
          parsed_shifts_count?: number | null
          status?: string
          unmatched_employees?: Json | null
          updated_at?: string | null
          uploaded_by?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shade_dismissals: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          id: string
          item_id: string
          notification_type: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
          item_id: string
          notification_type: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
          item_id?: string
          notification_type?: string
        }
        Relationships: []
      }
      special_features: {
        Row: {
          content: string
          content_es: string | null
          created_at: string | null
          created_by: string | null
          display_order: number | null
          end_date_time: string | null
          guide_file_id: string | null
          id: string
          is_active: boolean | null
          link: string | null
          message: string | null
          start_date_time: string | null
          thumbnail_shape: string | null
          thumbnail_url: string | null
          title: string
          title_es: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          content_es?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          end_date_time?: string | null
          guide_file_id?: string | null
          id?: string
          is_active?: boolean | null
          link?: string | null
          message?: string | null
          start_date_time?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          title: string
          title_es?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          content_es?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          end_date_time?: string | null
          guide_file_id?: string | null
          id?: string
          is_active?: boolean | null
          link?: string | null
          message?: string | null
          start_date_time?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          title?: string
          title_es?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "special_features_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_features_guide_file_id_fkey"
            columns: ["guide_file_id"]
            isOneToOne: false
            referencedRelation: "guides_and_training"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          created_at: string | null
          employee_name: string
          end_time: string
          id: string
          is_closer: boolean | null
          is_opener: boolean | null
          is_training: boolean | null
          roles: string[]
          room_assignment: string | null
          shift_date: string
          start_time: string
          upload_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          employee_name: string
          end_time: string
          id?: string
          is_closer?: boolean | null
          is_opener?: boolean | null
          is_training?: boolean | null
          roles?: string[]
          room_assignment?: string | null
          shift_date: string
          start_time: string
          upload_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          employee_name?: string
          end_time?: string
          id?: string
          is_closer?: boolean | null
          is_opener?: boolean | null
          is_training?: boolean | null
          roles?: string[]
          room_assignment?: string | null
          shift_date?: string
          start_time?: string
          upload_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedules_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "schedule_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      upcoming_events: {
        Row: {
          category: string | null
          content: string
          content_es: string | null
          created_at: string | null
          created_by: string | null
          display_order: number | null
          end_date_time: string | null
          guide_file_id: string | null
          id: string
          is_active: boolean | null
          link: string | null
          message: string | null
          start_date_time: string | null
          thumbnail_shape: string | null
          thumbnail_url: string | null
          title: string
          title_es: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content: string
          content_es?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          end_date_time?: string | null
          guide_file_id?: string | null
          id?: string
          is_active?: boolean | null
          link?: string | null
          message?: string | null
          start_date_time?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          title: string
          title_es?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          content_es?: string | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          end_date_time?: string | null
          guide_file_id?: string | null
          id?: string
          is_active?: boolean | null
          link?: string | null
          message?: string | null
          start_date_time?: string | null
          thumbnail_shape?: string | null
          thumbnail_url?: string | null
          title?: string
          title_es?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upcoming_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upcoming_events_guide_file_id_fkey"
            columns: ["guide_file_id"]
            isOneToOne: false
            referencedRelation: "guides_and_training"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bartender_checklist_progress: {
        Row: {
          checklist_item_id: string
          completed: boolean | null
          completed_date: string
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          checklist_item_id: string
          completed?: boolean | null
          completed_date?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          checklist_item_id?: string
          completed?: boolean | null
          completed_date?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bartender_checklist_progress_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "bartender_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bartender_checklist_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_checklist_progress: {
        Row: {
          checklist_item_id: string
          completed: boolean | null
          completed_date: string
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          checklist_item_id: string
          completed?: boolean | null
          completed_date?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          checklist_item_id?: string
          completed?: boolean | null
          completed_date?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_checklist_progress_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_checklist_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          badge_title: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          is_test_user: boolean
          job_title: string
          job_titles: string[] | null
          leaderboard_last_viewed_at: string | null
          mcloones_bucks: number | null
          name: string
          password_hash: string
          phone_number: string | null
          profile_picture_url: string | null
          quick_tools: Json | null
          role: string
          updated_at: string | null
          username: string
        }
        Insert: {
          badge_title?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          is_test_user?: boolean
          job_title: string
          job_titles?: string[] | null
          leaderboard_last_viewed_at?: string | null
          mcloones_bucks?: number | null
          name: string
          password_hash?: string
          phone_number?: string | null
          profile_picture_url?: string | null
          quick_tools?: Json | null
          role: string
          updated_at?: string | null
          username: string
        }
        Update: {
          badge_title?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          is_test_user?: boolean
          job_title?: string
          job_titles?: string[] | null
          leaderboard_last_viewed_at?: string | null
          mcloones_bucks?: number | null
          name?: string
          password_hash?: string
          phone_number?: string | null
          profile_picture_url?: string | null
          quick_tools?: Json | null
          role?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      weekly_specials: {
        Row: {
          created_at: string | null
          created_by: string | null
          day_of_week: string
          description: string | null
          id: string
          name: string
          price: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day_of_week: string
          description?: string | null
          id?: string
          name: string
          price: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day_of_week?: string
          description?: string | null
          id?: string
          name?: string
          price?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_specials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_pairings: {
        Row: {
          created_at: string | null
          display_order: number
          entree: string
          hint: string | null
          id: string
          is_active: boolean
          wine: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          entree: string
          hint?: string | null
          id?: string
          is_active?: boolean
          wine: string
        }
        Update: {
          created_at?: string | null
          display_order?: number
          entree?: string
          hint?: string | null
          id?: string
          is_active?: boolean
          wine?: string
        }
        Relationships: []
      }
      word_search_scores: {
        Row: {
          category: string
          completed: boolean
          created_at: string | null
          difficulty: string
          id: string
          play_mode: string
          score: number
          time_seconds: number
          total_words: number
          user_id: string
          words_found: number
        }
        Insert: {
          category: string
          completed?: boolean
          created_at?: string | null
          difficulty: string
          id?: string
          play_mode: string
          score?: number
          time_seconds?: number
          total_words?: number
          user_id: string
          words_found?: number
        }
        Update: {
          category?: string
          completed?: boolean
          created_at?: string | null
          difficulty?: string
          id?: string
          play_mode?: string
          score?: number
          time_seconds?: number
          total_words?: number
          user_id?: string
          words_found?: number
        }
        Relationships: [
          {
            foreignKeyName: "word_search_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_redemption_request: {
        Args: { p_manager_id: string; p_reason: string; p_request_id: string }
        Returns: undefined
      }
      close_expired_exams: { Args: never; Returns: undefined }
      create_announcement:
        | {
            Args: {
              p_display_order?: number
              p_message: string
              p_priority?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
              p_visibility?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_display_order?: number
              p_link?: string
              p_message: string
              p_priority?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
              p_visibility?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_display_order?: number
              p_guide_file_id?: string
              p_link?: string
              p_message: string
              p_priority?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
              p_visibility?: string
            }
            Returns: undefined
          }
      create_cocktail: {
        Args: {
          p_alcohol_type: string
          p_display_order?: number
          p_ingredients: string
          p_name: string
          p_procedure: string
          p_thumbnail_url?: string
          p_user_id: string
        }
        Returns: string
      }
      create_guide: {
        Args: {
          p_category: string
          p_description: string
          p_display_order: number
          p_file_name: string
          p_file_type: string
          p_file_url: string
          p_thumbnail_url: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_menu_item:
        | {
            Args: {
              p_available_for_dinner: boolean
              p_available_for_lunch: boolean
              p_category: string
              p_description: string
              p_display_order?: number
              p_is_gluten_free: boolean
              p_is_gluten_free_available: boolean
              p_is_vegetarian: boolean
              p_is_vegetarian_available: boolean
              p_name: string
              p_price: string
              p_subcategory: string
              p_thumbnail_shape: string
              p_thumbnail_url: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_available_for_dinner: boolean
              p_available_for_lunch: boolean
              p_bottle_price?: string
              p_category: string
              p_description: string
              p_display_order?: number
              p_glass_price?: string
              p_is_gluten_free: boolean
              p_is_gluten_free_available: boolean
              p_is_vegetarian: boolean
              p_is_vegetarian_available: boolean
              p_location?: string
              p_member_bottle_price?: string
              p_name: string
              p_price: string
              p_subcategory: string
              p_thumbnail_shape: string
              p_thumbnail_url: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_available_for_dinner: boolean
              p_available_for_lunch: boolean
              p_bottle_price?: string
              p_category: string
              p_description: string
              p_display_order?: number
              p_flavor_profile?: string
              p_flavor_profile_es?: string
              p_glass_price?: string
              p_is_gluten_free: boolean
              p_is_gluten_free_available: boolean
              p_is_vegetarian: boolean
              p_is_vegetarian_available: boolean
              p_location?: string
              p_member_bottle_price?: string
              p_name: string
              p_price: string
              p_subcategory: string
              p_thumbnail_shape: string
              p_thumbnail_url: string
              p_unique_selling_points?: string
              p_unique_selling_points_es?: string
              p_user_id: string
            }
            Returns: string
          }
      create_signature_recipe: {
        Args: {
          p_display_order: number
          p_glassware: string
          p_ingredients: Json
          p_name: string
          p_price: string
          p_procedure: string
          p_subcategory: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: string
      }
      create_special_feature:
        | {
            Args: {
              p_display_order?: number
              p_end_date_time?: string
              p_message: string
              p_start_date_time?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_display_order?: number
              p_end_date_time?: string
              p_link?: string
              p_message: string
              p_start_date_time?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_display_order?: number
              p_end_date_time?: string
              p_guide_file_id?: string
              p_link?: string
              p_message: string
              p_start_date_time?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
            }
            Returns: undefined
          }
      create_upcoming_event: {
        Args: {
          p_category?: string
          p_display_order?: number
          p_end_date_time?: string
          p_guide_file_id?: string
          p_link?: string
          p_message: string
          p_start_date_time?: string
          p_thumbnail_shape?: string
          p_thumbnail_url?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_user: {
        Args: {
          p_email: string
          p_job_title: string
          p_name: string
          p_password?: string
          p_phone_number: string
          p_role: string
          p_username: string
        }
        Returns: string
      }
      delete_announcement: {
        Args: { p_announcement_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_cocktail: {
        Args: { p_cocktail_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_expired_special_features: { Args: never; Returns: number }
      delete_expired_upcoming_events: { Args: never; Returns: number }
      delete_guide: {
        Args: { p_guide_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_libation_recipe: {
        Args: { p_recipe_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_menu_item: {
        Args: { p_menu_item_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_puree_syrup_recipe: {
        Args: { p_recipe_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_signature_recipe: {
        Args: { p_recipe_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_special_feature: {
        Args: { p_feature_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_upcoming_event: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: undefined
      }
      deny_redemption_request: {
        Args: { p_manager_id: string; p_reason: string; p_request_id: string }
        Returns: undefined
      }
      get_exam_completion_status: {
        Args: { p_exam_id: string; p_exam_type: string }
        Returns: {
          bucks_awarded: number
          correct_count: number
          has_completed: boolean
          job_title: string
          name: string
          profile_picture_url: string
          total_questions: number
          user_id: string
        }[]
      }
      get_game_leaderboard:
        | {
            Args: { p_game_mode: string; p_limit?: number }
            Returns: {
              best_score: number
              games_played: number
              name: string
              profile_picture_url: string
              user_id: string
            }[]
          }
        | {
            Args: {
              p_game_mode: string
              p_limit?: number
              p_play_mode?: string
            }
            Returns: {
              best_score: number
              games_played: number
              name: string
              profile_picture_url: string
              user_id: string
            }[]
          }
      get_master_leaderboard_memory: {
        Args: { p_limit?: number }
        Returns: {
          games_played: number
          name: string
          profile_picture_url: string
          total_score: number
          user_id: string
        }[]
      }
      get_master_leaderboard_overall: {
        Args: { p_limit?: number }
        Returns: {
          games_played: number
          name: string
          profile_picture_url: string
          total_score: number
          user_id: string
        }[]
      }
      get_master_leaderboard_picture_this: {
        Args: { p_limit?: number }
        Returns: {
          games_played: number
          name: string
          profile_picture_url: string
          total_score: number
          user_id: string
        }[]
      }
      get_master_leaderboard_word_search: {
        Args: { p_limit?: number }
        Returns: {
          games_played: number
          name: string
          profile_picture_url: string
          total_score: number
          user_id: string
        }[]
      }
      get_passed_users_on_leaderboard: {
        Args: { p_new_score: number; p_user_id: string }
        Returns: {
          name: string
          user_id: string
        }[]
      }
      get_picture_this_leaderboard_filtered: {
        Args: { p_category?: string; p_limit?: number; p_play_mode?: string }
        Returns: {
          games_played: number
          name: string
          profile_picture_url: string
          total_score: number
          user_id: string
        }[]
      }
      get_unread_leaderboard_pass_count: { Args: never; Returns: number }
      get_unread_message_count: { Args: { user_id: string }; Returns: number }
      get_user_badge_totals: {
        Args: { p_user_ids: string[] }
        Returns: {
          badge_total: number
          user_id: string
        }[]
      }
      get_user_total_game_score: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_word_search_leaderboard: {
        Args: { p_category: string; p_limit?: number }
        Returns: {
          best_score: number
          games_played: number
          name: string
          profile_picture_url: string
          user_id: string
        }[]
      }
      insert_cocktail: {
        Args: {
          p_alcohol_type: string
          p_display_order: number
          p_ingredients: string
          p_name: string
          p_procedure: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: string
      }
      insert_libation_recipe: {
        Args: {
          p_category: string
          p_display_order: number
          p_garnish: string
          p_glassware: string
          p_ingredients: Json
          p_name: string
          p_price: string
          p_procedure: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: string
      }
      insert_puree_syrup_recipe: {
        Args: {
          p_category: string
          p_display_order: number
          p_ingredients: Json
          p_name: string
          p_procedure: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: string
      }
      mark_leaderboard_viewed: { Args: never; Returns: undefined }
      reset_game_scores: {
        Args: { p_game_mode?: string; p_play_mode?: string }
        Returns: undefined
      }
      reset_picture_this_scores: {
        Args: { p_category?: string; p_difficulty?: string }
        Returns: undefined
      }
      reset_word_search_scores: {
        Args: { p_category?: string }
        Returns: undefined
      }
      set_user_test_flag: {
        Args: { p_is_test: boolean; p_user_id: string }
        Returns: undefined
      }
      start_exam_attempt: {
        Args: { p_exam_id: string; p_user_id: string }
        Returns: {
          is_completed: boolean
          result_id: string
          started_at: string
        }[]
      }
      submit_exam_and_award_bucks: {
        Args: {
          p_answers: Json
          p_bucks_awarded: number
          p_correct_count: number
          p_exam_id: string
          p_is_timed_out: boolean
          p_time_seconds: number
          p_total_questions: number
          p_user_id: string
        }
        Returns: string
      }
      submit_redemption_request: {
        Args: {
          p_bucks_amount: number
          p_comment: string
          p_item_name_snapshot: string
          p_menu_item_id: string
          p_request_type: string
          p_shift_date: string
          p_shift_period: string
          p_user_id: string
          p_weekly_special_id: string
        }
        Returns: string
      }
      update_announcement:
        | {
            Args: {
              p_announcement_id: string
              p_display_order?: number
              p_message: string
              p_priority?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
              p_visibility?: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_announcement_id: string
              p_display_order?: number
              p_link?: string
              p_message: string
              p_priority?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
              p_visibility?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_announcement_id: string
              p_display_order?: number
              p_guide_file_id?: string
              p_link?: string
              p_message: string
              p_priority?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
              p_visibility?: string
            }
            Returns: undefined
          }
      update_announcement_translations: {
        Args: { p_content_es?: string; p_id: string; p_title_es?: string }
        Returns: undefined
      }
      update_cocktail: {
        Args: {
          p_alcohol_type: string
          p_cocktail_id: string
          p_display_order: number
          p_ingredients: string
          p_name: string
          p_procedure: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: boolean
      }
      update_cocktail_translations: {
        Args: { p_id: string; p_procedure_es?: string }
        Returns: undefined
      }
      update_employee_info: {
        Args: {
          p_email: string
          p_employee_id: string
          p_job_title: string
          p_manager_id: string
          p_name: string
          p_phone_number: string
          p_role: string
        }
        Returns: boolean
      }
      update_guide: {
        Args: {
          p_category: string
          p_description: string
          p_display_order: number
          p_file_name: string
          p_file_type: string
          p_file_url: string
          p_guide_id: string
          p_thumbnail_url: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_guide_translations: {
        Args: { p_description_es?: string; p_id: string; p_title_es?: string }
        Returns: undefined
      }
      update_libation_recipe: {
        Args: {
          p_category: string
          p_display_order: number
          p_garnish: string
          p_glassware: string
          p_ingredients: Json
          p_name: string
          p_price: string
          p_procedure: string
          p_recipe_id: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: boolean
      }
      update_libation_recipe_translations: {
        Args: { p_id: string; p_procedure_es?: string }
        Returns: undefined
      }
      update_menu_item:
        | {
            Args: {
              p_available_for_dinner: boolean
              p_available_for_lunch: boolean
              p_category: string
              p_description: string
              p_display_order?: number
              p_is_gluten_free: boolean
              p_is_gluten_free_available: boolean
              p_is_vegetarian: boolean
              p_is_vegetarian_available: boolean
              p_menu_item_id: string
              p_name: string
              p_price: string
              p_subcategory: string
              p_thumbnail_shape: string
              p_thumbnail_url: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_available_for_dinner: boolean
              p_available_for_lunch: boolean
              p_bottle_price?: string
              p_category: string
              p_description: string
              p_display_order?: number
              p_glass_price?: string
              p_is_gluten_free: boolean
              p_is_gluten_free_available: boolean
              p_is_vegetarian: boolean
              p_is_vegetarian_available: boolean
              p_location?: string
              p_member_bottle_price?: string
              p_menu_item_id: string
              p_name: string
              p_price: string
              p_subcategory: string
              p_thumbnail_shape: string
              p_thumbnail_url: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_available_for_dinner: boolean
              p_available_for_lunch: boolean
              p_bottle_price?: string
              p_category: string
              p_description: string
              p_display_order?: number
              p_flavor_profile?: string
              p_flavor_profile_es?: string
              p_glass_price?: string
              p_is_gluten_free: boolean
              p_is_gluten_free_available: boolean
              p_is_vegetarian: boolean
              p_is_vegetarian_available: boolean
              p_location?: string
              p_member_bottle_price?: string
              p_menu_item_id: string
              p_name: string
              p_price: string
              p_subcategory: string
              p_thumbnail_shape: string
              p_thumbnail_url: string
              p_unique_selling_points?: string
              p_unique_selling_points_es?: string
              p_user_id: string
            }
            Returns: undefined
          }
      update_menu_item_translations:
        | {
            Args: {
              p_description_es?: string
              p_id: string
              p_name_es?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_description_es?: string
              p_id: string
              p_location_es?: string
              p_name_es?: string
            }
            Returns: undefined
          }
      update_password: {
        Args: { new_password: string; user_id: string }
        Returns: undefined
      }
      update_profile_info: {
        Args: { new_email: string; new_phone_number: string; user_id: string }
        Returns: undefined
      }
      update_profile_picture: {
        Args: { picture_url: string; user_id: string }
        Returns: undefined
      }
      update_puree_syrup_recipe: {
        Args: {
          p_category: string
          p_display_order: number
          p_ingredients: Json
          p_name: string
          p_procedure: string
          p_recipe_id: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_puree_syrup_recipe_translations: {
        Args: { p_id: string; p_procedure_es?: string }
        Returns: undefined
      }
      update_quick_tools: {
        Args: { tools: Json; user_id: string }
        Returns: undefined
      }
      update_signature_recipe: {
        Args: {
          p_display_order: number
          p_glassware: string
          p_ingredients: Json
          p_name: string
          p_price: string
          p_procedure: string
          p_recipe_id: string
          p_subcategory: string
          p_thumbnail_url: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_special_feature:
        | {
            Args: {
              p_display_order?: number
              p_end_date_time?: string
              p_feature_id: string
              p_message: string
              p_start_date_time?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_display_order?: number
              p_end_date_time?: string
              p_feature_id: string
              p_link?: string
              p_message: string
              p_start_date_time?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_display_order?: number
              p_end_date_time?: string
              p_feature_id: string
              p_guide_file_id?: string
              p_link?: string
              p_message: string
              p_start_date_time?: string
              p_thumbnail_shape?: string
              p_thumbnail_url?: string
              p_title: string
              p_user_id: string
            }
            Returns: undefined
          }
      update_special_feature_translations: {
        Args: { p_content_es?: string; p_id: string; p_title_es?: string }
        Returns: undefined
      }
      update_transaction_and_balance: {
        Args: {
          p_manager_id: string
          p_new_amount: number
          p_new_description: string
          p_transaction_id: string
        }
        Returns: boolean
      }
      update_upcoming_event: {
        Args: {
          p_category?: string
          p_display_order?: number
          p_end_date_time?: string
          p_event_id: string
          p_guide_file_id?: string
          p_link?: string
          p_message: string
          p_start_date_time?: string
          p_thumbnail_shape?: string
          p_thumbnail_url?: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_upcoming_event_translations: {
        Args: { p_content_es?: string; p_id: string; p_title_es?: string }
        Returns: undefined
      }
      update_user_active_status: {
        Args: { p_is_active: boolean; p_user_id: string }
        Returns: undefined
      }
      update_user_job_titles: {
        Args: { p_job_titles: string[]; p_user_id: string }
        Returns: undefined
      }
      upsert_notification_preferences:
        | {
            Args: {
              p_announcements_enabled?: boolean
              p_custom_notifications_enabled?: boolean
              p_events_enabled?: boolean
              p_messages_enabled?: boolean
              p_rewards_enabled?: boolean
              p_special_features_enabled?: boolean
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_announcements_enabled?: boolean
              p_custom_notifications_enabled?: boolean
              p_events_enabled?: boolean
              p_game_hub_enabled?: boolean
              p_messages_enabled?: boolean
              p_rewards_enabled?: boolean
              p_special_features_enabled?: boolean
              p_user_id: string
            }
            Returns: undefined
          }
      upsert_push_token: {
        Args: { p_device_type: string; p_token: string; p_user_id: string }
        Returns: undefined
      }
      verify_password: {
        Args: { password: string; user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
