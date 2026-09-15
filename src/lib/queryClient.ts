import { QueryClient } from "@tanstack/react-query";

// The one `QueryClient` instance for the app — a plain module export rather
// than only living inside `main.tsx`'s `<QueryClientProvider>`, so
// non-component code (Zustand store actions, e.g. `acpSlice.ts`'s
// `pushAcpCatalog`) can also call `invalidateQueries`/`setQueryData`
// directly, the same way a component would via `useQueryClient()`.
//
// Live/pushed data (git branch, actions, generating status, ...) is written
// into the query cache directly from Tauri event handlers rather than via
// refetch, so a long `staleTime` just means "don't refetch on refocus/mount
// if we already have a value" — freshness for that data comes from the
// event, not from React Query's own refetch heuristics.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
