# Migrating LangGraph from Python to JavaScript v1 > A Learning Journey

A comprehensive guide documenting my journey migrating the Chat LangChain backend from Python to LangGraph.js v1, including challenges, solutions, and key learnings.

> **Learning Journey:** This is part of my exploration of the [Chat LangChain](https://github.com/langchain-ai/chat-langchain) open-source project.
>
> **Source Repository:** [langchain-ai/chat-langchain](https://github.com/langchain-ai/chat-langchain)  
> **Practice Repository:** [thongvmdev/chat-langchain-practice](https://github.com/thongvmdev/chat-langchain-practice)  
> **JavaScript Implementation:** [backend-js](https://github.com/thongvmdev/chat-langchain-practice/tree/master/backend-js)  
> **Migration PR:** [#1](https://github.com/thongvmdev/chat-langchain-practice/pull/1)

---

## 🚨 Problem & Motivation

### The Challenge

After successfully implementing a local Docker-based ingestion pipeline (see [INGEST.md](./INGEST.md)), I wanted to explore the JavaScript/TypeScript ecosystem and migrate the entire Chat LangChain backend from Python to LangGraph.js v1. This migration presented several unique challenges:

1. **API Differences Between Python and JavaScript**

   - LangGraph.js v1 has different patterns than Python's LangGraph
   - State management uses `Annotation` instead of Python's class-based approach
   - Graph construction follows a builder pattern with different edge types
   - Subgraph integration requires understanding `Send` patterns for parallel execution

2. **Self-Teaching Each Component**

   - Limited documentation for LangGraph.js v1 migration patterns
   - Had to reverse-engineer Python code to understand the flow
   - TypeScript type system required careful type definitions
   - Different async/await patterns compared to Python's async

3. **Module Incompatibilities**

   - Document loaders work differently (sitemap filtering logic inverted)
   - Record Manager API differences between Python and JS
   - Weaviate client initialization requires different connection patterns
   - Evaluation framework integration with LangSmith needed adaptation

4. **Testing and CI/CD Challenges**
   - Setting up Vitest for E2E evaluations
   - GitHub Actions workflow configuration for pnpm
   - LangSmith evaluation integration in TypeScript

### The Solution: Systematic Component-by-Component Migration

I approached this migration systematically, breaking it down into manageable components:

1. **Document Ingestion Pipeline** - Fixed SitemapLoader, PostgresRecordManager, WeaviateStore integration
2. **Retrieval System** - Embeddings abstraction, retriever factory
3. **Main Retrieval Graph** - State annotations, graph builder pattern, conditional edges
4. **Researcher Subgraph** - Parallel query execution using Send pattern
5. **Evaluation Framework** - LangSmith integration, Vitest setup
6. **CI/CD Pipeline** - pnpm configuration, GitHub Actions

**Benefits:**

- ✅ **Type Safety:** Full TypeScript support with compile-time checks
- ✅ **Modern Tooling:** pnpm, Vitest, and modern Node.js features
- ✅ **Same Architecture:** Maintains feature parity with Python version
- ✅ **Shared Infrastructure:** Uses same Weaviate vector store and evaluation datasets

---

## 🎯 Component Migration Journey

### Component 1: Document Ingestion Pipeline

**File:** [`backend-js/src/ingest/index.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/ingest/index.ts)

**Challenge:** JavaScript `SitemapLoader` had inverted filter logic compared to Python.

**Solution:** Created `FixedSitemapLoader` with proper URL filtering. Pipeline: load from sitemaps → split (4000 chars, 200 overlap) → track with PostgresRecordManager → store in Weaviate.

**Key Differences:** JS uses `index()` from `@langchain/core/indexing`, Record Manager requires SSL config handling, document serialization needs explicit types.

---

### Component 2: Main Retrieval Graph

**File:** [`backend-js/src/retrieval_graph/graph.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/retrieval_graph/graph.ts)

**Challenge:** LangGraph.js v1 uses `Annotation`-based state management instead of Python's class-based `TypedDict`.

**Solution:** Created state annotations using `Annotation.Root()` pattern. The main graph flow: `START → create_research_plan → conduct_research → [checkFinished] → respond → END` (loops back to conduct_research if more steps).

**Key Challenges:**

1. **State Reducers:** Each annotation needs a reducer function (`messages` uses `messagesStateReducer`, `documents` uses custom `reduceDocs`, `answer`/`query` use string reducers)
2. **Conditional Edges:** The `checkFinished` function returns `'respond' | 'conduct_research'` to control flow
3. **Subgraph Invocation:** Calling the researcher subgraph requires passing state correctly

**Learning:** State management in LangGraph.js requires explicit reducer functions, unlike Python's automatic merging.

---

### Component 3: Researcher Subgraph

**File:** [`backend-js/src/retrieval_graph/researcher_graph/graph.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/retrieval_graph/researcher_graph/graph.ts)

**Challenge:** Implementing parallel query execution using LangGraph.js's `Send` pattern.

**Solution:** Flow: `START → generate_queries → [retrieveInParallel] → retrieve_documents (parallel) → END`. The `retrieveInParallel` function creates multiple `Send` objects (one per query) that execute in parallel, with results merged back into `ResearcherState`.

**Challenges:** State type matching must be exact, query index tracking needed, document deduplication required for overlapping results.

**Learning:** The `Send` pattern enables parallel execution but requires careful type definitions.

---

### Component 4: Evaluation Framework

**File:** [`backend-js/tests/evals/test_e2e.test.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/tests/evals/test_e2e.test.ts)

**Challenge:** Adapting Python's evaluation framework to TypeScript with LangSmith integration.

**Solution:** Created three evaluation metrics: retrieval recall, answer correctness (vs reference), and context correctness (vs retrieved docs). Uses `evaluateLangSmith()` with `openai/gpt-4o-mini` as judge model, `withStructuredOutput()` with Zod schemas, and processes results as async iterators.

**Key Differences:** JS uses options object instead of positional arguments, async iterator processing, slightly different result structure.

**Learning:** LangSmith's evaluation API is consistent but async patterns differ between languages.

---

### Component 5: CI/CD Pipeline

**File:** [`.github/workflows/eval-js.yml`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/.github/workflows/eval-js.yml)

**Challenge:** Setting up GitHub Actions for pnpm with proper caching and environment variables.

**Solution:** Configured workflow with `pnpm/action-setup@v4`, pnpm store caching, Node.js 20, and environment variables for all API keys and connection strings (LangSmith, OpenAI, Groq, Ollama, Weaviate, PostgreSQL).

**Learning:** pnpm's store-based caching is more efficient than node_modules caching. Understanding GitHub Actions secrets vs vars is crucial for security.

---

## 🔄 Architecture Comparison

Both implementations share the same infrastructure (Weaviate vector store, PostgreSQL Record Manager, LangSmith prompts, evaluation datasets) but differ in implementation patterns:

**Key Architectural Differences:**

| Aspect                 | Python              | JavaScript                 |
| ---------------------- | ------------------- | -------------------------- |
| **State Management**   | `TypedDict` classes | `Annotation.Root()`        |
| **State Reducers**     | Automatic merging   | Explicit reducer functions |
| **Parallel Execution** | Direct async calls  | `Send` pattern             |
| **Type Safety**        | Type hints          | TypeScript types           |
| **Graph Building**     | Method chaining     | Builder pattern (same)     |
| **Subgraph Calls**     | Direct invocation   | `graph.invoke()`           |

---

## 🎓 Key Learnings & Challenges

### 1. State Management Paradigm Shift

**Challenge:** Python uses class-based `TypedDict` with automatic merging, while JavaScript uses `Annotation.Root()` requiring explicit reducers for each field.

**Solution:** Created shared channel definitions to prevent "Channel already exists" errors. Every state field needs: a reducer function (how to merge updates), a default value (initial state), and proper type annotations.

---

### 2. Document Deduplication Complexity

**Challenge:** Retrieved documents can have same UUID, different UUIDs but same content, or same content from different queries.

**Solution:** Implemented dual deduplication in `reduceDocs`: primary UUID-based (matches Python), secondary content + source signature (catches duplicates with different UUIDs). Ensures no duplicate documents accumulate in state.

---

### 3. Module Incompatibility: SitemapLoader

**Problem:** JavaScript `SitemapLoader` had inverted filter logic compared to Python.

**Solution:** Created `FixedSitemapLoader` that properly escapes regex characters, converts filter URLs to regex patterns, and matches URLs correctly.

**Learning:** Always test filter logic thoroughly, even in "official" libraries. Edge cases can differ between language implementations.

---

### 4. Record Manager Connection Handling

**Challenge:** PostgreSQL connection string parsing differs between Python and JavaScript `pg` client.

**Solution:** Remove `sslmode` query parameter (not parsed correctly), explicitly set `ssl: false` in connection options, handle connection string cleanup before passing to client.

**Learning:** Database client libraries have subtle differences. Always check connection string format requirements.

---

### 5. Evaluation Framework Integration

**Challenge:** LangSmith's `evaluate()` function signature differs between Python and JavaScript.

**Solution:** Python uses `aevaluate(target, evaluators, data, ...)` while JavaScript uses `evaluateLangSmith(target, { evaluators, data, ... })` with options object instead of positional arguments, async iterator processing, and slightly different result structure.

**Learning:** Even when APIs are "similar," always check the exact signature and return types.

---

## 📊 Migration Statistics

### Code Structure

```
Python Backend:        JavaScript Backend:
├── retrieval_graph/   ├── retrieval_graph/
│   ├── graph.py       │   ├── graph.ts
│   ├── state.py       │   ├── state.ts
│   └── researcher/    │   └── researcher_graph/
│       └── graph.py   │       └── graph.ts
├── retrieval.py       ├── retrieval.ts
├── ingest.py          ├── ingest/index.ts
└── tests/             └── tests/evals/
    └── test_e2e.py        └── test_e2e.test.ts
```

### Lines of Code

- **Python:** ~2,500 lines
- **JavaScript:** ~3,200 lines (includes type definitions)
- **Type Safety:** Full TypeScript coverage

### Dependencies

**Python:**

- langchain, langgraph, weaviate-client, etc.

**JavaScript:**

- @langchain/core@^1.0.6
- @langchain/langgraph@^1.0.2
- @langchain/weaviate@^1.0.0
- weaviate-client@^3.2.0
- TypeScript 5.6, Vitest 2.1, pnpm 10.23.0

---

## 🚀 Running the JavaScript Implementation

**Prerequisites:** Node.js 20+, pnpm, Docker (for Weaviate and PostgreSQL)

**Setup:**

```bash
cd backend-js
corepack enable  # one-time
pnpm install
cp env.example .env  # edit with your API keys
```

**Commands:**

- `pnpm ingest` - Load documents, split, generate embeddings, store in Weaviate
- `pnpm test:e2e` - Run evaluation suite (retrieval recall, answer correctness, context faithfulness)
- `pnpm typecheck` - Type checking
- `pnpm build` - Build
- `pnpm test` - Run tests
- `pnpm langgraph:dev` - Start LangGraph dev server

---

## 💡 Key Takeaways

1. **State Management is Fundamental:** Every field needs a reducer, default value, and proper types. Shared channels prevent conflicts.

2. **Type Safety is Your Friend:** TypeScript caught many errors at compile time (type mismatches, incorrect signatures, missing fields, async issues).

3. **Test Each Component Independently:** Breaking migration into components enabled isolated testing, easier debugging, incremental progress, and better understanding.

4. **Documentation Gaps Require Experimentation:** When documentation is limited, read source code (both Python and JS), write test cases, use TypeScript's type system as documentation, and iterate.

5. **Shared Infrastructure Simplifies Migration:** Using the same Weaviate vector store, PostgreSQL database, LangSmith prompts, and evaluation datasets made validation and comparison easier.

6. **CI/CD Setup Matters:** Proper GitHub Actions configuration ensures consistent test environments, catches issues before merge, and documents required environment variables.

---

## 🔍 Migration Checklist

If you're planning a similar migration, consider:

- [ ] **Understand State Management:** Learn Annotation patterns vs TypedDict
- [ ] **Set Up TypeScript:** Configure strict type checking
- [ ] **Test Document Loaders:** Verify filter logic matches Python
- [ ] **Implement State Reducers:** Write reducers for all state fields
- [ ] **Handle Parallel Execution:** Understand Send pattern for subgraphs
- [ ] **Adapt Evaluation Framework:** Match Python evaluation signatures
- [ ] **Configure CI/CD:** Set up proper caching and secrets
- [ ] **Validate Results:** Compare outputs with Python version
- [ ] **Document Differences:** Note any behavioral differences
- [ ] **Test Edge Cases:** Handle null/undefined properly

---

## 📚 References

### Code Files

- **Ingestion:** [`backend-js/src/ingest/index.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/ingest/index.ts)
- **Main Graph:** [`backend-js/src/retrieval_graph/graph.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/retrieval_graph/graph.ts)
- **Researcher Subgraph:** [`backend-js/src/retrieval_graph/researcher_graph/graph.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/retrieval_graph/researcher_graph/graph.ts)
- **State Management:** [`backend-js/src/retrieval_graph/state.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/src/retrieval_graph/state.ts)
- **Evaluation Tests:** [`backend-js/tests/evals/test_e2e.test.ts`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/backend-js/tests/evals/test_e2e.test.ts)
- **CI/CD:** [`.github/workflows/eval-js.yml`](https://github.com/thongvmdev/chat-langchain-practice/blob/master/.github/workflows/eval-js.yml)

### Documentation

- [LangGraph.js Documentation](https://docs.langchain.com/oss/javascript/langgraph/)
- [LangChain.js v1 Documentation](https://docs.langchain.com/oss/javascript/langchain/)
- [LangSmith Evaluation Guide](https://docs.smith.langchain.com/evaluation)
- [Weaviate JavaScript Client](https://weaviate.io/developers/weaviate/client-libraries/javascript)

### Related Blog Posts

- [Document Ingestion Guide](./INGEST.md) - Local Docker setup for ingestion
- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md) - Frontend implementation details

---

## 🎯 Conclusion

Migrating from Python to LangGraph.js v1 required deep understanding of both ecosystems, systematic component-by-component approach, problem-solving for module incompatibilities, testing discipline, and documentation.

The result is a fully functional JavaScript/TypeScript implementation that maintains feature parity with Python, provides type safety, uses modern tooling (pnpm, Vitest), integrates seamlessly with existing infrastructure, and serves as a learning resource for others.

**Next Steps:** Continue improving type definitions, add comprehensive tests, optimize performance, explore LangGraph.js v1 new features, and share learnings with the community.

---

**Questions or feedback?** Check out the [GitHub repository](https://github.com/thongvmdev/chat-langchain-practice) or open an issue!
