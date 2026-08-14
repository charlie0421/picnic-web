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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string
          description: string
          details: Json | null
          id: number
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          timestamp: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          description: string
          details?: Json | null
          id?: number
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          description?: string
          details?: Json | null
          id?: number
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ad_campaigns: {
        Row: {
          advertiser: string | null
          created_at: string | null
          cta_url: string | null
          id: string
          is_default: boolean
          reward_comment: number
          reward_like: number
          reward_more: number
          reward_subscribe: number
          reward_view: number
          served_count: number
          status: string
          title: string
          total_cap: number | null
          updated_at: string | null
          video_key: string
          visible_from: string | null
          visible_to: string | null
          weight: number
        }
        Insert: {
          advertiser?: string | null
          created_at?: string | null
          cta_url?: string | null
          id?: string
          is_default?: boolean
          reward_comment?: number
          reward_like?: number
          reward_more?: number
          reward_subscribe?: number
          reward_view?: number
          served_count?: number
          status?: string
          title: string
          total_cap?: number | null
          updated_at?: string | null
          video_key: string
          visible_from?: string | null
          visible_to?: string | null
          weight?: number
        }
        Update: {
          advertiser?: string | null
          created_at?: string | null
          cta_url?: string | null
          id?: string
          is_default?: boolean
          reward_comment?: number
          reward_like?: number
          reward_more?: number
          reward_subscribe?: number
          reward_view?: number
          served_count?: number
          status?: string
          title?: string
          total_cap?: number | null
          updated_at?: string | null
          video_key?: string
          visible_from?: string | null
          visible_to?: string | null
          weight?: number
        }
        Relationships: []
      }
      ad_fraud_decisions: {
        Row: {
          created_at: string
          decision: string
          id: number
          impression_id: string
          mode: string
          observed_seconds: number
          signal: string
          threshold_seconds: number
          user_id: string
        }
        Insert: {
          created_at?: string
          decision?: string
          id?: number
          impression_id: string
          mode: string
          observed_seconds: number
          signal: string
          threshold_seconds: number
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: number
          impression_id?: string
          mode?: string
          observed_seconds?: number
          signal?: string
          threshold_seconds?: number
          user_id?: string
        }
        Relationships: []
      }
      ad_fraud_policy: {
        Row: {
          enabled: boolean
          id: number
          min_gap_seconds: number
          min_watch_seconds: number
          mode: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          min_gap_seconds?: number
          min_watch_seconds?: number
          mode?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          min_gap_seconds?: number
          min_watch_seconds?: number
          mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      ad_impressions: {
        Row: {
          ad_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          ip_hash: string | null
          issue_expires_at: string | null
          issue_jti: string | null
          issued_at: string
          more_completed_at: string | null
          more_reward_granted_at: string | null
          user_agent: string | null
          user_id: string
          view_result_grant_id: number | null
          view_reward_acknowledged_at: string | null
          view_reward_granted_at: string | null
          view_reward_payload_hash: string | null
          view_reward_status: string
        }
        Insert: {
          ad_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          issue_expires_at?: string | null
          issue_jti?: string | null
          issued_at?: string
          more_completed_at?: string | null
          more_reward_granted_at?: string | null
          user_agent?: string | null
          user_id: string
          view_result_grant_id?: number | null
          view_reward_acknowledged_at?: string | null
          view_reward_granted_at?: string | null
          view_reward_payload_hash?: string | null
          view_reward_status?: string
        }
        Update: {
          ad_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          issue_expires_at?: string | null
          issue_jti?: string | null
          issued_at?: string
          more_completed_at?: string | null
          more_reward_granted_at?: string | null
          user_agent?: string | null
          user_id?: string
          view_result_grant_id?: number | null
          view_reward_acknowledged_at?: string | null
          view_reward_granted_at?: string | null
          view_reward_payload_hash?: string | null
          view_reward_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_view_grant_user_fk"
            columns: ["view_result_grant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cotton_candy_grants"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ad_reward_claims: {
        Row: {
          acknowledged_at: string | null
          channel: string
          client_request_id: string
          created_at: string
          environment: string
          expires_at: string
          id: string
          payload_hash: string
          placement_id: string
          platform: string
          provider_occurred_at: string | null
          provider_payload_hash: string | null
          provider_received_at: string | null
          provider_transaction_id: string | null
          result_grant_id: number | null
          status: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          channel: string
          client_request_id: string
          created_at?: string
          environment: string
          expires_at: string
          id?: string
          payload_hash: string
          placement_id: string
          platform: string
          provider_occurred_at?: string | null
          provider_payload_hash?: string | null
          provider_received_at?: string | null
          provider_transaction_id?: string | null
          result_grant_id?: number | null
          status?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          channel?: string
          client_request_id?: string
          created_at?: string
          environment?: string
          expires_at?: string
          id?: string
          payload_hash?: string
          placement_id?: string
          platform?: string
          provider_occurred_at?: string | null
          provider_payload_hash?: string | null
          provider_received_at?: string | null
          provider_transaction_id?: string | null
          result_grant_id?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_reward_claims_result_grant_id_user_id_fkey"
            columns: ["result_grant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cotton_candy_grants"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ad_reward_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_reward_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ad_reward_events: {
        Row: {
          ad_id: string
          amount: number
          created_at: string | null
          id: string
          impression_id: string
          type: string
          user_id: string
        }
        Insert: {
          ad_id: string
          amount: number
          created_at?: string | null
          id?: string
          impression_id: string
          type: string
          user_id: string
        }
        Update: {
          ad_id?: string
          amount?: number
          created_at?: string | null
          id?: string
          impression_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_reward_events_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_reward_events_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_reward_events_impression_id_fkey"
            columns: ["impression_id"]
            isOneToOne: false
            referencedRelation: "ad_impressions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permissions: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          permission_key: string | null
          resource: string
          updated_at: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          permission_key?: string | null
          resource: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          permission_key?: string | null
          resource?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_user_roles: {
        Row: {
          created_at: string | null
          id: string
          role_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_whitelist: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      album: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: number
          title: string | null
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id: number
          title?: string | null
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          title?: string | null
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: []
      }
      album_image: {
        Row: {
          album_id: number
          image_id: number
        }
        Insert: {
          album_id: number
          image_id: number
        }
        Update: {
          album_id?: number
          image_id?: number
        }
        Relationships: []
      }
      album_image_user: {
        Row: {
          image_id: number
          user_id: number
        }
        Insert: {
          image_id: number
          user_id: number
        }
        Update: {
          image_id?: number
          user_id?: number
        }
        Relationships: []
      }
      anti_abuse_alert_log: {
        Row: {
          dedup_key: string
          id: number
          payload: Json | null
          rule: string
          sent_at: string
        }
        Insert: {
          dedup_key: string
          id?: number
          payload?: Json | null
          rule: string
          sent_at?: string
        }
        Update: {
          dedup_key?: string
          id?: number
          payload?: Json | null
          rule?: string
          sent_at?: string
        }
        Relationships: []
      }
      anti_abuse_daily_stats: {
        Row: {
          action_type: string
          count: number
          day: string
          decision: string
          mode: string
        }
        Insert: {
          action_type: string
          count: number
          day: string
          decision: string
          mode: string
        }
        Update: {
          action_type?: string
          count?: number
          day?: string
          decision?: string
          mode?: string
        }
        Relationships: []
      }
      anti_abuse_policies: {
        Row: {
          action_type: string
          block_threshold: number
          count_strategy: string
          created_at: string
          device_block_threshold: number | null
          device_suspect_threshold: number | null
          enabled: boolean
          enforce_since: string | null
          id: number
          link_loose_window_seconds: number | null
          link_tight_window_seconds: number | null
          mode: string
          note: string | null
          suspect_threshold: number
          updated_at: string
          updated_by: string | null
          window_seconds: number
        }
        Insert: {
          action_type: string
          block_threshold: number
          count_strategy: string
          created_at?: string
          device_block_threshold?: number | null
          device_suspect_threshold?: number | null
          enabled?: boolean
          enforce_since?: string | null
          id?: number
          link_loose_window_seconds?: number | null
          link_tight_window_seconds?: number | null
          mode?: string
          note?: string | null
          suspect_threshold: number
          updated_at?: string
          updated_by?: string | null
          window_seconds: number
        }
        Update: {
          action_type?: string
          block_threshold?: number
          count_strategy?: string
          created_at?: string
          device_block_threshold?: number | null
          device_suspect_threshold?: number | null
          enabled?: boolean
          enforce_since?: string | null
          id?: number
          link_loose_window_seconds?: number | null
          link_tight_window_seconds?: number | null
          mode?: string
          note?: string | null
          suspect_threshold?: number
          updated_at?: string
          updated_by?: string | null
          window_seconds?: number
        }
        Relationships: []
      }
      app_splash: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          duration: number | null
          end_at: string | null
          id: number
          image: Json | null
          start_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          duration?: number | null
          end_at?: string | null
          id?: number
          image?: Json | null
          start_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          duration?: number | null
          end_at?: string | null
          id?: number
          image?: Json | null
          start_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      application_logs: {
        Row: {
          browser_name: string | null
          category: string
          created_at: string
          data: string | null
          environment: string | null
          id: string
          id_old: string
          level: string
          line_number: number | null
          message: string
          platform: string | null
          request_id: string | null
          rid: string
          session_id: string | null
          source_file: string | null
          stack_trace: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          browser_name?: string | null
          category: string
          created_at?: string
          data?: string | null
          environment?: string | null
          id?: string
          id_old: string
          level: string
          line_number?: number | null
          message: string
          platform?: string | null
          request_id?: string | null
          rid?: string
          session_id?: string | null
          source_file?: string | null
          stack_trace?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          browser_name?: string | null
          category?: string
          created_at?: string
          data?: string | null
          environment?: string | null
          id?: string
          id_old?: string
          level?: string
          line_number?: number | null
          message?: string
          platform?: string | null
          request_id?: string | null
          rid?: string
          session_id?: string | null
          source_file?: string | null
          stack_trace?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      article: {
        Row: {
          comment_count: number | null
          content: string | null
          created_at: string | null
          deleted_at: string | null
          gallery_id: number
          id: number
          title_ko: string | null
          updated_at: string | null
        }
        Insert: {
          comment_count?: number | null
          content?: string | null
          created_at?: string | null
          deleted_at?: string | null
          gallery_id: number
          id?: number
          title_ko?: string | null
          updated_at?: string | null
        }
        Update: {
          comment_count?: number | null
          content?: string | null
          created_at?: string | null
          deleted_at?: string | null
          gallery_id?: number
          id?: number
          title_ko?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "gallery"
            referencedColumns: ["id"]
          },
        ]
      }
      article_comment: {
        Row: {
          article_id: number | null
          childrencount: number | null
          content: string | null
          created_at: string | null
          deleted_at: string | null
          id: number
          likes: number | null
          parent_id: number | null
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          article_id?: number | null
          childrencount?: number | null
          content?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          likes?: number | null
          parent_id?: number | null
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          article_id?: number | null
          childrencount?: number | null
          content?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          likes?: number | null
          parent_id?: number | null
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: []
      }
      article_comment_like: {
        Row: {
          comment_id: number
          user_id: number
        }
        Insert: {
          comment_id: number
          user_id: number
        }
        Update: {
          comment_id?: number
          user_id?: number
        }
        Relationships: []
      }
      article_comment_report: {
        Row: {
          comment_id: number
          user_id: number
        }
        Insert: {
          comment_id: number
          user_id: number
        }
        Update: {
          comment_id?: number
          user_id?: number
        }
        Relationships: []
      }
      article_image: {
        Row: {
          article_id: number
          created_at: string | null
          deleted_at: string | null
          id: number
          image: string | null
          order: number | null
          title_ko: string | null
          updated_at: string | null
        }
        Insert: {
          article_id: number
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          image?: string | null
          order?: number | null
          title_ko?: string | null
          updated_at?: string | null
        }
        Update: {
          article_id?: number
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          image?: string | null
          order?: number | null
          title_ko?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_image_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "article"
            referencedColumns: ["id"]
          },
        ]
      }
      article_image_user: {
        Row: {
          image_id: number
          user_id: string
        }
        Insert: {
          image_id: number
          user_id: string
        }
        Update: {
          image_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_image_user_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "article_image"
            referencedColumns: ["id"]
          },
        ]
      }
      artist: {
        Row: {
          birth_date: string | null
          created_at: string
          dd: number | null
          debut_date: string | null
          debut_dd: number | null
          debut_mm: number | null
          debut_yy: number | null
          deleted_at: string | null
          gender: string | null
          group_id: number | null
          id: number
          image: string | null
          is_kpop: boolean
          is_musical: boolean
          is_partnership: boolean | null
          is_solo: boolean
          mm: number | null
          name: Json | null
          partner: string | null
          partner_data: string | null
          updated_at: string
          yy: number | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          dd?: number | null
          debut_date?: string | null
          debut_dd?: number | null
          debut_mm?: number | null
          debut_yy?: number | null
          deleted_at?: string | null
          gender?: string | null
          group_id?: number | null
          id?: number
          image?: string | null
          is_kpop?: boolean
          is_musical?: boolean
          is_partnership?: boolean | null
          is_solo?: boolean
          mm?: number | null
          name?: Json | null
          partner?: string | null
          partner_data?: string | null
          updated_at?: string
          yy?: number | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          dd?: number | null
          debut_date?: string | null
          debut_dd?: number | null
          debut_mm?: number | null
          debut_yy?: number | null
          deleted_at?: string | null
          gender?: string | null
          group_id?: number | null
          id?: number
          image?: string | null
          is_kpop?: boolean
          is_musical?: boolean
          is_partnership?: boolean | null
          is_solo?: boolean
          mm?: number | null
          name?: Json | null
          partner?: string | null
          partner_data?: string | null
          updated_at?: string
          yy?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "artist_group"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_group: {
        Row: {
          created_at: string
          debut_date: string | null
          debut_dd: number | null
          debut_mm: number | null
          debut_yy: number | null
          deleted_at: string | null
          id: number
          image: string | null
          name: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          debut_date?: string | null
          debut_dd?: number | null
          debut_mm?: number | null
          debut_yy?: number | null
          deleted_at?: string | null
          id?: number
          image?: string | null
          name?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          debut_date?: string | null
          debut_dd?: number | null
          debut_mm?: number | null
          debut_yy?: number | null
          deleted_at?: string | null
          id?: number
          image?: string | null
          name?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      artist_user_bookmark: {
        Row: {
          artist_id: number | null
          created_at: string
          deleted_at: string | null
          id: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          artist_id?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          artist_id?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_user_bookmark_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_user_bookmark_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_user_bookmark_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_user_bookmark_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_user_bookmark_user_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_user_bookmark_user_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      artist_vote: {
        Row: {
          category: string | null
          content: Json | null
          created_at: string | null
          deleted_at: string | null
          id: number
          start_at: string | null
          stop_at: string | null
          title: Json | null
          updated_at: string | null
          visible_at: string | null
        }
        Insert: {
          category?: string | null
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string | null
          visible_at?: string | null
        }
        Update: {
          category?: string | null
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string | null
          visible_at?: string | null
        }
        Relationships: []
      }
      artist_vote_item: {
        Row: {
          artist_vote_id: number | null
          created_at: string | null
          deleted_at: string | null
          description: Json | null
          id: number
          title: Json | null
          updated_at: string | null
          vote_total: number | null
        }
        Insert: {
          artist_vote_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: Json | null
          id?: number
          title?: Json | null
          updated_at?: string | null
          vote_total?: number | null
        }
        Update: {
          artist_vote_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: Json | null
          id?: number
          title?: Json | null
          updated_at?: string | null
          vote_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_vote_item_artist_vote_id_fkey"
            columns: ["artist_vote_id"]
            isOneToOne: false
            referencedRelation: "artist_vote"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_check: {
        Row: {
          check_date: string
          created_at: string
          id: number
          reward_amount: number
          user_id: string
          weekly_bonus_amount: number
        }
        Insert: {
          check_date: string
          created_at?: string
          id?: never
          reward_amount?: number
          user_id: string
          weekly_bonus_amount?: number
        }
        Update: {
          check_date?: string
          created_at?: string
          id?: never
          reward_amount?: number
          user_id?: string
          weekly_bonus_amount?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_description: string
          action_type: string
          changed_fields: string | null
          classification: string | null
          created_at: string
          error_message: string | null
          id: string
          id_old: string
          ip_address: string | null
          metadata: string | null
          method: string | null
          new_values: string | null
          old_values: string | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string
          retention_period: number | null
          rid: string
          session_id: string | null
          severity: string
          status_code: number | null
          success: boolean
          tags: string | null
          timestamp: string
          updated_at: string
          url: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_roles: string | null
        }
        Insert: {
          action_description: string
          action_type: string
          changed_fields?: string | null
          classification?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          id_old: string
          ip_address?: string | null
          metadata?: string | null
          method?: string | null
          new_values?: string | null
          old_values?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type: string
          retention_period?: number | null
          rid?: string
          session_id?: string | null
          severity: string
          status_code?: number | null
          success?: boolean
          tags?: string | null
          timestamp?: string
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_roles?: string | null
        }
        Update: {
          action_description?: string
          action_type?: string
          changed_fields?: string | null
          classification?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          id_old?: string
          ip_address?: string | null
          metadata?: string | null
          method?: string | null
          new_values?: string | null
          old_values?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string
          retention_period?: number | null
          rid?: string
          session_id?: string | null
          severity?: string
          status_code?: number | null
          success?: boolean
          tags?: string | null
          timestamp?: string
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_roles?: string | null
        }
        Relationships: []
      }
      awsdms_ddl_audit: {
        Row: {
          c_ddlqry: string | null
          c_key: number
          c_name: string | null
          c_oid: number | null
          c_schema: string | null
          c_tag: string | null
          c_time: string | null
          c_txn: string | null
          c_user: string | null
        }
        Insert: {
          c_ddlqry?: string | null
          c_key?: number
          c_name?: string | null
          c_oid?: number | null
          c_schema?: string | null
          c_tag?: string | null
          c_time?: string | null
          c_txn?: string | null
          c_user?: string | null
        }
        Update: {
          c_ddlqry?: string | null
          c_key?: number
          c_name?: string | null
          c_oid?: number | null
          c_schema?: string | null
          c_tag?: string | null
          c_time?: string | null
          c_txn?: string | null
          c_user?: string | null
        }
        Relationships: []
      }
      banner: {
        Row: {
          celeb_id: number | null
          created_at: string | null
          deleted_at: string | null
          duration: number | null
          end_at: string | null
          id: number
          image: Json | null
          link: string | null
          link_target_id: number | null
          link_type: string | null
          location: string | null
          order: number | null
          promotion_campaign_owned: boolean
          start_at: string | null
          thumbnail: string | null
          title: Json
          updated_at: string | null
        }
        Insert: {
          celeb_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          duration?: number | null
          end_at?: string | null
          id?: number
          image?: Json | null
          link?: string | null
          link_target_id?: number | null
          link_type?: string | null
          location?: string | null
          order?: number | null
          promotion_campaign_owned?: boolean
          start_at?: string | null
          thumbnail?: string | null
          title?: Json
          updated_at?: string | null
        }
        Update: {
          celeb_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          duration?: number | null
          end_at?: string | null
          id?: number
          image?: Json | null
          link?: string | null
          link_target_id?: number | null
          link_type?: string | null
          location?: string | null
          order?: number | null
          promotion_campaign_owned?: boolean
          start_at?: string | null
          thumbnail?: string | null
          title?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      batch_log: {
        Row: {
          batch_name: string | null
          details: Json | null
          end_time: string | null
          id: number
          start_time: string | null
          status: string | null
        }
        Insert: {
          batch_name?: string | null
          details?: Json | null
          end_time?: string | null
          id?: number
          start_time?: string | null
          status?: string | null
        }
        Update: {
          batch_name?: string | null
          details?: Json | null
          end_time?: string | null
          id?: number
          start_time?: string | null
          status?: string | null
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string | null
          id: number
          ip_address: string
          reason: string | null
          rid: string
        }
        Insert: {
          blocked_at?: string | null
          id?: never
          ip_address: string
          reason?: string | null
          rid?: string
        }
        Update: {
          blocked_at?: string | null
          id?: never
          ip_address?: string
          reason?: string | null
          rid?: string
        }
        Relationships: []
      }
      board_user_bookmark: {
        Row: {
          board_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      boards: {
        Row: {
          artist_id: number
          board_id: string
          created_at: string
          creator_id: string | null
          deleted_at: string | null
          description: string | null
          features: string[] | null
          id: string
          is_official: boolean | null
          name: Json
          order: number | null
          parent_board_id: string | null
          request_message: string | null
          status: Database["public"]["Enums"]["board_status_enum"]
          updated_at: string
        }
        Insert: {
          artist_id: number
          board_id?: string
          created_at?: string
          creator_id?: string | null
          deleted_at?: string | null
          description?: string | null
          features?: string[] | null
          id: string
          is_official?: boolean | null
          name: Json
          order?: number | null
          parent_board_id?: string | null
          request_message?: string | null
          status: Database["public"]["Enums"]["board_status_enum"]
          updated_at?: string
        }
        Update: {
          artist_id?: number
          board_id?: string
          created_at?: string
          creator_id?: string | null
          deleted_at?: string | null
          description?: string | null
          features?: string[] | null
          id?: string
          is_official?: boolean | null
          name?: Json
          order?: number | null
          parent_board_id?: string | null
          request_message?: string | null
          status?: Database["public"]["Enums"]["board_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_boards_artist"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_boards_artist"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fk_boards_artist"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fk_boards_artist"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      bonus_expiry_log: {
        Row: {
          created_at: string | null
          details: Json | null
          id: number
          operation: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: number
          operation?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: number
          operation?: string | null
        }
        Relationships: []
      }
      broadcast_notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          created_by: string | null
          data: Json | null
          id: number
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          id?: number
          title: string
          type?: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          id?: number
          title?: string
          type?: string
        }
        Relationships: []
      }
      celeb: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: number
          name_ko: string | null
          thumbnail: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          name_ko?: string | null
          thumbnail?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          name_ko?: string | null
          thumbnail?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      celeb_bookmark_user: {
        Row: {
          celeb_id: number
          user_id: string
        }
        Insert: {
          celeb_id: number
          user_id: string
        }
        Update: {
          celeb_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "celeb_user_celeb_id_fkey"
            columns: ["celeb_id"]
            isOneToOne: false
            referencedRelation: "celeb"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          comment_like_id: string
          created_at: string
          deleted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          comment_like_id?: string
          created_at?: string
          deleted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          comment_like_id?: string
          created_at?: string
          deleted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["comment_id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          comment_report_id: string
          created_at: string | null
          deleted_at: string | null
          reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment_id: string
          comment_report_id?: string
          created_at?: string | null
          deleted_at?: string | null
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment_id?: string
          comment_report_id?: string
          created_at?: string | null
          deleted_at?: string | null
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["comment_id"]
          },
        ]
      }
      comments: {
        Row: {
          comment_id: string
          content: Json | null
          created_at: string
          deleted_at: string | null
          is_hidden: boolean | null
          likes: number
          locale: string | null
          parent_comment_id: string | null
          post_id: string
          replies: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment_id?: string
          content?: Json | null
          created_at?: string
          deleted_at?: string | null
          is_hidden?: boolean | null
          likes?: number
          locale?: string | null
          parent_comment_id?: string | null
          post_id: string
          replies?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment_id?: string
          content?: Json | null
          created_at?: string
          deleted_at?: string | null
          is_hidden?: boolean | null
          likes?: number
          locale?: string | null
          parent_comment_id?: string | null
          post_id?: string
          replies?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      config: {
        Row: {
          created_at: string | null
          id: string | null
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      config_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          config_key: string
          id: number
          new_value: string | null
          old_value: string | null
          op: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          config_key: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          op: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          config_key?: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          op?: string
        }
        Relationships: []
      }
      cotton_candy_grants: {
        Row: {
          canonical_payload_hash: string
          claim_id: string | null
          expires_at: string
          granted_at: string
          id: number
          idempotency_key: string
          impression_id: string | null
          metadata: Json
          original_amount: number
          provider_payload_hash: string
          remain_amount: number
          reward_policy_version: string
          source_environment: string
          source_event_type: string
          source_provider: string
          source_transaction_id: string
          user_id: string
        }
        Insert: {
          canonical_payload_hash: string
          claim_id?: string | null
          expires_at: string
          granted_at: string
          id?: never
          idempotency_key: string
          impression_id?: string | null
          metadata?: Json
          original_amount: number
          provider_payload_hash: string
          remain_amount: number
          reward_policy_version: string
          source_environment: string
          source_event_type: string
          source_provider: string
          source_transaction_id: string
          user_id: string
        }
        Update: {
          canonical_payload_hash?: string
          claim_id?: string | null
          expires_at?: string
          granted_at?: string
          id?: never
          idempotency_key?: string
          impression_id?: string | null
          metadata?: Json
          original_amount?: number
          provider_payload_hash?: string
          remain_amount?: number
          reward_policy_version?: string
          source_environment?: string
          source_event_type?: string
          source_provider?: string
          source_transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotton_candy_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotton_candy_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cotton_grant_claim_user_fk"
            columns: ["claim_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ad_reward_claims"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "cotton_grant_impression_user_fk"
            columns: ["impression_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ad_impressions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      cotton_candy_ledger: {
        Row: {
          amount_delta: number
          created_at: string
          event_type: string
          grant_id: number
          id: number
          operation_key: string
          source_reference: string | null
          user_id: string
          vote_pick_id: number | null
        }
        Insert: {
          amount_delta: number
          created_at?: string
          event_type: string
          grant_id: number
          id?: never
          operation_key: string
          source_reference?: string | null
          user_id: string
          vote_pick_id?: number | null
        }
        Update: {
          amount_delta?: number
          created_at?: string
          event_type?: string
          grant_id?: number
          id?: never
          operation_key?: string
          source_reference?: string | null
          user_id?: string
          vote_pick_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotton_candy_ledger_grant_id_user_id_fkey"
            columns: ["grant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cotton_candy_grants"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "cotton_candy_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotton_candy_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      country_info: {
        Row: {
          country_code: string
          country_name: string
          gdp: number | null
          last_updated: string | null
          population: number | null
        }
        Insert: {
          country_code: string
          country_name: string
          gdp?: number | null
          last_updated?: string | null
          population?: number | null
        }
        Update: {
          country_code?: string
          country_name?: string
          gdp?: number | null
          last_updated?: string | null
          population?: number | null
        }
        Relationships: []
      }
      cron_logs: {
        Row: {
          created_at: string
          ended_at: string | null
          id: number
          job_name: string
          log_message: string | null
          started_at: string
          status: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: number
          job_name: string
          log_message?: string | null
          started_at: string
          status?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: number
          job_name?: string
          log_message?: string | null
          started_at?: string
          status?: string | null
        }
        Relationships: []
      }
      cs_4_11_ad_fast_analysis: {
        Row: {
          min_real_gap: number | null
          sub_classification: string | null
          sub1_real_fast: number | null
          sub5_real_fast: number | null
          sub5_sdk_retry: number | null
          sub5_total: number | null
          user_id: string
        }
        Insert: {
          min_real_gap?: number | null
          sub_classification?: string | null
          sub1_real_fast?: number | null
          sub5_real_fast?: number | null
          sub5_sdk_retry?: number | null
          sub5_total?: number | null
          user_id: string
        }
        Update: {
          min_real_gap?: number | null
          sub_classification?: string | null
          sub1_real_fast?: number | null
          sub5_real_fast?: number | null
          sub5_sdk_retry?: number | null
          sub5_total?: number | null
          user_id?: string
        }
        Relationships: []
      }
      custom_logs: {
        Row: {
          details: Json | null
          log_id: number
          log_time: string | null
          operation: string | null
        }
        Insert: {
          details?: Json | null
          log_id?: number
          log_time?: string | null
          operation?: string | null
        }
        Update: {
          details?: Json | null
          log_id?: number
          log_time?: string | null
          operation?: string | null
        }
        Relationships: []
      }
      debug_db_logs: {
        Row: {
          detail: Json | null
          function_name: string
          id: number
          log_time: string | null
          step: string | null
        }
        Insert: {
          detail?: Json | null
          function_name: string
          id?: number
          log_time?: string | null
          step?: string | null
        }
        Update: {
          detail?: Json | null
          function_name?: string
          id?: number
          log_time?: string | null
          step?: string | null
        }
        Relationships: []
      }
      debug_logs: {
        Row: {
          created_at: string | null
          id: number
          log_message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          log_message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          log_message?: string | null
        }
        Relationships: []
      }
      device_bans: {
        Row: {
          banned_at: string | null
          banned_by: string | null
          created_at: string | null
          device_id: string | null
          id: string
          reason: string | null
          unbanned_at: string | null
        }
        Insert: {
          banned_at?: string | null
          banned_by?: string | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          reason?: string | null
          unbanned_at?: string | null
        }
        Update: {
          banned_at?: string | null
          banned_by?: string | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          reason?: string | null
          unbanned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_bans_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          },
        ]
      }
      devices: {
        Row: {
          app_build_number: string | null
          app_version: string | null
          ban_reason: string | null
          banned_at: string | null
          created_at: string | null
          device_id: string
          device_info: Json | null
          id: number
          is_banned: boolean | null
          last_ip: string | null
          last_seen: string | null
          last_updated: string | null
          rid: string
          user_id: string | null
        }
        Insert: {
          app_build_number?: string | null
          app_version?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string | null
          device_id: string
          device_info?: Json | null
          id?: never
          is_banned?: boolean | null
          last_ip?: string | null
          last_seen?: string | null
          last_updated?: string | null
          rid?: string
          user_id?: string | null
        }
        Update: {
          app_build_number?: string | null
          app_version?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string | null
          device_id?: string
          device_info?: Json | null
          id?: never
          is_banned?: boolean | null
          last_ip?: string | null
          last_seen?: string | null
          last_updated?: string | null
          rid?: string
          user_id?: string | null
        }
        Relationships: []
      }
      faq_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: number
          label: Json
          order_number: number
          rid: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: never
          label: Json
          order_number?: number
          rid?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: never
          label?: Json
          order_number?: number
          rid?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: Json
          answer_delta: Json | null
          category: string | null
          created_at: string | null
          created_by: string | null
          id: number
          order_number: number | null
          question: Json
          status: string | null
          updated_at: string | null
        }
        Insert: {
          answer: Json
          answer_delta?: Json | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: number
          order_number?: number | null
          question: Json
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          answer?: Json
          answer_delta?: Json | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: number
          order_number?: number | null
          question?: Json
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faqs_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "faq_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "faqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      fortune_batch_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          failed_count: number | null
          id: number
          processed_count: number | null
          status: string | null
          total_artists: number | null
          year: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: number
          processed_count?: number | null
          status?: string | null
          total_artists?: number | null
          year?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: number
          processed_count?: number | null
          status?: string | null
          total_artists?: number | null
          year?: number | null
        }
        Relationships: []
      }
      fortune_generation_log: {
        Row: {
          artist_id: number | null
          created_at: string | null
          error_message: string | null
          id: number
          status: string | null
          year: number | null
        }
        Insert: {
          artist_id?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: number
          status?: string | null
          year?: number | null
        }
        Update: {
          artist_id?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: number
          status?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fortune_generation_log_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fortune_generation_log_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_generation_log_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_generation_log_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      fortune_telling: {
        Row: {
          advice: string[]
          artist_id: number
          aspects: Json
          created_at: string | null
          id: string
          lucky: Json
          monthly_fortunes: Json
          overall_luck: string
          updated_at: string | null
          year: number
        }
        Insert: {
          advice: string[]
          artist_id: number
          aspects: Json
          created_at?: string | null
          id?: string
          lucky: Json
          monthly_fortunes: Json
          overall_luck: string
          updated_at?: string | null
          year: number
        }
        Update: {
          advice?: string[]
          artist_id?: number
          aspects?: Json
          created_at?: string | null
          id?: string
          lucky?: Json
          monthly_fortunes?: Json
          overall_luck?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fortune_telling_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fortune_telling_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_telling_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_telling_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      fortune_telling_i18n: {
        Row: {
          advice: string[]
          artist_id: number
          aspects: Json
          created_at: string | null
          fortune_id: string
          id: string
          language: string
          lucky: Json
          monthly_fortunes: Json
          overall_luck: string
          updated_at: string | null
          year: number
        }
        Insert: {
          advice: string[]
          artist_id: number
          aspects: Json
          created_at?: string | null
          fortune_id: string
          id?: string
          language: string
          lucky: Json
          monthly_fortunes: Json
          overall_luck: string
          updated_at?: string | null
          year: number
        }
        Update: {
          advice?: string[]
          artist_id?: number
          aspects?: Json
          created_at?: string | null
          fortune_id?: string
          id?: string
          language?: string
          lucky?: Json
          monthly_fortunes?: Json
          overall_luck?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fortune_telling_i18n_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fortune_telling_i18n_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_telling_i18n_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_telling_i18n_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "fortune_telling_i18n_fortune_id_artist_id_year_fkey"
            columns: ["fortune_id", "artist_id", "year"]
            isOneToOne: false
            referencedRelation: "fortune_telling"
            referencedColumns: ["id", "artist_id", "year"]
          },
          {
            foreignKeyName: "fortune_telling_i18n_fortune_id_fkey"
            columns: ["fortune_id"]
            isOneToOne: false
            referencedRelation: "fortune_telling"
            referencedColumns: ["id"]
          },
        ]
      }
      function_request_log: {
        Row: {
          code: number | null
          function_name: string
          id: number
          ip: string | null
          meta: Json | null
          ok: boolean | null
          reason: string | null
          ts: string
          user_id: string | null
        }
        Insert: {
          code?: number | null
          function_name: string
          id?: number
          ip?: string | null
          meta?: Json | null
          ok?: boolean | null
          reason?: string | null
          ts?: string
          user_id?: string | null
        }
        Update: {
          code?: number | null
          function_name?: string
          id?: number
          ip?: string | null
          meta?: Json | null
          ok?: boolean | null
          reason?: string | null
          ts?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gallery: {
        Row: {
          celeb_id: number
          cover: string | null
          created_at: string
          deleted_at: string | null
          id: number
          title: Json | null
          title_ko: string | null
          updated_at: string
        }
        Insert: {
          celeb_id: number
          cover?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          title?: Json | null
          title_ko?: string | null
          updated_at?: string
        }
        Update: {
          celeb_id?: number
          cover?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          title?: Json | null
          title_ko?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_celeb_id_fkey"
            columns: ["celeb_id"]
            isOneToOne: false
            referencedRelation: "celeb"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_user: {
        Row: {
          gallery_id: number
          user_id: number
        }
        Insert: {
          gallery_id: number
          user_id: number
        }
        Update: {
          gallery_id?: number
          user_id?: number
        }
        Relationships: []
      }
      goonghap_results: {
        Row: {
          artist_id: number
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          gender: Database["public"]["Enums"]["user_gender_enum"] | null
          id: string
          idol_birth_date: string
          is_ads: boolean | null
          is_paid: boolean
          paid_at: string | null
          score: number | null
          status: Database["public"]["Enums"]["goonghap_status"]
          tips: Json | null
          user_birth_date: string
          user_birth_time: string | null
          user_id: string
        }
        Insert: {
          artist_id: number
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          gender?: Database["public"]["Enums"]["user_gender_enum"] | null
          id?: string
          idol_birth_date: string
          is_ads?: boolean | null
          is_paid?: boolean
          paid_at?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["goonghap_status"]
          tips?: Json | null
          user_birth_date: string
          user_birth_time?: string | null
          user_id: string
        }
        Update: {
          artist_id?: number
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          gender?: Database["public"]["Enums"]["user_gender_enum"] | null
          id?: string
          idol_birth_date?: string
          is_ads?: boolean | null
          is_paid?: boolean
          paid_at?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["goonghap_status"]
          tips?: Json | null
          user_birth_date?: string
          user_birth_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      goonghap_results_i18n: {
        Row: {
          created_at: string
          details: Json | null
          goonghap_id: string
          goonghap_summary: string | null
          id: string
          language: string
          score: number | null
          score_title: string | null
          tips: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          goonghap_id: string
          goonghap_summary?: string | null
          id?: string
          language: string
          score?: number | null
          score_title?: string | null
          tips?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          goonghap_id?: string
          goonghap_summary?: string | null
          id?: string
          language?: string
          score?: number | null
          score_title?: string | null
          tips?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_compatibility"
            columns: ["goonghap_id"]
            isOneToOne: false
            referencedRelation: "compatibility_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compatibility"
            columns: ["goonghap_id"]
            isOneToOne: false
            referencedRelation: "goonghap_results"
            referencedColumns: ["id"]
          },
        ]
      }
      goonghap_score_descriptions: {
        Row: {
          score: number
          summary_ja: string
          summary_ko: string
          summary_zh: string
          title_ja: string | null
          title_ko: string | null
          title_zh: string | null
        }
        Insert: {
          score: number
          summary_ja: string
          summary_ko: string
          summary_zh: string
          title_ja?: string | null
          title_ko?: string | null
          title_zh?: string | null
        }
        Update: {
          score?: number
          summary_ja?: string
          summary_ko?: string
          summary_zh?: string
          title_ja?: string | null
          title_ko?: string | null
          title_zh?: string | null
        }
        Relationships: []
      }
      ip_block_decisions: {
        Row: {
          action_type: string
          applied_window: number
          attempt_count: number
          attempted_email: string | null
          attempted_provider: string | null
          cs_resolution: string | null
          decision: string
          expires_at: string | null
          first_seen_at: string
          id: number
          ip_hash: string
          last_seen_at: string
          mode: string
          observed_value: number
          raw_ip: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          threshold_used: number
          user_id: string | null
        }
        Insert: {
          action_type: string
          applied_window: number
          attempt_count?: number
          attempted_email?: string | null
          attempted_provider?: string | null
          cs_resolution?: string | null
          decision: string
          expires_at?: string | null
          first_seen_at?: string
          id?: number
          ip_hash: string
          last_seen_at?: string
          mode: string
          observed_value: number
          raw_ip?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          threshold_used: number
          user_id?: string | null
        }
        Update: {
          action_type?: string
          applied_window?: number
          attempt_count?: number
          attempted_email?: string | null
          attempted_provider?: string | null
          cs_resolution?: string | null
          decision?: string
          expires_at?: string | null
          first_seen_at?: string
          id?: number
          ip_hash?: string
          last_seen_at?: string
          mode?: string
          observed_value?: number
          raw_ip?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          threshold_used?: number
          user_id?: string | null
        }
        Relationships: []
      }
      ip_country_mapping: {
        Row: {
          country_code: string
          id: number
          ip_range_end: number
          ip_range_start: number
          last_updated: string | null
        }
        Insert: {
          country_code: string
          id?: number
          ip_range_end: number
          ip_range_start: number
          last_updated?: string | null
        }
        Update: {
          country_code?: string
          id?: number
          ip_range_end?: number
          ip_range_start?: number
          last_updated?: string | null
        }
        Relationships: []
      }
      library: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: number
          title: string | null
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          title?: string | null
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          title?: string | null
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: []
      }
      library_image: {
        Row: {
          image_id: number
          library_id: number
        }
        Insert: {
          image_id: number
          library_id: number
        }
        Update: {
          image_id?: number
          library_id?: number
        }
        Relationships: []
      }
      media: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: number
          thumbnail_url: string | null
          title: Json | null
          updated_at: string
          video_id: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          thumbnail_url?: string | null
          title?: Json | null
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          thumbnail_url?: string | null
          title?: Json | null
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      notices: {
        Row: {
          content: Json
          created_at: string | null
          created_by: string | null
          id: number
          is_pinned: boolean | null
          status: string | null
          title: Json
          updated_at: string | null
        }
        Insert: {
          content: Json
          created_at?: string | null
          created_by?: string | null
          id?: number
          is_pinned?: boolean | null
          status?: string | null
          title: Json
          updated_at?: string | null
        }
        Update: {
          content?: Json
          created_at?: string | null
          created_by?: string | null
          id?: number
          is_pinned?: boolean | null
          status?: string | null
          title?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ops_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          details: Json
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          notified_at: string | null
          occurrence_count: number
          resolved_at: string | null
          resolved_by: string | null
          row_version: number
          severity: string
          status: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          details?: Json
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notified_at?: string | null
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          row_version?: number
          severity: string
          status?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          details?: Json
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notified_at?: string | null
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          row_version?: number
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      partition_creation_log: {
        Row: {
          created_at: string | null
          id: number
          message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          resource: string
          updated_at: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          resource: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          resource?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pic_vote: {
        Row: {
          area: string | null
          created_at: string
          deleted_at: string | null
          id: number
          main_image: string | null
          order: number | null
          result_image: string | null
          start_at: string | null
          stop_at: string | null
          title: Json | null
          updated_at: string
          visible_at: string | null
          vote_category: string | null
          vote_content: string | null
          wait_image: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          main_image?: string | null
          order?: number | null
          result_image?: string | null
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string
          visible_at?: string | null
          vote_category?: string | null
          vote_content?: string | null
          wait_image?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          main_image?: string | null
          order?: number | null
          result_image?: string | null
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string
          visible_at?: string | null
          vote_category?: string | null
          vote_content?: string | null
          wait_image?: string | null
        }
        Relationships: []
      }
      pic_vote_item: {
        Row: {
          artist_id: number | null
          created_at: string | null
          deleted_at: string | null
          group_id: number | null
          id: number
          updated_at: string | null
          vote_id: number | null
          vote_total: number | null
        }
        Insert: {
          artist_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          group_id?: number | null
          id?: number
          updated_at?: string | null
          vote_id?: number | null
          vote_total?: number | null
        }
        Update: {
          artist_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          group_id?: number | null
          id?: number
          updated_at?: string | null
          vote_id?: number | null
          vote_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pic_vote_item_artist_group_id_fk"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "artist_group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pic_vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pic_vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "pic_vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "pic_vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "pic_vote_item_pic_vote_id_fk"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "pic_vote"
            referencedColumns: ["id"]
          },
        ]
      }
      pic_vote_pick: {
        Row: {
          amount: number | null
          created_at: string | null
          deleted_at: string | null
          id: number
          updated_at: string | null
          user_id: string | null
          vote_id: number | null
          vote_item_id: number
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          updated_at?: string | null
          user_id?: string | null
          vote_id?: number | null
          vote_item_id: number
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          updated_at?: string | null
          user_id?: string | null
          vote_id?: number | null
          vote_item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pic_vote_pick_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pic_vote_pick_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pic_vote_pick_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "pic_vote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pic_vote_pick_vote_item_id_fkey"
            columns: ["vote_item_id"]
            isOneToOne: false
            referencedRelation: "pic_vote_item"
            referencedColumns: ["id"]
          },
        ]
      }
      pic_vote_reward: {
        Row: {
          reward_id: number
          vote_id: number
        }
        Insert: {
          reward_id: number
          vote_id: number
        }
        Update: {
          reward_id?: number
          vote_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pic_vote_reward_pic_vote_id_fk"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "pic_vote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pic_vote_reward_reward_id_fk"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward"
            referencedColumns: ["id"]
          },
        ]
      }
      pocapop_base_frames: {
        Row: {
          category: string
          color_tone: string | null
          created_at: string | null
          generation_type: string | null
          id: string
          name: string
          png_url: string
          thumbnail_url: string
        }
        Insert: {
          category: string
          color_tone?: string | null
          created_at?: string | null
          generation_type?: string | null
          id?: string
          name: string
          png_url: string
          thumbnail_url: string
        }
        Update: {
          category?: string
          color_tone?: string | null
          created_at?: string | null
          generation_type?: string | null
          id?: string
          name?: string
          png_url?: string
          thumbnail_url?: string
        }
        Relationships: []
      }
      pocapop_categories: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          labels: Json
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          labels?: Json
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          labels?: Json
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      pocapop_community_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_community_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "pocapop_community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "pocapop_community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "pocapop_community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_community_posts: {
        Row: {
          artist_tags: string[] | null
          auto_shared: boolean | null
          country: string | null
          created_at: string | null
          frame_id: string
          id: string
          nickname: string
          thumbnail_url: string
          user_id: string
        }
        Insert: {
          artist_tags?: string[] | null
          auto_shared?: boolean | null
          country?: string | null
          created_at?: string | null
          frame_id: string
          id?: string
          nickname: string
          thumbnail_url: string
          user_id: string
        }
        Update: {
          artist_tags?: string[] | null
          auto_shared?: boolean | null
          country?: string | null
          created_at?: string | null
          frame_id?: string
          id?: string
          nickname?: string
          thumbnail_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_community_posts_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "pocapop_user_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_coupon_redemptions: {
        Row: {
          coupon_id: string
          id: string
          redeemed_at: string | null
          trial_count_added: number
          user_id: string
        }
        Insert: {
          coupon_id: string
          id?: string
          redeemed_at?: string | null
          trial_count_added?: number
          user_id: string
        }
        Update: {
          coupon_id?: string
          id?: string
          redeemed_at?: string | null
          trial_count_added?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "pocapop_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_coupons: {
        Row: {
          code: string
          created_at: string | null
          current_uses: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          trial_count: number
        }
        Insert: {
          code: string
          created_at?: string | null
          current_uses?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          trial_count?: number
        }
        Update: {
          code?: string
          created_at?: string | null
          current_uses?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          trial_count?: number
        }
        Relationships: []
      }
      pocapop_download_logs: {
        Row: {
          download_type: string
          downloaded_at: string | null
          frame_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          download_type: string
          downloaded_at?: string | null
          frame_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          download_type?: string
          downloaded_at?: string | null
          frame_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_download_logs_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "pocapop_user_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_download_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_download_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_frame_purchases: {
        Row: {
          frame_id: string
          id: string
          price_paid: number
          purchased_at: string
          user_id: string
        }
        Insert: {
          frame_id: string
          id?: string
          price_paid: number
          purchased_at?: string
          user_id: string
        }
        Update: {
          frame_id?: string
          id?: string
          price_paid?: number
          purchased_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_frame_purchases_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "pocapop_market_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_frame_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_frame_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_hd_download_counts: {
        Row: {
          count: number | null
          date: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          count?: number | null
          date: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          count?: number | null
          date?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_hd_download_counts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_hd_download_counts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_market_frames: {
        Row: {
          category: string | null
          created_at: string
          creator_id: string
          description: string | null
          id: string
          image_url: string
          price_star_candy: number | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          image_url: string
          price_star_candy?: number | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          image_url?: string
          price_star_candy?: number | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_market_frames_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_market_frames_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_reports: {
        Row: {
          comment_id: string | null
          created_at: string | null
          id: string
          post_id: string | null
          reason: string | null
          report_type: string
          reported_user_id: string | null
          reporter_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string | null
          id?: string
          post_id?: string | null
          reason?: string | null
          report_type: string
          reported_user_id?: string | null
          reporter_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string | null
          id?: string
          post_id?: string | null
          reason?: string | null
          report_type?: string
          reported_user_id?: string | null
          reporter_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "pocapop_community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "pocapop_community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pocapop_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pocapop_user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_user_frames: {
        Row: {
          artist_name: string
          base_frame_id: string | null
          concept_keywords: string[] | null
          created_at: string | null
          frame_type: string | null
          hd_image_url: string
          id: string
          poka_size: string | null
          sd_image_url: string
          user_id: string | null
        }
        Insert: {
          artist_name: string
          base_frame_id?: string | null
          concept_keywords?: string[] | null
          created_at?: string | null
          frame_type?: string | null
          hd_image_url: string
          id?: string
          poka_size?: string | null
          sd_image_url: string
          user_id?: string | null
        }
        Update: {
          artist_name?: string
          base_frame_id?: string | null
          concept_keywords?: string[] | null
          created_at?: string | null
          frame_type?: string | null
          hd_image_url?: string
          id?: string
          poka_size?: string | null
          sd_image_url?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_user_frames_base_frame_id_fkey"
            columns: ["base_frame_id"]
            isOneToOne: false
            referencedRelation: "pocapop_base_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_user_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_user_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pocapop_user_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          pro_trial_count: number | null
          subscription_expires_at: string | null
          subscription_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          pro_trial_count?: number | null
          subscription_expires_at?: string | null
          subscription_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          pro_trial_count?: number | null
          subscription_expires_at?: string | null
          subscription_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocapop_user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocapop_user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      policy: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: number
          language: Database["public"]["Enums"]["policy_language_enum"] | null
          type: string | null
          updated_at: string
          version: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: number
          language?: Database["public"]["Enums"]["policy_language_enum"] | null
          type?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: number
          language?: Database["public"]["Enums"]["policy_language_enum"] | null
          type?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      popup: {
        Row: {
          content: Json | null
          created_at: string | null
          deleted_at: string | null
          id: number
          image: Json | null
          platform: string | null
          start_at: string | null
          stop_at: string | null
          title: Json | null
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          image?: Json | null
          platform?: string | null
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          image?: Json | null
          platform?: string | null
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      post_attachments: {
        Row: {
          attachment_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          post_id: string | null
        }
        Insert: {
          attachment_id?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          post_id?: string | null
        }
        Update: {
          attachment_id?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          post_id?: string | null
        }
        Relationships: []
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          post_id: string | null
          post_report_id: string
          reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          post_id?: string | null
          post_report_id?: string
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          post_id?: string | null
          post_report_id?: string
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      post_scraps: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          post_id: string | null
          post_scrap_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          post_id?: string | null
          post_scrap_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          post_id?: string | null
          post_scrap_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_scrap_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_scraps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_scraps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      post_views: {
        Row: {
          post_id: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          post_id: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          post_id?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      posts: {
        Row: {
          attachments: string[] | null
          board_id: string | null
          content: Json[] | null
          created_at: string
          deleted_at: string | null
          id: string
          is_anonymous: boolean
          is_hidden: boolean | null
          is_temporary: boolean
          post_id: string
          reply_count: number
          title: string
          updated_at: string | null
          user_id: string
          view_count: number
        }
        Insert: {
          attachments?: string[] | null
          board_id?: string | null
          content?: Json[] | null
          created_at?: string
          deleted_at?: string | null
          id: string
          is_anonymous?: boolean
          is_hidden?: boolean | null
          is_temporary?: boolean
          post_id?: string
          reply_count?: number
          title: string
          updated_at?: string | null
          user_id: string
          view_count?: number
        }
        Update: {
          attachments?: string[] | null
          board_id?: string | null
          content?: Json[] | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_anonymous?: boolean
          is_hidden?: boolean | null
          is_temporary?: boolean
          post_id?: string
          reply_count?: number
          title?: string
          updated_at?: string | null
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["board_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          description: Json | null
          end_at: string | null
          id: string
          paypal_link: string | null
          platform: Database["public"]["Enums"]["platform_enum"]
          price: number | null
          product_name: string
          product_type: Database["public"]["Enums"]["product_type_enum"]
          rid: string
          star_candy: number | null
          star_candy_bonus: number | null
          start_at: string | null
          web_bonus_amount: number | null
          web_description: string | null
          web_display_order: number | null
          web_is_featured: boolean | null
          web_price_krw: number | null
          web_price_usd: number | null
        }
        Insert: {
          created_at?: string | null
          description?: Json | null
          end_at?: string | null
          id: string
          paypal_link?: string | null
          platform: Database["public"]["Enums"]["platform_enum"]
          price?: number | null
          product_name: string
          product_type: Database["public"]["Enums"]["product_type_enum"]
          rid?: string
          star_candy?: number | null
          star_candy_bonus?: number | null
          start_at?: string | null
          web_bonus_amount?: number | null
          web_description?: string | null
          web_display_order?: number | null
          web_is_featured?: boolean | null
          web_price_krw?: number | null
          web_price_usd?: number | null
        }
        Update: {
          created_at?: string | null
          description?: Json | null
          end_at?: string | null
          id?: string
          paypal_link?: string | null
          platform?: Database["public"]["Enums"]["platform_enum"]
          price?: number | null
          product_name?: string
          product_type?: Database["public"]["Enums"]["product_type_enum"]
          rid?: string
          star_candy?: number | null
          star_candy_bonus?: number | null
          start_at?: string | null
          web_bonus_amount?: number | null
          web_description?: string | null
          web_display_order?: number | null
          web_is_featured?: boolean | null
          web_price_krw?: number | null
          web_price_usd?: number | null
        }
        Relationships: []
      }
      promotion_campaign_versions: {
        Row: {
          campaign_id: number
          change_reason: string
          changed_by: string
          created_at: string
          effective_from: string
          end_iso_day: number
          end_local_time: string
          extra_bonus_bps: number
          home_banner_id: number | null
          id: number
          is_active: boolean
          localized_name: Json
          rollout_policy: Json
          start_iso_day: number
          start_local_time: string
          surfaces: Json
          timezone: string
          version: number
        }
        Insert: {
          campaign_id: number
          change_reason: string
          changed_by: string
          created_at?: string
          effective_from: string
          end_iso_day: number
          end_local_time: string
          extra_bonus_bps: number
          home_banner_id?: number | null
          id?: never
          is_active: boolean
          localized_name: Json
          rollout_policy: Json
          start_iso_day: number
          start_local_time: string
          surfaces: Json
          timezone: string
          version: number
        }
        Update: {
          campaign_id?: number
          change_reason?: string
          changed_by?: string
          created_at?: string
          effective_from?: string
          end_iso_day?: number
          end_local_time?: string
          extra_bonus_bps?: number
          home_banner_id?: number | null
          id?: never
          is_active?: boolean
          localized_name?: Json
          rollout_policy?: Json
          start_iso_day?: number
          start_local_time?: string
          surfaces?: Json
          timezone?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_campaign_versions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_campaign_versions_home_banner_id_fkey"
            columns: ["home_banner_id"]
            isOneToOne: false
            referencedRelation: "banner"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_campaigns: {
        Row: {
          code: string
          id: number
          kind: string
        }
        Insert: {
          code: string
          id?: never
          kind: string
        }
        Update: {
          code?: string
          id?: never
          kind?: string
        }
        Relationships: []
      }
      promotion_home_banner_owners: {
        Row: {
          campaign_id: number
          created_at: string
          home_banner_id: number
        }
        Insert: {
          campaign_id: number
          created_at?: string
          home_banner_id: number
        }
        Update: {
          campaign_id?: number
          created_at?: string
          home_banner_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_home_banner_owners_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_home_banner_owners_home_banner_id_fkey"
            columns: ["home_banner_id"]
            isOneToOne: true
            referencedRelation: "banner"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_usage_logs: {
        Row: {
          created_at: string | null
          error: string | null
          execution_time_ms: number | null
          id: string
          prompt_id: string | null
          response: Json
          token_count: number | null
          variables: Json
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          execution_time_ms?: number | null
          id?: string
          prompt_id?: string | null
          response: Json
          token_count?: number | null
          variables: Json
        }
        Update: {
          created_at?: string | null
          error?: string | null
          execution_time_ms?: number | null
          id?: string
          prompt_id?: string | null
          response?: Json
          token_count?: number | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prompt_usage_logs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          category: string
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          model_config: Json
          name: string
          tags: string[] | null
          template: string
          updated_at: string | null
          variables: string[]
          version: number
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          model_config: Json
          name: string
          tags?: string[] | null
          template: string
          updated_at?: string | null
          variables: string[]
          version: number
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          model_config?: Json
          name?: string
          tags?: string[] | null
          template?: string
          updated_at?: string | null
          variables?: string[]
          version?: number
        }
        Relationships: []
      }
      purchase_promotion_awards: {
        Row: {
          allocation_id: number
          allocation_kind: string
          award_amount: number
          award_payload_hash: string
          campaign_version_id: number
          created_at: string
          id: string
          resolution_id: string
          snapshot_id: string
        }
        Insert: {
          allocation_id: number
          allocation_kind?: string
          award_amount: number
          award_payload_hash: string
          campaign_version_id: number
          created_at?: string
          id?: string
          resolution_id: string
          snapshot_id: string
        }
        Update: {
          allocation_id?: number
          allocation_kind?: string
          award_amount?: number
          award_payload_hash?: string
          campaign_version_id?: number
          created_at?: string
          id?: string
          resolution_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_promotion_awards_allocation_id_snapshot_id_alloca_fkey"
            columns: ["allocation_id", "snapshot_id", "allocation_kind"]
            isOneToOne: false
            referencedRelation: "purchase_reward_allocations"
            referencedColumns: ["id", "snapshot_id", "allocation_kind"]
          },
          {
            foreignKeyName: "purchase_promotion_awards_campaign_version_id_fkey"
            columns: ["campaign_version_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaign_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_promotion_awards_resolution_id_snapshot_id_campai_fkey"
            columns: ["resolution_id", "snapshot_id", "campaign_version_id"]
            isOneToOne: false
            referencedRelation: "purchase_promotion_resolutions"
            referencedColumns: ["id", "snapshot_id", "campaign_version_id"]
          },
        ]
      }
      purchase_promotion_resolution_events: {
        Row: {
          audit_event_id: string | null
          event_no: number
          from_state: string | null
          id: number
          occurred_at: string
          reason: string
          resolution_id: string
          to_state: string
        }
        Insert: {
          audit_event_id?: string | null
          event_no: number
          from_state?: string | null
          id?: never
          occurred_at?: string
          reason: string
          resolution_id: string
          to_state: string
        }
        Update: {
          audit_event_id?: string | null
          event_no?: number
          from_state?: string | null
          id?: never
          occurred_at?: string
          reason?: string
          resolution_id?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_promotion_resolution_events_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_promotion_resolution_events_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "purchase_promotion_resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_promotion_resolution_inputs: {
        Row: {
          campaign_version_id: number | null
          created_at: string
          eligibility_input_snapshot: Json
          eligibility_payload_hash: string
          operation_key: string
          resolution_id: string
          snapshot_id: string
          verified_provider_occurred_at: string
        }
        Insert: {
          campaign_version_id?: number | null
          created_at?: string
          eligibility_input_snapshot: Json
          eligibility_payload_hash: string
          operation_key: string
          resolution_id: string
          snapshot_id: string
          verified_provider_occurred_at: string
        }
        Update: {
          campaign_version_id?: number | null
          created_at?: string
          eligibility_input_snapshot?: Json
          eligibility_payload_hash?: string
          operation_key?: string
          resolution_id?: string
          snapshot_id?: string
          verified_provider_occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_promotion_resolution_inputs_campaign_version_id_fkey"
            columns: ["campaign_version_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaign_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_promotion_resolution_inputs_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: true
            referencedRelation: "purchase_promotion_resolutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_promotion_resolution_inputs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "purchase_reward_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_promotion_resolutions: {
        Row: {
          campaign_version_id: number
          created_at: string
          eligibility_basis: Json
          id: string
          resolution_key: string
          resolved_at: string | null
          snapshot_id: string
          state: string
        }
        Insert: {
          campaign_version_id: number
          created_at?: string
          eligibility_basis?: Json
          id?: string
          resolution_key: string
          resolved_at?: string | null
          snapshot_id: string
          state: string
        }
        Update: {
          campaign_version_id?: number
          created_at?: string
          eligibility_basis?: Json
          id?: string
          resolution_key?: string
          resolved_at?: string | null
          snapshot_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_promotion_resolutions_campaign_version_id_fkey"
            columns: ["campaign_version_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaign_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_promotion_resolutions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "purchase_reward_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_refund_allocations: {
        Row: {
          allocation_no: number
          applied_at: string | null
          component: string
          created_at: string
          cumulative_target_amount: number
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_created_amount: number
          id: string
          incremental_reversal_amount: number
          operation_key: string
          original_reward_allocation_id: number
          original_snapshot_id: string
          recovery_plan: Json
          recovery_plan_hash: string
          refund_event_id: string
          user_id: string
          wallet_recovered_amount: number
        }
        Insert: {
          allocation_no: number
          applied_at?: string | null
          component: string
          created_at?: string
          cumulative_target_amount: number
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_created_amount: number
          id?: string
          incremental_reversal_amount: number
          operation_key: string
          original_reward_allocation_id: number
          original_snapshot_id: string
          recovery_plan: Json
          recovery_plan_hash: string
          refund_event_id: string
          user_id: string
          wallet_recovered_amount: number
        }
        Update: {
          allocation_no?: number
          applied_at?: string | null
          component?: string
          created_at?: string
          cumulative_target_amount?: number
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          debt_created_amount?: number
          id?: string
          incremental_reversal_amount?: number
          operation_key?: string
          original_reward_allocation_id?: number
          original_snapshot_id?: string
          recovery_plan?: Json
          recovery_plan_hash?: string
          refund_event_id?: string
          user_id?: string
          wallet_recovered_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_refund_allocations_original_reward_allocation_id__fkey"
            columns: [
              "original_reward_allocation_id",
              "original_snapshot_id",
              "component",
            ]
            isOneToOne: false
            referencedRelation: "purchase_reward_allocations"
            referencedColumns: ["id", "snapshot_id", "allocation_kind"]
          },
          {
            foreignKeyName: "purchase_refund_allocations_refund_event_id_user_id_fkey"
            columns: ["refund_event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "purchase_refund_events"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      purchase_refund_events: {
        Row: {
          canonical_payload_hash: string
          created_at: string
          cumulative_refunded_numerator: number
          id: string
          operation_key: string
          payload_hash: string
          provider_occurred_at: string
          provider_refund_event_id: string
          refund_denominator: number
          refund_ratio_basis: string
          snapshot_id: string
          user_id: string
        }
        Insert: {
          canonical_payload_hash: string
          created_at?: string
          cumulative_refunded_numerator: number
          id?: string
          operation_key: string
          payload_hash: string
          provider_occurred_at: string
          provider_refund_event_id: string
          refund_denominator: number
          refund_ratio_basis: string
          snapshot_id: string
          user_id: string
        }
        Update: {
          canonical_payload_hash?: string
          created_at?: string
          cumulative_refunded_numerator?: number
          id?: string
          operation_key?: string
          payload_hash?: string
          provider_occurred_at?: string
          provider_refund_event_id?: string
          refund_denominator?: number
          refund_ratio_basis?: string
          snapshot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_refund_events_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "purchase_reward_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_refund_events_snapshot_id_refund_ratio_basis_refu_fkey"
            columns: ["snapshot_id", "refund_ratio_basis", "refund_denominator"]
            isOneToOne: false
            referencedRelation: "purchase_reward_snapshots"
            referencedColumns: [
              "id",
              "refund_ratio_basis",
              "refund_denominator",
            ]
          },
          {
            foreignKeyName: "purchase_refund_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_refund_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      purchase_reward_allocations: {
        Row: {
          allocation_kind: string
          allocation_no: number
          created_at: string
          credit_allocation_id: number | null
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_offset_amount: number
          gross_amount: number
          id: number
          net_wallet_credit_amount: number
          snapshot_id: string
          user_id: string
        }
        Insert: {
          allocation_kind: string
          allocation_no: number
          created_at?: string
          credit_allocation_id?: number | null
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_offset_amount?: number
          gross_amount: number
          id?: never
          net_wallet_credit_amount: number
          snapshot_id: string
          user_id: string
        }
        Update: {
          allocation_kind?: string
          allocation_no?: number
          created_at?: string
          credit_allocation_id?: number | null
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          debt_offset_amount?: number
          gross_amount?: number
          id?: never
          net_wallet_credit_amount?: number
          snapshot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_reward_allocations_credit_allocation_id_currency__fkey"
            columns: ["credit_allocation_id", "currency_type", "user_id"]
            isOneToOne: false
            referencedRelation: "wallet_credit_allocations"
            referencedColumns: ["id", "currency_type", "user_id"]
          },
          {
            foreignKeyName: "purchase_reward_allocations_snapshot_id_user_id_fkey"
            columns: ["snapshot_id", "user_id"]
            isOneToOne: false
            referencedRelation: "purchase_reward_snapshots"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      purchase_reward_snapshots: {
        Row: {
          attestation_id: string | null
          base_bonus_amount: number
          base_operation_id: string | null
          base_policy_snapshot: Json
          base_star_amount: number
          canonical_purchase_payload_hash: string
          channel: string
          created_at: string
          eligibility_input_snapshot: Json
          eligibility_payload_hash: string
          environment: string
          id: string
          inbox_id: string | null
          initial_provider_occurred_at: string | null
          intake_provider_transaction_id: string
          product_id: string
          provider: string
          provider_currency: string | null
          provider_original_quantity: number | null
          provider_paid_amount_minor: number | null
          provider_transaction_id: string
          purchase_key: string
          quantity: number
          receipt_id: number | null
          refund_denominator: number
          refund_ratio_basis: string
          request_app_build: number
          request_app_version: string
          request_platform: string
          rollout_cohort_version: string
          source_payload_hash: string
          unit_bonus_amount: number
          unit_star_amount: number
          user_id: string
          verified_at: string
        }
        Insert: {
          attestation_id?: string | null
          base_bonus_amount: number
          base_operation_id?: string | null
          base_policy_snapshot: Json
          base_star_amount: number
          canonical_purchase_payload_hash: string
          channel: string
          created_at?: string
          eligibility_input_snapshot: Json
          eligibility_payload_hash: string
          environment: string
          id?: string
          inbox_id?: string | null
          initial_provider_occurred_at?: string | null
          intake_provider_transaction_id: string
          product_id: string
          provider: string
          provider_currency?: string | null
          provider_original_quantity?: number | null
          provider_paid_amount_minor?: number | null
          provider_transaction_id: string
          purchase_key: string
          quantity: number
          receipt_id?: number | null
          refund_denominator: number
          refund_ratio_basis: string
          request_app_build: number
          request_app_version: string
          request_platform: string
          rollout_cohort_version: string
          source_payload_hash: string
          unit_bonus_amount: number
          unit_star_amount: number
          user_id: string
          verified_at: string
        }
        Update: {
          attestation_id?: string | null
          base_bonus_amount?: number
          base_operation_id?: string | null
          base_policy_snapshot?: Json
          base_star_amount?: number
          canonical_purchase_payload_hash?: string
          channel?: string
          created_at?: string
          eligibility_input_snapshot?: Json
          eligibility_payload_hash?: string
          environment?: string
          id?: string
          inbox_id?: string | null
          initial_provider_occurred_at?: string | null
          intake_provider_transaction_id?: string
          product_id?: string
          provider?: string
          provider_currency?: string | null
          provider_original_quantity?: number | null
          provider_paid_amount_minor?: number | null
          provider_transaction_id?: string
          purchase_key?: string
          quantity?: number
          receipt_id?: number | null
          refund_denominator?: number
          refund_ratio_basis?: string
          request_app_build?: number
          request_app_version?: string
          request_platform?: string
          rollout_cohort_version?: string
          source_payload_hash?: string
          unit_bonus_amount?: number
          unit_star_amount?: number
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_reward_snapshots_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: true
            referencedRelation: "wallet_provider_verification_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_reward_snapshots_base_operation_id_fkey"
            columns: ["base_operation_id"]
            isOneToOne: true
            referencedRelation: "wallet_financial_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_reward_snapshots_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: true
            referencedRelation: "wallet_provider_event_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_reward_snapshots_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_reward_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_reward_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      push_messages: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          data: Json | null
          failure_count: number | null
          id: number
          platform: string | null
          success_count: number | null
          target_type: string
          target_user_ids: string[] | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          data?: Json | null
          failure_count?: number | null
          id?: number
          platform?: string | null
          success_count?: number | null
          target_type: string
          target_user_ids?: string[] | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          data?: Json | null
          failure_count?: number | null
          id?: number
          platform?: string | null
          success_count?: number | null
          target_type?: string
          target_user_ids?: string[] | null
          title?: string
        }
        Relationships: []
      }
      qna_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: number
          message_id: number | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: number
          message_id?: number | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: number
          message_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "qna_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      qna_categories: {
        Row: {
          active: boolean
          answer_template: Json | null
          code: string
          created_at: string
          label: Json
          order_number: number
          question_template: Json | null
          rid: string
        }
        Insert: {
          active?: boolean
          answer_template?: Json | null
          code: string
          created_at?: string
          label: Json
          order_number?: number
          question_template?: Json | null
          rid?: string
        }
        Update: {
          active?: boolean
          answer_template?: Json | null
          code?: string
          created_at?: string
          label?: Json
          order_number?: number
          question_template?: Json | null
          rid?: string
        }
        Relationships: []
      }
      qna_messages: {
        Row: {
          content: string | null
          created_at: string | null
          id: number
          is_admin_message: boolean | null
          thread_id: number | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: number
          is_admin_message?: boolean | null
          thread_id?: number | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: number
          is_admin_message?: boolean | null
          thread_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "qna_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      qna_threads: {
        Row: {
          category_code: string | null
          created_at: string | null
          id: number
          status: Database["public"]["Enums"]["qna_status"] | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category_code?: string | null
          created_at?: string | null
          id?: number
          status?: Database["public"]["Enums"]["qna_status"] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category_code?: string | null
          created_at?: string | null
          id?: number
          status?: Database["public"]["Enums"]["qna_status"] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qna_threads_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "qna_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "qna_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string | null
          environment: string | null
          id: number
          platform: string
          product_id: string | null
          receipt_data: string
          receipt_hash: string | null
          status: string
          tx_key: string | null
          user_id: string | null
          verification_data: Json | null
        }
        Insert: {
          created_at?: string | null
          environment?: string | null
          id?: number
          platform: string
          product_id?: string | null
          receipt_data: string
          receipt_hash?: string | null
          status: string
          tx_key?: string | null
          user_id?: string | null
          verification_data?: Json | null
        }
        Update: {
          created_at?: string | null
          environment?: string | null
          id?: number
          platform?: string
          product_id?: string | null
          receipt_data?: string
          receipt_hash?: string | null
          status?: string
          tx_key?: string | null
          user_id?: string | null
          verification_data?: Json | null
        }
        Relationships: []
      }
      request_ip_log: {
        Row: {
          action_type: string
          created_at: string
          device_hash: string | null
          id: number
          ip_hash: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          device_hash?: string | null
          id?: number
          ip_hash: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          device_hash?: string | null
          id?: number
          ip_hash?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      reward: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: number
          location: Json | null
          location_images: string[] | null
          order: number | null
          overview_images: string[] | null
          size_guide: Json | null
          size_guide_images: string[] | null
          thumbnail: string | null
          title: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          location?: Json | null
          location_images?: string[] | null
          order?: number | null
          overview_images?: string[] | null
          size_guide?: Json | null
          size_guide_images?: string[] | null
          thumbnail?: string | null
          title?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          location?: Json | null
          location_images?: string[] | null
          order?: number | null
          overview_images?: string[] | null
          size_guide?: Json | null
          size_guide_images?: string[] | null
          thumbnail?: string | null
          title?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_users: {
        Row: {
          created_at: string | null
          id: string
          role_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      star_candy_bonus_history: {
        Row: {
          amount: number | null
          created_at: string
          deleted_at: string | null
          expired_dt: string | null
          id: number
          parent_id: number | null
          remain_amount: number
          transaction_id: string | null
          type: string | null
          updated_at: string
          user_id: string
          vote_pick_id: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          deleted_at?: string | null
          expired_dt?: string | null
          id?: number
          parent_id?: number | null
          remain_amount?: number
          transaction_id?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
          vote_pick_id?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          deleted_at?: string | null
          expired_dt?: string | null
          id?: number
          parent_id?: number | null
          remain_amount?: number
          transaction_id?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          vote_pick_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "star_candy_bonus_history_user_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "star_candy_bonus_history_user_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      star_candy_history: {
        Row: {
          amount: number | null
          created_at: string
          deleted_at: string | null
          id: number
          parent_id: number | null
          reference_id: string | null
          transaction_id: string | null
          type: Database["public"]["Enums"]["candy_history_type"] | null
          updated_at: string
          user_id: string
          vote_pick_id: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          parent_id?: number | null
          reference_id?: string | null
          transaction_id?: string | null
          type?: Database["public"]["Enums"]["candy_history_type"] | null
          updated_at?: string
          user_id: string
          vote_pick_id?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          parent_id?: number | null
          reference_id?: string | null
          transaction_id?: string | null
          type?: Database["public"]["Enums"]["candy_history_type"] | null
          updated_at?: string
          user_id?: string
          vote_pick_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "star_candy_history_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vote_pick"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_admob: {
        Row: {
          ad_network: string | null
          created_at: string
          deleted_at: string | null
          id: number
          key_id: string | null
          reward_amount: number | null
          reward_type: string | null
          rid: string
          signature: string | null
          transaction_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ad_network?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          key_id?: string | null
          reward_amount?: number | null
          reward_type?: string | null
          rid?: string
          signature?: string | null
          transaction_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ad_network?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          key_id?: string | null
          reward_amount?: number | null
          reward_type?: string | null
          rid?: string
          signature?: string | null
          transaction_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transaction_internal: {
        Row: {
          action: string
          ad_campaign_id: string | null
          created_at: string
          id: string
          platform: string
          reward_amount: number
          reward_type: string
          user_id: string
        }
        Insert: {
          action: string
          ad_campaign_id?: string | null
          created_at?: string
          id?: string
          platform?: string
          reward_amount?: number
          reward_type?: string
          user_id: string
        }
        Update: {
          action?: string
          ad_campaign_id?: string | null
          created_at?: string
          id?: string
          platform?: string
          reward_amount?: number
          reward_type?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_pangle: {
        Row: {
          ad_network: string | null
          created_at: string
          deleted_at: string | null
          id: number
          key_id: string | null
          platform: string | null
          reward_amount: number | null
          reward_name: string | null
          reward_type: string | null
          rid: string
          signature: string | null
          transaction_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ad_network?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          key_id?: string | null
          platform?: string | null
          reward_amount?: number | null
          reward_name?: string | null
          reward_type?: string | null
          rid?: string
          signature?: string | null
          transaction_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ad_network?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          key_id?: string | null
          platform?: string | null
          reward_amount?: number | null
          reward_name?: string | null
          reward_type?: string | null
          rid?: string
          signature?: string | null
          transaction_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transaction_pincrux: {
        Row: {
          ad_network: string | null
          app_key: string | null
          app_title: string | null
          commission: number | null
          created_at: string
          deleted_at: string | null
          id: number
          menu_category1: string | null
          pub_key: number | null
          reward_amount: number | null
          reward_type: string | null
          rid: string
          signature: string | null
          transaction_id: string
          updated_at: string
          usr_key: string | null
        }
        Insert: {
          ad_network?: string | null
          app_key?: string | null
          app_title?: string | null
          commission?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          menu_category1?: string | null
          pub_key?: number | null
          reward_amount?: number | null
          reward_type?: string | null
          rid?: string
          signature?: string | null
          transaction_id: string
          updated_at?: string
          usr_key?: string | null
        }
        Update: {
          ad_network?: string | null
          app_key?: string | null
          app_title?: string | null
          commission?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          menu_category1?: string | null
          pub_key?: number | null
          reward_amount?: number | null
          reward_type?: string | null
          rid?: string
          signature?: string | null
          transaction_id?: string
          updated_at?: string
          usr_key?: string | null
        }
        Relationships: []
      }
      transaction_tapjoy: {
        Row: {
          created_at: string
          id: number
          platform: string | null
          reward_amount: number
          reward_type: string | null
          transaction_id: string
          user_id: string
          verifier: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          platform?: string | null
          reward_amount: number
          reward_type?: string | null
          transaction_id: string
          user_id: string
          verifier?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          platform?: string | null
          reward_amount?: number
          reward_type?: string | null
          transaction_id?: string
          user_id?: string
          verifier?: string | null
        }
        Relationships: []
      }
      transaction_unity: {
        Row: {
          ad_network: string | null
          created_at: string
          deleted_at: string | null
          hmac: string
          id: number
          platform: string | null
          reward_amount: number | null
          reward_type: string | null
          rid: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_network?: string | null
          created_at?: string
          deleted_at?: string | null
          hmac: string
          id?: never
          platform?: string | null
          reward_amount?: number | null
          reward_type?: string | null
          rid?: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_network?: string | null
          created_at?: string
          deleted_at?: string | null
          hmac?: string
          id?: never
          platform?: string | null
          reward_amount?: number | null
          reward_type?: string | null
          rid?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_abuse_review_queue: {
        Row: {
          created_at: string
          id: number
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_decision_id: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_decision_id: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_decision_id?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_abuse_review_queue_source_decision_id_fkey"
            columns: ["source_decision_id"]
            isOneToOne: false
            referencedRelation: "ip_block_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agreement: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          privacy: string | null
          terms: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id: string
          privacy?: string | null
          terms?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          privacy?: string | null
          terms?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_agreement_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agreement_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          created_at: string
          deleted_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_bonus_queue_audit: {
        Row: {
          deleted_at: string
          note: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          deleted_at?: string
          note?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          deleted_at?: string
          note?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_bonus_update_queue: {
        Row: {
          attempts: number
          created_at: string
          id: number
          last_enqueued_at: string
          last_error: string | null
          last_source: string | null
          next_run_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: number
          last_enqueued_at?: string
          last_error?: string | null
          last_source?: string | null
          next_run_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: number
          last_enqueued_at?: string
          last_error?: string | null
          last_source?: string | null
          next_run_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_comment_like: {
        Row: {
          comment_id: number | null
          created_at: string | null
          deleted_at: string | null
          id: number
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          comment_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          comment_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: []
      }
      user_comment_report: {
        Row: {
          comment_id: number | null
          created_at: string | null
          deleted_at: string | null
          id: number
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          comment_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          comment_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: []
      }
      user_country_events: {
        Row: {
          country_code: string
          created_at: string
          id: string
          source: string
          user_id: string
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          source?: string
          user_id: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          data: Json | null
          id: number
          is_read: boolean
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          data?: Json | null
          id?: number
          is_read?: boolean
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          data?: Json | null
          id?: number
          is_read?: boolean
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          birth_time: string | null
          cotton_candy: number
          country_code: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          gender: Database["public"]["Enums"]["user_gender_enum"] | null
          id: string
          is_admin: boolean
          is_super_admin: boolean | null
          jma_candy: number | null
          language: string | null
          last_ip: string | null
          nickname: string | null
          open_ages: boolean
          open_gender: boolean
          star_candy: number
          star_candy_bonus: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          birth_time?: string | null
          cotton_candy?: number
          country_code?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gender?: Database["public"]["Enums"]["user_gender_enum"] | null
          id: string
          is_admin?: boolean
          is_super_admin?: boolean | null
          jma_candy?: number | null
          language?: string | null
          last_ip?: string | null
          nickname?: string | null
          open_ages?: boolean
          open_gender?: boolean
          star_candy?: number
          star_candy_bonus?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          birth_time?: string | null
          cotton_candy?: number
          country_code?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gender?: Database["public"]["Enums"]["user_gender_enum"] | null
          id?: string
          is_admin?: boolean
          is_super_admin?: boolean | null
          jma_candy?: number | null
          language?: string | null
          last_ip?: string | null
          nickname?: string | null
          open_ages?: boolean
          open_gender?: boolean
          star_candy?: number
          star_candy_bonus?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          created_at: string | null
          device_locale: string | null
          id: number
          token_android: string | null
          token_ios: string | null
          token_macos: string | null
          token_web: string | null
          token_windows: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_locale?: string | null
          id?: number
          token_android?: string | null
          token_ios?: string | null
          token_macos?: string | null
          token_web?: string | null
          token_windows?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_locale?: string | null
          id?: number
          token_android?: string | null
          token_ios?: string | null
          token_macos?: string | null
          token_web?: string | null
          token_windows?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_push_tokens_user_profiles"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_push_tokens_user_profiles"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      version: {
        Row: {
          android: Json | null
          apk: Json | null
          created_at: string
          deleted_at: string | null
          id: number
          ios: Json | null
          linux: Json | null
          macos: Json | null
          updated_at: string
          windows: Json | null
        }
        Insert: {
          android?: Json | null
          apk?: Json | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          ios?: Json | null
          linux?: Json | null
          macos?: Json | null
          updated_at?: string
          windows?: Json | null
        }
        Update: {
          android?: Json | null
          apk?: Json | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          ios?: Json | null
          linux?: Json | null
          macos?: Json | null
          updated_at?: string
          windows?: Json | null
        }
        Relationships: []
      }
      vote: {
        Row: {
          area: string
          areas: string[] | null
          created_at: string
          deleted_at: string | null
          id: number
          is_partnership: boolean | null
          main_image: string | null
          order: number | null
          partner: string | null
          result_image: string | null
          star_candy_bonus_total: number | null
          star_candy_total: number | null
          start_at: string | null
          stop_at: string | null
          title: Json | null
          updated_at: string
          visible_at: string | null
          vote_category: string | null
          vote_content: string | null
          vote_sub_category: string | null
          vote_total: number | null
          wait_image: string | null
        }
        Insert: {
          area: string
          areas?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          is_partnership?: boolean | null
          main_image?: string | null
          order?: number | null
          partner?: string | null
          result_image?: string | null
          star_candy_bonus_total?: number | null
          star_candy_total?: number | null
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string
          visible_at?: string | null
          vote_category?: string | null
          vote_content?: string | null
          vote_sub_category?: string | null
          vote_total?: number | null
          wait_image?: string | null
        }
        Update: {
          area?: string
          areas?: string[] | null
          created_at?: string
          deleted_at?: string | null
          id?: number
          is_partnership?: boolean | null
          main_image?: string | null
          order?: number | null
          partner?: string | null
          result_image?: string | null
          star_candy_bonus_total?: number | null
          star_candy_total?: number | null
          start_at?: string | null
          stop_at?: string | null
          title?: Json | null
          updated_at?: string
          visible_at?: string | null
          vote_category?: string | null
          vote_content?: string | null
          vote_sub_category?: string | null
          vote_total?: number | null
          wait_image?: string | null
        }
        Relationships: []
      }
      vote_achieve: {
        Row: {
          amount: number | null
          id: number
          order: number | null
          reward_id: number | null
          vote_id: number | null
        }
        Insert: {
          amount?: number | null
          id?: never
          order?: number | null
          reward_id?: number | null
          vote_id?: number | null
        }
        Update: {
          amount?: number | null
          id?: never
          order?: number | null
          reward_id?: number | null
          vote_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vote_achieve_reward_id_fk"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_achieve_vote_id_fk"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_comment: {
        Row: {
          childrencount: number | null
          content: string | null
          created_at: string | null
          deleted_at: string | null
          id: number
          likes: number | null
          parent_id: number | null
          updated_at: string | null
          user_id: number | null
          vote_id: number | null
        }
        Insert: {
          childrencount?: number | null
          content?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          likes?: number | null
          parent_id?: number | null
          updated_at?: string | null
          user_id?: number | null
          vote_id?: number | null
        }
        Update: {
          childrencount?: number | null
          content?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: never
          likes?: number | null
          parent_id?: number | null
          updated_at?: string | null
          user_id?: number | null
          vote_id?: number | null
        }
        Relationships: []
      }
      vote_comment_like: {
        Row: {
          comment_id: number
          user_id: number
        }
        Insert: {
          comment_id: number
          user_id: number
        }
        Update: {
          comment_id?: number
          user_id?: number
        }
        Relationships: []
      }
      vote_comment_report: {
        Row: {
          comment_id: number
          user_id: number
        }
        Insert: {
          comment_id: number
          user_id: number
        }
        Update: {
          comment_id?: number
          user_id?: number
        }
        Relationships: []
      }
      vote_item: {
        Row: {
          artist_id: number | null
          created_at: string | null
          deleted_at: string | null
          group_id: number
          id: number
          star_candy_bonus_total: number
          star_candy_total: number
          updated_at: string | null
          vote_id: number | null
          vote_total: number | null
        }
        Insert: {
          artist_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          group_id?: number
          id?: number
          star_candy_bonus_total?: number
          star_candy_total?: number
          updated_at?: string | null
          vote_id?: number | null
          vote_total?: number | null
        }
        Update: {
          artist_id?: number | null
          created_at?: string | null
          deleted_at?: string | null
          group_id?: number
          id?: number
          star_candy_bonus_total?: number
          star_candy_total?: number
          updated_at?: string | null
          vote_id?: number | null
          vote_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_artist_id_fk"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "artist_group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_item_vote_id_fk"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_item_request_users: {
        Row: {
          artist_id: number
          created_at: string | null
          id: string
          ip_hash: string | null
          status: string
          updated_at: string | null
          user_id: string
          vote_id: number
          vote_item_request_id: string
        }
        Insert: {
          artist_id?: number
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          vote_id?: number
          vote_item_request_id: string
        }
        Update: {
          artist_id?: number
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          vote_id?: number
          vote_item_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_request_users_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_item_requests_backup: {
        Row: {
          created_at: string | null
          id: string
          status: string
          updated_at: string | null
          vote_id: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          vote_id: number
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          vote_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vote_item_requests_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_item_update_queue: {
        Row: {
          created_at: string
          delta_amount: number
          delta_bonus: number
          delta_star: number
          id: number
          vote_item_id: number
        }
        Insert: {
          created_at?: string
          delta_amount: number
          delta_bonus: number
          delta_star: number
          id?: number
          vote_item_id: number
        }
        Update: {
          created_at?: string
          delta_amount?: number
          delta_bonus?: number
          delta_star?: number
          id?: number
          vote_item_id?: number
        }
        Relationships: []
      }
      vote_pick: {
        Row: {
          amount: number | null
          cotton_candy_usage: number
          created_at: string | null
          deleted_at: string | null
          id: number
          request_id: string | null
          star_candy_bonus_usage: number
          star_candy_usage: number
          updated_at: string | null
          user_id: string | null
          vote_id: number | null
          vote_item_id: number
        }
        Insert: {
          amount?: number | null
          cotton_candy_usage?: number
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          request_id?: string | null
          star_candy_bonus_usage?: number
          star_candy_usage?: number
          updated_at?: string | null
          user_id?: string | null
          vote_id?: number | null
          vote_item_id: number
        }
        Update: {
          amount?: number | null
          cotton_candy_usage?: number
          created_at?: string | null
          deleted_at?: string | null
          id?: number
          request_id?: string | null
          star_candy_bonus_usage?: number
          star_candy_usage?: number
          updated_at?: string | null
          user_id?: string | null
          vote_id?: number | null
          vote_item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vote_pick_user_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_pick_user_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vote_pick_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_pick_vote_item_id_fkey"
            columns: ["vote_item_id"]
            isOneToOne: false
            referencedRelation: "vote_item"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_reward: {
        Row: {
          reward_id: number
          vote_id: number
        }
        Insert: {
          reward_id: number
          vote_id: number
        }
        Update: {
          reward_id?: number
          vote_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vote_reward_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_reward_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_share_bonus: {
        Row: {
          amount: number
          created_at: string
          id: number
          updated_at: string
          user_id: string
          vote_id: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: number
          updated_at?: string
          user_id: string
          vote_id: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: number
          updated_at?: string
          user_id?: string
          vote_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vote_share_bonus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_share_bonus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vote_share_bonus_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_admin_command_executions: {
        Row: {
          action_code: string
          actor_user_id: string
          canonical_request_hash: string
          created_at: string
          request_id: string
          response_envelope: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        }
        Insert: {
          action_code: string
          actor_user_id: string
          canonical_request_hash: string
          created_at?: string
          request_id: string
          response_envelope: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        }
        Update: {
          action_code?: string
          actor_user_id?: string
          canonical_request_hash?: string
          created_at?: string
          request_id?: string
          response_envelope?: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        }
        Relationships: []
      }
      wallet_admin_limit_versions: {
        Row: {
          action_code: string
          change_reason: string
          changed_by: string
          created_at: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          effective_from: string
          id: number
          max_amount: number
          role_name: string
          version: number
        }
        Insert: {
          action_code: string
          change_reason: string
          changed_by: string
          created_at?: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          effective_from: string
          id?: never
          max_amount: number
          role_name: string
          version: number
        }
        Update: {
          action_code?: string
          change_reason?: string
          changed_by?: string
          created_at?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          effective_from?: string
          id?: never
          max_amount?: number
          role_name?: string
          version?: number
        }
        Relationships: []
      }
      wallet_admin_role_assignment_approvals: {
        Row: {
          approver_user_id: string
          consumed_at: string | null
          expires_at: string
          id: string
          request_hash: string
          request_id: string
          role_name: string
          target_user_id: string
        }
        Insert: {
          approver_user_id: string
          consumed_at?: string | null
          expires_at: string
          id?: string
          request_hash: string
          request_id: string
          role_name: string
          target_user_id: string
        }
        Update: {
          approver_user_id?: string
          consumed_at?: string | null
          expires_at?: string
          id?: string
          request_hash?: string
          request_id?: string
          role_name?: string
          target_user_id?: string
        }
        Relationships: []
      }
      wallet_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          after_state: Json | null
          before_state: Json | null
          campaign_id: string | null
          created_at: string
          id: string
          occurred_at: string
          operation_id: string | null
          reason_code: string | null
          request_id: string | null
          resource_id: string
          resource_type: string
          ticket_reference: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          after_state?: Json | null
          before_state?: Json | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          operation_id?: string | null
          reason_code?: string | null
          request_id?: string | null
          resource_id: string
          resource_type: string
          ticket_reference?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          after_state?: Json | null
          before_state?: Json | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          operation_id?: string | null
          reason_code?: string | null
          request_id?: string | null
          resource_id?: string
          resource_type?: string
          ticket_reference?: string | null
        }
        Relationships: []
      }
      wallet_bonus_projection_violations: {
        Row: {
          detected_at: string
          id: number
          ledger_amount: number
          profile_amount: number
          resolved_at: string | null
          user_id: string
        }
        Insert: {
          detected_at?: string
          id?: never
          ledger_amount: number
          profile_amount: number
          resolved_at?: string | null
          user_id: string
        }
        Update: {
          detected_at?: string
          id?: never
          ledger_amount?: number
          profile_amount?: number
          resolved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_bonus_projection_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_bonus_projection_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_command_approval_events: {
        Row: {
          actor_id: string
          approval_request_id: string
          event_audit_id: string
          id: number
          occurred_at: string
          status: string
        }
        Insert: {
          actor_id: string
          approval_request_id: string
          event_audit_id: string
          id?: never
          occurred_at?: string
          status: string
        }
        Update: {
          actor_id?: string
          approval_request_id?: string
          event_audit_id?: string
          id?: never
          occurred_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_command_approval_events_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "wallet_command_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_command_approval_events_event_audit_id_fkey"
            columns: ["event_audit_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_command_approval_requests: {
        Row: {
          action_code: string
          approval_reference: string
          command_payload: Json
          command_payload_hash: string
          created_at: string
          creation_audit_id: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          expires_at: string
          id: string
          limit_version_id: number
          operation_key: string
          requester_id: string
          role_name: string
        }
        Insert: {
          action_code: string
          approval_reference: string
          command_payload: Json
          command_payload_hash: string
          created_at?: string
          creation_audit_id: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          expires_at: string
          id?: string
          limit_version_id: number
          operation_key: string
          requester_id: string
          role_name: string
        }
        Update: {
          action_code?: string
          approval_reference?: string
          command_payload?: Json
          command_payload_hash?: string
          created_at?: string
          creation_audit_id?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          expires_at?: string
          id?: string
          limit_version_id?: number
          operation_key?: string
          requester_id?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_command_approval_reque_limit_version_id_role_name_a_fkey"
            columns: [
              "limit_version_id",
              "role_name",
              "action_code",
              "currency_type",
            ]
            isOneToOne: false
            referencedRelation: "wallet_admin_limit_versions"
            referencedColumns: [
              "id",
              "role_name",
              "action_code",
              "currency_type",
            ]
          },
          {
            foreignKeyName: "wallet_command_approval_requests_creation_audit_id_fkey"
            columns: ["creation_audit_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_correction_approval_requests: {
        Row: {
          approval_reference: string
          approved_at: string | null
          approved_by: string | null
          audit_id: string
          command_payload: Json
          command_payload_hash: string
          created_at: string
          expires_at: string
          id: string
          operation_key: string
          requester_id: string
        }
        Insert: {
          approval_reference: string
          approved_at?: string | null
          approved_by?: string | null
          audit_id: string
          command_payload: Json
          command_payload_hash: string
          created_at?: string
          expires_at: string
          id?: string
          operation_key: string
          requester_id: string
        }
        Update: {
          approval_reference?: string
          approved_at?: string | null
          approved_by?: string | null
          audit_id?: string
          command_payload?: Json
          command_payload_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          operation_key?: string
          requester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_correction_approval_requests_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_credit_allocations: {
        Row: {
          allocation_no: number
          created_at: string
          credit_operation_id: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_offset_amount: number
          expires_at: string | null
          gross_amount: number
          id: number
          net_wallet_credit_amount: number
          reason: string
          star_candy_bonus_history_id: number | null
          star_candy_history_id: number | null
          user_id: string
        }
        Insert: {
          allocation_no: number
          created_at?: string
          credit_operation_id: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_offset_amount?: number
          expires_at?: string | null
          gross_amount: number
          id?: never
          net_wallet_credit_amount: number
          reason: string
          star_candy_bonus_history_id?: number | null
          star_candy_history_id?: number | null
          user_id: string
        }
        Update: {
          allocation_no?: number
          created_at?: string
          credit_operation_id?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          debt_offset_amount?: number
          expires_at?: string | null
          gross_amount?: number
          id?: never
          net_wallet_credit_amount?: number
          reason?: string
          star_candy_bonus_history_id?: number | null
          star_candy_history_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_credit_allocations_credit_operation_id_fkey"
            columns: ["credit_operation_id"]
            isOneToOne: false
            referencedRelation: "wallet_credit_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_credit_operations: {
        Row: {
          created_at: string
          financial_operation_id: string
          id: string
        }
        Insert: {
          created_at?: string
          financial_operation_id: string
          id?: string
        }
        Update: {
          created_at?: string
          financial_operation_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_credit_operations_financial_operation_id_fkey"
            columns: ["financial_operation_id"]
            isOneToOne: true
            referencedRelation: "wallet_financial_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_credit_source_registry: {
        Row: {
          classification: string
          evidence: Json
          migrated: boolean
          migrated_at: string | null
          owner_plan: string
          source_key: string
          target_interface: string
          writer_kind: string
        }
        Insert: {
          classification: string
          evidence?: Json
          migrated?: boolean
          migrated_at?: string | null
          owner_plan: string
          source_key: string
          target_interface: string
          writer_kind: string
        }
        Update: {
          classification?: string
          evidence?: Json
          migrated?: boolean
          migrated_at?: string | null
          owner_plan?: string
          source_key?: string
          target_interface?: string
          writer_kind?: string
        }
        Relationships: []
      }
      wallet_debit_allocations: {
        Row: {
          allocation_no: number
          created_at: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debit_operation_id: string
          debt_created_amount: number
          id: number
          requested_amount: number
          user_id: string
          wallet_debit_amount: number
        }
        Insert: {
          allocation_no: number
          created_at?: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debit_operation_id: string
          debt_created_amount?: number
          id?: never
          requested_amount: number
          user_id: string
          wallet_debit_amount: number
        }
        Update: {
          allocation_no?: number
          created_at?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          debit_operation_id?: string
          debt_created_amount?: number
          id?: never
          requested_amount?: number
          user_id?: string
          wallet_debit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallet_debit_allocations_debit_operation_id_user_id_fkey"
            columns: ["debit_operation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wallet_debit_operations"
            referencedColumns: ["financial_operation_id", "user_id"]
          },
          {
            foreignKeyName: "wallet_debit_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_debit_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_debit_bucket_allocations: {
        Row: {
          amount: number
          bucket_kind: string
          created_at: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debit_allocation_id: number
          id: number
          star_candy_bonus_history_id: number | null
          star_candy_history_id: number | null
          user_id: string
        }
        Insert: {
          amount: number
          bucket_kind: string
          created_at?: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debit_allocation_id: number
          id?: never
          star_candy_bonus_history_id?: number | null
          star_candy_history_id?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          bucket_kind?: string
          created_at?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          debit_allocation_id?: number
          id?: never
          star_candy_bonus_history_id?: number | null
          star_candy_history_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_debit_bucket_allocatio_debit_allocation_id_user_id__fkey"
            columns: ["debit_allocation_id", "user_id", "currency_type"]
            isOneToOne: false
            referencedRelation: "wallet_debit_allocations"
            referencedColumns: ["id", "user_id", "currency_type"]
          },
        ]
      }
      wallet_debit_operations: {
        Row: {
          allow_debt: boolean
          created_at: string
          debit_kind: string
          financial_operation_id: string
          user_id: string
        }
        Insert: {
          allow_debt?: boolean
          created_at?: string
          debit_kind: string
          financial_operation_id: string
          user_id: string
        }
        Update: {
          allow_debt?: boolean
          created_at?: string
          debit_kind?: string
          financial_operation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_debit_operations_financial_operation_id_user_id_fkey"
            columns: ["financial_operation_id", "user_id"]
            isOneToOne: true
            referencedRelation: "wallet_financial_operations"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      wallet_financial_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          operation_key: string
          operation_kind: Database["public"]["Enums"]["wallet_operation_kind"]
          payload_hash: string
          result: Json | null
          source_event_at: string | null
          source_reference: string
          source_type: string
          status: Database["public"]["Enums"]["wallet_operation_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          operation_key: string
          operation_kind: Database["public"]["Enums"]["wallet_operation_kind"]
          payload_hash: string
          result?: Json | null
          source_event_at?: string | null
          source_reference: string
          source_type: string
          status?: Database["public"]["Enums"]["wallet_operation_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          operation_key?: string
          operation_kind?: Database["public"]["Enums"]["wallet_operation_kind"]
          payload_hash?: string
          result?: Json | null
          source_event_at?: string | null
          source_reference?: string
          source_type?: string
          status?: Database["public"]["Enums"]["wallet_operation_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_financial_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_financial_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_invariant_violations: {
        Row: {
          actual: Json
          consistent_scans: number
          expected: Json
          first_seen_at: string
          last_seen_at: string
          resolved_at: string | null
          severity: string
          user_id: string
          violation_type: string
        }
        Insert: {
          actual: Json
          consistent_scans?: number
          expected: Json
          first_seen_at: string
          last_seen_at: string
          resolved_at?: string | null
          severity: string
          user_id: string
          violation_type: string
        }
        Update: {
          actual?: Json
          consistent_scans?: number
          expected?: Json
          first_seen_at?: string
          last_seen_at?: string
          resolved_at?: string | null
          severity?: string
          user_id?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_invariant_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_invariant_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_mutation_route_registry: {
        Row: {
          classification: string
          domain: string
          evidence: Json
          lock_interface: string
          migrated: boolean
          migrated_at: string | null
          owner_plan: string
          route_key: string
        }
        Insert: {
          classification: string
          domain: string
          evidence?: Json
          lock_interface: string
          migrated?: boolean
          migrated_at?: string | null
          owner_plan: string
          route_key: string
        }
        Update: {
          classification?: string
          domain?: string
          evidence?: Json
          lock_interface?: string
          migrated?: boolean
          migrated_at?: string | null
          owner_plan?: string
          route_key?: string
        }
        Relationships: []
      }
      wallet_operation_claim_cursor: {
        Row: {
          next_type: string
          singleton: boolean
        }
        Insert: {
          next_type: string
          singleton?: boolean
        }
        Update: {
          next_type?: string
          singleton?: boolean
        }
        Relationships: []
      }
      wallet_promotion_time_attestations: {
        Row: {
          environment: string
          id: string
          inbox_id: string
          intake_provider_transaction_id: string
          provider: string
          provider_verification_payload_hash: string
          snapshot_id: string
          verified_at: string
          verified_fields_hash: string
          verified_provider_occurred_at: string
        }
        Insert: {
          environment: string
          id?: string
          inbox_id: string
          intake_provider_transaction_id: string
          provider: string
          provider_verification_payload_hash: string
          snapshot_id: string
          verified_at?: string
          verified_fields_hash: string
          verified_provider_occurred_at: string
        }
        Update: {
          environment?: string
          id?: string
          inbox_id?: string
          intake_provider_transaction_id?: string
          provider?: string
          provider_verification_payload_hash?: string
          snapshot_id?: string
          verified_at?: string
          verified_fields_hash?: string
          verified_provider_occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_promotion_time_attestations_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: true
            referencedRelation: "wallet_provider_event_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_promotion_time_attestations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "purchase_reward_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_provider_event_inbox: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          encrypted_payload: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_error_retryable: boolean | null
          lease_token: string | null
          lease_until: string | null
          locked_by: string | null
          next_retry_at: string
          occurred_at: string
          operation_id: string
          operation_type: string
          payload_hash: string
          purchase_environment: string | null
          purchase_product_id: string | null
          purchase_provider: string | null
          purchase_provider_transaction_id: string | null
          purchase_user_id: string | null
          result_id: string | null
          result_type: string | null
          row_version: number
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          encrypted_payload: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          last_error_retryable?: boolean | null
          lease_token?: string | null
          lease_until?: string | null
          locked_by?: string | null
          next_retry_at?: string
          occurred_at: string
          operation_id?: string
          operation_type: string
          payload_hash: string
          purchase_environment?: string | null
          purchase_product_id?: string | null
          purchase_provider?: string | null
          purchase_provider_transaction_id?: string | null
          purchase_user_id?: string | null
          result_id?: string | null
          result_type?: string | null
          row_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          encrypted_payload?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          last_error_retryable?: boolean | null
          lease_token?: string | null
          lease_until?: string | null
          locked_by?: string | null
          next_retry_at?: string
          occurred_at?: string
          operation_id?: string
          operation_type?: string
          payload_hash?: string
          purchase_environment?: string | null
          purchase_product_id?: string | null
          purchase_provider?: string | null
          purchase_provider_transaction_id?: string | null
          purchase_user_id?: string | null
          result_id?: string | null
          result_type?: string | null
          row_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wallet_provider_verification_attestations: {
        Row: {
          authoritative_provider_transaction_id: string
          durable_proof_hash: string
          environment: string
          id: string
          inbox_id: string
          intake_provider_transaction_id: string
          product_id: string
          provider: string
          provider_currency: string | null
          provider_occurred_at: string | null
          provider_original_quantity: number | null
          provider_paid_amount_minor: number | null
          provider_verification_payload_hash: string
          quantity: number
          refund_ratio_basis: string
          user_id: string
          verified_at: string
          verified_fields_hash: string
        }
        Insert: {
          authoritative_provider_transaction_id: string
          durable_proof_hash: string
          environment: string
          id?: string
          inbox_id: string
          intake_provider_transaction_id: string
          product_id: string
          provider: string
          provider_currency?: string | null
          provider_occurred_at?: string | null
          provider_original_quantity?: number | null
          provider_paid_amount_minor?: number | null
          provider_verification_payload_hash: string
          quantity: number
          refund_ratio_basis: string
          user_id: string
          verified_at?: string
          verified_fields_hash: string
        }
        Update: {
          authoritative_provider_transaction_id?: string
          durable_proof_hash?: string
          environment?: string
          id?: string
          inbox_id?: string
          intake_provider_transaction_id?: string
          product_id?: string
          provider?: string
          provider_currency?: string | null
          provider_occurred_at?: string | null
          provider_original_quantity?: number | null
          provider_paid_amount_minor?: number | null
          provider_verification_payload_hash?: string
          quantity?: number
          refund_ratio_basis?: string
          user_id?: string
          verified_at?: string
          verified_fields_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_provider_verification_attestations_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: true
            referencedRelation: "wallet_provider_event_inbox"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_recovery_debt_events: {
        Row: {
          amount: number
          audit_event_id: string | null
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_id: string
          event_no: number
          event_type: string
          id: number
          occurred_at: string
          operation_key: string | null
          recovered_amount_after: number
          refund_allocation_no: number | null
          source_debit_allocation_id: number | null
          source_refund_allocation_id: string | null
          user_id: string
          waived_amount_after: number
          wallet_credit_allocation_id: number | null
        }
        Insert: {
          amount: number
          audit_event_id?: string | null
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          debt_id: string
          event_no: number
          event_type: string
          id?: never
          occurred_at?: string
          operation_key?: string | null
          recovered_amount_after: number
          refund_allocation_no?: number | null
          source_debit_allocation_id?: number | null
          source_refund_allocation_id?: string | null
          user_id: string
          waived_amount_after: number
          wallet_credit_allocation_id?: number | null
        }
        Update: {
          amount?: number
          audit_event_id?: string | null
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          debt_id?: string
          event_no?: number
          event_type?: string
          id?: never
          occurred_at?: string
          operation_key?: string | null
          recovered_amount_after?: number
          refund_allocation_no?: number | null
          source_debit_allocation_id?: number | null
          source_refund_allocation_id?: string | null
          user_id?: string
          waived_amount_after?: number
          wallet_credit_allocation_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_recovery_debt_events_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_recovery_debt_events_credit_allocation_fk"
            columns: ["wallet_credit_allocation_id", "currency_type", "user_id"]
            isOneToOne: false
            referencedRelation: "wallet_credit_allocations"
            referencedColumns: ["id", "currency_type", "user_id"]
          },
          {
            foreignKeyName: "wallet_recovery_debt_events_debit_allocation_fk"
            columns: ["source_debit_allocation_id", "user_id", "currency_type"]
            isOneToOne: false
            referencedRelation: "wallet_debit_allocations"
            referencedColumns: ["id", "user_id", "currency_type"]
          },
          {
            foreignKeyName: "wallet_recovery_debt_events_debt_id_user_id_currency_type_fkey"
            columns: ["debt_id", "user_id", "currency_type"]
            isOneToOne: false
            referencedRelation: "wallet_recovery_debts"
            referencedColumns: ["id", "user_id", "currency_type"]
          },
          {
            foreignKeyName: "wallet_recovery_debt_events_refund_allocation_fk"
            columns: ["source_refund_allocation_id", "user_id", "currency_type"]
            isOneToOne: false
            referencedRelation: "purchase_refund_allocations"
            referencedColumns: ["id", "user_id", "currency_type"]
          },
        ]
      }
      wallet_recovery_debts: {
        Row: {
          created_at: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          id: string
          owed_amount: number
          reason: string
          receipt_id: number | null
          recovered_amount: number
          row_version: number
          source_debit_allocation_id: number | null
          source_refund_allocation_id: string | null
          user_id: string
          waived_amount: number
        }
        Insert: {
          created_at?: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          owed_amount: number
          reason: string
          receipt_id?: number | null
          recovered_amount?: number
          row_version?: number
          source_debit_allocation_id?: number | null
          source_refund_allocation_id?: string | null
          user_id: string
          waived_amount?: number
        }
        Update: {
          created_at?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          owed_amount?: number
          reason?: string
          receipt_id?: number | null
          recovered_amount?: number
          row_version?: number
          source_debit_allocation_id?: number | null
          source_refund_allocation_id?: string | null
          user_id?: string
          waived_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallet_recovery_debts_correction_source_fk"
            columns: ["source_debit_allocation_id", "user_id", "currency_type"]
            isOneToOne: false
            referencedRelation: "wallet_debit_allocations"
            referencedColumns: ["id", "user_id", "currency_type"]
          },
          {
            foreignKeyName: "wallet_recovery_debts_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_recovery_debts_refund_allocation_fk"
            columns: ["source_refund_allocation_id", "user_id", "currency_type"]
            isOneToOne: false
            referencedRelation: "purchase_refund_allocations"
            referencedColumns: ["id", "user_id", "currency_type"]
          },
          {
            foreignKeyName: "wallet_recovery_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_recovery_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_repair_operations: {
        Row: {
          amount: number
          audit_event_id: string
          canonical_payload: Json
          canonical_payload_hash: string
          created_at: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          direction: string
          expected_state: Json
          id: string
          observed_state: Json
          operation_key: string
          user_id: string
        }
        Insert: {
          amount: number
          audit_event_id: string
          canonical_payload: Json
          canonical_payload_hash: string
          created_at?: string
          currency_type: Database["public"]["Enums"]["wallet_currency"]
          direction: string
          expected_state: Json
          id?: string
          observed_state: Json
          operation_key: string
          user_id: string
        }
        Update: {
          amount?: number
          audit_event_id?: string
          canonical_payload?: Json
          canonical_payload_hash?: string
          created_at?: string
          currency_type?: Database["public"]["Enums"]["wallet_currency"]
          direction?: string
          expected_state?: Json
          id?: string
          observed_state?: Json
          operation_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_repair_operations_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_repair_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_repair_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_repair_previews: {
        Row: {
          audit_id: string
          command_payload: Json
          command_payload_hash: string
          created_at: string
          executed_at: string | null
          executed_by: string | null
          expires_at: string
          id: string
          operation_key: string
          preview_reference: string
          requester_id: string
          result_hash: string
          result_payload: Json
        }
        Insert: {
          audit_id: string
          command_payload: Json
          command_payload_hash: string
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          expires_at: string
          id?: string
          operation_key: string
          preview_reference: string
          requester_id: string
          result_hash: string
          result_payload: Json
        }
        Update: {
          audit_id?: string
          command_payload?: Json
          command_payload_hash?: string
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          expires_at?: string
          id?: string
          operation_key?: string
          preview_reference?: string
          requester_id?: string
          result_hash?: string
          result_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "wallet_repair_previews_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "wallet_audit_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_reward_entitlements: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          reference_id: string
          source_key: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at: string
          reference_id: string
          source_key: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          reference_id?: string
          source_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_reward_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_reward_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_star_candy_bonus_drift"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_runtime_flags: {
        Row: {
          changed_at: string
          changed_by: string | null
          flag_key: string
          reason: string
          value_json: Json
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          flag_key: string
          reason: string
          value_json: Json
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          flag_key?: string
          reason?: string
          value_json?: Json
          version?: number
        }
        Relationships: []
      }
      wallet_worker_health: {
        Row: {
          clean_scans: number
          deployed_version: string
          last_result: Json
          last_success_at: string | null
          scan_had_skips: boolean
          worker_key: string
        }
        Insert: {
          clean_scans?: number
          deployed_version: string
          last_result?: Json
          last_success_at?: string | null
          scan_had_skips?: boolean
          worker_key: string
        }
        Update: {
          clean_scans?: number
          deployed_version?: string
          last_result?: Json
          last_success_at?: string | null
          scan_had_skips?: boolean
          worker_key?: string
        }
        Relationships: []
      }
      wallet_worker_heartbeats: {
        Row: {
          created_at: string
          instance_id: string
          last_heartbeat_at: string
          metadata: Json
          updated_at: string
          worker_id: string
          worker_type: string
        }
        Insert: {
          created_at?: string
          instance_id: string
          last_heartbeat_at?: string
          metadata?: Json
          updated_at?: string
          worker_id: string
          worker_type: string
        }
        Update: {
          created_at?: string
          instance_id?: string
          last_heartbeat_at?: string
          metadata?: Json
          updated_at?: string
          worker_id?: string
          worker_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      ad_campaigns_active: {
        Row: {
          advertiser: string | null
          created_at: string | null
          cta_url: string | null
          id: string | null
          is_default: boolean | null
          reward_comment: number | null
          reward_like: number | null
          reward_more: number | null
          reward_subscribe: number | null
          reward_view: number | null
          served_count: number | null
          status: string | null
          title: string | null
          total_cap: number | null
          updated_at: string | null
          video_key: string | null
          visible_from: string | null
          visible_to: string | null
          weight: number | null
        }
        Insert: {
          advertiser?: string | null
          created_at?: string | null
          cta_url?: string | null
          id?: string | null
          is_default?: boolean | null
          reward_comment?: number | null
          reward_like?: number | null
          reward_more?: number | null
          reward_subscribe?: number | null
          reward_view?: number | null
          served_count?: number | null
          status?: string | null
          title?: string | null
          total_cap?: number | null
          updated_at?: string | null
          video_key?: string | null
          visible_from?: string | null
          visible_to?: string | null
          weight?: number | null
        }
        Update: {
          advertiser?: string | null
          created_at?: string | null
          cta_url?: string | null
          id?: string | null
          is_default?: boolean | null
          reward_comment?: number | null
          reward_like?: number | null
          reward_more?: number | null
          reward_subscribe?: number | null
          reward_view?: number | null
          served_count?: number | null
          status?: string | null
          title?: string | null
          total_cap?: number | null
          updated_at?: string | null
          video_key?: string | null
          visible_from?: string | null
          visible_to?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      artist_request_statistics: {
        Row: {
          approved_requests: number | null
          artist_group: string | null
          artist_id: number | null
          artist_image: string | null
          artist_name: string | null
          first_request_at: string | null
          last_updated_at: string | null
          pending_requests: number | null
          rejected_requests: number | null
          total_requests: number | null
        }
        Relationships: []
      }
      audit_log_stats: {
        Row: {
          action_type: string | null
          log_count: number | null
          log_date: string | null
          resource_type: string | null
          severity: string | null
          success: boolean | null
          unique_users: number | null
        }
        Relationships: []
      }
      compatibility_results: {
        Row: {
          artist_id: number | null
          completed_at: string | null
          created_at: string | null
          details: Json | null
          error_message: string | null
          gender: Database["public"]["Enums"]["user_gender_enum"] | null
          id: string | null
          idol_birth_date: string | null
          is_ads: boolean | null
          is_paid: boolean | null
          paid_at: string | null
          score: number | null
          status: Database["public"]["Enums"]["goonghap_status"] | null
          tips: Json | null
          user_birth_date: string | null
          user_birth_time: string | null
          user_id: string | null
        }
        Insert: {
          artist_id?: number | null
          completed_at?: string | null
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          gender?: Database["public"]["Enums"]["user_gender_enum"] | null
          id?: string | null
          idol_birth_date?: string | null
          is_ads?: boolean | null
          is_paid?: boolean | null
          paid_at?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["goonghap_status"] | null
          tips?: Json | null
          user_birth_date?: string | null
          user_birth_time?: string | null
          user_id?: string | null
        }
        Update: {
          artist_id?: number | null
          completed_at?: string | null
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          gender?: Database["public"]["Enums"]["user_gender_enum"] | null
          id?: string | null
          idol_birth_date?: string | null
          is_ads?: boolean | null
          is_paid?: boolean | null
          paid_at?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["goonghap_status"] | null
          tips?: Json | null
          user_birth_date?: string | null
          user_birth_time?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "compatibility_results_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      compatibility_results_i18n: {
        Row: {
          compatibility_id: string | null
          compatibility_summary: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          language: string | null
          score: number | null
          score_title: string | null
          tips: Json | null
          updated_at: string | null
        }
        Insert: {
          compatibility_id?: string | null
          compatibility_summary?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          language?: string | null
          score?: number | null
          score_title?: string | null
          tips?: Json | null
          updated_at?: string | null
        }
        Update: {
          compatibility_id?: string | null
          compatibility_summary?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          language?: string | null
          score?: number | null
          score_title?: string | null
          tips?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_compatibility"
            columns: ["compatibility_id"]
            isOneToOne: false
            referencedRelation: "compatibility_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compatibility"
            columns: ["compatibility_id"]
            isOneToOne: false
            referencedRelation: "goonghap_results"
            referencedColumns: ["id"]
          },
        ]
      }
      compatibility_score_descriptions: {
        Row: {
          score: number | null
          summary_ja: string | null
          summary_ko: string | null
          summary_zh: string | null
          title_ja: string | null
          title_ko: string | null
          title_zh: string | null
        }
        Insert: {
          score?: number | null
          summary_ja?: string | null
          summary_ko?: string | null
          summary_zh?: string | null
          title_ja?: string | null
          title_ko?: string | null
          title_zh?: string | null
        }
        Update: {
          score?: number | null
          summary_ja?: string | null
          summary_ko?: string | null
          summary_zh?: string | null
          title_ja?: string | null
          title_ko?: string | null
          title_zh?: string | null
        }
        Relationships: []
      }
      cs_4_11_classification: {
        Row: {
          account_active: boolean | null
          ad_max_per_min: number | null
          admob_median_s: number | null
          admob_min_s: number | null
          admob_sub5s: number | null
          admob_sub5s_pct: number | null
          admob_total_gaps: number | null
          already_restored: boolean | null
          att_dup: number | null
          classification: string | null
          confiscated_4_11: number | null
          email: string | null
          nickname: string | null
          user_id: string | null
        }
        Relationships: []
      }
      security_events_summary: {
        Row: {
          action_type: string | null
          affected_users: number | null
          event_count: number | null
          event_date: string | null
          severity: string | null
          unique_ips: number | null
        }
        Relationships: []
      }
      user_activity_summary: {
        Row: {
          activity_date: string | null
          failed_actions: number | null
          first_activity: string | null
          last_activity: string | null
          total_actions: number | null
          unique_action_types: number | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: []
      }
      user_vote_item_request_history: {
        Row: {
          artist_group: string | null
          artist_id: number | null
          artist_image: string | null
          artist_name: string | null
          request_status: string | null
          request_status_text: string | null
          requested_at: string | null
          status_updated_at: string | null
          user_id: string | null
          vote_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vote_item_request_users_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      view_transaction_all: {
        Row: {
          ad_campaign_id: string | null
          ad_network: string | null
          commission: number | null
          created_at: string | null
          platform: string | null
          reward_amount: number | null
          reward_name: string | null
          reward_type: string | null
          source: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      view_transaction_all_base: {
        Row: {
          ad_network: string | null
          commission: number | null
          created_at: string | null
          platform: string | null
          reward_amount: number | null
          reward_name: string | null
          reward_type: string | null
          source: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      view_user_activity_unified: {
        Row: {
          ad_network: string | null
          ad_reward_name: string | null
          ad_source: string | null
          amount: number | null
          artist_name: Json | null
          bonus_gain: number | null
          created_at: string | null
          expired_dt: string | null
          receipt_environment: string | null
          receipt_platform: string | null
          receipt_product_id: string | null
          receipt_status: string | null
          remain_amount: number | null
          source: string | null
          star_gain: number | null
          subtype: string | null
          transaction_id: string | null
          unified_id: string | null
          user_id: string | null
          vote_item_name: Json | null
          vote_item_title: Json | null
          vote_pick_id: number | null
          vote_title: Json | null
        }
        Relationships: []
      }
      view_user_candy_ledger: {
        Row: {
          ad_network: string | null
          balance: number | null
          bonus_amount: number | null
          category: string | null
          created_at: string | null
          detail: string | null
          name: string | null
          star_amount: number | null
          transaction_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      vote_item_request_status_summary: {
        Row: {
          artist_id: number | null
          artist_name: string | null
          request_count: number | null
          request_status: string | null
          vote_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vote_item_request_users_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_item_requests: {
        Row: {
          artist: Json | null
          artist_id: number | null
          created_at: string | null
          id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          vote_id: number | null
        }
        Insert: {
          artist?: never
          artist_id?: number | null
          created_at?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          vote_id?: number | null
        }
        Update: {
          artist?: never
          artist_id?: number | null
          created_at?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          vote_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_request_statistics"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "user_vote_item_request_history"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_request_users_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "vote_item_request_status_summary"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "vote_item_request_users_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "vote"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_star_candy_bonus_drift: {
        Row: {
          delta: number | null
          history_bonus: number | null
          last_history_at: string | null
          profile_bonus: number | null
          user_id: string | null
        }
        Relationships: []
      }
      wallet_credit_source_coverage: {
        Row: {
          coverage_percent: number | null
          migrated_sources: number | null
          owner_plan: string | null
          total_sources: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aa_device_cohort_count: {
        Args: {
          p_action: string
          p_device_hash: string
          p_user_id: string
          p_window_start: string
        }
        Returns: number
      }
      aa_device_cohort_ip_count: {
        Args: {
          p_action: string
          p_device_hash: string
          p_ip_hash: string
          p_window_start: string
        }
        Returns: number
      }
      aa_hash_ip: { Args: { p_ip: string }; Returns: string }
      acknowledge_ad_reward: {
        Args: { p_reference_id: string; p_reference_type: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_reward_status"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_reward_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_ack_wallet_ops_alert: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_adjust_star_bonus: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_adjust_user_bonus: {
        Args: {
          bonus_amount: number
          expired_days?: number
          reason: string
          target_user_id: string
        }
        Returns: Json
      }
      admin_check_bonus_drift: {
        Args: { target_user_id: string }
        Returns: Json
      }
      admin_create_promotion_version: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_promotion_version_internal: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_emergency_set_wallet_flags: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_execute_wallet_repair: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_user_bonus_history: {
        Args: { limit_count?: number; target_user_id: string }
        Returns: Json
      }
      admin_get_user_cs_summary: {
        Args: { p_user_id: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_cs_summary"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_cs_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_wallet_actor_context: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_actor_context"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_actor_context"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_wallet_ops_summary: {
        Args: { p_at?: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_ops_summary"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_ops_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_wallet_runtime_flags: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_runtime_flags"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_runtime_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_worker_health: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_worker_health_item"][]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_worker_health_item"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_ops_alerts: {
        Args: { p_cursor?: string; p_filters: Json; p_limit?: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_alert_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_alert_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_promotion_campaign_versions: {
        Args: { p_campaign_id: string; p_cursor?: string; p_limit?: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_campaign_version_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_campaign_version_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_promotion_campaigns: {
        Args: { p_cursor?: string; p_filters: Json; p_limit?: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_campaign_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_campaign_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_user_currency_history: {
        Args: {
          p_currency: Database["public"]["Enums"]["wallet_currency"]
          p_cursor?: string
          p_filters: Json
          p_limit?: number
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_currency_history_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_currency_history_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_user_money_timeline: {
        Args: {
          p_cursor?: string
          p_filters: Json
          p_limit?: number
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_timeline_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_timeline_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_user_wallet_debts: {
        Args: {
          p_cursor?: string
          p_filters: Json
          p_limit?: number
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_debt_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_debt_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_wallet_audit_events: {
        Args: { p_cursor?: string; p_filters: Json; p_limit?: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_audit_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_audit_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_wallet_home_banners: { Args: never; Returns: Json }
      admin_list_wallet_invariant_violations: {
        Args: { p_cursor?: string; p_filters: Json; p_limit?: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_invariant_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_invariant_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_wallet_operations: {
        Args: { p_cursor?: string; p_filters: Json; p_limit?: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_operation_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_operation_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_preview_promotion_campaign: {
        Args: { p_at: string; p_campaign_id: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_admin_promotion_preview"]
        SetofOptions: {
          from: "*"
          to: "wallet_admin_promotion_preview"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_preview_wallet_repair: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_request_wallet_operation_retry: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_waive_wallet_debt: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      aggregate_anti_abuse_daily_stats: {
        Args: { p_target_day?: string }
        Returns: undefined
      }
      apply_wallet_correction: {
        Args: { p_actor_user_id: string; p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_anti_abuse_permission: {
        Args: { p_permission_key: string }
        Returns: undefined
      }
      attest_promotion_time: {
        Args: {
          p_inbox_id: string
          p_lease_token: string
          p_provider_verification_payload_hash: string
          p_snapshot_id: string
          p_verified_provider_occurred_at: string
          p_worker_mac: string
        }
        Returns: string
      }
      attest_verified_purchase: {
        Args: {
          p_authoritative_provider_transaction_id: string
          p_environment: string
          p_inbox_id: string
          p_intake_provider_transaction_id: string
          p_lease_token: string
          p_product_id: string
          p_provider: string
          p_provider_currency: string
          p_provider_occurred_at: string
          p_provider_original_quantity: number
          p_provider_paid_amount_minor: number
          p_provider_verification_payload_hash: string
          p_quantity: number
          p_refund_ratio_basis: string
          p_user_id: string
          p_verified_at: string
          p_worker_mac: string
        }
        Returns: Json
      }
      auto_fix_bonus_drift: {
        Args: never
        Returns: {
          new_bonus: number
          old_bonus: number
          user_id: string
        }[]
      }
      auto_resolve_stale_qna_threads: {
        Args: { inactivity_days?: number }
        Returns: undefined
      }
      batch_revoke_abuser_bonus: {
        Args: {
          p_admin_id?: string
          p_dry_run?: boolean
          p_reason: string
          p_user_ids: string[]
        }
        Returns: {
          affected_records: number
          total_revoked: number
          user_id: string
          user_nickname: string
          user_was_banned: boolean
        }[]
      }
      begin_transaction: { Args: never; Returns: undefined }
      bytea_to_text: { Args: { data: string }; Returns: string }
      call_edge_function: {
        Args: { function_name: string; payload?: Json }
        Returns: number
      }
      can_vote: {
        Args: { p_user_id: string; p_vote_amount: number }
        Returns: boolean
      }
      check_ad_view_fraud: {
        Args: { p_impression_id: string; p_user_id: string }
        Returns: string
      }
      check_bonus_state: {
        Args: { check_time?: string }
        Returns: {
          active_bonuses: number
          earliest_expiry: string
          expirable_bonuses: number
          latest_expiry: string
          total_bonuses: number
        }[]
      }
      check_ip_quota: {
        Args: {
          p_action: string
          p_device_hash?: string
          p_ip_hash: string
          p_raw_ip?: string
          p_user_id: string
        }
        Returns: string
      }
      check_ip_quota_clustered: {
        Args: {
          p_action: string
          p_device_hash?: string
          p_ip_hash: string
          p_raw_ip?: string
          p_user_id: string
        }
        Returns: string
      }
      claim_promotion_award_event: {
        Args: {
          p_inbox_id: string
          p_lease_seconds: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          encrypted_payload: string
          id: string
          lease_token: string
          operation_type: string
        }[]
      }
      claim_provider_event_batch: {
        Args: { p_lease_seconds: number; p_limit: number; p_worker_id: string }
        Returns: {
          attempt_count: number
          encrypted_payload: string
          id: string
          lease_token: string
          operation_type: string
        }[]
      }
      claim_purchase_provider_event: {
        Args: {
          p_inbox_id: string
          p_lease_seconds: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          encrypted_payload: string
          id: string
          lease_token: string
          operation_type: string
        }[]
      }
      claim_purchase_refund_event: {
        Args: {
          p_inbox_id: string
          p_lease_seconds: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          encrypted_payload: string
          id: string
          lease_token: string
          operation_type: string
        }[]
      }
      claim_wallet_alert_notifications: {
        Args: { p_limit?: number }
        Returns: {
          alert_id: string
          payload: Json
        }[]
      }
      claim_wallet_operation_batch: {
        Args: { p_lease_seconds: number; p_limit: number; p_worker_id: string }
        Returns: {
          attempt_count: number
          encrypted_payload: string
          id: string
          lease_token: string
          operation_type: string
        }[]
      }
      cleanup_deleted_qnas: { Args: { days_old?: number }; Returns: number }
      cleanup_exhausted_buckets_batch: {
        Args: { batch_limit?: number }
        Returns: number
      }
      cleanup_expired_audit_logs: { Args: never; Returns: number }
      cleanup_stale_wallet_claims: {
        Args: { p_limit?: number }
        Returns: number
      }
      commit_transaction: { Args: never; Returns: undefined }
      complete_cancelled_promotion_event: {
        Args: { p_inbox_id: string; p_lease_token: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_purchase_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_purchase_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_provider_event: {
        Args: {
          p_inbox_id: string
          p_lease_token: string
          p_result_id: string
          p_result_type: string
        }
        Returns: undefined
      }
      compute_bonus_expiry: { Args: { at_ts?: string }; Returns: string }
      consolidate_bonus_buckets: {
        Args: { p_user_id: string }
        Returns: {
          consolidated_count: number
          new_bucket_count: number
        }[]
      }
      consolidate_bonus_buckets_batch: {
        Args: { p_limit?: number; p_min_buckets?: number }
        Returns: {
          consolidated_count: number
          new_bucket_count: number
          user_id: string
        }[]
      }
      create_ad_reward_claim: {
        Args: {
          p_client_request_id: string
          p_placement_id: string
          p_platform: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_claim_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_claim_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_boards_for_existing_artists: { Args: never; Returns: undefined }
      create_boards_for_existing_artists_meme: {
        Args: never
        Returns: undefined
      }
      create_monthly_votes: { Args: never; Returns: undefined }
      create_vote_item_request_with_user: {
        Args: {
          artist_id_param: number
          p_ip_hash?: string
          user_id_param: string
          vote_id_param: number
        }
        Returns: Json
      }
      create_weekly_votes: { Args: never; Returns: undefined }
      credit_event_reward: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_credit_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_credit_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_gift_reward: {
        Args: { p_gift_id: string; p_user_id: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_credit_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_credit_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_mission_reward: {
        Args: { p_mission_id: string; p_user_id: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_credit_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_credit_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_vote_share_bonus: {
        Args: { p_expires_at: string; p_user_id: string; p_vote_id: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_credit_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_credit_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deduct_star_candy: {
        Args: { p_amount: number; p_user_id: string; p_vote_pick_id: number }
        Returns: undefined
      }
      deduct_star_candy_bonus: {
        Args: {
          p_amount: number
          p_bonus_id: number
          p_user_id: string
          p_vote_pick_id: number
        }
        Returns: undefined
      }
      delete_anti_abuse_policy: {
        Args: {
          p_action_type: string
          p_admin_user_id: string
          p_window: number
        }
        Returns: undefined
      }
      detect_abuser_candidates: {
        Args: {
          p_daily_threshold?: number
          p_lookback_days?: number
          p_min_days?: number
        }
        Returns: {
          active_bonus: number
          daily_avg: number
          email: string
          is_banned: boolean
          max_daily: number
          nickname: string
          suspicious_days: number
          total_bonus: number
          user_id: string
        }[]
      }
      enqueue_bonus_recalc: {
        Args: { p_error?: string; p_source?: string; p_user_id: string }
        Returns: undefined
      }
      evaluate_wallet_worker_heartbeats: { Args: never; Returns: number }
      expire_cotton_candy_batch: {
        Args: { p_limit: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_batch_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_batch_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_cotton_candy_batch_release_unguarded: {
        Args: { p_limit: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_batch_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_batch_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_old_suspect_decisions: { Args: never; Returns: number }
      expire_star_candy_bonus: {
        Args: { cutoff_time?: string }
        Returns: {
          affected_users: number
          updated_amount: number
          updated_count: number
        }[]
      }
      expire_star_candy_bonus_batch: {
        Args: { chunk_size?: number; cutoff_time: string }
        Returns: {
          batch_amount: number
          batch_count: number
          batch_users: number
        }[]
      }
      expire_star_candy_bonus_core: {
        Args: { chunk_size?: number; cutoff_time: string }
        Returns: {
          batch_amount: number
          batch_count: number
          batch_users: number
        }[]
      }
      fail_provider_event: {
        Args: {
          p_error_code: string
          p_inbox_id: string
          p_lease_token: string
          p_next_retry_at: string
          p_retryable: boolean
        }
        Returns: undefined
      }
      get_active_block_spike: {
        Args: never
        Returns: {
          baseline: number
          current_count: number
          ratio: number
        }[]
      }
      get_active_promotion_campaigns: {
        Args: { surface: string }
        Returns: Json
      }
      get_ad_reward_status: {
        Args: { p_reference_id: string; p_reference_type: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_reward_status"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_reward_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_alert_blocked_rows: {
        Args: { p_since: string }
        Returns: {
          action_type: string
          applied_window: number
          attempt_count: number
          country_code: string
          cs_resolution: string
          decision: string
          expires_at: string
          first_seen_at: string
          id: number
          ip_hash: string
          ip_is_fallback: boolean
          ip_user_count: number
          last_ip: string
          mode: string
          observed_value: number
          reason: string
          threshold_used: number
          user_email: string
          user_id: string
          user_nickname: string
        }[]
      }
      get_anti_abuse_summary: {
        Args: { p_window_days?: number }
        Returns: {
          active_blocked_ips: number
          active_enforce_blocks: number
          blocked_count: number
          enforce_count: number
          fp_ratio: number
          shadow_count: number
          suspect_count: number
          total_decisions: number
        }[]
      }
      get_anti_abuse_timeseries: {
        Args: {
          p_granularity?: string
          p_metric?: string
          p_window_days?: number
        }
        Returns: {
          action_type: string
          bucket: string
          count: number
          decision: string
          mode: string
        }[]
      }
      get_anti_abuse_top_ips: {
        Args: { p_limit?: number; p_window_days?: number }
        Returns: {
          block_count: number
          channels: Json
          country_code: string
          distinct_user_ids: number
          has_active_shadow_block: boolean
          has_resolved: boolean
          ip_hash: string
          is_active_block: boolean
          last_ip: string
          last_seen_at: string
          max_observed: number
          suspect_count: number
          total_attempts: number
        }[]
      }
      get_artist_paid_votes: {
        Args: { p_exclude_admin?: boolean; p_vote_id?: number }
        Returns: {
          artist_id: number
          artist_name: Json
          paid_candy_sum: number
          paid_vote_count: number
          paid_voter_count: number
        }[]
      }
      get_artist_request_count: {
        Args: { artist_id_param: number; vote_id_param: number }
        Returns: number
      }
      get_artist_vote_breakdown: {
        Args: {
          p_end?: string
          p_exclude_admin?: boolean
          p_limit?: number
          p_start?: string
        }
        Returns: Json
      }
      get_compatibility_i18n: {
        Args: { p_compatibility_id: string }
        Returns: Json
      }
      get_compatibility_result: { Args: { p_id: string }; Returns: Json }
      get_cotton_ad_limit_status: {
        Args: { p_platform: string; p_user_id: string }
        Returns: Json
      }
      get_currency_history: {
        Args: {
          p_currency: Database["public"]["Enums"]["wallet_currency"]
          p_cursor: string
          p_limit: number
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_currency_history_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_currency_history_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_current_splash_image: {
        Args: never
        Returns: {
          celeb_id: number | null
          created_at: string | null
          deleted_at: string | null
          duration: number | null
          end_at: string | null
          id: number
          image: Json | null
          link: string | null
          link_target_id: number | null
          link_type: string | null
          location: string | null
          order: number | null
          promotion_campaign_owned: boolean
          start_at: string | null
          thumbnail: string | null
          title: Json
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "banner"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_expiring_bonus_prediction:
        | {
            Args: never
            Returns: {
              expiring_amount: number
              prediction_month: string
            }[]
          }
        | {
            Args: { uri: string }
            Returns: {
              expiring_amount: number
              prediction_month: string
            }[]
          }
      get_expiring_bonus_prediction_v2: {
        Args: { uri?: string }
        Returns: {
          prediction_month: string
          sum: number
        }[]
      }
      get_fp_ratios_24h: {
        Args: never
        Returns: {
          action_type: string
          fp_count: number
          fp_ratio: number
          total: number
        }[]
      }
      get_goonghap_i18n: { Args: { p_goonghap_id: string }; Returns: Json }
      get_goonghap_result: { Args: { p_id: string }; Returns: Json }
      get_ip_block_decision_detail: {
        Args: { p_decision_id: number }
        Returns: {
          action_type: string
          applied_window: number
          attempt_count: number
          attempted_email: string | null
          attempted_provider: string | null
          cs_resolution: string | null
          decision: string
          expires_at: string | null
          first_seen_at: string
          id: number
          ip_hash: string
          last_seen_at: string
          mode: string
          observed_value: number
          raw_ip: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          threshold_used: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ip_block_decisions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_ip_hash_meta: {
        Args: { p_ip_hash: string; p_window_days?: number }
        Returns: {
          country_code: string
          last_ip: string
          user_count: number
        }[]
      }
      get_payment_breakdown: {
        Args: { p_dimension?: string; p_end?: string; p_start?: string }
        Returns: Json
      }
      get_promotion_resolution_for_lease: {
        Args: { p_inbox_id: string; p_lease_token: string }
        Returns: {
          snapshot_id: string
          state: string
        }[]
      }
      get_purchase_inbox_outcome: {
        Args: { p_inbox_id: string }
        Returns: {
          attempt_count: number
          last_error_code: string
          last_error_retryable: boolean
          lease_active: boolean
          next_retry_at: string
          status: string
        }[]
      }
      get_purchase_result_for_inbox: {
        Args: { p_inbox_id: string }
        Returns: Database["public"]["CompositeTypes"]["wallet_purchase_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_purchase_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_refund_snapshot_for_lease: {
        Args: {
          p_environment: string
          p_inbox_id: string
          p_lease_token: string
          p_provider: string
          p_provider_transaction_id: string
        }
        Returns: {
          refund_denominator: number
          snapshot_id: string
        }[]
      }
      get_request_ip_activity: {
        Args: { p_ip_hash: string; p_limit?: number; p_window_days?: number }
        Returns: {
          action_type: string
          created_at: string
          device_hash: string | null
          id: number
          ip_hash: string
          metadata: Json | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "request_ip_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_suspect_burst: {
        Args: never
        Returns: {
          baseline: number
          current_count: number
          ratio: number
        }[]
      }
      get_user_abuse_status: {
        Args: { p_user_id: string; p_window_days?: number }
        Returns: {
          action_type: string
          applied_window: number
          attempt_count: number
          cs_resolution: string
          decision: string
          expires_at: string
          first_seen_at: string
          id: number
          ip_hash: string
          is_active_block: boolean
          last_seen_at: string
          mode: string
          observed_value: number
          reason: string
          reviewed_at: string
          reviewed_by: string
          threshold_used: number
        }[]
      }
      get_user_activity_unified: {
        Args: { p_limit: number; p_offset: number; p_user_id: string }
        Returns: {
          ad_network: string
          ad_reward_name: string
          ad_source: string
          amount: number
          artist_name: Json
          bonus_gain: number
          created_at: string
          receipt_environment: string
          receipt_platform: string
          receipt_product_id: string
          receipt_status: string
          source: string
          star_gain: number
          subtype: string
          transaction_id: string
          unified_id: string
          user_id: string
          vote_item_title: Json
          vote_pick_id: number
          vote_title: Json
        }[]
      }
      get_user_activity_unified_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_profile: {
        Args: { user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          id: string
          is_admin: boolean
          nickname: string
          star_candy: number
          updated_at: string
        }[]
      }
      get_user_qna_stats: { Args: { user_id_param: string }; Returns: Json }
      get_users_abuse_summary: {
        Args: { p_user_ids: string[]; p_window_days?: number }
        Returns: {
          decision_count: number
          earliest_active_expires: string
          has_active_block: boolean
          user_id: string
        }[]
      }
      get_users_for_ip_hash: {
        Args: { p_ip_hash: string; p_window_days?: number }
        Returns: {
          country_code: string
          created_at: string
          email: string
          is_banned: boolean
          last_ip: string
          nickname: string
          sources: string
          user_id: string
        }[]
      }
      get_vote_and_user_info: {
        Args: { p_user_id: number; p_vote_id: number }
        Returns: {
          star_candy: number
          star_candy_bonus: number
          stop_at: string
          total_bonus_remain: number
        }[]
      }
      get_wallet_operation_event_type: {
        Args: { p_inbox_id: string }
        Returns: string
      }
      get_wallet_summary: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["wallet_summary"]
        SetofOptions: {
          from: "*"
          to: "wallet_summary"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_weekday_stats: {
        Args: { p_end?: string; p_start?: string }
        Returns: Json
      }
      grant_ad_cotton: {
        Args: {
          p_amount: number
          p_claim_id: string
          p_impression_id: string
          p_metadata: Json
          p_operation_key: string
          p_payload_hash: string
          p_reward_policy_version: string
          p_source_environment: string
          p_source_event_type: string
          p_source_provider: string
          p_source_transaction_id: string
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_grant_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_grant_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      grant_ad_cotton_release_unguarded: {
        Args: {
          p_amount: number
          p_claim_id: string
          p_impression_id: string
          p_metadata: Json
          p_operation_key: string
          p_payload_hash: string
          p_reward_policy_version: string
          p_source_environment: string
          p_source_event_type: string
          p_source_provider: string
          p_source_transaction_id: string
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_grant_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_grant_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      grant_verified_purchase: {
        Args: {
          p_environment: string
          p_inbox_id: string
          p_lease_token: string
          p_operation_key: string
          p_product_id: string
          p_provider: string
          p_provider_currency: string
          p_provider_occurred_at: string
          p_provider_original_quantity: number
          p_provider_paid_amount_minor: number
          p_provider_transaction_id: string
          p_quantity: number
          p_refund_ratio_basis: string
          p_request_context: Json
          p_user_id: string
          p_verification_payload_hash: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_purchase_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_purchase_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_user_requested_artist: {
        Args: {
          artist_id_param: number
          user_id_param: string
          vote_id_param: number
        }
        Returns: boolean
      }
      hook_signup_ip_rate_limit: { Args: { event: Json }; Returns: Json }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_star_candy: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      increment_star_candy_bonus: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      increment_user_star_candy_bonus: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      increment_view_count: {
        Args: { post_id_param: string; viewer_id?: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_super: { Args: never; Returns: boolean }
      is_request_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_vote_creator: { Args: { vote_id: number }; Returns: boolean }
      is_vote_item_request_open: { Args: { vote_id: number }; Returns: boolean }
      list_anti_abuse_policies: {
        Args: never
        Returns: {
          action_type: string
          block_threshold: number
          count_strategy: string
          created_at: string
          device_block_threshold: number | null
          device_suspect_threshold: number | null
          enabled: boolean
          enforce_since: string | null
          id: number
          link_loose_window_seconds: number | null
          link_tight_window_seconds: number | null
          mode: string
          note: string | null
          suspect_threshold: number
          updated_at: string
          updated_by: string | null
          window_seconds: number
        }[]
        SetofOptions: {
          from: "*"
          to: "anti_abuse_policies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_bonus_drift:
        | {
            Args: { p_limit?: number; p_threshold?: number }
            Returns: {
              delta: number
              history_bonus: number
              last_history_at: string
              profile_bonus: number
              user_id: string
            }[]
          }
        | {
            Args: {
              p_page?: number
              p_page_size?: number
              p_threshold?: number
            }
            Returns: {
              delta: number
              history_bonus: number
              last_history_at: string
              profile_bonus: number
              total_count: number
              user_id: string
            }[]
          }
      list_claimable_promotion_award_events: {
        Args: { p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      list_claimable_purchase_provider_events: {
        Args: { p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      list_claimable_wallet_operation_events: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          operation_type: string
        }[]
      }
      list_my_anti_abuse_permissions: { Args: never; Returns: string[] }
      list_unacknowledged_ad_rewards: {
        Args: { p_cursor: string; p_limit: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_reward_status_page"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_reward_status_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_star_candy_bonus_expiry: {
        Args: { p_source?: string }
        Returns: string
      }
      perform_pic_vote_transaction_without_wallet_lock: {
        Args: {
          p_amount: number
          p_user_id: string
          p_vote_id: number
          p_vote_item_id: number
        }
        Returns: Json
      }
      perform_vote_deduction: {
        Args: {
          p_user_id: string
          p_vote_amount: number
          p_vote_pick_id: number
        }
        Returns: undefined
      }
      perform_vote_transaction: {
        Args: {
          p_amount: number
          p_user_id: string
          p_vote_id: number
          p_vote_item_id: number
        }
        Returns: Json
      }
      perform_vote_transaction_v3: {
        Args: {
          p_amount: number
          p_request_id: string
          p_user_id: string
          p_vote_id: number
          p_vote_item_id: number
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_vote_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_vote_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_promotion_time_attestation: {
        Args: {
          p_inbox_id: string
          p_lease_token: string
          p_provider_verification_payload_hash: string
          p_snapshot_id: string
          p_verified_provider_occurred_at: string
        }
        Returns: Json
      }
      prepare_purchase_attestation: {
        Args: {
          p_authoritative_provider_transaction_id: string
          p_environment: string
          p_inbox_id: string
          p_intake_provider_transaction_id: string
          p_lease_token: string
          p_product_id: string
          p_provider: string
          p_provider_currency: string
          p_provider_occurred_at: string
          p_provider_original_quantity: number
          p_provider_paid_amount_minor: number
          p_provider_verification_payload_hash: string
          p_quantity: number
          p_refund_ratio_basis: string
          p_user_id: string
          p_verified_at: string
        }
        Returns: Json
      }
      process_attendance_check: {
        Args: {
          p_check_date: string
          p_expired_dt: string
          p_reward_amount: number
          p_transaction_id: string
          p_user_id: string
          p_weekly_bonus_amount: number
          p_weekly_transaction_id?: string
        }
        Returns: Json
      }
      process_bonus_recalc: {
        Args: { p_limit?: number }
        Returns: {
          message: string
          processed_at: string
          status: string
          user_id: string
        }[]
      }
      process_compatibility_payment_without_wallet_lock: {
        Args: {
          p_compatibility_id: string
          p_star_candy_amount?: number
          p_user_id: string
        }
        Returns: undefined
      }
      process_goonghap_payment_without_wallet_lock: {
        Args: {
          p_goonghap_id: string
          p_star_candy_amount?: number
          p_user_id: string
        }
        Returns: undefined
      }
      process_paypal_capture: {
        Args: {
          p_amount: string
          p_bonus_amount: number
          p_bonus_expiry: string
          p_capture_id: string
          p_currency: string
          p_environment: string
          p_order_id: string
          p_payment_details: Json
          p_product_id: string
          p_star_candy: number
          p_status: string
          p_user_id: string
          p_verification_data: Json
        }
        Returns: Json
      }
      process_portone_capture: {
        Args: {
          p_bonus_amount: number
          p_bonus_expiry: string
          p_currency: string
          p_environment: string
          p_method: string
          p_payment_id: string
          p_product_id: string
          p_receipt_data: Json
          p_star_candy: number
          p_status: string
          p_total_amount: number
          p_user_id: string
          p_verification_data: Json
        }
        Returns: Json
      }
      process_vote: {
        Args: {
          p_amount: number
          p_total_bonus_remain: number
          p_user_id: string
          p_vote_id: number
          p_vote_item_id: number
        }
        Returns: {
          vote_total: number
        }[]
      }
      process_vote_item_queue:
        | { Args: { p_limit: number; p_vote_item_id: number }; Returns: number }
        | { Args: { p_vote_item_id: number }; Returns: number }
      process_vote_item_update_queue:
        | { Args: never; Returns: number }
        | { Args: { p_limit: number }; Returns: number }
      receive_provider_event: {
        Args: {
          p_encrypted_payload: string
          p_idempotency_key: string
          p_occurred_at: string
          p_operation_type: string
          p_payload_hash: string
        }
        Returns: {
          operation_id: string
          replayed: boolean
        }[]
      }
      receive_purchase_provider_event: {
        Args: {
          p_environment: string
          p_payload: Json
          p_payload_hash: string
          p_product_id: string
          p_provider: string
          p_provider_transaction_id: string
          p_received_at?: string
          p_user_id: string
        }
        Returns: Json
      }
      recompute_user_bonus: { Args: { p_user_id: string }; Returns: number }
      reconcile_wallet_batch: {
        Args: { p_after_user_id?: string; p_limit: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_batch_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_batch_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_wallet_batch_release_unguarded: {
        Args: { p_after_user_id?: string; p_limit: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_batch_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_batch_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_request_ip: {
        Args: {
          p_action: string
          p_device_hash?: string
          p_ip_hash: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: undefined
      }
      record_wallet_command_failure: {
        Args: { p_request: Json }
        Returns: Database["public"]["CompositeTypes"]["wallet_stable_command_envelope"]
        SetofOptions: {
          from: "*"
          to: "wallet_stable_command_envelope"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_wallet_worker_heartbeat: {
        Args: {
          p_instance_id: string
          p_metadata: Json
          p_worker_id: string
          p_worker_type: string
        }
        Returns: undefined
      }
      refund_verified_purchase: {
        Args: {
          p_cumulative_refunded_numerator: number
          p_inbox_id?: string
          p_lease_token?: string
          p_operation_key: string
          p_payload_hash: string
          p_provider_occurred_at: string
          p_provider_refund_event_id: string
          p_refund_denominator: number
          p_snapshot_id: string
        }
        Returns: Json
      }
      repair_bonus_balance: {
        Args: { p_user_id: string }
        Returns: {
          new_bonus: number
          old_bonus: number
          user_id: string
        }[]
      }
      repair_bonus_balance_bulk: {
        Args: { p_limit?: number; p_threshold?: number }
        Returns: {
          queued_user_id: string
        }[]
      }
      resolve_clean_wallet_invariant_alerts: { Args: never; Returns: number }
      resolve_purchase_promotion: {
        Args: {
          p_inbox_id: string
          p_lease_token: string
          p_operation_key: string
          p_snapshot_id: string
          p_verified_provider_occurred_at: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_purchase_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_purchase_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_qna: { Args: { qna_id_param: number }; Returns: undefined }
      revoke_abuser_bonus: {
        Args: {
          p_admin_id?: string
          p_dry_run?: boolean
          p_reason: string
          p_user_id: string
        }
        Returns: {
          affected_records: number
          total_revoked: number
          user_nickname: string
          user_was_banned: boolean
          was_dry_run: boolean
        }[]
      }
      rollback_transaction: { Args: never; Returns: undefined }
      run_expire_star_candy_bonus_once: { Args: never; Returns: undefined }
      run_wallet_reconciliation_checkpoint: {
        Args: { p_limit: number }
        Returns: Database["public"]["CompositeTypes"]["wallet_batch_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_batch_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_artists: {
        Args: { search_term?: string }
        Returns: {
          artist_group: Json
          birth_date: string
          id: number
          image: Json
          name: Json
        }[]
      }
      set_wallet_runtime_flag: {
        Args: {
          p_expected_version: number
          p_flag_key: string
          p_reason: string
          p_value_json: Json
        }
        Returns: {
          changed_at: string
          changed_by: string | null
          flag_key: string
          reason: string
          value_json: Json
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "wallet_runtime_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_wallet_runtime_flag_promotion_unguarded: {
        Args: {
          p_expected_version: number
          p_flag_key: string
          p_reason: string
          p_value_json: Json
        }
        Returns: {
          changed_at: string
          changed_by: string | null
          flag_key: string
          reason: string
          value_json: Json
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "wallet_runtime_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_pangle_ad_reward: {
        Args: {
          p_claim_id: string
          p_claim_payload_hash: string
          p_environment: string
          p_expires_at: string
          p_placement_id: string
          p_platform: string
          p_provider_occurred_at: string
          p_provider_payload_hash: string
          p_provider_transaction_id: string
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_grant_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_grant_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settle_shortform_view_reward: {
        Args: {
          p_impression_id: string
          p_issue_jti: string
          p_payload_hash: string
          p_token_expires_at: string
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_ad_grant_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_ad_grant_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_threshold_change: {
        Args: {
          p_action_type: string
          p_new_block: number
          p_new_suspect: number
          p_window: number
        }
        Returns: {
          current_blocked: number
          current_suspect: number
          would_be_blocked: number
          would_be_suspect: number
        }[]
      }
      soft_delete_qna: { Args: { qna_id_param: number }; Returns: undefined }
      sync_user_profiles_from_queue: {
        Args: { max_rows?: number }
        Returns: {
          updated_users: number
        }[]
      }
      test_expire_star_candy_bonus: {
        Args: { test_datetime: string }
        Returns: {
          details: Json
          operation: string
        }[]
      }
      test_realtime_update: { Args: { vote_id_param: number }; Returns: string }
      text_to_bytea: { Args: { data: string }; Returns: string }
      update_vote_item_and_vote_totals: {
        Args: { p_vote_item_id: number }
        Returns: undefined
      }
      update_vote_totals_batch_bak: {
        Args: { p_vote_ids: number[] }
        Returns: undefined
      }
      upsert_ad_bonus: {
        Args: {
          p_amount: number
          p_expired_dt: string
          p_transaction_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_anti_abuse_policy: {
        Args: {
          p_action_type: string
          p_admin_user_id: string
          p_block: number
          p_enabled: boolean
          p_mode: string
          p_suspect: number
          p_window: number
        }
        Returns: undefined
      }
      upsert_user_push_token:
        | {
            Args: { p_platform: string; p_token: string; p_user_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_device_locale?: string
              p_platform: string
              p_token: string
              p_user_id: string
            }
            Returns: undefined
          }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      use_star_candy_bonus:
        | { Args: { p_amount: number; p_user_id: string }; Returns: number }
        | {
            Args: {
              p_amount: number
              p_user_id: string
              p_vote_pick_id: number
            }
            Returns: number
          }
      verify_ip_hash_sig: {
        Args: {
          p_action: string
          p_exp: number
          p_ip_hash: string
          p_secret: string
          p_sig: string
        }
        Returns: boolean
      }
      wallet_credit_bonus: {
        Args: {
          p_bonus_amount: number
          p_bonus_expires_at: string
          p_metadata?: Json
          p_operation_key: string
          p_reason: Database["public"]["Enums"]["candy_history_type"]
          p_reference_id: string
          p_reference_type: string
          p_source_key: string
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["wallet_credit_result"]
        SetofOptions: {
          from: "*"
          to: "wallet_credit_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      board_status_enum: "pending" | "approved" | "rejected"
      candy_history_type:
        | "AD"
        | "VOTE"
        | "PURCHASE"
        | "GIFT"
        | "EXPIRED"
        | "VOTE_SHARE_BONUS"
        | "OPEN_COMPATIBILITY"
        | "MISSION"
        | "OPEN_GOONGHAP"
        | "ADMIN_ADJUST"
        | "CANDY_BOOST"
        | "REFUND_REVERSAL"
        | "DEBT_RECOVERY"
        | "CORRECTION"
      goonghap_status: "pending" | "completed" | "error"
      platform_enum: "iOS" | "Android" | "Both"
      policy_language_enum: "ko" | "en"
      policy_type_enum:
        | "PRIVACY_KO"
        | "PRIVACY_EN"
        | "TERMS_KO"
        | "TERMS_EN"
        | "WITHDRAW_ACCOUNT_KO"
        | "WITHDRAW_ACCOUNT_EN"
      portal_enum: "vote" | "pic"
      product_type_enum: "consumable" | "non-consumable" | "subscription"
      qna_status: "RECEIVED" | "IN_PROGRESS" | "RESOLVED"
      specific_platform_enum: "iOS" | "Android"
      supported_language:
        | "ko"
        | "en"
        | "ja"
        | "zh"
        | "zh-CN"
        | "zh-TW"
        | "fil"
        | "id"
        | "th"
        | "vi"
        | "es"
        | "bn"
        | "my"
      user_gender_enum: "male" | "female" | "other"
      wallet_currency: "STAR_CANDY" | "BONUS_STAR_CANDY" | "COTTON_CANDY"
      wallet_operation_kind: "CREDIT" | "DEBIT"
      wallet_operation_status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "DEAD"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
      wallet_ad_claim_result: {
        id: string | null
        user_id: string | null
        channel: string | null
        environment: string | null
        platform: string | null
        placement_id: string | null
        client_request_id: string | null
        status: string | null
        expires_at: string | null
        payload_hash: string | null
        replayed: boolean | null
      }
      wallet_ad_grant_result: {
        operation_id: string | null
        replayed: boolean | null
        grant_id: number | null
        amount: number | null
        granted_at: string | null
        expires_at: string | null
        cotton_balance: number | null
        cotton_expiring_amount: number | null
        cotton_next_expires_at: string | null
        snapshot_at: string | null
      }
      wallet_ad_reward_grant: {
        id: string | null
        currency: Database["public"]["Enums"]["wallet_currency"] | null
        amount: string | null
        granted_at: string | null
        expires_at: string | null
      }
      wallet_ad_reward_reference: {
        type: string | null
        id: string | null
      }
      wallet_ad_reward_status: {
        reference:
          | Database["public"]["CompositeTypes"]["wallet_ad_reward_reference"]
          | null
        state: string | null
        grant:
          | Database["public"]["CompositeTypes"]["wallet_ad_reward_grant"]
          | null
        wallet: Database["public"]["CompositeTypes"]["wallet_summary"] | null
        snapshot_at: string | null
      }
      wallet_ad_reward_status_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_ad_reward_status"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_actor_context: {
        actor_id: string | null
        actor_role: string | null
        permissions: string[] | null
      }
      wallet_admin_alert_item: {
        id: string | null
        severity: string | null
        status: string | null
        summary: string | null
        occurrence_count: string | null
        resource_type: string | null
        resource_id: string | null
        first_seen_at: string | null
        last_seen_at: string | null
        row_version: string | null
        audit_id: string | null
      }
      wallet_admin_alert_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_alert_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_audit_item: {
        id: string | null
        actor_user_id: string | null
        actor_role: string | null
        action_code: string | null
        resource_type: string | null
        resource_id: string | null
        operation_id: string | null
        request_id: string | null
        reason: string | null
        cs_ticket: string | null
        before_json: Json | null
        after_json: Json | null
        campaign_version_id: string | null
        created_at: string | null
      }
      wallet_admin_audit_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_audit_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_campaign_item: {
        id: string | null
        code: string | null
        kind: string | null
        latest_version:
          | Database["public"]["CompositeTypes"]["wallet_admin_campaign_version_item"]
          | null
      }
      wallet_admin_campaign_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_campaign_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_campaign_version_item: {
        id: string | null
        campaign_id: string | null
        version: string | null
        effective_from: string | null
        is_active: boolean | null
        timezone: string | null
        weekly_start_isodow: number | null
        weekly_start_time: string | null
        weekly_end_isodow: number | null
        weekly_end_time: string | null
        extra_bonus_bps: string | null
        display_name: Json | null
        show_home_banner: boolean | null
        show_in_store: boolean | null
        home_banner_id: number | null
        rollout_policy: Json | null
        change_reason: string | null
        created_by: string | null
        created_at: string | null
        audit_id: string | null
      }
      wallet_admin_campaign_version_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_campaign_version_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_cs_summary: {
        user_id: string | null
        balances: Json | null
        open_debt: Json | null
        cotton_expiring_amount: string | null
        cotton_next_expires_at: string | null
        invariant_status: string | null
        authoritative_totals: Json | null
        recent_operation:
          | Database["public"]["CompositeTypes"]["wallet_admin_operation_item"]
          | null
        snapshot_at: string | null
      }
      wallet_admin_currency_history_item: {
        id: string | null
        currency: Database["public"]["Enums"]["wallet_currency"] | null
        event_type: string | null
        origin: string | null
        delta: string | null
        balance_effect: string | null
        expires_at: string | null
        purchase_id: string | null
        refund_id: string | null
        grant_id: string | null
        operation_id: string | null
        created_at: string | null
      }
      wallet_admin_currency_history_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_currency_history_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_debt_item: {
        id: string | null
        user_id: string | null
        currency: Database["public"]["Enums"]["wallet_currency"] | null
        reason: string | null
        status: string | null
        owed_amount: string | null
        recovered_amount: string | null
        waived_amount: string | null
        outstanding_amount: string | null
        source_refund_allocation_id: string | null
        source_debit_allocation_id: string | null
        row_version: string | null
        created_at: string | null
        updated_at: string | null
      }
      wallet_admin_debt_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_debt_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_invariant_item: {
        id: string | null
        status: string | null
        resource_type: string | null
        resource_id: string | null
        currency: Database["public"]["Enums"]["wallet_currency"] | null
        expected_amount: string | null
        actual_amount: string | null
        operation_id: string | null
        support_ref: string | null
        detected_at: string | null
      }
      wallet_admin_invariant_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_invariant_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_operation_item: {
        id: string | null
        operation_type: string | null
        status: Database["public"]["Enums"]["wallet_operation_status"] | null
        retryable: boolean | null
        attempt_count: string | null
        next_retry_at: string | null
        last_error_code: string | null
        support_ref: string | null
        row_version: string | null
        approval_reference: string | null
        approval_status: string | null
        requested_by: string | null
        operation_key: string | null
        requested_currency:
          | Database["public"]["Enums"]["wallet_currency"]
          | null
        requested_direction: string | null
        requested_amount: string | null
        created_at: string | null
        updated_at: string | null
      }
      wallet_admin_operation_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_operation_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_ops_summary: {
        inbox_pending_count: string | null
        inbox_dead_count: string | null
        inbox_oldest_pending_seconds: string | null
        debt_open_amount: Json | null
        debt_oldest_open_seconds: Json | null
        debt_recovery_rate_bps: string | null
        campaign_conflict_count: string | null
        audit_completeness_bps: string | null
        expiry_status: string | null
        reconciliation_status: string | null
        snapshot_at: string | null
      }
      wallet_admin_promotion_preview: {
        campaign_id: string | null
        evaluated_at: string | null
        status: string | null
        effective_version:
          | Database["public"]["CompositeTypes"]["wallet_admin_campaign_version_item"]
          | null
        window_start: string | null
        window_end: string | null
        surfaces: string[] | null
      }
      wallet_admin_runtime_flags: {
        flag_version: string | null
        values: Json | null
        changed_at: string | null
        changed_by: string | null
        snapshot_at: string | null
        versions: Json | null
      }
      wallet_admin_timeline_item: {
        id: string | null
        kind: string | null
        allocations: Json | null
        provider_occurred_at: string | null
        campaign_version_id: string | null
        audit_id: string | null
        operation_id: string | null
        created_at: string | null
      }
      wallet_admin_timeline_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_admin_timeline_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_admin_worker_health_item: {
        worker_name: string | null
        status: string | null
        last_heartbeat_at: string | null
        last_success_at: string | null
        lag_seconds: string | null
        support_ref: string | null
      }
      wallet_batch_result: {
        processed: number | null
        skipped_locked: number | null
        next_cursor: string | null
      }
      wallet_credit_result: {
        operation_id: string | null
        replayed: boolean | null
        star_gross: number | null
        star_debt_offset: number | null
        star_net_wallet_credit: number | null
        star_balance: number | null
        bonus_gross: number | null
        bonus_debt_offset: number | null
        bonus_net_wallet_credit: number | null
        bonus_balance: number | null
      }
      wallet_currency_history_item: {
        id: string | null
        currency: Database["public"]["Enums"]["wallet_currency"] | null
        event_type: string | null
        origin: string | null
        delta: string | null
        balance_effect: string | null
        expires_at: string | null
        purchase_id: string | null
        refund_id: string | null
        grant_id: string | null
        operation_id: string | null
        created_at: string | null
      }
      wallet_currency_history_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_currency_history_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
      }
      wallet_promotion_campaign_surface_item_v1: {
        campaign_id: string | null
        campaign_version_id: string | null
        code: string | null
        display_name: Json | null
        extra_bonus_bps: number | null
        window_starts_at: string | null
        window_ends_at: string | null
        show_in_store: boolean | null
        show_home_banner: boolean | null
        home_creative: Json | null
      }
      wallet_promotion_campaign_surface_page_v1: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_promotion_campaign_surface_item_v1"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
        campaign_owned_home_banner_ids: number[] | null
      }
      wallet_promotion_surface_item: {
        campaign_code: string | null
        campaign_kind: string | null
        version: number | null
        name: Json | null
        extra_bonus_bps: number | null
        home_banner_id: number | null
      }
      wallet_promotion_surface_page: {
        items:
          | Database["public"]["CompositeTypes"]["wallet_promotion_surface_item"][]
          | null
        total_count: string | null
        next_cursor: string | null
        snapshot_at: string | null
        campaign_owned_home_banner_ids: number[] | null
      }
      wallet_purchase_promotion_result: {
        resolution_id: string | null
        state: string | null
        campaign_version_id: string | null
        promo_bonus_amount: string | null
        domain_code: string | null
      }
      wallet_purchase_result: {
        contract_version: string | null
        operation_id: string | null
        replayed: boolean | null
        base_star_amount: string | null
        base_bonus_amount: string | null
        promotion:
          | Database["public"]["CompositeTypes"]["wallet_purchase_promotion_result"]
          | null
        wallet: Database["public"]["CompositeTypes"]["wallet_summary"] | null
      }
      wallet_stable_command_envelope: {
        ok: boolean | null
        domain_code: string | null
        retryable: boolean | null
        operation_id: string | null
        audit_id: string | null
        payload: Json | null
        support_ref: string | null
      }
      wallet_summary: {
        contract_version: string | null
        star: string | null
        bonus: string | null
        cotton: string | null
        cotton_expiring_amount: string | null
        cotton_next_expires_at: string | null
        snapshot_at: string | null
      }
      wallet_vote_result: {
        vote_pick_id: number | null
        updated_vote_total: number | null
        added_vote_total: number | null
        updated_at: string | null
        operation_id: string | null
        replayed: boolean | null
        cotton_spent: number | null
        bonus_spent: number | null
        star_spent: number | null
        star_balance: number | null
        bonus_balance: number | null
        cotton_balance: number | null
        cotton_expiring_amount: number | null
        cotton_next_expires_at: string | null
        snapshot_at: string | null
      }
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
      board_status_enum: ["pending", "approved", "rejected"],
      candy_history_type: [
        "AD",
        "VOTE",
        "PURCHASE",
        "GIFT",
        "EXPIRED",
        "VOTE_SHARE_BONUS",
        "OPEN_COMPATIBILITY",
        "MISSION",
        "OPEN_GOONGHAP",
        "ADMIN_ADJUST",
        "CANDY_BOOST",
        "REFUND_REVERSAL",
        "DEBT_RECOVERY",
        "CORRECTION",
      ],
      goonghap_status: ["pending", "completed", "error"],
      platform_enum: ["iOS", "Android", "Both"],
      policy_language_enum: ["ko", "en"],
      policy_type_enum: [
        "PRIVACY_KO",
        "PRIVACY_EN",
        "TERMS_KO",
        "TERMS_EN",
        "WITHDRAW_ACCOUNT_KO",
        "WITHDRAW_ACCOUNT_EN",
      ],
      portal_enum: ["vote", "pic"],
      product_type_enum: ["consumable", "non-consumable", "subscription"],
      qna_status: ["RECEIVED", "IN_PROGRESS", "RESOLVED"],
      specific_platform_enum: ["iOS", "Android"],
      supported_language: [
        "ko",
        "en",
        "ja",
        "zh",
        "zh-CN",
        "zh-TW",
        "fil",
        "id",
        "th",
        "vi",
        "es",
        "bn",
        "my",
      ],
      user_gender_enum: ["male", "female", "other"],
      wallet_currency: ["STAR_CANDY", "BONUS_STAR_CANDY", "COTTON_CANDY"],
      wallet_operation_kind: ["CREDIT", "DEBIT"],
      wallet_operation_status: ["PENDING", "PROCESSING", "SUCCEEDED", "DEAD"],
    },
  },
} as const
