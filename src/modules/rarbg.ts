const rarbgApi = require('rarbg-api');

rarbgApi.search(process.argv[2], {
    limit: 50,
    min_seeders: 1
}).then(data => {
    const sorted = data.sort((a,b) => a.size < b.size);

    sorted.forEach(r => {
        console.log(r.download, `${Math.round(r.size/1024/1024)}mb`, `Seeders: ${r.seeders}`);
    });

}, err => console.log(err));