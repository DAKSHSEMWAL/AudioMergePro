let metadataParserPromise;

const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2/recording';
const COVER_ART_BASE_URL = 'https://coverartarchive.org/release';
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

const createEmptyMetadata = () => ({
  title: '',
  artist: '',
  album: '',
  codec: '',
  bitrate: 0,
  sampleRate: 0,
  artworkUrl: null,
  artworkFallbackUrls: [],
});

const appendUniqueUrls = (urls) => {
  return [...new Set((urls || []).filter(Boolean))];
};

const stripExtension = (fileName) => fileName.replace(/\.[^.]+$/, '');

const cleanSearchText = (value) => {
  return value
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b\d{3,4}kbps\b/gi, ' ')
    .replace(/\b(remaster(ed)?|explicit|official|audio|video|lyrics?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const buildSearchCandidates = (file, metadata) => {
  const candidates = [];
  const cleanedFileName = cleanSearchText(stripExtension(file.name));

  if (metadata.title && metadata.artist) {
    candidates.push(`${metadata.title} ${metadata.artist}`);
  }

  if (metadata.title) {
    candidates.push(metadata.title);
  }

  if (cleanedFileName) {
    candidates.push(cleanedFileName);
  }

  return [...new Set(candidates)].filter(Boolean);
};

const shouldUseOnlineLookup = (metadata) => {
  return !(metadata.title && metadata.artist && metadata.album && metadata.artworkUrl);
};

const normalizeCompareText = (value) => {
  return cleanSearchText((value || '').toLowerCase());
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Metadata lookup failed with status ${response.status}`);
  }

  return response.json();
};

const fetchCoverArt = async (releaseId) => {
  if (!releaseId) return null;

  try {
    const response = await fetch(`${COVER_ART_BASE_URL}/${releaseId}/front-250`);
    if (!response.ok) return null;
    return response.url;
  } catch {
    return null;
  }
};

const pickBestItunesResult = (results, metadata, candidate) => {
  const normalizedTitle = normalizeCompareText(metadata.title);
  const normalizedArtist = normalizeCompareText(metadata.artist);
  const normalizedCandidate = normalizeCompareText(candidate);

  return results
    .map((result) => {
      let score = 0;
      const trackName = normalizeCompareText(result.trackName);
      const artistName = normalizeCompareText(result.artistName);
      const collectionName = normalizeCompareText(result.collectionName);

      if (normalizedTitle && trackName === normalizedTitle) score += 5;
      if (normalizedTitle && trackName.includes(normalizedTitle)) score += 3;
      if (normalizedArtist && artistName === normalizedArtist) score += 5;
      if (normalizedArtist && artistName.includes(normalizedArtist)) score += 3;
      if (normalizedCandidate && `${trackName} ${artistName}`.includes(normalizedCandidate)) score += 2;
      if (collectionName && normalizedCandidate && collectionName.includes(normalizedCandidate)) score += 1;

      return { result, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.result;
};

const lookupMetadataInItunes = async (file, metadata) => {
  const searchCandidates = buildSearchCandidates(file, metadata);

  for (const candidate of searchCandidates) {
    try {
      const query = encodeURIComponent(candidate);
      const response = await fetchJson(`${ITUNES_SEARCH_URL}?media=music&entity=song&limit=10&term=${query}`);
      const bestMatch = pickBestItunesResult(response.results || [], metadata, candidate);

      if (!bestMatch) {
        continue;
      }

      const artworkUrl = metadata.artworkUrl
        || bestMatch.artworkUrl100?.replace(/100x100bb|100x100/gi, '600x600bb');

      return {
        title: metadata.title || bestMatch.trackName || '',
        artist: metadata.artist || bestMatch.artistName || '',
        album: metadata.album || bestMatch.collectionName || '',
        codec: metadata.codec,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        artworkUrl: artworkUrl || null,
        artworkFallbackUrls: appendUniqueUrls([
          artworkUrl,
          bestMatch.artworkUrl100,
          bestMatch.artworkUrl60,
        ]),
      };
    } catch (error) {
      console.warn('iTunes metadata lookup failed:', error);
    }
  }

  return metadata;
};

const lookupMetadataOnline = async (file, metadata) => {
  const itunesMetadata = await lookupMetadataInItunes(file, metadata);
  if (!shouldUseOnlineLookup(itunesMetadata)) {
    return itunesMetadata;
  }

  const searchCandidates = buildSearchCandidates(file, itunesMetadata);

  for (const candidate of searchCandidates) {
    try {
      const query = encodeURIComponent(candidate);
      const result = await fetchJson(`${MUSICBRAINZ_BASE_URL}?query=${query}&fmt=json&limit=5`);
      const bestMatch = result.recordings?.find((recording) => recording.score >= 70) ?? result.recordings?.[0];

      if (!bestMatch) {
        continue;
      }

      const release = bestMatch.releases?.[0];
      const artistCredit = bestMatch['artist-credit']?.map((artistEntry) => artistEntry.name).join(', ') || '';
      const artworkUrl = itunesMetadata.artworkUrl || await fetchCoverArt(release?.id);

      const enrichedMetadata = {
        title: itunesMetadata.title || bestMatch.title || '',
        artist: itunesMetadata.artist || artistCredit,
        album: itunesMetadata.album || release?.title || '',
        codec: itunesMetadata.codec,
        bitrate: itunesMetadata.bitrate,
        sampleRate: itunesMetadata.sampleRate,
        artworkUrl,
        artworkFallbackUrls: appendUniqueUrls([
          ...(itunesMetadata.artworkFallbackUrls || []),
          artworkUrl,
        ]),
      };

      if (!enrichedMetadata.artworkUrl) {
        return lookupMetadataInItunes(file, enrichedMetadata);
      }

      return enrichedMetadata;
    } catch (error) {
      console.warn('Online metadata lookup failed:', error);
    }
  }

  return itunesMetadata;
};

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const buildArtworkDataUrl = (picture) => {
  if (!picture?.data?.length || !picture.format) return null;

  const bytes = picture.data instanceof Uint8Array ? picture.data : new Uint8Array(picture.data);
  const base64 = bytesToBase64(bytes);
  return `data:${picture.format};base64,${base64}`;
};

export const extractTrackMetadata = async (file) => {
  let localMetadata = createEmptyMetadata();

  try {
    const { parseBlob } = await preloadTrackMetadataParser();
    const metadata = await parseBlob(file, { skipPostHeaders: true });
    const picture = metadata.common.picture?.[0];

    localMetadata = {
      title: metadata.common.title || '',
      artist: metadata.common.artist || '',
      album: metadata.common.album || '',
      codec: metadata.format.codec || metadata.format.container || '',
      bitrate: metadata.format.bitrate || 0,
      sampleRate: metadata.format.sampleRate || 0,
      artworkUrl: buildArtworkDataUrl(picture),
      artworkFallbackUrls: appendUniqueUrls([buildArtworkDataUrl(picture)]),
    };
  } catch (error) {
    console.warn('Unable to read track metadata:', error);
  }

  if (!shouldUseOnlineLookup(localMetadata)) {
    return localMetadata;
  }

  return lookupMetadataOnline(file, localMetadata);
};

export const preloadTrackMetadataParser = () => {
  if (!metadataParserPromise) {
    metadataParserPromise = import('music-metadata-browser');
  }

  return metadataParserPromise;
};