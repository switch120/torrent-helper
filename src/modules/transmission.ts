const Transmission = require("transmission");
import database from "./firebase";

const tr = new Transmission();

const _getActiveTorrents = function() {
    return new Promise((resolve, reject) => {
        tr.get((err: any, data: any) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(data.torrents);
        });
    });
}

export default {
    transmission: tr,
    addTorrents: (torrents: any, options?: any) => {
        return new Promise((resolve, reject) => {
            if (!torrents) resolve();

            let promises:Promise<any>[] = [];
            Object.keys(torrents).forEach((k:string) => {
                promises.push(new Promise((_resolve, _reject) => {
                    let torrent = torrents[k];

                    console.log("Found new Torrent; starting download: ", torrent.url);

                    tr.add(torrent.url, {
                        "download-dir": "/downloads",
                        ...options
                    }, async (err:any, result:any) => {
                        if (err) {
                            _reject(err);
                            return;
                        }

                        // update the torrent with the transmission id
                        await database.ref(`/torrents/${k}`).update({
                            trnsId: result.id
                        });
        
                        _resolve(result);
                    });
                }));
            });

            Promise.all(promises).then(() => resolve()).catch(() => reject());
        });
    },
    getActiveTorrents: _getActiveTorrents,
    cleanup: async function() {
        try {
            let torrents = (<any[]>await _getActiveTorrents());
            torrents && torrents.forEach(torrent => {
                if (torrent.status !== 6) return;
                tr.remove(torrent.id, (err:any, data:any) => {
                    console.log("Torrent cleaned: ", torrent);
                })
            });
        }
        catch (exc) {
            console.log("Cleanup error: ", exc);
        }
    }
};