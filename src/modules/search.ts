import database from "./firebase";
import stringSimilarity  from 'string-similarity';
const rarbgApi = require('rarbg-api');

require("dotenv").config();

export interface ISearchCollection {
    current: string;
    history: any;
}

export interface ISearch {
    term: string;
    timestamp?: number;
}

export class TorrentSearch {
    public static async getCollection(): Promise<ISearchCollection> {
        return await database.ref("/search").once("value").then(snapshot => snapshot.val());
    }
    public static async setCurrent(value:string) {
        return await database.ref("/search").update({ current: value });
    }
    public static async addHistory(search:ISearch) {
        // check to see if the normalized term already exists
        const coll = await this.getCollection();
        
        if (coll && coll.history && !Object.keys(coll.history).map(key => coll.history[key]).filter(h => {
            // const normalizePattern = /[+\-"';:.\(\)\[\]]/i;
            // return h.term.replace(normalizePattern, "").toLowerCase() != search.term.replace(normalizePattern, "").toLowerCase();
            const threshold = parseFloat(process.env.SEARCH_SIMILARITY_THRESHOLD || "") || .8;
            const similarity = stringSimilarity.compareTwoStrings(h.term, search.term);

            if (similarity) console.log(`History term '${h.term}' matched '${search.term}' : ${Math.round(similarity*100)}% certainty`);

            return similarity <= threshold; 
        }).length) return false;

        search.term = search.term.trim();

        console.log("Adding search history: ", search.term);
        return await database.ref("/search/history").push().set({ 
            ...search, timestamp: new Date().getTime()
        });
    }  
    public static async populateResults() {
        const coll = await this.getCollection();

        console.log("Populating search results ...");
        
        return rarbgApi.search(coll.current, {
            limit: 50,
            min_seeders: 1
        }).then(async (data:any) => {
            const resultsRef = database.ref("search/results");

            // clear the emphemeral results
            await resultsRef.remove();
        
            data.forEach((r:any) => {
                console.log(r.title, `${Math.round(r.size/1024/1024)}mb`, `Seeders: ${r.seeders}`);
                resultsRef.push().set(r);
            });
        
        }, (err:any) => console.log(err));
    }  
    public static async getResults() {
        return await database.ref("search/results").once("value").then(s => s.val());
    }
}