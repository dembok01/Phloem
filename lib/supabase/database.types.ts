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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          care_role: Database["public"]["Enums"]["care_role"]
          care_user_id: string
          id: string
          member_id: string
          unassigned_at: string | null
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          care_role: Database["public"]["Enums"]["care_role"]
          care_user_id: string
          id?: string
          member_id: string
          unassigned_at?: string | null
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          care_role?: Database["public"]["Enums"]["care_role"]
          care_user_id?: string
          id?: string
          member_id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_care_user_id_fkey"
            columns: ["care_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          meta?: Json | null
        }
        Relationships: []
      }
      consultations: {
        Row: {
          completed_at: string | null
          coordinator_notes: string | null
          cycle_id: string | null
          id: string
          marked_done_by: string | null
          meeting_link: string | null
          meeting_status: Database["public"]["Enums"]["meeting_status"]
          member_id: string
          mode: Database["public"]["Enums"]["consult_mode"] | null
          report_status: Database["public"]["Enums"]["submit_status"]
          scheduled_at: string | null
          type: Database["public"]["Enums"]["care_role"]
        }
        Insert: {
          completed_at?: string | null
          coordinator_notes?: string | null
          cycle_id?: string | null
          id?: string
          marked_done_by?: string | null
          meeting_link?: string | null
          meeting_status?: Database["public"]["Enums"]["meeting_status"]
          member_id: string
          mode?: Database["public"]["Enums"]["consult_mode"] | null
          report_status?: Database["public"]["Enums"]["submit_status"]
          scheduled_at?: string | null
          type: Database["public"]["Enums"]["care_role"]
        }
        Update: {
          completed_at?: string | null
          coordinator_notes?: string | null
          cycle_id?: string | null
          id?: string
          marked_done_by?: string | null
          meeting_link?: string | null
          meeting_status?: Database["public"]["Enums"]["meeting_status"]
          member_id?: string
          mode?: Database["public"]["Enums"]["consult_mode"] | null
          report_status?: Database["public"]["Enums"]["submit_status"]
          scheduled_at?: string | null
          type?: Database["public"]["Enums"]["care_role"]
        }
        Relationships: [
          {
            foreignKeyName: "consultations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_marked_done_by_fkey"
            columns: ["marked_done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          end_date: string
          id: string
          number: number
          package_id: string
          start_date: string
          status: Database["public"]["Enums"]["cycle_status"]
        }
        Insert: {
          end_date: string
          id?: string
          number: number
          package_id: string
          start_date: string
          status?: Database["public"]["Enums"]["cycle_status"]
        }
        Update: {
          end_date?: string
          id?: string
          number?: number
          package_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["cycle_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cycles_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          answers: Json
          consultation_id: string | null
          created_at: string
          cycle_id: string | null
          id: string
          member_id: string
          respondent_id: string | null
          submitted_at: string | null
          template_id: string
        }
        Insert: {
          answers?: Json
          consultation_id?: string | null
          created_at?: string
          cycle_id?: string | null
          id?: string
          member_id: string
          respondent_id?: string | null
          submitted_at?: string | null
          template_id: string
        }
        Update: {
          answers?: Json
          consultation_id?: string | null
          created_at?: string
          cycle_id?: string | null
          id?: string
          member_id?: string
          respondent_id?: string | null
          submitted_at?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_respondent_id_fkey"
            columns: ["respondent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          active: boolean
          id: string
          key: string
          schema: Json
          version: number
        }
        Insert: {
          active?: boolean
          id?: string
          key: string
          schema: Json
          version: number
        }
        Update: {
          active?: boolean
          id?: string
          key?: string
          schema?: Json
          version?: number
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          member_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          member_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          member_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_contacts: {
        Row: {
          address: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          member_id: string
          phone: string | null
          pin_code: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          member_id: string
          phone?: string | null
          pin_code?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          member_id?: string
          phone?: string | null
          pin_code?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_contacts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          age: number | null
          caregiver_id: string | null
          city: string | null
          country: string | null
          created_at: string
          full_name: string
          gender: string | null
          id: string
          language: string | null
          member_user_id: string | null
          occupation: string | null
          onboarding_video_watched_at: string | null
          red_flags: Json
          relationship_to_caregiver: string | null
          status: Database["public"]["Enums"]["member_status"]
        }
        Insert: {
          age?: number | null
          caregiver_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          full_name: string
          gender?: string | null
          id?: string
          language?: string | null
          member_user_id?: string | null
          occupation?: string | null
          onboarding_video_watched_at?: string | null
          red_flags?: Json
          relationship_to_caregiver?: string | null
          status?: Database["public"]["Enums"]["member_status"]
        }
        Update: {
          age?: number | null
          caregiver_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          full_name?: string
          gender?: string | null
          id?: string
          language?: string | null
          member_user_id?: string | null
          occupation?: string | null
          onboarding_video_watched_at?: string | null
          red_flags?: Json
          relationship_to_caregiver?: string | null
          status?: Database["public"]["Enums"]["member_status"]
        }
        Relationships: [
          {
            foreignKeyName: "members_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_member_user_id_fkey"
            columns: ["member_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          email_sent_at: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          email_sent_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          email_sent_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          duration_months: number
          end_date: string | null
          id: string
          member_id: string
          paused_at: string | null
          psych_override: boolean
          start_date: string | null
          status: Database["public"]["Enums"]["package_status"]
          total_paused_days: number
        }
        Insert: {
          created_at?: string
          duration_months?: number
          end_date?: string | null
          id?: string
          member_id: string
          paused_at?: string | null
          psych_override?: boolean
          start_date?: string | null
          status?: Database["public"]["Enums"]["package_status"]
          total_paused_days?: number
        }
        Update: {
          created_at?: string
          duration_months?: number
          end_date?: string | null
          id?: string
          member_id?: string
          paused_at?: string | null
          psych_override?: boolean
          start_date?: string | null
          status?: Database["public"]["Enums"]["package_status"]
          total_paused_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          specialization: string | null
          status: Database["public"]["Enums"]["account_status"]
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          specialization?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          specialization?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          whatsapp?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          cycle_id: string | null
          id: string
          member_id: string
          pdf_path: string | null
          share_with_caregiver: boolean
          supersedes: string | null
          type: Database["public"]["Enums"]["report_type"]
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          id?: string
          member_id: string
          pdf_path?: string | null
          share_with_caregiver?: boolean
          supersedes?: string | null
          type: Database["public"]["Enums"]["report_type"]
          version?: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          id?: string
          member_id?: string
          pdf_path?: string | null
          share_with_caregiver?: boolean
          supersedes?: string | null
          type?: Database["public"]["Enums"]["report_type"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _audit: {
        Args: {
          p_action: string
          p_actor: string
          p_entity_id: string
          p_entity_type: string
          p_meta?: Json
        }
        Returns: undefined
      }
      _notify: {
        Args: {
          p_body: string
          p_dedupe: string
          p_link: string
          p_title: string
          p_type: string
          p_user: string
        }
        Returns: undefined
      }
      _notify_care_team: {
        Args: {
          p_body: string
          p_dedupe_prefix: string
          p_link: string
          p_member: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      _notify_roles: {
        Args: {
          p_body: string
          p_dedupe_prefix: string
          p_link: string
          p_roles: Database["public"]["Enums"]["user_role"][]
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      _red_flags: { Args: { a: Json }; Returns: Json }
      _report_stub: {
        Args: { p_cycle: number; p_extra?: Json; p_title: string }
        Returns: Json
      }
      accept_invite: {
        Args: {
          p_full_name: string
          p_phone?: string
          p_token: string
          p_user_id: string
        }
        Returns: Json
      }
      activate_program: { Args: { p_member: string }; Returns: undefined }
      assign_care_team: {
        Args: {
          p_member: string
          p_role: Database["public"]["Enums"]["care_role"]
          p_user: string
        }
        Returns: string
      }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      close_cycle_open_next: { Args: { p_cycle: string }; Returns: undefined }
      compile_performance_report: { Args: { p_cycle: string }; Returns: string }
      create_member_with_invite: {
        Args: {
          p_address: string
          p_age: number
          p_caregiver_email: string
          p_city: string
          p_country: string
          p_duration_months?: number
          p_email: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_full_name: string
          p_gender: string
          p_language: string
          p_occupation: string
          p_phone: string
          p_pin_code: string
          p_relationship_to_caregiver: string
          p_whatsapp: string
        }
        Returns: string
      }
      deactivate_member: { Args: { p_member: string }; Returns: undefined }
      get_onboarding_scoped: { Args: { m: string }; Returns: Json }
      is_assigned_to: { Args: { m: string }; Returns: boolean }
      is_caregiver_of: { Args: { m: string }; Returns: boolean }
      log_report_view: { Args: { p_report: string }; Returns: undefined }
      mark_meeting_done: { Args: { p_cons: string }; Returns: undefined }
      mark_video_watched: { Args: { p_member: string }; Returns: undefined }
      pause_program: { Args: { p_package: string }; Returns: undefined }
      reactivate_member: {
        Args: { p_duration_months: number; p_member: string }
        Returns: string
      }
      resume_program: { Args: { p_package: string }; Returns: undefined }
      set_account_status: {
        Args: {
          p_status: Database["public"]["Enums"]["account_status"]
          p_user_id: string
        }
        Returns: undefined
      }
      set_consultation_schedule: {
        Args: {
          p_at: string
          p_cons: string
          p_link?: string
          p_mode: Database["public"]["Enums"]["consult_mode"]
        }
        Returns: undefined
      }
      set_package_duration: {
        Args: { p_months: number; p_package: string }
        Returns: undefined
      }
      submit_clinical_form: {
        Args: { p_answers: Json; p_cons: string; p_report_content?: Json }
        Returns: string
      }
      submit_feedback: { Args: { p_response: string }; Returns: undefined }
      submit_onboarding: {
        Args: { p_member: string; p_report_content?: Json; p_response: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      care_role: "doctor" | "nutritionist" | "trainer" | "psychologist"
      consult_mode: "video" | "phone" | "in_person"
      cycle_status: "upcoming" | "active" | "closed"
      meeting_status: "to_schedule" | "scheduled" | "done" | "cancelled"
      member_status:
        | "invited"
        | "signed_up"
        | "onboarding"
        | "onboarded"
        | "assigned"
        | "initial_consults"
        | "ready_to_start"
        | "active"
        | "renewal_due"
        | "inactive"
      package_status: "not_started" | "active" | "paused" | "completed"
      report_type:
        | "onboarding_summary"
        | "doctor_initial"
        | "doctor_review"
        | "nutrition_plan"
        | "nutrition_review"
        | "training_plan"
        | "training_review"
        | "wellbeing"
        | "performance"
      submit_status: "pending" | "submitted"
      user_role:
        | "admin"
        | "coordinator"
        | "doctor"
        | "nutritionist"
        | "trainer"
        | "psychologist"
        | "caregiver"
        | "member"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      care_role: ["doctor", "nutritionist", "trainer", "psychologist"],
      consult_mode: ["video", "phone", "in_person"],
      cycle_status: ["upcoming", "active", "closed"],
      meeting_status: ["to_schedule", "scheduled", "done", "cancelled"],
      member_status: [
        "invited",
        "signed_up",
        "onboarding",
        "onboarded",
        "assigned",
        "initial_consults",
        "ready_to_start",
        "active",
        "renewal_due",
        "inactive",
      ],
      package_status: ["not_started", "active", "paused", "completed"],
      report_type: [
        "onboarding_summary",
        "doctor_initial",
        "doctor_review",
        "nutrition_plan",
        "nutrition_review",
        "training_plan",
        "training_review",
        "wellbeing",
        "performance",
      ],
      submit_status: ["pending", "submitted"],
      user_role: [
        "admin",
        "coordinator",
        "doctor",
        "nutritionist",
        "trainer",
        "psychologist",
        "caregiver",
        "member",
      ],
    },
  },
} as const
