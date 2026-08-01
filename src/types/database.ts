export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'pix' | 'fiado' | 'mixed'

export type UserRole = 'admin' | 'employee'

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          sale_price: number
          cost_price: number
          stock_quantity: number
          min_stock: number
          category_id: string | null
          is_active: boolean
          track_stock: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          sale_price: number
          cost_price: number
          stock_quantity?: number
          min_stock?: number
          category_id?: string | null
          is_active?: boolean
          track_stock?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          sale_price?: number
          cost_price?: number
          stock_quantity?: number
          min_stock?: number
          category_id?: string | null
          is_active?: boolean
          track_stock?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          }
        ]
      }
      customers: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          id: string
          customer_id: string
          amount: number
          notes: string | null
          recorded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          amount: number
          notes?: string | null
          recorded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          amount?: number
          notes?: string | null
          recorded_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'debt_payments_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      sales: {
        Row: {
          id: string
          total_amount: number
          payment_method: PaymentMethod
          notes: string | null
          seller_id: string
          created_at: string
          client_uuid: string | null
          customer_id: string | null
        }
        Insert: {
          id?: string
          total_amount: number
          payment_method: PaymentMethod
          notes?: string | null
          seller_id: string
          created_at?: string
          client_uuid?: string | null
          customer_id?: string | null
        }
        Update: {
          id?: string
          total_amount?: number
          payment_method?: PaymentMethod
          notes?: string | null
          seller_id?: string
          created_at?: string
          client_uuid?: string | null
          customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sales_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          subtotal: number
          item_description: string | null
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          subtotal: number
          item_description?: string | null
        }
        Update: {
          id?: string
          sale_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          subtotal?: number
          item_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sale_items_sale_id_fkey'
            columns: ['sale_id']
            isOneToOne: false
            referencedRelation: 'sales'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      profiles: {
        Row: {
          user_id: string
          first_name: string | null
          last_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          first_name?: string | null
          last_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          first_name?: string | null
          last_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          user_id: string
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_recipients: {
        Row: {
          id: string
          email: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      barcode_cache: {
        Row: {
          code: string
          source: 'cosmos' | 'openfoodfacts' | 'upcitemdb' | 'not_found'
          name: string | null
          description: string | null
          created_at: string
          updated_at: string
          last_accessed_at: string
        }
        Insert: {
          code: string
          source: 'cosmos' | 'openfoodfacts' | 'upcitemdb' | 'not_found'
          name?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
          last_accessed_at?: string
        }
        Update: {
          code?: string
          source?: 'cosmos' | 'openfoodfacts' | 'upcitemdb' | 'not_found'
          name?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
          last_accessed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_balances: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
          total_fiado: number
          total_paid: number
          current_debt: number
          last_payment_at: string | null
          first_fiado_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_sale_with_items: {
        Args: {
          p_payment_method: PaymentMethod
          p_notes: string | null
          p_items: Json
          p_client_uuid?: string | null
          p_customer_id?: string | null
          p_payments?: Json | null
        }
        Returns: string
      }
      search_customers: {
        Args: { p_query: string }
        Returns: {
          id: string
          full_name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }[]
      }
      record_debt_payment: {
        Args: {
          p_customer_id: string
          p_amount: number
          p_notes?: string | null
        }
        Returns: string
      }
      is_admin: {
        Args: {
          p_user_id?: string
        }
        Returns: boolean
      }
      admin_list_users: {
        Args: Record<string, never>
        Returns: {
          user_id: string
          email: string
          first_name: string | null
          last_name: string | null
          role: UserRole
          created_at: string
          last_sign_in_at: string | null
        }[]
      }
      admin_set_role: {
        Args: {
          p_user_id: string
          p_role: UserRole
        }
        Returns: null
      }
      cancel_sale: {
        Args: {
          p_sale_id: string
        }
        Returns: null
      }
      cleanup_barcode_cache: {
        Args: Record<string, never>
        Returns: number
      }
    }
  }
}

export type Category = Database['public']['Tables']['categories']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Sale = Database['public']['Tables']['sales']['Row']
export type SaleItem = Database['public']['Tables']['sale_items']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type DebtPayment = Database['public']['Tables']['debt_payments']['Row']
export type CustomerBalance = Database['public']['Views']['customer_balances']['Row']

export type ProductWithCategory = Product & {
  categories: Category | null
}

export type SaleWithItems = Sale & {
  sale_items: (SaleItem & { products: Product })[]
  customers: { full_name: string } | null
}

export type CartItem = {
  product: Product
  quantity: number
  customPrice?: number
  itemDescription?: string
}
