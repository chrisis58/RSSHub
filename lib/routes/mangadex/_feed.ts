import got from '@/utils/got';
import { config } from '@/config';
import cache from '@/utils/cache';
import { getFilteredLanguages } from './_profile';
import { toQueryString, firstMatch } from './_utils';
import constants from './_constants';

/**
 * Retrieves the title, description, and cover of a manga.
 *
 * @author chrisis58, vzz64
 * @param id manga id
 * @param lang language(s), absent for default
 * @param needCover whether to fetch cover
 * @returns title, description, and cover of the manga
 */
const getMangaMeta = async (id: string, needCover: boolean = true, lang?: string | string[]) => {
    const includes = needCover ? ['cover_art'] : [];

    const rawMangaMeta = (await cache.tryGet(
        `mangadex:manga-meta:${id}`,
        async () => {
            const { data } = await got.get(
                `${constants.API.MANGA_META}${id}` +
                    toQueryString({
                        includes,
                    })
            );

            if (data.result === 'error') {
                throw new Error(data.errors[0].detail);
            }
            return data.data;
        },
        config.cache.contentExpire
    )) as any;

    const relationships = (rawMangaMeta.relationships || []) as Array<{ type: string; id: string; attributes: any }>;

    const languages = [
        ...(typeof lang === 'string' ? [lang] : lang || []),
        ...(await getFilteredLanguages()),
        rawMangaMeta.attributes.originalLanguage, // fallback to original language
    ].filter(Boolean);

    // combine title and altTitles
    const titles = {
        ...rawMangaMeta.attributes.title,
        ...Object.fromEntries(rawMangaMeta.attributes.altTitles.flatMap((element) => Object.entries(element))),
    };

    const title = firstMatch(titles, languages) as string;

    const description = firstMatch(rawMangaMeta.attributes.description, languages) as string;

    if (!needCover) {
        return { title, description };
    }

    const coverFilename = relationships.find((relationship) => relationship.type === 'cover_art')?.attributes.fileName + '.512.jpg';
    const cover = `${constants.API.COVER_IMAGE}${id}/${coverFilename}`;

    return { title, description, cover };
};

/**
 * Retrieves the chapters of a manga.
 *
 * @author chrisis58, vzz64
 * @param id manga id
 * @param lang language(s), absent for default
 * @returns chapters of the manga
 */
const getMangaChapters = async (id: string, lang?: string | string[], limit?: number) => {
    const languages = new Set([...(typeof lang === 'string' ? [lang] : lang || []), ...(await getFilteredLanguages())].filter(Boolean));

    const url = `${constants.API.MANGA_META}${id}/feed${toQueryString({
        order: {
            publishAt: 'desc',
        },
        limit: limit || 100,
        translatedLanguage: languages,
    })}`;

    const chapters = (await cache.tryGet(`mangadex:manga-chapters:${id}`, async () => {
        const { data } = await got.get(url);

        if (data.result === 'error') {
            throw new Error(data.errors[0].detail);
        }

        return data.data;
    })) as any;

    if (!chapters) {
        return [];
    }

    return chapters.map((chapter) => ({
        title: [chapter.attributes.volume ? `Vol. ${chapter.attributes.volume}` : null, chapter.attributes.chapter ? `Ch. ${chapter.attributes.chapter}` : null, chapter.attributes.title].filter(Boolean).join(' '),
        link: `${constants.API.MANGA_CHAPTERS}${chapter.id}`,
        pubDate: new Date(chapter.attributes.publishAt),
    })) as Array<{ title: string; link: string; pubDate: Date }>;
};

/**
 * Retrieves the title, description, cover, and chapters of a manga.
 * Cominbation of getMangaMeta and getMangaChapters.
 *
 * @param id manga id
 * @param lang language, absent for default
 * @returns title, description, cover, and chapters of the manga
 */
const getMangaDetails = async (id: string, needCover: boolean = true, lang?: string | string[]) => {
    const [meta, chapters] = await Promise.all([getMangaMeta(id, needCover, lang), getMangaChapters(id, lang)]);
    return { ...meta, chapters };
};

export { getMangaMeta, getMangaChapters, getMangaDetails };
