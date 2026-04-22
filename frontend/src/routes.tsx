import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireRole } from '@/components/auth/RequireRole'
import { Skeleton } from '@/components/ui/skeleton'

// Public pages (eager — small)
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

// Layout (eager — always needed once authenticated)
import AppLayout from './components/layout/AppLayout'

// Protected pages (lazy — code-split)
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const PerformancePage = lazy(() => import('./pages/PerformancePage'))
const CollaboratorProfilePage = lazy(
  () => import('./pages/CollaboratorProfilePage'),
)
const CollaboratorsPage = lazy(() => import('./pages/admin/CollaboratorsPage'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const DatasetUploadPage = lazy(() => import('./pages/admin/DatasetUploadPage'))
const CollectionHealthPage = lazy(
  () => import('./pages/admin/CollectionHealthPage'),
)

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: '/dashboard',
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
      },
      {
        path: '/reviews',
        element: (
          <LazyPage>
            <ReviewsPage />
          </LazyPage>
        ),
      },
      {
        path: '/analytics',
        element: (
          <LazyPage>
            <AnalyticsPage />
          </LazyPage>
        ),
      },
      {
        path: '/performance',
        element: (
          <LazyPage>
            <PerformancePage />
          </LazyPage>
        ),
      },
      {
        path: '/account/password',
        element: (
          <LazyPage>
            <ChangePasswordPage />
          </LazyPage>
        ),
      },
      {
        path: '/collaborators/:id',
        element: (
          <LazyPage>
            <CollaboratorProfilePage />
          </LazyPage>
        ),
      },
      {
        path: '/admin/collaborators',
        element: (
          <RequireRole allowed={['admin', 'manager']}>
            <LazyPage>
              <CollaboratorsPage />
            </LazyPage>
          </RequireRole>
        ),
      },
      {
        path: '/admin/users',
        element: (
          <RequireRole allowed={['admin']}>
            <LazyPage>
              <UsersPage />
            </LazyPage>
          </RequireRole>
        ),
      },
      {
        path: '/admin/dataset-upload',
        element: (
          <RequireRole allowed={['admin']}>
            <LazyPage>
              <DatasetUploadPage />
            </LazyPage>
          </RequireRole>
        ),
      },
      {
        path: '/admin/collection-health',
        element: (
          <RequireRole allowed={['admin']}>
            <LazyPage>
              <CollectionHealthPage />
            </LazyPage>
          </RequireRole>
        ),
      },
    ],
  },
])
