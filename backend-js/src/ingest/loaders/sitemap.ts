/**
 * Sitemap loader utilities.
 *
 * Provides functions to load documents from XML sitemaps.
 */

import { Document } from '@langchain/core/documents'
import type { CheerioAPI } from 'cheerio'
import { FixedSitemapLoader } from '../FixedSitemapLoader.js'
import { simpleExtractor } from '../parser.js'

/**
 * Load documents from a sitemap and extract content.
 *
 * @param sitemapUrl - URL of the sitemap to load
 * @param filterUrls - Array of URL patterns to filter (optional)
 * @param extractor - Function to extract content from HTML
 * @returns Array of loaded documents
 */
export async function loadFromSitemap(
  sitemapUrl: string,
  filterUrls?: string[],
  extractor: (html: string | CheerioAPI) => string = simpleExtractor,
): Promise<Document[]> {
  console.log(`Loading documents from sitemap: ${sitemapUrl}`)

  // Use FixedSitemapLoader to load documents from sitemap
  // This fixes a bug in the original SitemapLoader where filterUrls has inverted logic
  // Convert filter URLs to regex patterns that match the URL
  // Escape special regex characters in URLs for literal matching
  const filterRegexes = filterUrls?.map((url) => {
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(escapedUrl)
  })

  const loader = new FixedSitemapLoader(sitemapUrl, {
    filterUrls: filterRegexes,
    extractor, // Pass the custom extractor
  })

  console.log('Loading documents from sitemap...')
  console.log(
    `Filter patterns: ${filterUrls?.join(', ') || 'none (loading all)'}`,
  )

  try {
    // FixedSitemapLoader now handles content extraction and metadata during load
    // It uses the provided extractor (or simpleExtractor by default) and extractMetadata internally
    const docs = await loader.load()
    console.log(`Successfully loaded and processed ${docs.length} documents`)
    return docs
  } catch (error) {
    console.error('Error loading from sitemap:', error)
    throw error
  }
}
