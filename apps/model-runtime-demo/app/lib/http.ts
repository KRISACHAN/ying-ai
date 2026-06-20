export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function errorResponse(error: unknown, status = 500): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "request failed",
      },
    },
    status,
  );
}
