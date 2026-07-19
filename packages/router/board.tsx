import {
  PostBoardSchemaType,
  PostSectionSchemaType,
  PostBoardItemSchemaType,
  BulkItemPositionSchemaType,
} from "@linkwarden/lib/schemaValidation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSession } from "next-auth/react";

async function v1<T = any>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data?.response || "Request failed.");
  return data.response as T;
}

export const useBoards = () => {
  const { status } = useSession();
  return useQuery({
    queryKey: ["boards"],
    queryFn: () => v1(`/boards`),
    enabled: status === "authenticated",
  });
};

export const useBoard = (boardId?: number) => {
  const { status } = useSession();
  return useQuery({
    queryKey: ["boards", boardId],
    queryFn: () => v1(`/boards/${boardId}`),
    enabled: status === "authenticated" && !!boardId,
  });
};

export const useCreateBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PostBoardSchemaType) =>
      v1(`/boards`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
};

export const useCreateSection = (boardId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PostSectionSchemaType) =>
      v1(`/boards/${boardId}/sections`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards", boardId] }),
  });
};

export const useDeleteSection = (boardId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: number) =>
      v1(`/boards/${boardId}/sections/${sectionId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards", boardId] }),
  });
};

export const useCreateItem = (boardId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PostBoardItemSchemaType) =>
      v1(`/boards/${boardId}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards", boardId] }),
  });
};

export const useDeleteItem = (boardId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) =>
      v1(`/boards/${boardId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards", boardId] }),
  });
};

// One-call bulk reposition - the API-driven reorg path.
export const useUpdateItemPositions = (boardId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkItemPositionSchemaType) =>
      v1(`/boards/${boardId}/items/positions`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards", boardId] }),
  });
};

// Live widget status, polled at the caller-provided cadence.
export const useWidgetStatus = (
  boardId: number,
  itemId: number,
  refreshSeconds: number,
  enabled = true
) => {
  return useQuery({
    queryKey: ["widget-status", boardId, itemId],
    queryFn: () => v1(`/boards/${boardId}/items/${itemId}/widget-status`),
    enabled,
    refetchInterval: Math.max(refreshSeconds, 5) * 1000,
    refetchIntervalInBackground: false,
  });
};

export const useWidgetTypes = () => {
  const { status } = useSession();
  return useQuery({
    queryKey: ["widget-types"],
    queryFn: () => v1(`/widget-types`),
    enabled: status === "authenticated",
  });
};
