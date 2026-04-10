import { createBrowserRouter, Outlet } from 'react-router-dom'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireRole } from '@/components/auth/RequireRole'
import HealthPage from './pages/HealthPage'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import CollaboratorsPage from './pages/admin/CollaboratorsPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <HealthPage /> },
      {
        path: '/admin/collaborators',
        element: (
          <RequireRole allowed={['admin', 'manager']}>
            <CollaboratorsPage />
          </RequireRole>
        ),
      },
    ],
  },
])
