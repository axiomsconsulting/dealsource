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
      deal_sheets: {
        Row: {
          created_at: string
          hero_photo_id: string | null
          id: string
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
          id?: string
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
          id?: string
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
      personas: {
        Row: {
          ai_default_enabled: boolean
          allow_epc_de_if_neighbours_c: boolean
          cash_available_gbp: number
          created_at: string
          id: string
          ignore_eras: string[]
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
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
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
          epc_rate: string | null
          estimated_rent_pcm: number | null
          hidden: boolean
          hide_address: boolean
          id: string
          image_urls: string[]
          lease_years_remaining: number | null
          notes: string | null
          pf_json: Json | null
          postcode: string | null
          property_type: string | null
          refurb_estimate: Json | null
          rent_source: string | null
          risk_flags: Json
          source: string
          source_link: string | null
          tenure: string | null
          updated_at: string
          user_id: string
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
          epc_rate?: string | null
          estimated_rent_pcm?: number | null
          hidden?: boolean
          hide_address?: boolean
          id?: string
          image_urls?: string[]
          lease_years_remaining?: number | null
          notes?: string | null
          pf_json?: Json | null
          postcode?: string | null
          property_type?: string | null
          refurb_estimate?: Json | null
          rent_source?: string | null
          risk_flags?: Json
          source?: string
          source_link?: string | null
          tenure?: string | null
          updated_at?: string
          user_id: string
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
          epc_rate?: string | null
          estimated_rent_pcm?: number | null
          hidden?: boolean
          hide_address?: boolean
          id?: string
          image_urls?: string[]
          lease_years_remaining?: number | null
          notes?: string | null
          pf_json?: Json | null
          postcode?: string | null
          property_type?: string | null
          refurb_estimate?: Json | null
          rent_source?: string | null
          risk_flags?: Json
          source?: string
          source_link?: string | null
          tenure?: string | null
          updated_at?: string
          user_id?: string
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
      [_ in never]: never
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
