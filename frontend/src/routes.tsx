import { createBrowserRouter, Outlet } from 'react-router-dom'
import { RequireAuth } from '@/components/auth/RequireAuth'
import HealthPage from './pages/HealthPage'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

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
    ],
  },
])
