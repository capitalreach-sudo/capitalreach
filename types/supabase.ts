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
      admin_actions: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          note: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          note?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          note?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          admin_id: string | null
          body: string
          created_at: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          admin_id?: string | null
          body: string
          created_at?: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          admin_id?: string | null
          body?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      ai_reports: {
        Row: {
          content: string
          created_at: string
          id: string
          investor_id: string | null
          startup_id: string
          stripe_charge_id: string | null
          type: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          investor_id?: string | null
          startup_id: string
          stripe_charge_id?: string | null
          type: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          investor_id?: string | null
          startup_id?: string
          stripe_charge_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reports_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          action: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      circumvention_acks: {
        Row: {
          acknowledged_at: string
          id: string
          investor_id: string
          ip_address: string | null
          startup_id: string
          terms_version: string
          user_agent: string | null
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          investor_id: string
          ip_address?: string | null
          startup_id: string
          terms_version?: string
          user_agent?: string | null
        }
        Update: {
          acknowledged_at?: string
          id?: string
          investor_id?: string
          ip_address?: string | null
          startup_id?: string
          terms_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circumvention_acks_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circumvention_acks_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          opened_by: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: string
          opened_by: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          opened_by?: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      content_translations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          fields: Json
          id: string
          locale: string
          source_hash: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          fields: Json
          id?: string
          locale: string
          source_hash: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          fields?: Json
          id?: string
          locale?: string
          source_hash?: string
        }
        Relationships: []
      }
      contract_signatures: {
        Row: {
          content_hash: string
          contract_id: string
          created_at: string
          id: string
          signed_ip: string | null
          signed_ua: string | null
          signer_id: string
          signer_name: string
        }
        Insert: {
          content_hash: string
          contract_id: string
          created_at?: string
          id?: string
          signed_ip?: string | null
          signed_ua?: string | null
          signer_id: string
          signer_name: string
        }
        Update: {
          content_hash?: string
          contract_id?: string
          created_at?: string
          id?: string
          signed_ip?: string | null
          signed_ua?: string | null
          signer_id?: string
          signer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number | null
          contract_type: string
          created_at: string
          created_by: string
          currency: string
          deal_id: string
          equity_percent: number | null
          id: string
          investor_id: string
          startup_id: string
          status: string
          terms: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          contract_type?: string
          created_at?: string
          created_by: string
          currency?: string
          deal_id: string
          equity_percent?: number | null
          id?: string
          investor_id: string
          startup_id: string
          status?: string
          terms?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          contract_type?: string
          created_at?: string
          created_by?: string
          currency?: string
          deal_id?: string
          equity_percent?: number | null
          id?: string
          investor_id?: string
          startup_id?: string
          status?: string
          terms?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activity: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          startup_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          deal_id: string
          id?: string
          investor_id: string
          startup_id: string
          type?: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          investor_id?: string
          startup_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activity_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activity_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_checklist_items: {
        Row: {
          created_at: string
          deal_id: string
          done: boolean
          due_date: string | null
          evidence: string | null
          id: string
          label: string
          owner_side: string | null
          position: number
        }
        Insert: {
          created_at?: string
          deal_id: string
          done?: boolean
          due_date?: string | null
          evidence?: string | null
          id?: string
          label: string
          owner_side?: string | null
          position?: number
        }
        Update: {
          created_at?: string
          deal_id?: string
          done?: boolean
          due_date?: string | null
          evidence?: string | null
          id?: string
          label?: string
          owner_side?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_checklist_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_documents: {
        Row: {
          created_at: string
          deal_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          investor_id: string
          mime_type: string | null
          startup_id: string
          uploader_id: string
          uploader_side: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          investor_id: string
          mime_type?: string | null
          startup_id: string
          uploader_id: string
          uploader_side: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          investor_id?: string
          mime_type?: string | null
          startup_id?: string
          uploader_id?: string
          uploader_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_documents_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_documents_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_proposals: {
        Row: {
          amount: number | null
          circumvention_ack_id: string | null
          conditions: string | null
          counters_id: string | null
          created_at: string
          currency: string | null
          equity_pct: number | null
          from_side: string
          id: string
          instrument: string | null
          investor_id: string
          next_follow_up: string | null
          note: string | null
          opening_status: string
          proposed_by: string
          resolved_at: string | null
          startup_id: string
          status: string
          valuation: number | null
        }
        Insert: {
          amount?: number | null
          circumvention_ack_id?: string | null
          conditions?: string | null
          counters_id?: string | null
          created_at?: string
          currency?: string | null
          equity_pct?: number | null
          from_side: string
          id?: string
          instrument?: string | null
          investor_id: string
          next_follow_up?: string | null
          note?: string | null
          opening_status?: string
          proposed_by: string
          resolved_at?: string | null
          startup_id: string
          status?: string
          valuation?: number | null
        }
        Update: {
          amount?: number | null
          circumvention_ack_id?: string | null
          conditions?: string | null
          counters_id?: string | null
          created_at?: string
          currency?: string | null
          equity_pct?: number | null
          from_side?: string
          id?: string
          instrument?: string | null
          investor_id?: string
          next_follow_up?: string | null
          note?: string | null
          opening_status?: string
          proposed_by?: string
          resolved_at?: string | null
          startup_id?: string
          status?: string
          valuation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_proposals_counters_id_fkey"
            columns: ["counters_id"]
            isOneToOne: false
            referencedRelation: "deal_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_proposals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_proposals_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_seals: {
        Row: {
          deal_id: string
          id: string
          ip_address: string | null
          party: string
          seal_sha256: string
          seal_version: string
          signed_at: string
          signed_name: string
          signer_user_id: string
          user_agent: string | null
        }
        Insert: {
          deal_id: string
          id?: string
          ip_address?: string | null
          party: string
          seal_sha256: string
          seal_version: string
          signed_at?: string
          signed_name: string
          signer_user_id: string
          user_agent?: string | null
        }
        Update: {
          deal_id?: string
          id?: string
          ip_address?: string | null
          party?: string
          seal_sha256?: string
          seal_version?: string
          signed_at?: string
          signed_name?: string
          signer_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_seals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tranches: {
        Row: {
          amount: number
          condition: string | null
          created_at: string
          deal_id: string
          due_date: string | null
          funds_received_at: string | null
          funds_received_by: string | null
          funds_sent_at: string | null
          funds_sent_by: string | null
          id: string
          label: string | null
          position: number
          reference: string | null
        }
        Insert: {
          amount: number
          condition?: string | null
          created_at?: string
          deal_id: string
          due_date?: string | null
          funds_received_at?: string | null
          funds_received_by?: string | null
          funds_sent_at?: string | null
          funds_sent_by?: string | null
          id?: string
          label?: string | null
          position?: number
          reference?: string | null
        }
        Update: {
          amount?: number
          condition?: string | null
          created_at?: string
          deal_id?: string
          due_date?: string | null
          funds_received_at?: string | null
          funds_received_by?: string | null
          funds_sent_at?: string | null
          funds_sent_by?: string | null
          id?: string
          label?: string | null
          position?: number
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_tranches_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number | null
          circumvention_ack_id: string | null
          close_proposed_amount: number | null
          close_proposed_at: string | null
          close_proposed_by: string | null
          close_proposed_currency: string | null
          closed_at: string | null
          closing_snapshot: Json | null
          commitment_at: string | null
          commitment_type: string | null
          created_at: string
          currency: string
          fee_billing_error: string | null
          fee_billing_status: string | null
          fee_chargeback_at: string | null
          fee_chargeback_resolved_at: string | null
          fee_dispute_reason: string | null
          fee_dispute_resolution: string | null
          fee_dispute_resolved_at: string | null
          fee_disputed_at: string | null
          fee_enforced_at: string | null
          fee_enforcement: string | null
          fee_paused_round_state: string | null
          fee_plan_months: number | null
          fee_plan_started_at: string | null
          fee_refund_amount: number | null
          fee_refunded_at: string | null
          fee_reminder_count: number
          fee_reminder_last_at: string | null
          fee_retry_count: number
          fee_retry_last_at: string | null
          fee_waive_reason: string | null
          fee_waived_at: string | null
          fee_waived_by: string | null
          funded_at: string | null
          funding_reference: string | null
          funds_received_at: string | null
          funds_received_by: string | null
          funds_sent_at: string | null
          funds_sent_by: string | null
          id: string
          instrument_doc_extracted_amount: number | null
          instrument_doc_url: string | null
          investor_id: string
          next_follow_up: string | null
          notes: string | null
          ownership_percent: number | null
          passed_at: string | null
          public_interest: boolean
          reconciliation_status: string
          register_check_due: string | null
          register_check_status: string
          register_filed_amount: number | null
          seal_sha256: string | null
          seal_version: string | null
          sealed_at: string | null
          stage_entered_at: string | null
          startup_id: string
          status: string
          stripe_invoice_id: string | null
          success_fee_amount: number | null
          success_fee_invoiced: boolean
          success_fee_paid_at: string | null
          term_sheet_url: string | null
          updated_at: string
          valuation_at_close: number | null
        }
        Insert: {
          amount?: number | null
          circumvention_ack_id?: string | null
          close_proposed_amount?: number | null
          close_proposed_at?: string | null
          close_proposed_by?: string | null
          close_proposed_currency?: string | null
          closed_at?: string | null
          closing_snapshot?: Json | null
          commitment_at?: string | null
          commitment_type?: string | null
          created_at?: string
          currency?: string
          fee_billing_error?: string | null
          fee_billing_status?: string | null
          fee_chargeback_at?: string | null
          fee_chargeback_resolved_at?: string | null
          fee_dispute_reason?: string | null
          fee_dispute_resolution?: string | null
          fee_dispute_resolved_at?: string | null
          fee_disputed_at?: string | null
          fee_enforced_at?: string | null
          fee_enforcement?: string | null
          fee_paused_round_state?: string | null
          fee_plan_months?: number | null
          fee_plan_started_at?: string | null
          fee_refund_amount?: number | null
          fee_refunded_at?: string | null
          fee_reminder_count?: number
          fee_reminder_last_at?: string | null
          fee_retry_count?: number
          fee_retry_last_at?: string | null
          fee_waive_reason?: string | null
          fee_waived_at?: string | null
          fee_waived_by?: string | null
          funded_at?: string | null
          funding_reference?: string | null
          funds_received_at?: string | null
          funds_received_by?: string | null
          funds_sent_at?: string | null
          funds_sent_by?: string | null
          id?: string
          instrument_doc_extracted_amount?: number | null
          instrument_doc_url?: string | null
          investor_id: string
          next_follow_up?: string | null
          notes?: string | null
          ownership_percent?: number | null
          passed_at?: string | null
          public_interest?: boolean
          reconciliation_status?: string
          register_check_due?: string | null
          register_check_status?: string
          register_filed_amount?: number | null
          seal_sha256?: string | null
          seal_version?: string | null
          sealed_at?: string | null
          stage_entered_at?: string | null
          startup_id: string
          status?: string
          stripe_invoice_id?: string | null
          success_fee_amount?: number | null
          success_fee_invoiced?: boolean
          success_fee_paid_at?: string | null
          term_sheet_url?: string | null
          updated_at?: string
          valuation_at_close?: number | null
        }
        Update: {
          amount?: number | null
          circumvention_ack_id?: string | null
          close_proposed_amount?: number | null
          close_proposed_at?: string | null
          close_proposed_by?: string | null
          close_proposed_currency?: string | null
          closed_at?: string | null
          closing_snapshot?: Json | null
          commitment_at?: string | null
          commitment_type?: string | null
          created_at?: string
          currency?: string
          fee_billing_error?: string | null
          fee_billing_status?: string | null
          fee_chargeback_at?: string | null
          fee_chargeback_resolved_at?: string | null
          fee_dispute_reason?: string | null
          fee_dispute_resolution?: string | null
          fee_dispute_resolved_at?: string | null
          fee_disputed_at?: string | null
          fee_enforced_at?: string | null
          fee_enforcement?: string | null
          fee_paused_round_state?: string | null
          fee_plan_months?: number | null
          fee_plan_started_at?: string | null
          fee_refund_amount?: number | null
          fee_refunded_at?: string | null
          fee_reminder_count?: number
          fee_reminder_last_at?: string | null
          fee_retry_count?: number
          fee_retry_last_at?: string | null
          fee_waive_reason?: string | null
          fee_waived_at?: string | null
          fee_waived_by?: string | null
          funded_at?: string | null
          funding_reference?: string | null
          funds_received_at?: string | null
          funds_received_by?: string | null
          funds_sent_at?: string | null
          funds_sent_by?: string | null
          id?: string
          instrument_doc_extracted_amount?: number | null
          instrument_doc_url?: string | null
          investor_id?: string
          next_follow_up?: string | null
          notes?: string | null
          ownership_percent?: number | null
          passed_at?: string | null
          public_interest?: boolean
          reconciliation_status?: string
          register_check_due?: string | null
          register_check_status?: string
          register_filed_amount?: number | null
          seal_sha256?: string | null
          seal_version?: string | null
          sealed_at?: string | null
          stage_entered_at?: string | null
          startup_id?: string
          status?: string
          stripe_invoice_id?: string | null
          success_fee_amount?: number | null
          success_fee_invoiced?: boolean
          success_fee_paid_at?: string | null
          term_sheet_url?: string | null
          updated_at?: string
          valuation_at_close?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_circumvention_ack_id_fkey"
            columns: ["circumvention_ack_id"]
            isOneToOne: false
            referencedRelation: "circumvention_acks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_funds_received_by_fkey"
            columns: ["funds_received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_funds_sent_by_fkey"
            columns: ["funds_sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      document_downloads: {
        Row: {
          document_id: string | null
          downloaded_at: string
          id: string
          investor_id: string
          ip_address: string | null
          startup_id: string
          watermark_id: string
        }
        Insert: {
          document_id?: string | null
          downloaded_at?: string
          id?: string
          investor_id: string
          ip_address?: string | null
          startup_id: string
          watermark_id: string
        }
        Update: {
          document_id?: string | null
          downloaded_at?: string
          id?: string
          investor_id?: string
          ip_address?: string | null
          startup_id?: string
          watermark_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_downloads_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "startup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_downloads_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_downloads_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          created_at: string
          deal_id: string | null
          doc_type: string
          fulfilled_document_id: string | null
          id: string
          investor_id: string
          message: string | null
          reminded_at: string | null
          resolved_at: string | null
          startup_id: string
          status: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          doc_type: string
          fulfilled_document_id?: string | null
          id?: string
          investor_id: string
          message?: string | null
          reminded_at?: string | null
          resolved_at?: string | null
          startup_id: string
          status?: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          doc_type?: string
          fulfilled_document_id?: string | null
          id?: string
          investor_id?: string
          message?: string | null
          reminded_at?: string | null
          resolved_at?: string | null
          startup_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      document_views: {
        Row: {
          document_id: string
          id: string
          investor_id: string
          viewed_at: string
        }
        Insert: {
          document_id: string
          id?: string
          investor_id: string
          viewed_at?: string
        }
        Update: {
          document_id?: string
          id?: string
          investor_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_views_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "startup_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_views_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          id: string
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_instalments: {
        Row: {
          amount: number
          billing_error: string | null
          created_at: string
          deal_id: string
          due_date: string
          id: string
          paid_at: string | null
          seq: number
          stripe_invoice_id: string | null
        }
        Insert: {
          amount: number
          billing_error?: string | null
          created_at?: string
          deal_id: string
          due_date: string
          id?: string
          paid_at?: string | null
          seq: number
          stripe_invoice_id?: string | null
        }
        Update: {
          amount?: number
          billing_error?: string | null
          created_at?: string
          deal_id?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          seq?: number
          stripe_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_instalments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_signals: {
        Row: {
          created_at: string
          from_id: string
          from_type: string
          from_user: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          from_id: string
          from_type: string
          from_user: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          from_id?: string
          from_type?: string
          from_user?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      introductions: {
        Row: {
          ack_id: string | null
          channel: string
          created_at: string
          first_contact_at: string
          id: string
          investor_id: string
          startup_id: string
          tail_ends_at: string
          terms_version: string | null
        }
        Insert: {
          ack_id?: string | null
          channel: string
          created_at?: string
          first_contact_at?: string
          id?: string
          investor_id: string
          startup_id: string
          tail_ends_at: string
          terms_version?: string | null
        }
        Update: {
          ack_id?: string | null
          channel?: string
          created_at?: string
          first_contact_at?: string
          id?: string
          investor_id?: string
          startup_id?: string
          tail_ends_at?: string
          terms_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "introductions_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_checklist_templates: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          is_default: boolean
          items: Json
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          is_default?: boolean
          items?: Json
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
          is_default?: boolean
          items?: Json
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_checklist_templates_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_scorecards: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          note: string | null
          scores: Json
          startup_id: string
          total: number | null
          updated_at: string
          weights: Json
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          note?: string | null
          scores?: Json
          startup_id: string
          total?: number | null
          updated_at?: string
          weights?: Json
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
          note?: string | null
          scores?: Json
          startup_id?: string
          total?: number | null
          updated_at?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "investor_scorecards_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_scorecards_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_targets: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          next_contact_at: string | null
          note: string | null
          startup_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          next_contact_at?: string | null
          note?: string | null
          startup_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
          next_contact_at?: string | null
          note?: string | null
          startup_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_targets_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_targets_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_views: {
        Row: {
          id: string
          investor_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          investor_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          investor_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_views_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          allocation_period: string | null
          allocation_target: number | null
          aum: string | null
          avatar_url: string | null
          avg_hold_period: string | null
          bio: string | null
          board_seat_pref: string | null
          booking_url: string | null
          contact_email: string | null
          contact_note: string | null
          created_at: string
          display_name: string | null
          firm_name: string | null
          follow_on_policy: string | null
          geography: string[]
          id: string
          industries: string[]
          investment_thesis: string | null
          is_demo: boolean
          is_external: boolean
          is_public: boolean
          languages: string[] | null
          lead_rounds: boolean
          linkedin_url: string | null
          logo_color: string | null
          logo_url: string | null
          managed_by_startup_id: string | null
          max_check: number | null
          min_check: number | null
          number_of_investments: number | null
          owner_id: string | null
          portfolio_json: Json
          search_vector: unknown
          slug: string
          stages: string[]
          subscription_tier: string
          trust_expires_at: string | null
          trust_level: number
          trust_reviewed_at: string | null
          twitter_url: string | null
          type: string
          verification_checks: Json | null
          verified_at: string | null
          verified_by: string | null
          video_url: string | null
          website: string | null
        }
        Insert: {
          allocation_period?: string | null
          allocation_target?: number | null
          aum?: string | null
          avatar_url?: string | null
          avg_hold_period?: string | null
          bio?: string | null
          board_seat_pref?: string | null
          booking_url?: string | null
          contact_email?: string | null
          contact_note?: string | null
          created_at?: string
          display_name?: string | null
          firm_name?: string | null
          follow_on_policy?: string | null
          geography?: string[]
          id?: string
          industries?: string[]
          investment_thesis?: string | null
          is_demo?: boolean
          is_external?: boolean
          is_public?: boolean
          languages?: string[] | null
          lead_rounds?: boolean
          linkedin_url?: string | null
          logo_color?: string | null
          logo_url?: string | null
          managed_by_startup_id?: string | null
          max_check?: number | null
          min_check?: number | null
          number_of_investments?: number | null
          owner_id?: string | null
          portfolio_json?: Json
          search_vector?: unknown
          slug: string
          stages?: string[]
          subscription_tier?: string
          trust_expires_at?: string | null
          trust_level?: number
          trust_reviewed_at?: string | null
          twitter_url?: string | null
          type: string
          verification_checks?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
          website?: string | null
        }
        Update: {
          allocation_period?: string | null
          allocation_target?: number | null
          aum?: string | null
          avatar_url?: string | null
          avg_hold_period?: string | null
          bio?: string | null
          board_seat_pref?: string | null
          booking_url?: string | null
          contact_email?: string | null
          contact_note?: string | null
          created_at?: string
          display_name?: string | null
          firm_name?: string | null
          follow_on_policy?: string | null
          geography?: string[]
          id?: string
          industries?: string[]
          investment_thesis?: string | null
          is_demo?: boolean
          is_external?: boolean
          is_public?: boolean
          languages?: string[] | null
          lead_rounds?: boolean
          linkedin_url?: string | null
          logo_color?: string | null
          logo_url?: string | null
          managed_by_startup_id?: string | null
          max_check?: number | null
          min_check?: number | null
          number_of_investments?: number | null
          owner_id?: string | null
          portfolio_json?: Json
          search_vector?: unknown
          slug?: string
          stages?: string[]
          subscription_tier?: string
          trust_expires_at?: string | null
          trust_level?: number
          trust_reviewed_at?: string | null
          twitter_url?: string | null
          type?: string
          verification_checks?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investors_managed_by_startup_id_fkey"
            columns: ["managed_by_startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investors_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          id: string
          invite_role: string
          inviter_id: string
          note: string | null
          revoked_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          created_at?: string
          id?: string
          invite_role: string
          inviter_id: string
          note?: string | null
          revoked_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          id?: string
          invite_role?: string
          inviter_id?: string
          note?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      listing_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          created_at: string
          id: string
          investor_id: string
          is_private: boolean
          question: string
          startup_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          investor_id: string
          is_private?: boolean
          question: string
          startup_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          investor_id?: string
          is_private?: boolean
          question?: string
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_questions_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_questions_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          body: string
          body_original: string | null
          created_at: string
          id: string
          read_at: string | null
          safety_flags: Json | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          body: string
          body_original?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          safety_flags?: Json | null
          sender_id: string
          thread_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string
          body_original?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          safety_flags?: Json | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      nda_disclosures: {
        Row: {
          id: string
          investor_id: string
          ip: string | null
          item_id: string | null
          item_label: string | null
          item_type: string
          nda_record_id: string | null
          occurred_at: string
          startup_id: string
          user_agent: string | null
        }
        Insert: {
          id?: string
          investor_id: string
          ip?: string | null
          item_id?: string | null
          item_label?: string | null
          item_type: string
          nda_record_id?: string | null
          occurred_at?: string
          startup_id: string
          user_agent?: string | null
        }
        Update: {
          id?: string
          investor_id?: string
          ip?: string | null
          item_id?: string | null
          item_label?: string | null
          item_type?: string
          nda_record_id?: string | null
          occurred_at?: string
          startup_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nda_disclosures_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nda_disclosures_nda_record_id_fkey"
            columns: ["nda_record_id"]
            isOneToOne: false
            referencedRelation: "nda_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nda_disclosures_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      nda_records: {
        Row: {
          counterparty: Json | null
          docusign_envelope_id: string | null
          id: string
          investor_id: string
          method: string | null
          nda_version: string | null
          obligations_end_at: string | null
          signed_at: string | null
          signed_ip: string | null
          signed_ua: string | null
          startup_id: string
          text_sha256: string | null
        }
        Insert: {
          counterparty?: Json | null
          docusign_envelope_id?: string | null
          id?: string
          investor_id: string
          method?: string | null
          nda_version?: string | null
          obligations_end_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_ua?: string | null
          startup_id: string
          text_sha256?: string | null
        }
        Update: {
          counterparty?: Json | null
          docusign_envelope_id?: string | null
          id?: string
          investor_id?: string
          method?: string | null
          nda_version?: string | null
          obligations_end_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_ua?: string | null
          startup_id?: string
          text_sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nda_records_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nda_records_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          body_key: string | null
          created_at: string
          href: string | null
          id: string
          params: Json | null
          read_at: string | null
          title: string
          title_key: string | null
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          body_key?: string | null
          created_at?: string
          href?: string | null
          id?: string
          params?: Json | null
          read_at?: string | null
          title: string
          title_key?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          body_key?: string | null
          created_at?: string
          href?: string | null
          id?: string
          params?: Json | null
          read_at?: string | null
          title?: string
          title_key?: string | null
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
      pageviews: {
        Row: {
          created_at: string
          id: string
          investor_id: string | null
          session_id: string
          startup_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id?: string | null
          session_id: string
          startup_id: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string | null
          session_id?: string
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pageviews_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pageviews_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      profile_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event: string
          id: number
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event: string
          id?: never
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event?: string
          id?: never
          viewer_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          accreditation_certified: boolean
          admin_level: string | null
          anonymised_at: string | null
          avatar_url: string | null
          check_size_max: number | null
          check_size_min: number | null
          circumvention_strikes: number
          created_at: string
          deleted_at: string | null
          deletion_reason: string | null
          email: string
          email_opt_out: boolean
          full_name: string | null
          id: string
          identity_check_at: string | null
          identity_check_method: string | null
          investment_thesis: string | null
          investor_declaration_at: string | null
          investor_declarations: Json | null
          investor_status_declared: string
          investor_type: string | null
          invite_code: string | null
          invited_by: string | null
          languages: string[] | null
          last_review_id: string | null
          lead_investor: boolean | null
          muted_notification_types: string[]
          portfolio_count: number | null
          preferred_countries: string[] | null
          preferred_industries: string[] | null
          preferred_locale: string | null
          preferred_stages: string[] | null
          role: string
          signup_stage: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          suspended: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          suspended_until: string | null
          terms_accepted_at: string | null
          tier_override: boolean
          unsubscribe_token: string
        }
        Insert: {
          account_status?: string
          accreditation_certified?: boolean
          admin_level?: string | null
          anonymised_at?: string | null
          avatar_url?: string | null
          check_size_max?: number | null
          check_size_min?: number | null
          circumvention_strikes?: number
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          email: string
          email_opt_out?: boolean
          full_name?: string | null
          id: string
          identity_check_at?: string | null
          identity_check_method?: string | null
          investment_thesis?: string | null
          investor_declaration_at?: string | null
          investor_declarations?: Json | null
          investor_status_declared?: string
          investor_type?: string | null
          invite_code?: string | null
          invited_by?: string | null
          languages?: string[] | null
          last_review_id?: string | null
          lead_investor?: boolean | null
          muted_notification_types?: string[]
          portfolio_count?: number | null
          preferred_countries?: string[] | null
          preferred_industries?: string[] | null
          preferred_locale?: string | null
          preferred_stages?: string[] | null
          role: string
          signup_stage?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          suspended?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          terms_accepted_at?: string | null
          tier_override?: boolean
          unsubscribe_token?: string
        }
        Update: {
          account_status?: string
          accreditation_certified?: boolean
          admin_level?: string | null
          anonymised_at?: string | null
          avatar_url?: string | null
          check_size_max?: number | null
          check_size_min?: number | null
          circumvention_strikes?: number
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          email?: string
          email_opt_out?: boolean
          full_name?: string | null
          id?: string
          identity_check_at?: string | null
          identity_check_method?: string | null
          investment_thesis?: string | null
          investor_declaration_at?: string | null
          investor_declarations?: Json | null
          investor_status_declared?: string
          investor_type?: string | null
          invite_code?: string | null
          invited_by?: string | null
          languages?: string[] | null
          last_review_id?: string | null
          lead_investor?: boolean | null
          muted_notification_types?: string[]
          portfolio_count?: number | null
          preferred_countries?: string[] | null
          preferred_industries?: string[] | null
          preferred_locale?: string | null
          preferred_stages?: string[] | null
          role?: string
          signup_stage?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          suspended?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          terms_accepted_at?: string | null
          tier_override?: boolean
          unsubscribe_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_review_id_fkey"
            columns: ["last_review_id"]
            isOneToOne: false
            referencedRelation: "review_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          action: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reporter_id: string | null
          status: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          status?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_checklists: {
        Row: {
          checklist_version: string
          id: string
          items: Json
          outcome: string
          outcome_reason: string | null
          reviewed_at: string
          reviewer_id: string | null
          subject_id: string
          subject_type: string
        }
        Insert: {
          checklist_version: string
          id?: string
          items: Json
          outcome: string
          outcome_reason?: string | null
          reviewed_at?: string
          reviewer_id?: string | null
          subject_id: string
          subject_type: string
        }
        Update: {
          checklist_version?: string
          id?: string
          items?: Json
          outcome?: string
          outcome_reason?: string | null
          reviewed_at?: string
          reviewer_id?: string | null
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_checklists_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      round_closures: {
        Row: {
          amount_raised: number | null
          attestation_version: string
          currency: string | null
          declared_at: string
          declared_by: string
          declared_external: string | null
          declared_investor_ids: string[]
          id: string
          introduced_in_tail: string[]
          ip: string | null
          outcome: string
          startup_id: string
          undeclared_introduced: string[]
          user_agent: string | null
        }
        Insert: {
          amount_raised?: number | null
          attestation_version: string
          currency?: string | null
          declared_at?: string
          declared_by: string
          declared_external?: string | null
          declared_investor_ids?: string[]
          id?: string
          introduced_in_tail?: string[]
          ip?: string | null
          outcome: string
          startup_id: string
          undeclared_introduced?: string[]
          user_agent?: string | null
        }
        Update: {
          amount_raised?: number | null
          attestation_version?: string
          currency?: string | null
          declared_at?: string
          declared_by?: string
          declared_external?: string | null
          declared_investor_ids?: string[]
          id?: string
          introduced_in_tail?: string[]
          ip?: string | null
          outcome?: string
          startup_id?: string
          undeclared_introduced?: string[]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_closures_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      round_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          grants_documents: boolean
          id: string
          label: string | null
          last_opened_at: string | null
          opens: number
          revoked_at: string | null
          startup_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          grants_documents?: boolean
          id?: string
          label?: string | null
          last_opened_at?: string | null
          opens?: number
          revoked_at?: string | null
          startup_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          grants_documents?: boolean
          id?: string
          label?: string | null
          last_opened_at?: string | null
          opens?: number
          revoked_at?: string | null
          startup_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_shares_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      round_waitlist: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          note: string | null
          startup_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          note?: string | null
          startup_id: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
          note?: string | null
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_waitlist_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_waitlist_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          alert_enabled: boolean
          created_at: string
          filters: Json
          id: string
          investor_id: string
          last_run_at: string | null
          name: string
          query: string | null
          result_count: number | null
          search_type: string
          user_id: string | null
        }
        Insert: {
          alert_enabled?: boolean
          created_at?: string
          filters?: Json
          id?: string
          investor_id: string
          last_run_at?: string | null
          name: string
          query?: string | null
          result_count?: number | null
          search_type?: string
          user_id?: string | null
        }
        Update: {
          alert_enabled?: boolean
          created_at?: string
          filters?: Json
          id?: string
          investor_id?: string
          last_run_at?: string | null
          name?: string
          query?: string | null
          result_count?: number | null
          search_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_dismissals: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          reason: string | null
          snooze_until: string | null
          startup_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          reason?: string | null
          snooze_until?: string | null
          startup_id: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
          reason?: string | null
          snooze_until?: string | null
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_dismissals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_dismissals_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_documents: {
        Row: {
          file_url: string
          id: string
          label: string
          requires_nda: boolean
          startup_id: string
          type: string
        }
        Insert: {
          file_url: string
          id?: string
          label: string
          requires_nda?: boolean
          startup_id: string
          type: string
        }
        Update: {
          file_url?: string
          id?: string
          label?: string
          requires_nda?: boolean
          startup_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_documents_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_founders: {
        Row: {
          bio: string | null
          id: string
          linkedin_url: string | null
          name: string
          photo_url: string | null
          role: string
          startup_id: string
          twitter_url: string | null
        }
        Insert: {
          bio?: string | null
          id?: string
          linkedin_url?: string | null
          name: string
          photo_url?: string | null
          role: string
          startup_id: string
          twitter_url?: string | null
        }
        Update: {
          bio?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string
          photo_url?: string | null
          role?: string
          startup_id?: string
          twitter_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_founders_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_metrics: {
        Row: {
          arr: number | null
          created_at: string
          id: string
          month: string
          mrr: number | null
          paying_customers: number | null
          startup_id: string
          user_count: number | null
        }
        Insert: {
          arr?: number | null
          created_at?: string
          id?: string
          month: string
          mrr?: number | null
          paying_customers?: number | null
          startup_id: string
          user_count?: number | null
        }
        Update: {
          arr?: number | null
          created_at?: string
          id?: string
          month?: string
          mrr?: number | null
          paying_customers?: number | null
          startup_id?: string
          user_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_metrics_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_milestones: {
        Row: {
          date: string
          description: string
          id: string
          startup_id: string
        }
        Insert: {
          date: string
          description: string
          id?: string
          startup_id: string
        }
        Update: {
          date?: string
          description?: string
          id?: string
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_milestones_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_shares: {
        Row: {
          created_at: string
          from_investor_id: string
          id: string
          note: string | null
          startup_id: string
          thread_id: string | null
          to_investor_id: string
        }
        Insert: {
          created_at?: string
          from_investor_id: string
          id?: string
          note?: string | null
          startup_id: string
          thread_id?: string | null
          to_investor_id: string
        }
        Update: {
          created_at?: string
          from_investor_id?: string
          id?: string
          note?: string | null
          startup_id?: string
          thread_id?: string | null
          to_investor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_shares_from_investor_id_fkey"
            columns: ["from_investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_shares_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_shares_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_shares_to_investor_id_fkey"
            columns: ["to_investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_updates: {
        Row: {
          audience: string
          body: string
          created_at: string
          id: string
          startup_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          id?: string
          startup_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          startup_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_updates_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_views: {
        Row: {
          id: string
          investor_id: string
          startup_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          investor_id: string
          startup_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          investor_id?: string
          startup_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_views_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_views_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          arr: number | null
          booking_url: string | null
          business_model: string | null
          churn_rate: number | null
          city: string | null
          company_type: string | null
          competitive_advantage: string | null
          competitors_json: Json
          country: string
          created_at: string
          deck_language: string | null
          demo_video_url: string | null
          description: string | null
          draft_nudge_count: number
          draft_nudged_at: string | null
          edited_since_review_at: string | null
          equity_offered: number | null
          featured: boolean
          founded_date: string | null
          founded_year: number | null
          founder_attestation_at: string | null
          founder_attestation_ip: string | null
          founder_attestation_sha256: string | null
          founder_attestation_version: string | null
          funding_target: number
          growth_rate: number | null
          id: string
          industry: string
          instrument: string | null
          is_demo: boolean
          languages: string[] | null
          languages_spoken: string[] | null
          last_review_id: string | null
          lead_investor: string | null
          lead_investor_status: string | null
          legal_entity_name: string | null
          listed_at: string | null
          logo_color: string | null
          logo_url: string | null
          looking_for: string[] | null
          market: string | null
          min_check_size: number | null
          mrr: number | null
          name: string
          owner_id: string
          pageviews: number
          paying_customers: number | null
          pitch_deck_url: string | null
          previous_funding: number | null
          problem: string | null
          product_hunt_url: string | null
          register_number: string | null
          register_type: string | null
          require_nda: boolean
          revenue_model: string | null
          round_close_date: string | null
          round_state: string
          round_state_changed_at: string | null
          runway_months: number | null
          safe_cap: number | null
          safe_discount: number | null
          sam: number | null
          scored_at: string | null
          search_vector: unknown
          show_momentum: boolean
          slug: string
          social_proof: Json | null
          solution: string | null
          som: number | null
          stage: string
          status: string
          subscription_tier: string
          tagline: string
          tags: string[] | null
          tam: number | null
          target_markets: string[] | null
          team_size: string | null
          trust_expires_at: string | null
          trust_level: number
          trust_reviewed_at: string | null
          twitter_url: string | null
          updated_at: string
          use_of_funds: string | null
          user_count: number | null
          valuation: number | null
          valuation_type: string | null
          vaultrise_score: number | null
          verification_checks: Json | null
          verified_at: string | null
          verified_by: string | null
          video_pitch_url: string | null
          website: string | null
        }
        Insert: {
          arr?: number | null
          booking_url?: string | null
          business_model?: string | null
          churn_rate?: number | null
          city?: string | null
          company_type?: string | null
          competitive_advantage?: string | null
          competitors_json?: Json
          country: string
          created_at?: string
          deck_language?: string | null
          demo_video_url?: string | null
          description?: string | null
          draft_nudge_count?: number
          draft_nudged_at?: string | null
          edited_since_review_at?: string | null
          equity_offered?: number | null
          featured?: boolean
          founded_date?: string | null
          founded_year?: number | null
          founder_attestation_at?: string | null
          founder_attestation_ip?: string | null
          founder_attestation_sha256?: string | null
          founder_attestation_version?: string | null
          funding_target?: number
          growth_rate?: number | null
          id?: string
          industry: string
          instrument?: string | null
          is_demo?: boolean
          languages?: string[] | null
          languages_spoken?: string[] | null
          last_review_id?: string | null
          lead_investor?: string | null
          lead_investor_status?: string | null
          legal_entity_name?: string | null
          listed_at?: string | null
          logo_color?: string | null
          logo_url?: string | null
          looking_for?: string[] | null
          market?: string | null
          min_check_size?: number | null
          mrr?: number | null
          name: string
          owner_id: string
          pageviews?: number
          paying_customers?: number | null
          pitch_deck_url?: string | null
          previous_funding?: number | null
          problem?: string | null
          product_hunt_url?: string | null
          register_number?: string | null
          register_type?: string | null
          require_nda?: boolean
          revenue_model?: string | null
          round_close_date?: string | null
          round_state?: string
          round_state_changed_at?: string | null
          runway_months?: number | null
          safe_cap?: number | null
          safe_discount?: number | null
          sam?: number | null
          scored_at?: string | null
          search_vector?: unknown
          show_momentum?: boolean
          slug: string
          social_proof?: Json | null
          solution?: string | null
          som?: number | null
          stage: string
          status?: string
          subscription_tier?: string
          tagline: string
          tags?: string[] | null
          tam?: number | null
          target_markets?: string[] | null
          team_size?: string | null
          trust_expires_at?: string | null
          trust_level?: number
          trust_reviewed_at?: string | null
          twitter_url?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_count?: number | null
          valuation?: number | null
          valuation_type?: string | null
          vaultrise_score?: number | null
          verification_checks?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          video_pitch_url?: string | null
          website?: string | null
        }
        Update: {
          arr?: number | null
          booking_url?: string | null
          business_model?: string | null
          churn_rate?: number | null
          city?: string | null
          company_type?: string | null
          competitive_advantage?: string | null
          competitors_json?: Json
          country?: string
          created_at?: string
          deck_language?: string | null
          demo_video_url?: string | null
          description?: string | null
          draft_nudge_count?: number
          draft_nudged_at?: string | null
          edited_since_review_at?: string | null
          equity_offered?: number | null
          featured?: boolean
          founded_date?: string | null
          founded_year?: number | null
          founder_attestation_at?: string | null
          founder_attestation_ip?: string | null
          founder_attestation_sha256?: string | null
          founder_attestation_version?: string | null
          funding_target?: number
          growth_rate?: number | null
          id?: string
          industry?: string
          instrument?: string | null
          is_demo?: boolean
          languages?: string[] | null
          languages_spoken?: string[] | null
          last_review_id?: string | null
          lead_investor?: string | null
          lead_investor_status?: string | null
          legal_entity_name?: string | null
          listed_at?: string | null
          logo_color?: string | null
          logo_url?: string | null
          looking_for?: string[] | null
          market?: string | null
          min_check_size?: number | null
          mrr?: number | null
          name?: string
          owner_id?: string
          pageviews?: number
          paying_customers?: number | null
          pitch_deck_url?: string | null
          previous_funding?: number | null
          problem?: string | null
          product_hunt_url?: string | null
          register_number?: string | null
          register_type?: string | null
          require_nda?: boolean
          revenue_model?: string | null
          round_close_date?: string | null
          round_state?: string
          round_state_changed_at?: string | null
          runway_months?: number | null
          safe_cap?: number | null
          safe_discount?: number | null
          sam?: number | null
          scored_at?: string | null
          search_vector?: unknown
          show_momentum?: boolean
          slug?: string
          social_proof?: Json | null
          solution?: string | null
          som?: number | null
          stage?: string
          status?: string
          subscription_tier?: string
          tagline?: string
          tags?: string[] | null
          tam?: number | null
          target_markets?: string[] | null
          team_size?: string | null
          trust_expires_at?: string | null
          trust_level?: number
          trust_reviewed_at?: string | null
          twitter_url?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_count?: number | null
          valuation?: number | null
          valuation_type?: string | null
          vaultrise_score?: number | null
          verification_checks?: Json | null
          verified_at?: string | null
          verified_by?: string | null
          video_pitch_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startups_last_review_id_fkey"
            columns: ["last_review_id"]
            isOneToOne: false
            referencedRelation: "review_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          confirmed: boolean
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      system_events: {
        Row: {
          created_at: string
          detail: Json | null
          id: string
          level: string
          message: string
          source: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          id?: string
          level: string
          message: string
          source: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          id?: string
          level?: string
          message?: string
          source?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          invited_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          invited_by?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          invited_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      thread_archives: {
        Row: {
          created_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_archives_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_flags: {
        Row: {
          created_at: string
          important: boolean
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          important?: boolean
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          important?: boolean
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_flags_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          id: string
          investor_id: string | null
          recipient_investor_id: string | null
          recipient_startup_id: string | null
          startup_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id?: string | null
          recipient_investor_id?: string | null
          recipient_startup_id?: string | null
          startup_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string | null
          recipient_investor_id?: string | null
          recipient_startup_id?: string | null
          startup_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_recipient_investor_id_fkey"
            columns: ["recipient_investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_recipient_startup_id_fkey"
            columns: ["recipient_startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_signals: {
        Row: {
          created_at: string
          detail: Json
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          signal: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          signal: string
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          signal?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      verification_cases: {
        Row: {
          created_at: string
          decision_note: string | null
          expires_at: string | null
          id: string
          level_granted: number | null
          level_requested: number
          owner_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          risk_flags: Json
          risk_score: number | null
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          level_granted?: number | null
          level_requested?: number
          owner_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          risk_flags?: Json
          risk_score?: number | null
          status?: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          level_granted?: number | null
          level_requested?: number
          owner_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          risk_flags?: Json
          risk_score?: number | null
          status?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      verification_evidence: {
        Row: {
          case_id: string
          checked_at: string | null
          created_at: string
          detail: Json
          id: string
          kind: string
          method: string
          status: string
          storage_path: string | null
          vendor_ref: string | null
        }
        Insert: {
          case_id: string
          checked_at?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          method: string
          status?: string
          storage_path?: string | null
          vendor_ref?: string | null
        }
        Update: {
          case_id?: string
          checked_at?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          method?: string
          status?: string
          storage_path?: string | null
          vendor_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "verification_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          changes_seen_at: string | null
          created_at: string
          id: string
          investor_id: string
          note: string | null
          priority: number
          startup_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          changes_seen_at?: string | null
          created_at?: string
          id?: string
          investor_id: string
          note?: string | null
          priority?: number
          startup_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          changes_seen_at?: string | null
          created_at?: string
          id?: string
          investor_id?: string
          note?: string | null
          priority?: number
          startup_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlists_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_startup: {
        Args: never
        Returns: {
          arr: number | null
          booking_url: string | null
          business_model: string | null
          churn_rate: number | null
          city: string | null
          company_type: string | null
          competitive_advantage: string | null
          competitors_json: Json
          country: string
          created_at: string
          deck_language: string | null
          demo_video_url: string | null
          description: string | null
          draft_nudge_count: number
          draft_nudged_at: string | null
          edited_since_review_at: string | null
          equity_offered: number | null
          featured: boolean
          founded_date: string | null
          founded_year: number | null
          founder_attestation_at: string | null
          founder_attestation_ip: string | null
          founder_attestation_sha256: string | null
          founder_attestation_version: string | null
          funding_target: number
          growth_rate: number | null
          id: string
          industry: string
          instrument: string | null
          is_demo: boolean
          languages: string[] | null
          languages_spoken: string[] | null
          last_review_id: string | null
          lead_investor: string | null
          lead_investor_status: string | null
          legal_entity_name: string | null
          listed_at: string | null
          logo_color: string | null
          logo_url: string | null
          looking_for: string[] | null
          market: string | null
          min_check_size: number | null
          mrr: number | null
          name: string
          owner_id: string
          pageviews: number
          paying_customers: number | null
          pitch_deck_url: string | null
          previous_funding: number | null
          problem: string | null
          product_hunt_url: string | null
          register_number: string | null
          register_type: string | null
          require_nda: boolean
          revenue_model: string | null
          round_close_date: string | null
          round_state: string
          round_state_changed_at: string | null
          runway_months: number | null
          safe_cap: number | null
          safe_discount: number | null
          sam: number | null
          scored_at: string | null
          search_vector: unknown
          show_momentum: boolean
          slug: string
          social_proof: Json | null
          solution: string | null
          som: number | null
          stage: string
          status: string
          subscription_tier: string
          tagline: string
          tags: string[] | null
          tam: number | null
          target_markets: string[] | null
          team_size: string | null
          trust_expires_at: string | null
          trust_level: number
          trust_reviewed_at: string | null
          twitter_url: string | null
          updated_at: string
          use_of_funds: string | null
          user_count: number | null
          valuation: number | null
          valuation_type: string | null
          vaultrise_score: number | null
          verification_checks: Json | null
          verified_at: string | null
          verified_by: string | null
          video_pitch_url: string | null
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "startups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_startup_daily_views: {
        Args: { p_startup_id: string }
        Returns: {
          date: string
          views: number
        }[]
      }
      get_trending_startups: {
        Args: { limit_count?: number }
        Returns: {
          id: string
          industry: string
          name: string
          recent_views: number
          slug: string
          stage: string
          tagline: string
        }[]
      }
      has_unmasked_contact: { Args: { txt: string }; Returns: boolean }
      increment_pageview: { Args: { startup_id: string }; Returns: undefined }
      is_deal_counterparty: { Args: { p_startup_id: string }; Returns: boolean }
      is_investor_member: { Args: { iid: string }; Returns: boolean }
      is_startup_member: { Args: { sid: string }; Returns: boolean }
      is_suspended: { Args: never; Returns: boolean }
      my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          id: string
          ip: string
          last_seen: string
          user_agent: string
        }[]
      }
      revoke_my_session: { Args: { sid: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
