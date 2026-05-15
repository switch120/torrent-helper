import test from "node:test";
import assert from "node:assert/strict";

import { TransmissionRpcClient } from "./transmission-rpc";

type CapturedRequest = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function captureFetch(responses: Response[]) {
  const requests: CapturedRequest[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input.toString(),
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: JSON.parse(String(init?.body)),
    });

    const response = responses.shift();
    if (!response) {
      throw new Error("No test response configured");
    }

    return response;
  };

  return { fetchImpl, requests };
}

test("sends torrent-get and returns active torrents", async () => {
  const { fetchImpl, requests } = captureFetch([
    jsonResponse({
      result: "success",
      arguments: { torrents: [{ id: 1, name: "Ubuntu ISO", status: 4 }] },
    }),
  ]);
  const client = new TransmissionRpcClient({
    host: "transmission",
    port: 9091,
    fetchImpl,
  });

  const torrents = await client.getActiveTorrents();

  assert.deepEqual(torrents, [{ id: 1, name: "Ubuntu ISO", status: 4 }]);
  assert.equal(requests[0].url, "http://transmission:9091/transmission/rpc");
  assert.deepEqual(requests[0].body, {
    method: "torrent-get",
    arguments: { fields: ["id", "name", "status"] },
  });
});

test("retries once with the Transmission session id after a 409 response", async () => {
  const { fetchImpl, requests } = captureFetch([
    new Response(null, {
      status: 409,
      headers: { "x-transmission-session-id": "session-123" },
    }),
    jsonResponse({ result: "success", arguments: { torrents: [] } }),
  ]);
  const client = new TransmissionRpcClient({ fetchImpl });

  await client.getActiveTorrents();

  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["x-transmission-session-id"], undefined);
  assert.equal(requests[1].headers["x-transmission-session-id"], "session-123");
});

test("sends torrent-remove with the expected torrent id", async () => {
  const { fetchImpl, requests } = captureFetch([
    jsonResponse({ result: "success", arguments: {} }),
  ]);
  const client = new TransmissionRpcClient({ fetchImpl });

  await client.removeTorrent(42);

  assert.deepEqual(requests[0].body, {
    method: "torrent-remove",
    arguments: { ids: [42], "delete-local-data": false },
  });
});

test("includes basic auth only when rpc credentials are configured", async () => {
  const withoutAuth = captureFetch([
    jsonResponse({ result: "success", arguments: { torrents: [] } }),
  ]);
  const clientWithoutAuth = new TransmissionRpcClient({
    fetchImpl: withoutAuth.fetchImpl,
  });

  await clientWithoutAuth.getActiveTorrents();

  assert.equal(withoutAuth.requests[0].headers.authorization, undefined);

  const withAuth = captureFetch([
    jsonResponse({ result: "success", arguments: { torrents: [] } }),
  ]);
  const clientWithAuth = new TransmissionRpcClient({
    username: "scott",
    password: "secret",
    fetchImpl: withAuth.fetchImpl,
  });

  await clientWithAuth.getActiveTorrents();

  assert.equal(
    withAuth.requests[0].headers.authorization,
    `Basic ${Buffer.from("scott:secret").toString("base64")}`,
  );
});
