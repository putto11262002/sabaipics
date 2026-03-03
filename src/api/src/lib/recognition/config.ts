/**
 * Face Search — Tunable Parameters
 *
 * Single source of truth for all face recognition search settings.
 * Change values here; consumers import from this module.
 */

/** Minimum cosine similarity (0-1) to consider a match. ArcFace 512-D typical same-person range: 0.3–0.7. */
export const FACE_SEARCH_MIN_SIMILARITY = 0.3;

/** Maximum photo matches to return per search. */
export const FACE_SEARCH_MAX_RESULTS = 50;

/** HNSW ef_search — higher = better recall, slower query. PG default is ~40. */
export const FACE_SEARCH_EF_SEARCH = 200;
