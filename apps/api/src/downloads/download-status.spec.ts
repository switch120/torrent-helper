import { describe, expect, it } from "vitest";
import { buildDownloadStatus } from "./download-status";
import type { TransmissionDownload } from "./download.types";

describe("buildDownloadStatus", () => {
  it("hides the permanent WhatIsMyIP torrent and reports a healthy proxy when IPs differ", () => {
    const response = buildDownloadStatus(
      [
        download({
          id: 1,
          name: "WhatIsMyIP.net - Torrent Tracker IP Checker",
          errorString: "IP: 140.228.24.168",
        }),
        download({ id: 2, name: "GOAT 2026 1080p" }),
      ],
      "73.10.20.30",
      new Date("2026-05-18T13:00:00.000Z"),
    );

    expect(response.downloads.map((item) => item.name)).toEqual(["GOAT 2026 1080p"]);
    expect(response.proxy).toEqual({
      status: "up",
      proxyIp: "140.228.24.168",
      publicIp: "73.10.20.30",
      checkedAt: "2026-05-18T13:00:00.000Z",
      warning: null,
    });
  });

  it("marks the proxy down when the tracker reports the same public IP", () => {
    const response = buildDownloadStatus(
      [download({ name: "WhatIsMyIP.net - Torrent Tracker IP Checker", errorString: "IP: 73.10.20.30" })],
      "73.10.20.30",
      new Date("2026-05-18T13:00:00.000Z"),
    );

    expect(response.downloads).toEqual([]);
    expect(response.proxy.status).toBe("down");
    expect(response.proxy.warning).toBe("Proxy checker is reporting the same IP as the public connection.");
  });

  it("reports unknown status when the checker torrent is missing", () => {
    const response = buildDownloadStatus(
      [download({ name: "Regular torrent" })],
      "73.10.20.30",
      new Date("2026-05-18T13:00:00.000Z"),
    );

    expect(response.downloads).toHaveLength(1);
    expect(response.proxy).toMatchObject({
      status: "unknown",
      proxyIp: null,
      publicIp: "73.10.20.30",
      warning: "Proxy checker torrent was not found.",
    });
  });
});

function download(overrides: Partial<TransmissionDownload>): TransmissionDownload {
  return {
    id: 1,
    name: "Torrent",
    status: "downloading",
    rawStatus: 4,
    percentDone: 0,
    rateDownload: 0,
    rateUpload: 0,
    eta: -1,
    downloadDir: "/data",
    totalSize: 0,
    downloadedEver: 0,
    uploadedEver: 0,
    leftUntilDone: 0,
    peersConnected: 0,
    peersSendingToUs: 0,
    peersGettingFromUs: 0,
    uploadRatio: 0,
    errorString: null,
    labels: [],
    magnetLink: null,
    ...overrides,
  };
}
