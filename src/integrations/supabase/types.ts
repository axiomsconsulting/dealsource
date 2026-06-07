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
      personas: {
        Row: {
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
          asking_price_gbp: number | null
          baths: number | null
          beds: number | null
          city: string | null
          created_at: string
          csv_row: Json | null
          epc_rate: string | null
          hide_address: boolean
          id: string
          notes: string | null
          pf_json: Json | null
          postcode: string | null
          property_type: string | null
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
          asking_price_gbp?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          created_at?: string
          csv_row?: Json | null
          epc_rate?: string | null
          hide_address?: boolean
          id?: string
          notes?: string | null
          pf_json?: Json | null
          postcode?: string | null
          property_type?: string | null
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
          asking_price_gbp?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          created_at?: string
          csv_row?: Json | null
          epc_rate?: string | null
          hide_address?: boolean
          id?: string
          notes?: string | null
          pf_json?: Json | null
          postcode?: string | null
          property_type?: string | null
          source?: string
          source_link?: string | null
          tenure?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
