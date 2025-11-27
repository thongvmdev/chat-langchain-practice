/**
 * Playwright loader utilities.
 *
 * Provides functions to load documents from JavaScript-rendered sites using Playwright.
 */

import { PlaywrightWebBaseLoader } from '@langchain/community/document_loaders/web/playwright'
import { RecursiveUrlLoader } from '@langchain/community/document_loaders/web/recursive_url'
import { Document } from '@langchain/core/documents'
import type { CheerioAPI } from 'cheerio'
import { reactDevExtractor, extractMetadata } from '../parser.js'

/**
 * Options for loading documents with Playwright.
 */
export interface PlaywrightLoaderOptions {
  /** Function to extract content from HTML using cheerio */
  extractor?: (html: string | CheerioAPI) => string
  /** Maximum number of pages to load (for rate limiting) */
  maxPages?: number
  /** Timeout for page load in milliseconds */
  timeout?: number
  /** Wait until option for page load */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  /** Whether to extract metadata from HTML */
  extractMetadata?: boolean
}

/**
 * Load documents from URLs using Playwright (for JavaScript-rendered sites).
 *
 * This function uses PlaywrightWebBaseLoader to load pages with JavaScript
 * execution, then processes the rendered HTML with cheerio extractors.
 * Useful for React, Vue, or other client-side rendered sites.
 *
 * @param urls - Array of URLs to load
 * @param options - PlaywrightLoaderOptions
 * @returns Array of loaded documents with extracted content
 */
export async function loadFromPlaywright(
  urls: string[],
  options: PlaywrightLoaderOptions = {},
): Promise<Document[]> {
  const {
    extractor = reactDevExtractor,
    maxPages,
    timeout = 30000,
    waitUntil = 'networkidle',
    extractMetadata: shouldExtractMetadata = true,
  } = options

  console.log(`Loading ${urls.length} documents with Playwright...`)
  if (maxPages) {
    console.log(`Limiting to ${maxPages} pages`)
  }

  const documents: Document[] = []
  const urlsToLoad = maxPages ? urls.slice(0, maxPages) : urls

  for (let i = 0; i < urlsToLoad.length; i++) {
    const url = urlsToLoad[i]
    console.log(`Loading [${i + 1}/${urlsToLoad.length}]: ${url}`)

    try {
      // Use PlaywrightWebBaseLoader to get rendered HTML (after JS execution)
      const loader = new PlaywrightWebBaseLoader(url, {
        gotoOptions: {
          timeout,
          waitUntil,
        },
        // Use evaluate to get the full HTML after rendering
        // Wait for React/content to be fully rendered before extracting HTML
        evaluate: async (page) => {
          // Wait for content to be rendered (React sites need time to hydrate)
          await page.waitForTimeout(2000) // Wait 2s for React to render
          return await page.content()
        },
      })

      // Load the page - this returns HTML string in pageContent
      const docs = await loader.load()

      if (docs.length === 0 || !docs[0].pageContent) {
        console.warn(`No content extracted from ${url}`)
        continue
      }

      // Process HTML with cheerio extractor
      const html = docs[0].pageContent
      const extractedText = extractor(html)

      if (!extractedText || extractedText.trim().length === 0) {
        console.warn(`Empty content extracted from ${url}`)
        continue
      }

      // Extract metadata from HTML if requested
      let metadata: Record<string, string> = {}
      if (shouldExtractMetadata) {
        metadata = extractMetadata(html)
      }

      documents.push(
        new Document({
          pageContent: extractedText,
          metadata: {
            source: url,
            ...docs[0].metadata,
            ...metadata,
          },
        }),
      )

      console.log(`✓ Processed: ${url} (${extractedText.length} chars)`)
    } catch (error) {
      console.error(`Failed to load ${url}:`, error)
      // Continue with next URL instead of failing completely
    }
  }

  console.log(`✓ Loaded ${documents.length} documents with Playwright`)
  return documents
}

/**
 * Options for recursive Playwright loading.
 */
export interface PlaywrightRecursiveOptions {
  maxDepth?: number
  excludeDirs?: string[]
  preventOutside?: boolean
  timeout?: number
  extractor?: (html: string | CheerioAPI) => string
  maxPages?: number
}

/**
 * Load documents recursively using Playwright (for JavaScript-rendered sites).
 *
 * First discovers URLs using RecursiveUrlLoader (without content extraction),
 * then loads each URL with PlaywrightWebBaseLoader for proper JS rendering.
 *
 * @param baseUrl - Starting URL for recursive crawling
 * @param options - Options for both URL discovery and Playwright loading
 * @returns Array of loaded documents with extracted content
 */
export async function loadFromPlaywrightRecursive(
  baseUrl: string,
  options: PlaywrightRecursiveOptions = {},
): Promise<Document[]> {
  console.log(`Discovering URLs recursively from: ${baseUrl}`)

  const {
    maxDepth = 3,
    excludeDirs = [],
    preventOutside = true,
    timeout = 15000,
    extractor = reactDevExtractor,
    maxPages,
  } = options

  // Step 1: Discover URLs using RecursiveUrlLoader (just to get URLs)
  const urlLoader = new RecursiveUrlLoader(baseUrl, {
    maxDepth,
    excludeDirs,
    preventOutside,
    timeout,
  })

  console.log('Discovering URLs...')
  const urlDocs = await urlLoader.load()
  const discoveredUrls = urlDocs
    .map((doc) => doc.metadata.source)
    .filter((url) => url.startsWith(baseUrl))

  console.log(`Discovered ${discoveredUrls.length} URLs`)

  if (discoveredUrls.length === 0) {
    throw new Error('No URLs discovered! Check your base URL and options.')
  }

  // Step 2: Load each URL with Playwright for proper JS rendering
  return loadFromPlaywright(discoveredUrls, {
    extractor,
    maxPages,
    timeout: timeout * 2, // Give Playwright more time
    waitUntil: 'networkidle',
    extractMetadata: true,
  })
}

