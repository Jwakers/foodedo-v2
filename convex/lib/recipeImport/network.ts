"use node";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch, type Dispatcher } from "undici";

import { isPrivateOrReservedAddress } from "../../../src/lib/domain/recipe-import";
import { ImportFailure, RECIPE_IMPORT_LIMITS } from "./contracts";

export type ImportResponse = Awaited<ReturnType<typeof fetch>>;
const responseDispatchers = new WeakMap<ImportResponse, Dispatcher>();

/**
 * Validate DNS at the socket lookup boundary, so the connection uses exactly
 * the checked addresses. Keep the original hostname for Host/SNI and avoid the
 * DNS interceptor's response-handler assertion on HTTP informational responses.
 */
function publicNetworkDispatcher(): Dispatcher {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        void lookup(hostname, { all: true, verbatim: true }).then(
          (addresses) => {
            try {
              assertPublicResolvedAddresses(
                addresses.map(({ address }) => address),
              );
            } catch (error) {
              callback(
                error instanceof Error
                  ? error
                  : new Error("Recipe host could not be resolved."),
                [],
              );
              return;
            }
            const family =
              options.family === "IPv4"
                ? 4
                : options.family === "IPv6"
                  ? 6
                  : options.family;
            const selected = family
              ? addresses.filter((address) => address.family === family)
              : addresses;
            if (selected.length === 0) {
              callback(
                Object.assign(
                  new Error("Recipe host has no matching address."),
                  {
                    code: "ENOTFOUND",
                  },
                ),
                [],
              );
              return;
            }
            if (options.all) callback(null, selected);
            else callback(null, selected[0].address, selected[0].family);
          },
          (error: unknown) =>
            callback(
              error instanceof Error
                ? error
                : new Error("Recipe host could not be resolved."),
              [],
            ),
        );
      },
    },
  });
}

export async function safeFetch(
  rawUrl: string,
  maximumBytes: number,
  expected: "html" | "image" | "json",
  deadline?: number,
): Promise<ImportResponse> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new ImportFailure("invalid_url", "Invalid URL.");
  }

  const dispatcher = publicNetworkDispatcher();
  try {
    for (
      let redirects = 0;
      redirects <= RECIPE_IMPORT_LIMITS.redirects;
      redirects += 1
    ) {
      assertPublicUrlShape(current);
      const timeout = Math.min(
        RECIPE_IMPORT_LIMITS.fetchTimeoutMs,
        deadline === undefined ? Infinity : deadline - Date.now(),
      );
      if (timeout <= 0) {
        throw new ImportFailure("timed_out", "Source acquisition timed out.");
      }
      let response: ImportResponse;
      try {
        response = await fetch(current, {
          dispatcher,
          redirect: "manual",
          signal: AbortSignal.timeout(Math.ceil(timeout)),
          headers: {
            accept:
              expected === "html"
                ? "text/html,application/xhtml+xml"
                : expected === "json"
                  ? "application/json"
                  : "image/avif,image/webp,image/png,image/jpeg",
            "user-agent": "FoodedoRecipeImporter/2.0 (+https://foodedo.com)",
          },
        });
      } catch (error) {
        console.warn("recipe_import_network_failure", {
          stage: "fetch",
          expected,
          reason: networkFailureReason(error),
        });
        if (hasErrorCode(error, "EUNSAFEADDRESS")) {
          throw new ImportFailure(
            "unsafe_url",
            "Private addresses are not allowed.",
          );
        }
        throw new ImportFailure(
          "source_unreachable",
          "Recipe source could not be reached.",
        );
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {});
        const location = response.headers.get("location");
        if (!location || redirects === RECIPE_IMPORT_LIMITS.redirects) {
          throw new ImportFailure("source_unreachable", "Too many redirects.");
        }
        try {
          current = new URL(location, current);
        } catch {
          throw new ImportFailure(
            "source_unreachable",
            "Source returned an invalid redirect.",
          );
        }
        continue;
      }
      // From this point every rejection must release the response as well as
      // its connection, not just the successful body-reader path.
      responseDispatchers.set(response, dispatcher);
      if (!response.ok) {
        console.warn("recipe_import_network_failure", {
          stage: "response",
          expected,
          status: response.status,
        });
        await discardResponse(response);
        if ([401, 403, 429].includes(response.status)) {
          throw new ImportFailure(
            "source_blocked",
            `Source blocked access with ${response.status}.`,
          );
        }
        throw new ImportFailure(
          "source_unreachable",
          `Source returned ${response.status}.`,
        );
      }
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > maximumBytes) {
        await discardResponse(response);
        throw new ImportFailure("unsupported_content", "Source is too large.");
      }
      return response;
    }
    throw new ImportFailure("source_unreachable", "Too many redirects.");
  } catch (error) {
    await dispatcher.destroy().catch(() => {});
    throw error;
  }
}

/** Cancellation/connection cleanup must never obscure the original failure. */
export async function discardResponse(response: ImportResponse) {
  const dispatcher = responseDispatchers.get(response);
  responseDispatchers.delete(response);
  try {
    await response.body?.cancel();
  } catch {
    // Aborted or already-consumed bodies may reject cancellation.
  } finally {
    await dispatcher?.destroy().catch(() => {});
  }
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (!(error instanceof Error)) return false;
  if ("code" in error && error.code === expectedCode) return true;
  return "cause" in error && hasErrorCode(error.cause, expectedCode);
}

/** Fixed labels only: transport messages may contain URLs or credentials. */
function networkFailureReason(error: unknown): string {
  for (const code of [
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "CERT_HAS_EXPIRED",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "EUNSAFEADDRESS",
    "ERR_ASSERTION",
  ]) {
    if (hasErrorCode(error, code)) return code;
  }
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  return "other";
}

export function assertPublicResolvedAddresses(addresses: string[]) {
  if (
    addresses.length === 0 ||
    addresses.some((address) => isPrivateOrReservedAddress(address))
  ) {
    throw Object.assign(new Error("Private addresses are not allowed."), {
      code: "EUNSAFEADDRESS",
    });
  }
}

export async function readBoundedBytes(
  response: ImportResponse,
  maximumBytes: number,
) {
  const dispatcher = responseDispatchers.get(response);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (response.body === null) return new Uint8Array();
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new ImportFailure("unsupported_content", "Source is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    responseDispatchers.delete(response);
    await dispatcher?.destroy().catch(() => {});
  }
}

export function assertPublicUrlShape(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImportFailure("unsafe_url", "Unsupported URL protocol.");
  }
  if (url.username || url.password) {
    throw new ImportFailure(
      "unsafe_url",
      "Credentials are not allowed in URLs.",
    );
  }
  // WHATWG URLs retain brackets around IPv6 literals; net.isIP does not.
  // Literal addresses bypass socket DNS lookup, so reject them here as well.
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    (isIP(hostname) !== 0 && isPrivateOrReservedAddress(hostname))
  ) {
    throw new ImportFailure("unsafe_url", "Private addresses are not allowed.");
  }
}
