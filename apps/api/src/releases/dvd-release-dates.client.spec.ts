import { describe, expect, it } from "vitest";
import { DvdReleaseDatesClient } from "./dvd-release-dates.client";

describe("DvdReleaseDatesClient", () => {
  it("parses monthly Digital HD rows into dated movie releases", async () => {
    const client = new DvdReleaseDatesClient({
      baseUrl: "https://www.dvdsreleasedates.test",
      fetchImpl: async () => new Response(`
        <table class='fieldtable-inner'>
          <tr><td colspan='5' class='reldate past'><a id='week22'></a>Tuesday May 26, 2026<div class='distance'>(this week)</div></td></tr>
          <tr><td colspan='5' class='reltype'></td></tr>
          <td class='dvdcell'>
            <a href='/movies/12740/over-your-dead-body'><img class='movieimg' alt='Over Your Dead Body DVD Release Date' src='/posters/110/O/Over-Your-Dead-Body-2026.jpg'/></a><br/>
            <a style='color:#000;' href='/movies/12740/over-your-dead-body'>Over Your Dead Body</a><br/>
            <table class='celldiscs'><tr><td class='imdblink left'>imdb: <a href='http://www.imdb.com/title/tt34685692/' target='_blank' rel='nofollow'>6.8</a></td><td class='imdblink right'>R&nbsp;&nbsp;</td></tr></table>
          </td>
        </table>
      `),
    });

    await expect(
      client.getDigitalMovieReleases({
        weekStart: "2026-05-25",
        weekEnd: "2026-05-31",
      }),
    ).resolves.toEqual({
      releases: [
        {
          sourceTitleId: 12740,
          title: "Over Your Dead Body",
          releaseDate: "2026-05-26",
          detailUrl: "https://www.dvdsreleasedates.test/movies/12740/over-your-dead-body",
          posterUrl: "https://www.dvdsreleasedates.test/posters/110/O/Over-Your-Dead-Body-2026.jpg",
          imdbId: "tt34685692",
          imdbRating: 6.8,
          contentRating: "R",
        },
      ],
      raw: expect.objectContaining({
        months: ["2026-05"],
      }),
    });
  });
});
