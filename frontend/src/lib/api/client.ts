import axios, { type AxiosError } from 'axios'
import { useAuthStore } from '@/lib/auth/store'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || undefined,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const url = error.config?.url ?? ''
      if (!url.endsWith('/auth/me')) {
        useAuthStore.getState().reset()
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient
