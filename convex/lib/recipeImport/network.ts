"use node";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch, interceptors, type Dispatcher } from "undici";

import { isPrivateOrReservedAddress } from "../../../src/lib/domain/recipe-import";
import { ImportFailure, RECIPE_IMPORT_LIMITS } from "./contracts";

export type ImportResponse = Awaited<ReturnType<typeof fetch>>;
const responseDispatchers = new WeakMap<ImportResponse, Dispatcher>();

/**
 * Fetch through an Undici DNS interceptor so the address validated here is the
 * same address used by the connection. This avoids a validate-then-resolve
 * DNS-rebinding gap without mutating Node's global dispatcher.
 */
function publicNetworkDispatcher(): Dispatcher {
  return new Agent().compose(
    interceptors.dns({
      maxTTL: 1,
      maxItems: 1,
      lookup(origin, _options, callback) {
        void lookup(origin.hostname, { all: true, verbatim: true }).then(
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
            callback(
              null,
              addresses.map(({ address, family }) => ({
                address,
                family: family === 6 ? 6 : 4,
                ttl: 1,
              })),
            );
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
    }),
  );
}

export async function safeFetch(
  rawUrl: string,
  maximumBytes: number,
  expected: "html" | "image",
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
      let response: ImportResponse;
      try {
        response = await fetch(current, {
          dispatcher,
          redirect: "manual",
          signal: AbortSignal.timeout(RECIPE_IMPORT_LIMITS.fetchTimeoutMs),
          headers: {
            accept:
              expected === "html"
                ? "text/html,application/xhtml+xml"
                : "image/avif,image/webp,image/png,image/jpeg",
            "user-agent": "FoodedoRecipeImporter/2.0 (+https://foodedo.com)",
          },
        });
      } catch (error) {
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
        await response.body?.cancel();
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
      if (!response.ok) {
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
        throw new ImportFailure("unsupported_content", "Source is too large.");
      }
      responseDispatchers.set(response, dispatcher);
      return response;
    }
    throw new ImportFailure("source_unreachable", "Too many redirects.");
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (!(error instanceof Error)) return false;
  if ("code" in error && error.code === expectedCode) return true;
  return "cause" in error && hasErrorCode(error.cause, expectedCode);
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
  try {
    if (response.body === null) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
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
    responseDispatchers.delete(response);
    if (dispatcher) await dispatcher.close();
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
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    (isIP(hostname) !== 0 && isPrivateOrReservedAddress(hostname))
  ) {
    throw new ImportFailure("unsafe_url", "Private addresses are not allowed.");
  }
}
