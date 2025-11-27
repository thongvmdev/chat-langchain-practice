/**
 * Ingestion utility functions.
 *
 * Common utilities for document processing, serialization, splitting,
 * and vector store operations.
 */

import 'dotenv/config'

import { promises as fs } from 'fs'
import * as path from 'path'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { Document } from '@langchain/core/documents'
import { WeaviateStore } from '@langchain/weaviate'
import { PostgresRecordManager } from '@langchain/community/indexes/postgres'
import { index } from '@langchain/core/indexing'
import { WEAVIATE_GENERAL_GUIDES_AND_TUTORIALS_INDEX_NAME } from '../constants.js'

// Environment variables
const RECORD_MANAGER_DB_URL = process.env.RECORD_MANAGER_DB_URL

/**
 * Serialize a document to JSON format for file output.
 *
 * @param doc - Document to serialize
 * @returns Serialized document data
 */
export function serializeDocumentForJson(doc: Document): Record<string, any> {
  // Start with basic fields (matching Python format)
  const docData: Record<string, any> = {
    page_content: doc.pageContent,
    metadata: doc.metadata,
    type: 'Document',
  }

  // Add any additional fields from the document object
  // This matches the Python version which iterates through all attributes
  for (const key of Object.keys(doc)) {
    if (!['pageContent', 'metadata'].includes(key) && !key.startsWith('_')) {
      const value = (doc as any)[key]
      // Only include serializable values
      if (
        value !== undefined &&
        typeof value !== 'function' &&
        typeof value !== 'symbol'
      ) {
        try {
          JSON.stringify(value)
          docData[key] = value
        } catch {
          // Skip non-serializable values
        }
      }
    }
  }

  return docData
}

/**
 * Write documents to a JSON file for inspection.
 *
 * @param documents - Documents to write
 * @param filename - Name of the output file
 * @param description - Description for logging
 */
export async function writeDocumentsToJsonFile(
  documents: Document[],
  filename: string,
  description: string,
): Promise<void> {
  const serializedData = documents.map(serializeDocumentForJson)
  const filePath = path.join(process.cwd(), '..', filename)

  console.log(`Writing to: ${filePath}`)
  await fs.writeFile(filePath, JSON.stringify(serializedData, null, 2), 'utf-8')
  console.log(`✓ Wrote ${serializedData.length} ${description} to ${filename}`)
}

/**
 * Split documents into chunks and filter out short ones.
 *
 * @param documents - Documents to split
 * @param textSplitter - Text splitter instance
 * @param minLength - Minimum content length to keep
 * @returns Filtered chunks
 */
export async function splitAndFilterDocuments(
  documents: Document[],
  textSplitter: RecursiveCharacterTextSplitter,
  minLength: number = 10,
): Promise<Document[]> {
  console.log('Step 3/5: Splitting documents into chunks...')
  let chunks = await textSplitter.splitDocuments(documents)
  console.log(`Created ${chunks.length} chunks (before filtering)`)

  // Filter out very short documents
  const beforeFilter = chunks.length
  chunks = chunks.filter((doc) => doc.pageContent.length > minLength)
  console.log(
    `✓ Filtered to ${chunks.length} chunks (removed ${
      beforeFilter - chunks.length
    } short chunks)`,
  )

  return chunks
}

/**
 * Ensure required metadata fields exist in all documents.
 * Weaviate will error at query time if required attributes are missing.
 *
 * @param documents - Documents to validate
 */
export function ensureRequiredMetadata(documents: Document[]): void {
  console.log('Step 5/5: Ensuring metadata fields...')

  for (const doc of documents) {
    if (!doc.metadata.source) {
      doc.metadata.source = ''
    }
    if (!doc.metadata.title) {
      doc.metadata.title = ''
    }
  }

  console.log('✓ Metadata fields validated')
}

/**
 * Create a Weaviate vector store instance.
 *
 * @param weaviateClient - Weaviate client
 * @param embedding - Embeddings model
 * @returns Weaviate store instance
 */
export function createWeaviateVectorStore(
  weaviateClient: any,
  embedding: any,
): WeaviateStore {
  console.log('Indexing documents in Weaviate...')

  return new WeaviateStore(embedding, {
    client: weaviateClient,
    indexName: WEAVIATE_GENERAL_GUIDES_AND_TUTORIALS_INDEX_NAME,
    textKey: 'text',
    metadataKeys: ['source', 'title'],
  })
}

/**
 * Create and initialize PostgreSQL record manager.
 *
 * @returns Initialized record manager
 */
export async function createRecordManager(): Promise<PostgresRecordManager> {
  // Remove sslmode from connection string as pg client doesn't parse it properly
  // and explicitly set ssl to false since the server doesn't support SSL
  const dbUrl = RECORD_MANAGER_DB_URL?.split('?')[0] || RECORD_MANAGER_DB_URL

  const recordManager = new PostgresRecordManager(
    `weaviate/${WEAVIATE_GENERAL_GUIDES_AND_TUTORIALS_INDEX_NAME}`,
    {
      postgresConnectionOptions: {
        connectionString: dbUrl,
        ssl: false,
      },
    },
  )

  await recordManager.createSchema()
  console.log('Record manager schema created')

  return recordManager
}

/**
 * Index documents in the vector store with record manager tracking.
 *
 * @param documents - Documents to index
 * @param vectorStore - Vector store instance
 * @param recordManager - Record manager instance
 * @returns Indexing statistics
 */
export async function indexDocumentsInVectorStore(
  documents: Document[],
  vectorStore: WeaviateStore,
  recordManager: PostgresRecordManager,
): Promise<any> {
  const indexingStats = await index({
    docsSource: documents,
    recordManager,
    vectorStore,
    options: {
      cleanup: 'full',
      sourceIdKey: 'source',
      forceUpdate:
        (process.env.FORCE_UPDATE || 'false').toLowerCase() === 'true',
    },
  })

  console.log(`Indexing stats:`, indexingStats)
  return indexingStats
}

/**
 * Get and log total vector count from Weaviate collection.
 *
 * @param weaviateClient - Weaviate client
 */
export async function logTotalVectorCount(weaviateClient: any): Promise<void> {
  const collection = await weaviateClient.collections.get(
    WEAVIATE_GENERAL_GUIDES_AND_TUTORIALS_INDEX_NAME,
  )
  const totalCount = await collection.aggregate.overAll()
  console.log(`Total vectors in collection: ${totalCount.totalCount}`)
}
