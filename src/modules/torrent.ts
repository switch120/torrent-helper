import fs from 'fs';
import WebTorrent from 'webtorrent';
import readline from 'readline';

require("dotenv").config();

const client = new WebTorrent();
const magnetURI = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent";

client.add(magnetURI, {
    path: `${__dirname}/output`
}, (torrent) => {

    let clean = false;

    // Got torrent metadata!
    console.log('Client download started!');

    const torrentFiles = torrent.files.filter(f => f.name.match(/mp4$/));

    torrent.on("download", val => {

        let pieces = [];

        torrentFiles.forEach((file, idx) => {
            pieces.push(`${file.name} : ${Math.round(file.downloaded / 1024 / 1024)}/${Math.round(file.length / 1024 / 1024)}mb - ${Math.round(torrent.progress * 100)}% Complete ...`);
        });

        // once each file has been allocated - clean up the ones we don't want
        if (!clean && torrent.files.filter(f => f.downloaded > 0).length == torrent.files.length)
        {
            console.log("\nAllocations complete. Cleaning up excluded files ...");
            torrent.files.forEach((file, idx) => {
                if (torrentFiles.indexOf(file) == -1)
                {
                    file.deselect();
                    fs.unlinkSync(`${__dirname}/output/${file.path}`);
                    console.log(`Excluding ${file.name}`);
                }
                else
                {
                    console.log(`Adding ${file.name} to queue`);
                    file.select();
                }
            });

            clean = true;
        }

        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);

        pieces.push(`Total Progress: ${Math.round(torrent.progress * 100)}% Complete ...`);

        process.stdout.write(pieces.join(" | "));
    });

    torrent.on("done", () => {
        console.log("Finished!");
        process.exit(0);
    });
});