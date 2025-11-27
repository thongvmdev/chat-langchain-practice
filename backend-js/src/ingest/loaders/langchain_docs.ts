/**
 * LangChain documentation loader utilities.
 *
 * Provides convenience functions for loading LangChain documentation from various sources.
 */

import { Document } from '@langchain/core/documents'
import {
  langchainDocsExtractor,
  simpleExtractor,
} from '../parser.js'
import { loadFromSitemap } from './sitemap.js'

/**
 * Load LangChain Python docs (to be deprecated once docs are migrated).
 */
export async function loadLangchainPythonDocs(): Promise<Document[]> {
  return loadFromSitemap(
    'https://python.langchain.com/sitemap.xml',
    ['https://python.langchain.com/'],
    langchainDocsExtractor,
  )
}

/**
 * Load LangChain JS docs (to be deprecated once docs are migrated).
 */
export async function loadLangchainJsDocs(): Promise<Document[]> {
  return loadFromSitemap(
    'https://js.langchain.com/sitemap.xml',
    ['https://js.langchain.com/docs/concepts'],
    simpleExtractor,
  )
}

/**
 * Load from aggregated docs site.
 */
export async function loadAggregatedDocsSite(): Promise<Document[]> {
  console.log('Loading from aggregated docs site...')
  const docs = await loadFromSitemap(
    'https://docs.langchain.com/sitemap.xml',
    [
      // 'https://docs.langchain.com/oss/javascript',
      //   'https://docs.langchain.com/oss/javascript/langchain/mcp',
      //   'https://docs.langchain.com/oss/javascript/langchain/agents',
      'https://docs.langchain.com/oss/javascript/langchain/context-engineering',
      // 'https://docs.langchain.com/oss/javascript/concepts/context',
    ],
    simpleExtractor,
  )

  if (docs.length === 0) {
    console.warn(
      'WARNING: No documents matched the filter criteria! Check your filter URLs.',
    )
  }

  return docs
}

