
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          name: string
          email: string
          job_title: string
          phone_number: string | null
          role: 'employee' | 'manager'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          name: string
          email: string
          job_title: string
          phone_number?: string | null
          role: 'employee' | 'manager'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          name?: string
          email?: string
          job_title?: string
          phone_number?: string | null
          role?: 'employee' | 'manager'
          created_at?: string
          updated_at?: string
        }
      }
      announcements: {
        Row: {
          id: string
          title: string
          content: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      events: {
        Row: {
          id: string
          title: string
          description: string | null
          event_date: string
          start_time: string | null
          end_time: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          event_date: string
          start_time?: string | null
          end_time?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          event_date?: string
          start_time?: string | null
          end_time?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      weekly_specials: {
        Row: {
          id: string
          day_of_week: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
          name: string
          description: string | null
          price: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          day_of_week: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
          name: string
          description?: string | null
          price: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          day_of_week?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
          name?: string
          description?: string | null
          price?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
