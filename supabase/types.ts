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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      collaborators: {
        Row: {
          aliases: string[] | null
          created_at: string | null
          department: string | null
          full_name: string | null
          id: number
          is_active: boolean | null
          position: string | null
          updated_at: string | null
        }
        Insert: {
          aliases?: string[] | null
          created_at?: string | null
          department?: string | null
          full_name?: string | null
          id?: number
          is_active?: boolean | null
          position?: string | null
          updated_at?: string | null
        }
        Update: {
          aliases?: string[] | null
          created_at?: string | null
          department?: string | null
          full_name?: string | null
          id?: number
          is_active?: boolean | null
          position?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      collection_runs: {
        Row: {
          api_cost: number | null
          completed_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: number
          location_id: string | null
          metadata: Json | null
          reviews_found: number | null
          reviews_new: number | null
          reviews_updated: number | null
          run_type: string
          started_at: string
          status: string
        }
        Insert: {
          api_cost?: number | null
          completed_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: number
          location_id?: string | null
          metadata?: Json | null
          reviews_found?: number | null
          reviews_new?: number | null
          reviews_updated?: number | null
          run_type: string
          started_at?: string
          status?: string
        }
        Update: {
          api_cost?: number | null
          completed_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: number
          location_id?: string | null
          metadata?: Json | null
          reviews_found?: number | null
          reviews_new?: number | null
          reviews_updated?: number | null
          run_type?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_runs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "gbp_locations"
            referencedColumns: ["location_id"]
          },
        ]
      }
      gbp_accounts: {
        Row: {
          account_id: string
          display_name: string | null
        }
        Insert: {
          account_id: string
          display_name?: string | null
        }
        Update: {
          account_id?: string
          display_name?: string | null
        }
        Relationships: []
      }
      gbp_locations: {
        Row: {
          account_id: string | null
          address: string | null
          cid: string | null
          current_rating: number | null
          domain: string | null
          is_monitoring_active: boolean | null
          last_review_sync: string | null
          location_id: string
          name: string | null
          phone: string | null
          place_id: string | null
          sync_frequency_hours: number | null
          title: string | null
          total_reviews_count: number | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          cid?: string | null
          current_rating?: number | null
          domain?: string | null
          is_monitoring_active?: boolean | null
          last_review_sync?: string | null
          location_id: string
          name?: string | null
          phone?: string | null
          place_id?: string | null
          sync_frequency_hours?: number | null
          title?: string | null
          total_reviews_count?: number | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          address?: string | null
          cid?: string | null
          current_rating?: number | null
          domain?: string | null
          is_monitoring_active?: boolean | null
          last_review_sync?: string | null
          location_id?: string
          name?: string | null
          phone?: string | null
          place_id?: string | null
          sync_frequency_hours?: number | null
          title?: string | null
          total_reviews_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbp_locations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gbp_accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      monitoring_config: {
        Row: {
          alert_on_negative_review: boolean | null
          alert_on_new_review: boolean | null
          alert_rating_threshold: number | null
          auto_collection_enabled: boolean | null
          collection_frequency_hours: number | null
          last_modified: string | null
          location_id: string
          webhook_url: string | null
        }
        Insert: {
          alert_on_negative_review?: boolean | null
          alert_on_new_review?: boolean | null
          alert_rating_threshold?: number | null
          auto_collection_enabled?: boolean | null
          collection_frequency_hours?: number | null
          last_modified?: string | null
          location_id: string
          webhook_url?: string | null
        }
        Update: {
          alert_on_negative_review?: boolean | null
          alert_on_new_review?: boolean | null
          alert_rating_threshold?: number | null
          auto_collection_enabled?: boolean | null
          collection_frequency_hours?: number | null
          last_modified?: string | null
          location_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_config_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "gbp_locations"
            referencedColumns: ["location_id"]
          },
        ]
      }
      nlp_queue: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: number
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          review_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: number
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          review_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: number
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          review_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nlp_queue_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["review_id"]
          },
        ]
      }
      review_alerts: {
        Row: {
          alert_type: string
          channel: string | null
          id: number
          payload: Json | null
          review_id: string | null
          sent_at: string
        }
        Insert: {
          alert_type: string
          channel?: string | null
          id?: number
          payload?: Json | null
          review_id?: string | null
          sent_at?: string
        }
        Update: {
          alert_type?: string
          channel?: string | null
          id?: number
          payload?: Json | null
          review_id?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_alerts_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["review_id"]
          },
        ]
      }
      review_collaborators: {
        Row: {
          collaborator_id: number
          context_found: string | null
          match_score: number | null
          mention_snippet: string | null
          review_id: string
        }
        Insert: {
          collaborator_id: number
          context_found?: string | null
          match_score?: number | null
          mention_snippet?: string | null
          review_id: string
        }
        Update: {
          collaborator_id?: number
          context_found?: string | null
          match_score?: number | null
          mention_snippet?: string | null
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_collaborators_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_collaborators_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["review_id"]
          },
        ]
      }
      review_collaborators_backup_cp: {
        Row: {
          collaborator_id: number
          context_found: string | null
          match_score: number | null
          mention_snippet: string | null
          review_id: string
        }
        Insert: {
          collaborator_id: number
          context_found?: string | null
          match_score?: number | null
          mention_snippet?: string | null
          review_id: string
        }
        Update: {
          collaborator_id?: number
          context_found?: string | null
          match_score?: number | null
          mention_snippet?: string | null
          review_id?: string
        }
        Relationships: []
      }
      review_labels: {
        Row: {
          classifier_version: string | null
          is_enotariado: boolean | null
          review_id: string
          sentiment: Database["public"]["Enums"]["review_sentiment"] | null
          toxicity: number | null
        }
        Insert: {
          classifier_version?: string | null
          is_enotariado?: boolean | null
          review_id: string
          sentiment?: Database["public"]["Enums"]["review_sentiment"] | null
          toxicity?: number | null
        }
        Update: {
          classifier_version?: string | null
          is_enotariado?: boolean | null
          review_id?: string
          sentiment?: Database["public"]["Enums"]["review_sentiment"] | null
          toxicity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "review_labels_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["review_id"]
          },
        ]
      }
      review_services: {
        Row: {
          confidence: number | null
          review_id: string
          service_id: number
        }
        Insert: {
          confidence?: number | null
          review_id: string
          service_id: number
        }
        Update: {
          confidence?: number | null
          review_id?: string
          service_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_services_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "review_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          collection_batch_id: string | null
          collection_source: string | null
          comment: string | null
          create_time: string | null
          is_anonymous: boolean | null
          is_local_guide: boolean | null
          last_cekennd_at: string | null
          last_seen_at: string | null
          location_id: string | null
          original_language: string | null
          processed_at: string | null
          rating: number | null
          reply_text: string | null
          reply_time: string | null
          response_text: string | null
          response_time: string | null
          review_id: string
          review_url: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          reviewer_photo_url: string | null
          reviewer_url: string | null
          source: string | null
          translated_text: string | null
          tsv: unknown | null
          update_time: string | null
        }
        Insert: {
          collection_batch_id?: string | null
          collection_source?: string | null
          comment?: string | null
          create_time?: string | null
          is_anonymous?: boolean | null
          is_local_guide?: boolean | null
          last_seen_at?: string | null
          location_id?: string | null
          original_language?: string | null
          processed_at?: string | null
          rating?: number | null
          reply_text?: string | null
          reply_time?: string | null
          response_text?: string | null
          response_time?: string | null
          review_id: string
          review_url?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          reviewer_url?: string | null
          source?: string | null
          translated_text?: string | null
          tsv?: unknown | null
          update_time?: string | null
        }
        Update: {
          collection_batch_id?: string | null
          collection_source?: string | null
          comment?: string | null
          create_time?: string | null
          is_anonymous?: boolean | null
          is_local_guide?: boolean | null
          last_seen_at?: string | null
          location_id?: string | null
          original_language?: string | null
          processed_at?: string | null
          rating?: number | null
          reply_text?: string | null
          reply_time?: string | null
          response_text?: string | null
          response_time?: string | null
          review_id?: string
          review_url?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          reviewer_url?: string | null
          source?: string | null
          translated_text?: string | null
          tsv?: unknown | null
          update_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "gbp_locations"
            referencedColumns: ["location_id"]
          },
        ]
      }
      reviews_backup_cp: {
        Row: {
          collection_batch_id: string | null
          collection_source: string | null
          comment: string | null
          create_time: string | null
          is_anonymous: boolean | null
          last_checked_at: string | null
          location_id: string | null
          processed_at: string | null
          rating: number | null
          reply_text: string | null
          reply_time: string | null
          review_id: string
          reviewer_name: string | null
          tsv: unknown | null
          update_time: string | null
        }
        Insert: {
          collection_batch_id?: string | null
          collection_source?: string | null
          comment?: string | null
          create_time?: string | null
          is_anonymous?: boolean | null
          last_checked_at?: string | null
          location_id?: string | null
          processed_at?: string | null
          rating?: number | null
          reply_text?: string | null
          reply_time?: string | null
          review_id: string
          reviewer_name?: string | null
          tsv?: unknown | null
          update_time?: string | null
        }
        Update: {
          collection_batch_id?: string | null
          collection_source?: string | null
          comment?: string | null
          create_time?: string | null
          is_anonymous?: boolean | null
          last_checked_at?: string | null
          location_id?: string | null
          processed_at?: string | null
          rating?: number | null
          reply_text?: string | null
          reply_time?: string | null
          review_id?: string
          reviewer_name?: string | null
          tsv?: unknown | null
          update_time?: string | null
        }
        Relationships: []
      }
      reviews_legacy_archive: {
        Row: {
          collection_batch_id: string | null
          collection_source: string | null
          comment: string | null
          create_time: string | null
          is_anonymous: boolean | null
          is_local_guide: boolean | null
          last_checked_at: string | null
          location_id: string | null
          original_language: string | null
          processed_at: string | null
          rating: number | null
          reply_text: string | null
          reply_time: string | null
          response_text: string | null
          response_time: string | null
          review_id: string
          review_url: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          reviewer_photo_url: string | null
          reviewer_url: string | null
          source: string | null
          translated_text: string | null
          tsv: unknown | null
          update_time: string | null
        }
        Insert: {
          collection_batch_id?: string | null
          collection_source?: string | null
          comment?: string | null
          create_time?: string | null
          is_anonymous?: boolean | null
          is_local_guide?: boolean | null
          last_checked_at?: string | null
          location_id?: string | null
          original_language?: string | null
          processed_at?: string | null
          rating?: number | null
          reply_text?: string | null
          reply_time?: string | null
          response_text?: string | null
          response_time?: string | null
          review_id: string
          review_url?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          reviewer_url?: string | null
          source?: string | null
          translated_text?: string | null
          tsv?: unknown | null
          update_time?: string | null
        }
        Update: {
          collection_batch_id?: string | null
          collection_source?: string | null
          comment?: string | null
          create_time?: string | null
          is_anonymous?: boolean | null
          is_local_guide?: boolean | null
          last_checked_at?: string | null
          location_id?: string | null
          original_language?: string | null
          processed_at?: string | null
          rating?: number | null
          reply_text?: string | null
          reply_time?: string | null
          response_text?: string | null
          response_time?: string | null
          review_id?: string
          review_url?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          reviewer_url?: string | null
          source?: string | null
          translated_text?: string | null
          tsv?: unknown | null
          update_time?: string | null
        }
        Relationships: []
      }
      reviews_raw: {
        Row: {
          last_seen_at: string | null
          location_id: string | null
          payload: Json
          received_at: string | null
          review_id: string
        }
        Insert: {
          last_seen_at?: string | null
          location_id?: string | null
          payload: Json
          received_at?: string | null
          review_id: string
        }
        Update: {
          last_seen_at?: string | null
          location_id?: string | null
          payload?: Json
          received_at?: string | null
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_raw_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "gbp_locations"
            referencedColumns: ["location_id"]
          },
        ]
      }
      reviews_raw_legacy_archive: {
        Row: {
          location_id: string | null
          payload: Json
          received_at: string | null
          review_id: string
        }
        Insert: {
          location_id?: string | null
          payload: Json
          received_at?: string | null
          review_id: string
        }
        Update: {
          location_id?: string | null
          payload?: Json
          received_at?: string | null
          review_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: number
          name: string | null
          synonyms: string[] | null
        }
        Insert: {
          id?: number
          name?: string | null
          synonyms?: string[] | null
        }
        Update: {
          id?: number
          name?: string | null
          synonyms?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      mv_monthly: {
        Row: {
          avg_rating: number | null
          avg_rating_enotariado: number | null
          location_id: string | null
          month: string | null
          reviews_enotariado: number | null
          total_reviews: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "gbp_locations"
            referencedColumns: ["location_id"]
          },
        ]
      }
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      claim_nlp_review: {
        Args: { p_worker_id: string }
        Returns: {
          attempts: number
          id: number
          review_id: string
        }[]
      }
      cleanup_legacy_from_dataset: {
        Args: { p_ids: string[]; p_location_id: string; p_urls: string[] }
        Returns: undefined
      }
      complete_nlp_review: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      create_auto_alerts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      enqueue_nlp_review: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      fail_nlp_review: {
        Args: { p_error: string; p_review_id: string }
        Returns: undefined
      }
      find_collaborator_mentions: {
        Args: { review_text: string }
        Returns: {
          collaborator_id: number
          context_found: string
          full_name: string
          match_score: number
          matched_alias: string
          snippet: string
        }[]
      }
      get_collaborator_mentions: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_rating_when_mentioned: number
          department: string
          full_name: string
          latest_mention: string
          mentions: number
        }[]
      }
      get_collaborator_mentions_by_month: {
        Args: { p_month: string }
        Returns: {
          avg_rating_when_mentioned: number
          department: string
          full_name: string
          latest_mention: string
          mentions: number
        }[]
      }
      get_collaborators_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_collaborators: number
          inactive_collaborators: number
          top_department: string
          total_collaborators: number
        }[]
      }
      get_daily_trends: {
        Args: { p_days?: number } | { p_days?: number; p_location_id?: string }
        Returns: {
          avg_rating: number
          day: string
          total: number
        }[]
      }
      get_daily_trends_for_month: {
        Args: { p_month: string }
        Returns: {
          avg_rating: number
          day: string
          five_star_count: number
          total_reviews: number
        }[]
      }
      get_monthly_stats: {
        Args: { p_location_id?: string; p_month: string } | { p_month: string }
        Returns: {
          avg_rating: number
          five_star_count: number
          five_star_percentage: number
          newest_review: string
          oldest_review: string
          total_reviews: number
        }[]
      }
      get_monthly_trends: {
        Args: Record<PropertyKey, never> | { p_location_id?: string }
        Returns: {
          avg_rating: number
          five_star_count: number
          four_star_count: number
          month: string
          one_star_count: number
          three_star_count: number
          total_reviews: number
          two_star_count: number
        }[]
      }
      get_monthly_trends_ext: {
        Args: { p_location_id: string; p_months: number }
        Returns: {
          avg_rating: number
          avg_rating_enotariado: number
          month: string
          reviews_enotariado: number
          total_reviews: number
        }[]
      }
      get_pending_alerts: {
        Args: { p_alert_type?: string; p_limit?: number }
        Returns: {
          alert_type: string
          id: number
          location_name: string
          payload: Json
          review_comment: string
          review_id: string
          review_rating: number
          sent_at: string
        }[]
      }
      get_recent_reviews: {
        Args: { limit_param?: number; p_location_id?: string }
        Returns: {
          collection_source: string
          comment: string
          create_time: string
          location_id: string
          rating: number
          review_id: string
          reviewer_name: string
          update_time: string
        }[]
      }
      get_recent_reviews_with_fallback: {
        Args: { limit_param?: number }
        Returns: {
          comment: string
          display_time: string
          location_id: string
          rating: number
          review_id: string
          reviewer_name: string
        }[]
      }
      get_reviews_by_month: {
        Args:
          | {
              p_limit?: number
              p_location_id?: string
              p_month: string
              p_offset?: number
            }
          | {
              p_limit?: number
              p_location_id?: string
              p_month: string
              p_offset?: number
            }
          | { p_limit?: number; p_month: string; p_offset?: number }
        Returns: {
          collection_source: string
          comment: string
          create_time: string
          location_id: string
          rating: number
          review_id: string
          reviewer_name: string
          update_time: string
        }[]
      }
      get_reviews_stats: {
        Args: Record<PropertyKey, never> | { p_location_id?: string }
        Returns: {
          avg_rating: number
          five_star_count: number
          five_star_percentage: number
          newest_review: string
          oldest_review: string
          total_reviews: number
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      refresh_monthly_view: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      search_reviews: {
        Args: {
          p_limit?: number
          p_location_id?: string
          p_search_term: string
        }
        Returns: {
          comment: string
          create_time: string
          location_id: string
          match_score: number
          rating: number
          review_id: string
          reviewer_name: string
        }[]
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      unaccent: {
        Args: { "": string }
        Returns: string
      }
      unaccent_init: {
        Args: { "": unknown }
        Returns: unknown
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      review_sentiment: "pos" | "neu" | "neg" | "unknown"
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
    Enums: {
      review_sentiment: ["pos", "neu", "neg", "unknown"],
    },
  },
} as const
