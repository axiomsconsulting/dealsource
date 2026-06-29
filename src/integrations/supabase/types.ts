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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          completed: number
          created_at: string
          errors: number
          id: string
          kind: string
          last_error: string | null
          last_property_id: string | null
          property_ids: Json
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: number
          created_at?: string
          errors?: number
          id?: string
          kind?: string
          last_error?: string | null
          last_property_id?: string | null
          property_ids?: Json
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: number
          created_at?: string
          errors?: number
          id?: string
          kind?: string
          last_error?: string | null
          last_property_id?: string | null
          property_ids?: Json
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          property_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          property_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          property_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analyses: {
        Row: {
          ai_notes: Json
          ai_payload: Json | null
          ai_used_at: string | null
          ai_version: string | null
          created_at: string
          deal_score: number | null
          id: string
          negotiation: Json
          overrides: Json
          persona_id: string | null
          property_id: string
          results: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_notes?: Json
          ai_payload?: Json | null
          ai_used_at?: string | null
          ai_version?: string | null
          created_at?: string
          deal_score?: number | null
          id?: string
          negotiation?: Json
          overrides?: Json
          persona_id?: string | null
          property_id: string
          results?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_notes?: Json
          ai_payload?: Json | null
          ai_used_at?: string | null
          ai_version?: string | null
          created_at?: string
          deal_score?: number | null
          id?: string
          negotiation?: Json
          overrides?: Json
          persona_id?: string | null
          property_id?: string
          results?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      article4_areas: {
        Row: {
          council: string | null
          created_at: string
          id: string
          notes: string | null
          postcode_prefix: string
          scope: string
          source_url: string | null
        }
        Insert: {
          council?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          postcode_prefix: string
          scope?: string
          source_url?: string | null
        }
        Update: {
          council?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          postcode_prefix?: string
          scope?: string
          source_url?: string | null
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          channels_sent: string[]
          created_at: string
          dismissed_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          channels_sent?: string[]
          created_at?: string
          dismissed_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          channels_sent?: string[]
          created_at?: string
          dismissed_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_type: string
          body: string
          channels: string[]
          created_at: string
          created_by: string
          id: string
          inactive_hours: number | null
          sent_at: string | null
          status: string
          title: string
          user_ids: string[] | null
        }
        Insert: {
          audience_type: string
          body: string
          channels: string[]
          created_at?: string
          created_by: string
          id?: string
          inactive_hours?: number | null
          sent_at?: string | null
          status?: string
          title: string
          user_ids?: string[] | null
        }
        Update: {
          audience_type?: string
          body?: string
          channels?: string[]
          created_at?: string
          created_by?: string
          id?: string
          inactive_hours?: number | null
          sent_at?: string | null
          status?: string
          title?: string
          user_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_sheets: {
        Row: {
          created_at: string
          hero_photo_id: string | null
          hide_address: boolean
          hide_photos: boolean
          id: string
          include_refurb_breakdown: boolean
          include_risk_flags: boolean
          is_public: boolean
          property_id: string
          redact: boolean
          share_token: string
          snapshot: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hero_photo_id?: string | null
          hide_address?: boolean
          hide_photos?: boolean
          id?: string
          include_refurb_breakdown?: boolean
          include_risk_flags?: boolean
          is_public?: boolean
          property_id: string
          redact?: boolean
          share_token?: string
          snapshot?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hero_photo_id?: string | null
          hide_address?: boolean
          hide_photos?: boolean
          id?: string
          include_refurb_breakdown?: boolean
          include_risk_flags?: boolean
          is_public?: boolean
          property_id?: string
          redact?: boolean
          share_token?: string
          snapshot?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_sheets_hero_photo_id_fkey"
            columns: ["hero_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_sheets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      design_themes: {
        Row: {
          created_at: string
          dark: Json
          font_scale: number
          id: string
          is_active: boolean
          light: Json
          name: string
          radius: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dark?: Json
          font_scale?: number
          id?: string
          is_active?: boolean
          light?: Json
          name: string
          radius?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dark?: Json
          font_scale?: number
          id?: string
          is_active?: boolean
          light?: Json
          name?: string
          radius?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          location_city: string | null
          location_country: string | null
          note: string | null
          page_path: string | null
          property_id: string | null
          reasons: string[]
          section_key: string
          section_label: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          location_city?: string | null
          location_country?: string | null
          note?: string | null
          page_path?: string | null
          property_id?: string | null
          reasons?: string[]
          section_key: string
          section_label: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          location_city?: string | null
          location_country?: string | null
          note?: string | null
          page_path?: string | null
          property_id?: string | null
          reasons?: string[]
          section_key?: string
          section_label?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_shares: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          owner_user_id: string
          property_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          owner_user_id: string
          property_id: string
          token?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          owner_user_id?: string
          property_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_shares_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          ai_default_enabled: boolean
          allow_epc_de_if_neighbours_c: boolean
          cash_available_gbp: number
          created_at: string
          id: string
          ignore_eras: string[]
          investor_type: string | null
          is_default: boolean
          ltv: number
          max_beds: number
          max_offer_gbp: number
          min_bed_size_ft: number
          min_beds: number
          min_epc: string
          mortgage_rate: number
          name: string
          refurb_buffer_gbp: number
          require_gas_boiler: boolean
          require_parking: boolean
          risk_policy: Json
          strategy: string
          stress_rate: number
          target_offer_gbp: number
          target_rent_gbp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_default_enabled?: boolean
          allow_epc_de_if_neighbours_c?: boolean
          cash_available_gbp?: number
          created_at?: string
          id?: string
          ignore_eras?: string[]
          investor_type?: string | null
          is_default?: boolean
          ltv?: number
          max_beds?: number
          max_offer_gbp?: number
          min_bed_size_ft?: number
          min_beds?: number
          min_epc?: string
          mortgage_rate?: number
          name: string
          refurb_buffer_gbp?: number
          require_gas_boiler?: boolean
          require_parking?: boolean
          risk_policy?: Json
          strategy?: string
          stress_rate?: number
          target_offer_gbp?: number
          target_rent_gbp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_default_enabled?: boolean
          allow_epc_de_if_neighbours_c?: boolean
          cash_available_gbp?: number
          created_at?: string
          id?: string
          ignore_eras?: string[]
          investor_type?: string | null
          is_default?: boolean
          ltv?: number
          max_beds?: number
          max_offer_gbp?: number
          min_bed_size_ft?: number
          min_beds?: number
          min_epc?: string
          mortgage_rate?: number
          name?: string
          refurb_buffer_gbp?: number
          require_gas_boiler?: boolean
          require_parking?: boolean
          risk_policy?: Json
          strategy?: string
          stress_rate?: number
          target_offer_gbp?: number
          target_rent_gbp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          ai_findings: Json
          caption: string | null
          created_at: string
          id: string
          is_exterior: boolean
          issue_key: string | null
          property_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          ai_findings?: Json
          caption?: string | null
          created_at?: string
          id?: string
          is_exterior?: boolean
          issue_key?: string | null
          property_id: string
          storage_path: string
          user_id: string
        }
        Update: {
          ai_findings?: Json
          caption?: string | null
          created_at?: string
          id?: string
          is_exterior?: boolean
          issue_key?: string | null
          property_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          epc_bearer_token: string | null
          id: string
          role: string
          share_defaults: Json
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          epc_bearer_token?: string | null
          id: string
          role?: string
          share_defaults?: Json
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          epc_bearer_token?: string | null
          id?: string
          role?: string
          share_defaults?: Json
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          agent_name: string | null
          area_sqm: number | null
          article4_source: string | null
          article4_status: string | null
          asking_price_gbp: number | null
          baths: number | null
          beds: number | null
          city: string | null
          created_at: string
          csv_row: Json | null
          epc_data: Json | null
          epc_fetched_at: string | null
          epc_rate: string | null
          estimated_rent_pcm: number | null
          favourite: boolean
          hidden: boolean
          hide_address: boolean
          id: string
          image_urls: string[]
          lease_years_remaining: number | null
          notes: string | null
          pf_json: Json | null
          postcode: string | null
          price_qualifier: string | null
          property_type: string | null
          refurb_estimate: Json | null
          rent_source: string | null
          risk_flags: Json
          seller_context: Json
          source: string
          source_link: string | null
          survey_findings: Json
          tenure: string | null
          updated_at: string
          user_id: string
          viewing_note_history: Json | null
          viewing_notes: Json | null
        }
        Insert: {
          address: string
          agent_name?: string | null
          area_sqm?: number | null
          article4_source?: string | null
          article4_status?: string | null
          asking_price_gbp?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          created_at?: string
          csv_row?: Json | null
          epc_data?: Json | null
          epc_fetched_at?: string | null
          epc_rate?: string | null
          estimated_rent_pcm?: number | null
          favourite?: boolean
          hidden?: boolean
          hide_address?: boolean
          id?: string
          image_urls?: string[]
          lease_years_remaining?: number | null
          notes?: string | null
          pf_json?: Json | null
          postcode?: string | null
          price_qualifier?: string | null
          property_type?: string | null
          refurb_estimate?: Json | null
          rent_source?: string | null
          risk_flags?: Json
          seller_context?: Json
          source?: string
          source_link?: string | null
          survey_findings?: Json
          tenure?: string | null
          updated_at?: string
          user_id: string
          viewing_note_history?: Json | null
          viewing_notes?: Json | null
        }
        Update: {
          address?: string
          agent_name?: string | null
          area_sqm?: number | null
          article4_source?: string | null
          article4_status?: string | null
          asking_price_gbp?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          created_at?: string
          csv_row?: Json | null
          epc_data?: Json | null
          epc_fetched_at?: string | null
          epc_rate?: string | null
          estimated_rent_pcm?: number | null
          favourite?: boolean
          hidden?: boolean
          hide_address?: boolean
          id?: string
          image_urls?: string[]
          lease_years_remaining?: number | null
          notes?: string | null
          pf_json?: Json | null
          postcode?: string | null
          price_qualifier?: string | null
          property_type?: string | null
          refurb_estimate?: Json | null
          rent_source?: string | null
          risk_flags?: Json
          seller_context?: Json
          source?: string
          source_link?: string | null
          survey_findings?: Json
          tenure?: string | null
          updated_at?: string
          user_id?: string
          viewing_note_history?: Json | null
          viewing_notes?: Json | null
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          city: string | null
          created_at: string
          frequency: string
          id: string
          is_active: boolean
          last_run_at: string | null
          max_beds: number | null
          max_price: number | null
          min_beds: number | null
          min_deal_score: number
          min_price: number | null
          name: string
          notify_email: string | null
          persona_id: string | null
          postcode_prefix: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          max_beds?: number | null
          max_price?: number | null
          min_beds?: number | null
          min_deal_score?: number
          min_price?: number | null
          name: string
          notify_email?: string | null
          persona_id?: string | null
          postcode_prefix?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          max_beds?: number | null
          max_price?: number | null
          min_beds?: number | null
          min_deal_score?: number
          min_price?: number | null
          name?: string
          notify_email?: string | null
          persona_id?: string | null
          postcode_prefix?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      search_matches: {
        Row: {
          created_at: string
          deal_score: number | null
          id: string
          notified_at: string | null
          property_id: string
          saved_search_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_score?: number | null
          id?: string
          notified_at?: string | null
          property_id: string
          saved_search_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_score?: number | null
          id?: string
          notified_at?: string | null
          property_id?: string
          saved_search_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_matches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_matches_saved_search_id_fkey"
            columns: ["saved_search_id"]
            isOneToOne: false
            referencedRelation: "saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
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
