import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { PendingDraftsProvider, useDraftState, useHasPendingDrafts } from "./pendingDrafts";

it("keeps newer edits and independently dirty settings when acknowledging a save", () => {
  const { result } = renderHook(
    () => {
      const [, editFirst, , saveFirst] = useDraftState({ enabled: false });
      const [, editSecond] = useDraftState("");
      return { editFirst, saveFirst, editSecond, pending: useHasPendingDrafts() };
    },
    { wrapper: PendingDraftsProvider },
  );

  act(() => result.current.editFirst({ enabled: true }));
  act(() => result.current.editSecond("draft"));
  act(() => result.current.saveFirst({ enabled: true }));
  expect(result.current.pending()).toBe(true);
  act(() => result.current.editSecond(""));
  expect(result.current.pending()).toBe(false);

  act(() => result.current.editFirst({ enabled: false }));
  act(() => result.current.saveFirst({ enabled: true }));
  expect(result.current.pending()).toBe(true);
});
