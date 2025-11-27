import { ingestDocs } from './ingest'

export default ingestDocs

/**
 * Run ingestion if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  ingestDocs()
    .then(() => {
      console.log('Done!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Ingestion failed:', error)
      process.exit(1)
    })
}
