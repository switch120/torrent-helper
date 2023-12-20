import transmission from "./modules/transmission";

console.clear();
console.log("Starting Torrent-Helper Daemon ...");

transmission.cleanup();

// run every 30s
setInterval(transmission.cleanup, 30*1000);