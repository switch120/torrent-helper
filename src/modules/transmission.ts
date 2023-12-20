const Transmission = require("transmission");

const tr = new Transmission({
  host: process.env.CONTAINERIZED ? "torrentHost" : "localhost"
});

const _getActiveTorrents = function () {
  console.log("Fetching active torrents ...");

  return new Promise((resolve, reject) => {
    tr.get((err: any, data: any) => {
      if (err) {
        console.error(err);
        return reject(err);
      }
      
      console.log(`[Done] Found ${data.torrents.length} active torrents.`);
      resolve(data.torrents);
    });
  });
}

export default {
  transmission: tr,
  getActiveTorrents: _getActiveTorrents,
  cleanup: async function () {
    try {
      let torrents = (<any[]>await _getActiveTorrents());
      torrents && torrents.forEach(torrent => {
        if (torrent.status !== 6) return;

        console.log(`Cleaning completed torrent: ${torrent}`)

        tr.remove(torrent.id, (err: any, data: any) => {
          console.log("[Done] Torrent cleaned: ", torrent);
        })
      });
    }
    catch (exc) {
      console.log("Cleanup error: ", exc);
    }
  }
};