const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export async function api<T>(
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error(
        apiBase
          ? `Cannot reach the backend at ${apiBase}. Start the backend and verify VITE_API_URL.`
          : "Cannot reach the backend through this app. Start the backend and restart the frontend.",
      );
    }
    throw cause;
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    let message = `Request failed (${response.status})`;
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      message = payload.error === "Student account not found"
        ? "এই ইমেইলে এই অ্যাপের ডাটাবেসে কোনো শিক্ষার্থী অ্যাকাউন্ট নেই। শিক্ষার্থীকে আগে এই localhost অ্যাপেই নিবন্ধন করতে হবে।"
        : String(payload.error);
      if ("details" in payload && Array.isArray(payload.details)) {
        const detailMessages = payload.details.flatMap((detail: unknown) =>
          typeof detail === "object" && detail !== null && "message" in detail
            ? [
                `${"path" in detail && Array.isArray(detail.path) && detail.path.length
                  ? `${detail.path.map(String).join(".")}: `
                  : ""}${String(detail.message)}`,
              ]
            : [],
        );
        if (detailMessages.length) message = detailMessages.join(". ");
      }
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
