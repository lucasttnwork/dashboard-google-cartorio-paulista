import { apiClient } from './client'
import type {
  AdminUser,
  AdminUserCreate,
  AdminUserCreateResponse,
  AdminUserListResponse,
  AdminUserUpdate,
} from '@/types/admin-user'

const BASE = '/api/v1/admin/users'

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUserListResponse>(`${BASE}/`)
  return data.items
}

export async function createAdminUser(
  body: AdminUserCreate,
): Promise<AdminUserCreateResponse> {
  const { data } = await apiClient.post<AdminUserCreateResponse>(`${BASE}/`, body)
  return data
}

export async function updateAdminUser(
  id: string,
  body: AdminUserUpdate,
): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`${BASE}/${id}`, body)
  return data
}

export async function deleteAdminUser(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`)
}
