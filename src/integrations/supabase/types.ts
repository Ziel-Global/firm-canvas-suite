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
      activity_log: {
        Row: {
          action: string | null
          actor_id: string | null
          case_id: string | null
          created_at: string
          detail: Json | null
          id: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          case_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          input: Json | null
          kind: string | null
          output: Json | null
          requested_by: string | null
          status: string | null
        }
        Insert: {
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          input?: Json | null
          kind?: string | null
          output?: Json | null
          requested_by?: string | null
          status?: string | null
        }
        Update: {
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          input?: Json | null
          kind?: string | null
          output?: Json | null
          requested_by?: string | null
          status?: string | null
        }
        Relationships: []
      }
      approval_comments: {
        Row: {
          anchor: Json | null
          approval_id: string | null
          author_id: string | null
          body: string | null
          created_at: string
          id: string
        }
        Insert: {
          anchor?: Json | null
          approval_id?: string | null
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          anchor?: Json | null
          approval_id?: string | null
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_comments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          ai_report: Json | null
          case_id: string | null
          decided_at: string | null
          decided_by: string | null
          document_id: string | null
          id: string
          status: Database["public"]["Enums"]["approval_status"] | null
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          ai_report?: Json | null
          case_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          document_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["approval_status"] | null
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          ai_report?: Json | null
          case_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          document_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["approval_status"] | null
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string
          detail: Json | null
          id: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          case_id: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string | null
          id: string
          is_private: boolean | null
          location: string | null
          owner_id: string | null
          source_stage_id: string | null
          starts_at: string | null
          title: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string | null
          id?: string
          is_private?: boolean | null
          location?: string | null
          owner_id?: string | null
          source_stage_id?: string | null
          starts_at?: string | null
          title?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string | null
          id?: string
          is_private?: boolean | null
          location?: string | null
          owner_id?: string | null
          source_stage_id?: string | null
          starts_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_source_stage_id_fkey"
            columns: ["source_stage_id"]
            isOneToOne: false
            referencedRelation: "case_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_access_overrides: {
        Row: {
          access_level: string | null
          case_id: string | null
          folder_scope: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          note: string | null
          user_id: string | null
        }
        Insert: {
          access_level?: string | null
          case_id?: string | null
          folder_scope?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          note?: string | null
          user_id?: string | null
        }
        Update: {
          access_level?: string | null
          case_id?: string | null
          folder_scope?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          note?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_access_overrides_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_access_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          case_id: string | null
          id: string
          is_lead: boolean | null
          role_on_case: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          case_id?: string | null
          id?: string
          is_lead?: boolean | null
          role_on_case?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          case_id?: string | null
          id?: string
          is_lead?: boolean | null
          role_on_case?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          author_id: string | null
          body: string
          case_id: string
          created_at: string
          id: string
          is_principal_only: boolean
        }
        Insert: {
          author_id?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: string
          is_principal_only?: boolean
        }
        Update: {
          author_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          is_principal_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_stages: {
        Row: {
          assignee_id: string | null
          case_id: string | null
          completed_at: string | null
          deadline: string | null
          id: string
          is_private: boolean
          name: string | null
          notes: string | null
          sequence_order: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"] | null
          template_stage_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          case_id?: string | null
          completed_at?: string | null
          deadline?: string | null
          id?: string
          is_private?: boolean
          name?: string | null
          notes?: string | null
          sequence_order?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"] | null
          template_stage_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          case_id?: string | null
          completed_at?: string | null
          deadline?: string | null
          id?: string
          is_private?: boolean
          name?: string | null
          notes?: string | null
          sequence_order?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"] | null
          template_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_stages_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_stages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_ref: string | null
          case_type: string | null
          client_id: string | null
          closed_at: string | null
          closure_summary: string | null
          created_at: string
          created_by: string | null
          current_stage_id: string | null
          health: Database["public"]["Enums"]["health_status"] | null
          id: string
          is_private: boolean
          opened_at: string | null
          retention_until: string | null
          status: Database["public"]["Enums"]["case_status"] | null
          title: string
        }
        Insert: {
          case_ref?: string | null
          case_type?: string | null
          client_id?: string | null
          closed_at?: string | null
          closure_summary?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string | null
          health?: Database["public"]["Enums"]["health_status"] | null
          id?: string
          is_private?: boolean
          opened_at?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title: string
        }
        Update: {
          case_ref?: string | null
          case_type?: string | null
          client_id?: string | null
          closed_at?: string | null
          closure_summary?: string | null
          created_at?: string
          created_by?: string | null
          current_stage_id?: string | null
          health?: Database["public"]["Enums"]["health_status"] | null
          id?: string
          is_private?: boolean
          opened_at?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      document_folders: {
        Row: {
          case_id: string | null
          code: string | null
          id: string
          name: string | null
        }
        Insert: {
          case_id?: string | null
          code?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          case_id?: string | null
          code?: string | null
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      document_shares: {
        Row: {
          can_download: boolean
          created_at: string
          document_id: string
          id: string
          shared_by: string | null
          shared_with: string
        }
        Insert: {
          can_download?: boolean
          created_at?: string
          document_id: string
          id?: string
          shared_by?: string | null
          shared_with: string
        }
        Update: {
          can_download?: boolean
          created_at?: string
          document_id?: string
          id?: string
          shared_by?: string | null
          shared_with?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          doc_type: string | null
          fields: Json | null
          id: string
          name: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          fields?: Json | null
          id?: string
          name?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          fields?: Json | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          document_id: string | null
          file_path: string | null
          id: string
          note: string | null
          uploaded_at: string
          uploaded_by: string | null
          version_number: number | null
        }
        Insert: {
          document_id?: string | null
          file_path?: string | null
          id?: string
          note?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          version_number?: number | null
        }
        Update: {
          document_id?: string | null
          file_path?: string | null
          id?: string
          note?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          created_at: string
          current_version: number | null
          doc_type: string | null
          file_path: string | null
          folder_id: string | null
          id: string
          is_archived: boolean | null
          is_locked: boolean | null
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          current_version?: number | null
          doc_type?: string | null
          file_path?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean | null
          is_locked?: boolean | null
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          current_version?: number | null
          doc_type?: string | null
          file_path?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean | null
          is_locked?: boolean | null
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          channel: string | null
          event_id: string | null
          id: string
          offset_minutes: number | null
          sent: boolean | null
        }
        Insert: {
          channel?: string | null
          event_id?: string | null
          id?: string
          offset_minutes?: number | null
          sent?: boolean | null
        }
        Update: {
          channel?: string | null
          event_id?: string | null
          id?: string
          offset_minutes?: number | null
          sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_settings: {
        Row: {
          id: string
          key: string | null
          value: Json | null
        }
        Insert: {
          id?: string
          key?: string | null
          value?: Json | null
        }
        Update: {
          id?: string
          key?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          email: string
          failed_count: number
          last_failed_at: string | null
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          email: string
          failed_count?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          email?: string
          failed_count?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean | null
          link: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
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
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          two_factor_enabled: boolean | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          two_factor_enabled?: boolean | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          two_factor_enabled?: boolean | null
        }
        Relationships: []
      }
      reports_cache: {
        Row: {
          generated_at: string
          id: string
          is_summary: boolean
          params: Json | null
          payload: Json | null
          report_type: string | null
        }
        Insert: {
          generated_at?: string
          id?: string
          is_summary?: boolean
          params?: Json | null
          payload?: Json | null
          report_type?: string | null
        }
        Update: {
          generated_at?: string
          id?: string
          is_summary?: boolean
          params?: Json | null
          payload?: Json | null
          report_type?: string | null
        }
        Relationships: []
      }
      task_tags: {
        Row: {
          color: string | null
          id: string
          label: string | null
          task_id: string | null
        }
        Insert: {
          color?: string | null
          id?: string
          label?: string | null
          task_id?: string | null
        }
        Update: {
          color?: string | null
          id?: string
          label?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          case_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["priority"] | null
          sort_order: number | null
          stage_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
        }
        Insert: {
          assignee_id?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority"] | null
          sort_order?: number | null
          stage_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
        }
        Update: {
          assignee_id?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority"] | null
          sort_order?: number | null
          stage_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_stages: {
        Row: {
          deadline_days: number | null
          expected_output: string | null
          id: string
          name: string | null
          responsible_role: Database["public"]["Enums"]["user_role"] | null
          sequence_order: number | null
          template_id: string | null
        }
        Insert: {
          deadline_days?: number | null
          expected_output?: string | null
          id?: string
          name?: string | null
          responsible_role?: Database["public"]["Enums"]["user_role"] | null
          sequence_order?: number | null
          template_id?: string | null
        }
        Update: {
          deadline_days?: number | null
          expected_output?: string | null
          id?: string
          name?: string | null
          responsible_role?: Database["public"]["Enums"]["user_role"] | null
          sequence_order?: number | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          case_type: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          case_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          case_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_folder: {
        Args: { _case_id: string; _folder_code: string }
        Returns: boolean
      }
      can_read_case: { Args: { _case_id: string }; Returns: boolean }
      can_read_document: { Args: { _doc_id: string }; Returns: boolean }
      case_override_level: { Args: { _case_id: string }; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      effective_case_access: { Args: { _case_id: string }; Returns: string }
      effective_case_access_for: {
        Args: { _case_id: string; _user_id: string }
        Returns: {
          effective_level: string
          folder_scope: string
          override_level: string
          role_default: string
        }[]
      }
      folder_scope_for_case: { Args: { _case_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_staff: { Args: { _user_id: string }; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      is_assigned_to_case: { Args: { _case_id: string }; Returns: boolean }
      next_case_ref: { Args: never; Returns: string }
      next_client_ref: { Args: never; Returns: string }
      role_can_read_folder: { Args: { _code: string }; Returns: boolean }
      role_can_write_folder: { Args: { _code: string }; Returns: boolean }
      stage_assigned_to_user: { Args: { _case_id: string }; Returns: number }
    }
    Enums: {
      approval_status: "pending" | "approved" | "returned" | "locked"
      case_status: "intake" | "active" | "on_hold" | "closed"
      health_status: "on_track" | "at_risk" | "overdue"
      priority: "low" | "medium" | "high"
      stage_status: "pending" | "active" | "complete" | "returned"
      task_status: "todo" | "in_progress" | "in_review" | "done"
      user_role:
        | "super_admin"
        | "admin"
        | "senior_lawyer"
        | "junior_lawyer"
        | "support"
        | "client"
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
      approval_status: ["pending", "approved", "returned", "locked"],
      case_status: ["intake", "active", "on_hold", "closed"],
      health_status: ["on_track", "at_risk", "overdue"],
      priority: ["low", "medium", "high"],
      stage_status: ["pending", "active", "complete", "returned"],
      task_status: ["todo", "in_progress", "in_review", "done"],
      user_role: [
        "super_admin",
        "admin",
        "senior_lawyer",
        "junior_lawyer",
        "support",
        "client",
      ],
    },
  },
} as const
