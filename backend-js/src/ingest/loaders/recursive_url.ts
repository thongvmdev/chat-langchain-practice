/**
 * Recursive URL loader utilities.
 *
 * Provides functions to load documents by recursively crawling URLs.
 */

import {
  RecursiveUrlLoader,
  RecursiveUrlLoaderOptions,
} from '@langchain/community/document_loaders/web/recursive_url'
import { Document } from '@langchain/core/documents'
import { extractMetadata } from '../parser.js'

/**
 * Load documents recursively from a base URL.
 *
 * @param baseUrl - Starting URL for recursive crawling
 * @param options - RecursiveUrlLoaderOptions
 * @returns Array of loaded documents
 */
export async function loadFromRecursiveUrl(
  baseUrl: string,
  options: RecursiveUrlLoaderOptions,
): Promise<Document[]> {
  console.log(`Loading documents recursively from: ${baseUrl}`)

  const { maxDepth, extractor, excludeDirs, preventOutside, timeout } =
    options || {}

  const loader = new RecursiveUrlLoader(baseUrl, {
    maxDepth: maxDepth || 2,
    excludeDirs: excludeDirs || [],
    preventOutside,
    timeout: timeout || 10000,
  })

  console.log('Loading documents recursively...')
  const docs = await loader.load()
  console.log(`Loaded ${docs.length} documents recursively`)

  // Debug: Check what the first document looks like
  if (docs.length > 0) {
    console.log('Sample document:', {
      pageContent: docs[1]?.pageContent?.substring(0, 200),
      metadata: docs[1]?.metadata,
    })
  }

  const filteredDocs = docs.filter((d) => d.metadata.source.startsWith(baseUrl))

  // Process documents to extract metadata
  const documents: Document[] = []
  console.log(`Filtered documents`, filteredDocs[1])

  for (const doc of filteredDocs) {
    try {
      // Note: doc.pageContent is already extracted text, not HTML
      // If you need to extract metadata from HTML, you'll need to modify
      // RecursiveUrlLoader to preserve the raw HTML
      documents.push(
        new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
          },
        }),
      )

      console.log(`Processed: ${doc.metadata.source}`)
    } catch (error) {
      console.error(`Failed to process document:`, error)
    }
  }

  return documents
}

