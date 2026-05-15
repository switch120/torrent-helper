import {
  createTransmissionClientFromEnv,
  TransmissionTorrent,
} from "./transmission-rpc";

const client = createTransmissionClientFromEnv();

const _getActiveTorrents = async function (): Promise<TransmissionTorrent[]> {
  console.log("Fetching active torrents ...");

  const torrents = await client.getActiveTorrents();
  console.log(`[Done] Found ${torrents.length} active torrents.`);

  return torrents;
}

export default {
  transmission: client,
  getActiveTorrents: _getActiveTorrents,
  cleanup: async function () {
    try {
      const torrents = await _getActiveTorrents();
      for (const torrent of torrents) {
        if (torrent.status !== 6) continue;

        console.log(`Cleaning completed torrent: ${torrent.id}`)

        await client.removeTorrent(torrent.id);
        console.log("[Done] Torrent cleaned: ", torrent);
      }
    }
    catch (exc) {
      console.log("Cleanup error: ", exc);
    }
  }
};
