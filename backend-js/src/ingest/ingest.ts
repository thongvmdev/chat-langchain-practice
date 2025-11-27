import 'dotenv/config'

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PostgresRecordManager } from '@langchain/community/indexes/postgres'
import { getWeaviateClient } from '../utils.js'
import { getEmbeddingsModel } from '../embeddings.js'
import { OLLAMA_BASE_EMBEDDING_DOCS_URL } from '../constants.js'
import { Document } from '@langchain/core/documents'
import { reactDevExtractor } from './parser.js'
import { loadFromPlaywrightRecursive } from './loaders/index.js'

import {
  writeDocumentsToJsonFile,
  splitAndFilterDocuments,
  ensureRequiredMetadata,
  createWeaviateVectorStore,
  createRecordManager,
  indexDocumentsInVectorStore,
  logTotalVectorCount,
} from './utils.js'

const WEAVIATE_URL = process.env.WEAVIATE_URL
const WEAVIATE_GRPC_URL = process.env.WEAVIATE_GRPC_URL
const WEAVIATE_API_KEY = process.env.WEAVIATE_API_KEY

/**
 * Ingest general guides and tutorials.
 */
export async function ingestGeneralGuidesAndTutorials(): Promise<Document[]> {
  // Use Playwright loader for React.dev (JavaScript-rendered site)
  const aggregatedSiteDocs = await loadFromPlaywrightRecursive(
    'https://react.dev/reference',
    {
      maxDepth: 3, // crawl through all hook pages
      timeout: 15000, // 15s timeout for URL discovery
      preventOutside: true, // do not leave react.dev domain
      extractor: reactDevExtractor, // Use React.dev specific extractor
      maxPages: undefined, // Load all discovered pages (set a number to limit)
    },
  )

  if (aggregatedSiteDocs.length === 0) {
    throw new Error(
      'No documents were loaded! Check your base URL and options.',
    )
  }

  return aggregatedSiteDocs
}

/**
 * Main ingestion function.
 * Orchestrates the document ingestion pipeline: load, split, and index documents.
 */
export async function ingestDocs(): Promise<void> {
  console.log('Starting document ingestion...')

  // Initialize text splitter
  // Chunks for nomic-embed-text (2K token context window)
  // Reduce to 2000 chars ≈ 500-650 tokens to avoid context overflow
  // TypeScript Ollama client seems more strict than Python version
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 200,
  })

  // Initialize embeddings model
  const embedding = getEmbeddingsModel(
    undefined,
    OLLAMA_BASE_EMBEDDING_DOCS_URL,
  )
  if (!embedding) {
    throw new Error('Embeddings model is required for ingestion')
  }

  // Initialize Weaviate client
  const weaviateClient = await getWeaviateClient(
    WEAVIATE_URL,
    WEAVIATE_GRPC_URL,
    WEAVIATE_API_KEY,
  )

  let recordManager: PostgresRecordManager | undefined

  try {
    // Step 1: Load documents
    console.log('Loading documents...')
    console.log('Step 1/5: Fetching documents from sitemap...')
    const rawDocuments = await ingestGeneralGuidesAndTutorials()
    console.log(`✓ Loaded ${rawDocuments.length} documents successfully`)

    // Step 2: Write raw documents to file
    console.log('Step 2/5: Writing raw documents to file...')
    await writeDocumentsToJsonFile(
      rawDocuments,
      'raw_docs_js.json',
      'raw documents',
    )

    // Step 3: Split and filter documents
    const chunks = await splitAndFilterDocuments(rawDocuments, textSplitter)

    // Step 4: Write chunks to file
    console.log('Step 4/5: Writing chunks to file...')
    await writeDocumentsToJsonFile(chunks, 'chunks_js.json', 'chunks')

    // Step 5: Ensure required metadata
    ensureRequiredMetadata(chunks)

    // Create vector store and record manager
    const vectorStore = createWeaviateVectorStore(weaviateClient, embedding)
    recordManager = await createRecordManager()

    // Index documents
    await indexDocumentsInVectorStore(chunks, vectorStore, recordManager)

    // Log final count
    await logTotalVectorCount(weaviateClient)

    console.log('Document ingestion completed successfully!')
  } finally {
    // Cleanup connections
    if (recordManager) {
      await recordManager.end()
      console.log('Record manager connection closed')
    }
    await weaviateClient.close()
    console.log('Weaviate client closed')
  }
}
