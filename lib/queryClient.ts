import { QueryClient } from './reactQuery'

// Centralized QueryClient singleton used across the app.
// This avoids multiple instances and enables direct query cache access in hooks
// without requiring useQueryClient() (which depends on React context).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
})