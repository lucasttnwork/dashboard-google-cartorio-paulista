export type Role = 'admin' | 'manager' | 'viewer'

export interface AdminUser {
  id: string
  email: string
  role: Role
  is_active: boolean
  collaborator_id: number | null
  collaborator_name: string | null
  created_at: string | null
}

export interface AdminUserListResponse {
  items: AdminUser[]
}

export interface AdminUserCreate {
  email: string
  password: string
  role: Role
  collaborator_id?: number | null
}

export interface AdminUserCreateResponse {
  id: string
  email: string
  role: Role
  is_active: boolean
  collaborator_id: number | null
  temp_password: string
}

export interface AdminUserUpdate {
  role?: Role
  is_active?: boolean
  collaborator_id?: number | null
  clear_collaborator?: boolean
}
