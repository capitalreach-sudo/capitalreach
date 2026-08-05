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
      deals: {
        Row: {
          amount: number | null
          closed_at: string | null
          created_at: string
          currency: string
          id: string
          investor_id: string
          next_follow_up: string | null
          notes: string | null
          passed_at: string | null
          stage_entered_at: string | null
          startup_id: string
          status: string
          stripe_invoice_id: string | null
          success_fee_amount: number | null
          success_fee_invoiced: boolean
          success_fee_paid_at: string | null
          term_sheet_url: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          investor_id: string
          next_follow_up?: string | null
          notes?: string | null
          passed_at?: string | null
          stage_entered_at?: string | null
          startup_id: string
          status?: string
          stripe_invoice_id?: string | null
          success_fee_amount?: number | null
          success_fee_invoiced?: boolean
          success_fee_paid_at?: string | null
          term_sheet_url?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          investor_id?: string
          next_follow_up?: string | null
          notes?: string | null
          passed_at?: string | null
          stage_entered_at?: string | null
          startup_id?: string
          status?: string
          stripe_invoice_id?: string | null
          success_fee_amount?: number | null
          success_fee_invoiced?: boolean
          success_fee_paid_at?: string | null
          term_sheet_url?: string | null
          updated_at?: string
        }
        Relationships: [
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
      investor_targets: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          note: string | null
          startup_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          note?: string | null
          startup_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
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
      investors: {
        Row: {
          aum: string | null
          avatar_url: string | null
          avg_hold_period: string | null
          bio: string | null
          board_seat_pref: string | null
          created_at: string
          display_name: string | null
          firm_name: string | null
          follow_on_policy: string | null
          geography: string[]
          id: string
          industries: string[]
          investment_thesis: string | null
          languages: string[] | null
          lead_rounds: boolean
          linkedin_url: string | null
          max_check: number | null
          min_check: number | null
          number_of_investments: number | null
          owner_id: string
          portfolio_json: Json
          slug: string
          stages: string[]
          subscription_tier: string
          twitter_url: string | null
          type: string
          website: string | null
        }
        Insert: {
          aum?: string | null
          avatar_url?: string | null
          avg_hold_period?: string | null
          bio?: string | null
          board_seat_pref?: string | null
          created_at?: string
          display_name?: string | null
          firm_name?: string | null
          follow_on_policy?: string | null
          geography?: string[]
          id?: string
          industries?: string[]
          investment_thesis?: string | null
          languages?: string[] | null
          lead_rounds?: boolean
          linkedin_url?: string | null
          max_check?: number | null
          min_check?: number | null
          number_of_investments?: number | null
          owner_id: string
          portfolio_json?: Json
          slug: string
          stages?: string[]
          subscription_tier?: string
          twitter_url?: string | null
          type: string
          website?: string | null
        }
        Update: {
          aum?: string | null
          avatar_url?: string | null
          avg_hold_period?: string | null
          bio?: string | null
          board_seat_pref?: string | null
          created_at?: string
          display_name?: string | null
          firm_name?: string | null
          follow_on_policy?: string | null
          geography?: string[]
          id?: string
          industries?: string[]
          investment_thesis?: string | null
          languages?: string[] | null
          lead_rounds?: boolean
          linkedin_url?: string | null
          max_check?: number | null
          min_check?: number | null
          number_of_investments?: number | null
          owner_id?: string
          portfolio_json?: Json
          slug?: string
          stages?: string[]
          subscription_tier?: string
          twitter_url?: string | null
          type?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investors_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
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
      nda_records: {
        Row: {
          docusign_envelope_id: string | null
          id: string
          investor_id: string
          signed_at: string | null
          startup_id: string
        }
        Insert: {
          docusign_envelope_id?: string | null
          id?: string
          investor_id: string
          signed_at?: string | null
          startup_id: string
        }
        Update: {
          docusign_envelope_id?: string | null
          id?: string
          investor_id?: string
          signed_at?: string | null
          startup_id?: string
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
          created_at: string
          href: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
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
      profiles: {
        Row: {
          account_status: string
          accreditation_certified: boolean
          avatar_url: string | null
          check_size_max: number | null
          check_size_min: number | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          investment_thesis: string | null
          investor_declarations: Json | null
          investor_type: string | null
          languages: string[] | null
          lead_investor: boolean | null
          portfolio_count: number | null
          preferred_countries: string[] | null
          preferred_industries: string[] | null
          preferred_locale: string | null
          preferred_stages: string[] | null
          role: string
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
        }
        Insert: {
          account_status?: string
          accreditation_certified?: boolean
          avatar_url?: string | null
          check_size_max?: number | null
          check_size_min?: number | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          investment_thesis?: string | null
          investor_declarations?: Json | null
          investor_type?: string | null
          languages?: string[] | null
          lead_investor?: boolean | null
          portfolio_count?: number | null
          preferred_countries?: string[] | null
          preferred_industries?: string[] | null
          preferred_locale?: string | null
          preferred_stages?: string[] | null
          role: string
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
        }
        Update: {
          account_status?: string
          accreditation_certified?: boolean
          avatar_url?: string | null
          check_size_max?: number | null
          check_size_min?: number | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          investment_thesis?: string | null
          investor_declarations?: Json | null
          investor_type?: string | null
          languages?: string[] | null
          lead_investor?: boolean | null
          portfolio_count?: number | null
          preferred_countries?: string[] | null
          preferred_industries?: string[] | null
          preferred_locale?: string | null
          preferred_stages?: string[] | null
          role?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          investor_id: string
          name: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          investor_id: string
          name: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          investor_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_dismissals: {
        Row: {
          created_at: string
          id: string
          investor_id: string
          startup_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id: string
          startup_id: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string
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
          equity_offered: number | null
          featured: boolean
          founded_date: string | null
          funding_target: number
          growth_rate: number | null
          id: string
          industry: string
          languages: string[] | null
          lead_investor: string | null
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
          require_nda: boolean
          revenue_model: string | null
          runway_months: number | null
          slug: string
          social_proof: Json | null
          solution: string | null
          stage: string
          status: string
          subscription_tier: string
          tagline: string
          target_markets: string[] | null
          team_size: string | null
          twitter_url: string | null
          updated_at: string
          use_of_funds: string | null
          user_count: number | null
          vaultrise_score: number | null
          video_pitch_url: string | null
          website: string | null
        }
        Insert: {
          arr?: number | null
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
          equity_offered?: number | null
          featured?: boolean
          founded_date?: string | null
          funding_target?: number
          growth_rate?: number | null
          id?: string
          industry: string
          languages?: string[] | null
          lead_investor?: string | null
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
          require_nda?: boolean
          revenue_model?: string | null
          runway_months?: number | null
          slug: string
          social_proof?: Json | null
          solution?: string | null
          stage: string
          status?: string
          subscription_tier?: string
          tagline: string
          target_markets?: string[] | null
          team_size?: string | null
          twitter_url?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_count?: number | null
          vaultrise_score?: number | null
          video_pitch_url?: string | null
          website?: string | null
        }
        Update: {
          arr?: number | null
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
          equity_offered?: number | null
          featured?: boolean
          founded_date?: string | null
          funding_target?: number
          growth_rate?: number | null
          id?: string
          industry?: string
          languages?: string[] | null
          lead_investor?: string | null
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
          require_nda?: boolean
          revenue_model?: string | null
          runway_months?: number | null
          slug?: string
          social_proof?: Json | null
          solution?: string | null
          stage?: string
          status?: string
          subscription_tier?: string
          tagline?: string
          target_markets?: string[] | null
          team_size?: string | null
          twitter_url?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_count?: number | null
          vaultrise_score?: number | null
          video_pitch_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      threads: {
        Row: {
          created_at: string
          id: string
          investor_id: string | null
          recipient_startup_id: string | null
          startup_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          investor_id?: string | null
          recipient_startup_id?: string | null
          startup_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          investor_id?: string | null
          recipient_startup_id?: string | null
          startup_id?: string
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
      watchlists: {
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
      increment_pageview: { Args: { startup_id: string }; Returns: undefined }
      is_investor_member: { Args: { iid: string }; Returns: boolean }
      is_startup_member: { Args: { sid: string }; Returns: boolean }
      is_suspended: { Args: never; Returns: boolean }
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
