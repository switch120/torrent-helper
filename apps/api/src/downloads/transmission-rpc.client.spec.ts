import { describe, expect, it } from "vitest";
import { TransmissionRpcClient } from "./transmission-rpc.client";

describe("TransmissionRpcClient", () => {
  it("adds a magnet link with the selected download directory", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const client = new TransmissionRpcClient({
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(String(init.body)));
        return jsonResponse({
          result: "success",
          arguments: {
            "torrent-added": {
              id: 12,
              name: "Sample Film",
              hashString: "abc",
            },
          },
        });
      },
    });

    const result = await client.addMagnet("magnet:?xt=urn:btih:abc", "/data/Movies/Sourced");

    expect(requests[0]).toEqual({
      method: "torrent-add",
      arguments: {
        filename: "magnet:?xt=urn:btih:abc",
        "download-dir": "/data/Movies/Sourced",
        labels: ["release-hub"],
      },
    });
    expect(result).toEqual({ id: 12, name: "Sample Film", hashString: "abc", duplicate: false });
  });

  it("maps torrent status fields for the downloads view", async () => {
    const client = new TransmissionRpcClient({
      fetchImpl: async () =>
        jsonResponse({
          result: "success",
          arguments: {
            torrents: [
              {
                id: 1,
                name: "Active",
                status: 4,
                percentDone: 0.5,
                rateDownload: 1024,
                rateUpload: 512,
                eta: 60,
                downloadDir: "/data/Movies/Sourced",
                totalSize: 1000,
                downloadedEver: 250,
                uploadedEver: 50,
                leftUntilDone: 750,
                peersConnected: 12,
                peersSendingToUs: 3,
                peersGettingFromUs: 1,
                uploadRatio: 0.2,
                errorString: "",
                labels: ["release-hub"],
                magnetLink: "magnet:?xt=urn:btih:abc",
              },
            ],
          },
        }),
    });

    await expect(client.getDownloads()).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        name: "Active",
        status: "downloading",
        percentDone: 0.5,
        rateDownload: 1024,
        rateUpload: 512,
        eta: 60,
        downloadDir: "/data/Movies/Sourced",
        totalSize: 1000,
        downloadedEver: 250,
        uploadedEver: 50,
        leftUntilDone: 750,
        peersConnected: 12,
        peersSendingToUs: 3,
        peersGettingFromUs: 1,
        uploadRatio: 0.2,
      }),
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}
