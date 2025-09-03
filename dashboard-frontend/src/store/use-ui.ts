import { create } from 'zustand'

type Visibility = Record<string, boolean>

interface UIState {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  columnVisibility: Record<string, Visibility>
  setColumnVisibility: (tableId: string, visibility: Visibility) => void
}

export const useUI = create<UIState>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  columnVisibility: {},
  setColumnVisibility: (tableId, visibility) =>
    set((state) => ({
      columnVisibility: {
        ...state.columnVisibility,
        [tableId]: visibility,
      },
    })),
}))
