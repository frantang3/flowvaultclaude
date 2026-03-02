// lib/reactQuery.ts
// A single re-export point for React Query.
//
// Why this exists:
// In some bundler setups (especially with Metro/Expo + fast refresh), it's possible to end up
// with multiple copies/entrypoints of the same dependency. When that happens, React Query's
// context can be created by one copy, while hooks import from another copy — resulting in:
//   "No QueryClient set, use QueryClientProvider to set one"
//
// By importing React Query exclusively through this module across the app, we strongly reduce
// the risk of context mismatches.
//
// Note:
// This project environment sometimes ships with minimal/incorrect TS type stubs for some
// dependencies. To keep the app buildable while still using the real runtime exports, we
// intentionally `require()` React Query and re-export the pieces we use.

declare const require: any

const ReactQuery = require('@tanstack/react-query') as any

export const QueryClient = ReactQuery.QueryClient as any
export const QueryClientProvider = ReactQuery.QueryClientProvider as any
export const useQuery = ReactQuery.useQuery as any
export const useMutation = ReactQuery.useMutation as any
export const useQueryClient = ReactQuery.useQueryClient as any