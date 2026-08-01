import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useRepos, useAddRepo } from "./core";
import { ApiError } from "../api";

/**
 * Data-layer tests for the TanStack Query hooks. We stub global `fetch` (the
 * single chokepoint under `apiFetch`) so no network is touched, and assert the
 * hook's request shape + how it surfaces success and normalized errors.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: React.ReactNode }) {
  // retry:false so an errored query fails fast instead of backing off.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as Response);
}

describe("useRepos", () => {
  it("GETs /repos and returns the list", async () => {
    const repos = [{ id: "r1", full_name: "acme/api" }];
    const fetchSpy = mockFetchOnce(repos);

    const { result } = renderHook(() => useRepos(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(repos);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/repos$/),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("surfaces a non-2xx as a normalized ApiError", async () => {
    mockFetchOnce({ error: { code: "boom", message: "kaboom" } }, { ok: false, status: 500 });

    const { result } = renderHook(() => useRepos(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(500);
    expect((result.current.error as ApiError).code).toBe("boom");
  });
});

describe("useAddRepo", () => {
  it("POSTs the url as a JSON body", async () => {
    const fetchSpy = mockFetchOnce({ id: "r9", full_name: "acme/new" });

    const { result } = renderHook(() => useAddRepo(), { wrapper });
    result.current.mutate("https://github.com/acme/new");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      url: "https://github.com/acme/new",
    });
  });
});
