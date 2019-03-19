import database from "./modules/firebase";
import transmission from "./modules/transmission";
import cron from "node-cron";

console.clear();
console.log("Starting Torrent-Helper Daemon ...");

let promises = [];

let url:string;
if (url = process.argv[2]) {
    // push a torrent url by hand in dev mode by passing a command line argument
    promises.push(database.ref("torrents").push().set({
        url: url,
        added: new Date().getTime(),
        trnsId: null,
        folder: process.argv[3] || null
    }));
}

Promise.all(promises).then(() => {
    // get all the torrents - find any new ones (w/o transmission ids)
    database.ref("/torrents").orderByChild("trnsId").equalTo(null).on("value", async (snapshot) => {
        if (!snapshot) return;
        // add any new torrents (should only ever be one, but api supports multiple)
        transmission.addTorrents(snapshot.val());
    });

    // run every 60s
    cron.schedule("* * * * *", transmission.cleanup);
});