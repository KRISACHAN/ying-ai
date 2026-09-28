import http from "node:http";
import https from "node:https";
import { OLLAMA_URL } from "./paths.js";

const LOCAL_NO_PROXY = "localhost,127.0.0.1,::1";

export function ensureLocalNoProxy() {
  const current = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  const parts = current
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const host of LOCAL_NO_PROXY.split(",")) {
    if (!parts.includes(host)) {
      parts.push(host);
    }
  }
  const value = parts.join(",");
  process.env.NO_PROXY = value;
  process.env.no_proxy = value;
}

function requestJson(urlString, payload, timeoutMs = 30 * 60 * 1000) {
  const url = new URL(urlString);
  const body = JSON.stringify(payload);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Ollama API error (${res.statusCode}): ${text}`));
            return;
          }

          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(new Error(`Invalid JSON from Ollama: ${text.slice(0, 500)}`, { cause: error }));
          }
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`Ollama request timed out after ${Math.round(timeoutMs / 60000)} minutes`),
      );
    });

    req.on("error", (error) => {
      reject(
        new Error(`Failed to reach Ollama at ${urlString}: ${error.message}`, { cause: error }),
      );
    });

    req.write(body);
    req.end();
  });
}

function requestStream(urlString, payload, { onChunk, timeoutMs = 30 * 60 * 1000 } = {}) {
  const url = new URL(urlString);
  const body = JSON.stringify({ ...payload, stream: true });
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            reject(
              new Error(
                `Ollama API error (${res.statusCode}): ${Buffer.concat(chunks).toString("utf8")}`,
              ),
            );
          });
          return;
        }

        let buffer = "";
        let lastChunk = null;

        res.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            let parsed;
            try {
              parsed = JSON.parse(line);
            } catch (error) {
              reject(
                new Error(`Invalid JSON from Ollama stream: ${line.slice(0, 500)}`, {
                  cause: error,
                }),
              );
              return;
            }

            lastChunk = parsed;
            onChunk?.(parsed);
          }
        });

        res.on("end", () => {
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer);
              lastChunk = parsed;
              onChunk?.(parsed);
            } catch (error) {
              reject(
                new Error(`Invalid JSON from Ollama stream: ${buffer.slice(0, 500)}`, {
                  cause: error,
                }),
              );
              return;
            }
          }

          if (!lastChunk) {
            reject(new Error("Empty response from Ollama stream"));
            return;
          }

          resolve(lastChunk);
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`Ollama request timed out after ${Math.round(timeoutMs / 60000)} minutes`),
      );
    });

    req.on("error", (error) => {
      reject(
        new Error(`Failed to reach Ollama at ${urlString}: ${error.message}`, { cause: error }),
      );
    });

    req.write(body);
    req.end();
  });
}

export async function checkOllama() {
  ensureLocalNoProxy();
  const response = await fetch(`${OLLAMA_URL}/`);
  if (!response.ok) {
    throw new Error(`Ollama is not reachable at ${OLLAMA_URL} (status ${response.status})`);
  }
}

export async function ollamaGenerate(payload, { timeoutMs = 30 * 60 * 1000 } = {}) {
  ensureLocalNoProxy();
  return requestJson(`${OLLAMA_URL}/api/generate`, payload, timeoutMs);
}

export async function ollamaGenerateStream(
  payload,
  { onProgress, timeoutMs = 30 * 60 * 1000 } = {},
) {
  ensureLocalNoProxy();
  return requestStream(`${OLLAMA_URL}/api/generate`, payload, {
    timeoutMs,
    onChunk(chunk) {
      if (chunk.total != null && chunk.completed != null) {
        onProgress?.({
          completed: Number(chunk.completed),
          total: Number(chunk.total),
        });
      }
    },
  });
}
