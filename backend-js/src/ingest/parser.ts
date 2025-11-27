/**
 * HTML parsing utilities for document ingestion.
 *
 * This module provides functions to extract text content from HTML documents,
 * with specific handling for LangChain documentation structure.
 */

import * as cheerio from 'cheerio'

/**
 * Extract text content from LangChain documentation HTML.
 *
 * This function extracts the main content from LangChain documentation pages,
 * focusing on the article content and removing unnecessary elements.
 *
 * @param html - HTML string or cheerio instance
 * @returns Extracted text content
 */
export function langchainDocsExtractor(
  html: string | cheerio.CheerioAPI,
): string {
  const $ = typeof html === 'string' ? cheerio.load(html) : html

  // Remove unwanted elements before extraction
  // This matches Python's behavior which uses SoupStrainer to filter during parsing
  // Remove navigation, menus, sidebars, and other non-content elements
  $(
    'script, style, nav, header, footer, iframe, noscript, form, button, ' +
      'aside, [role="navigation"], [role="banner"], [role="complementary"], ' +
      '[class*="sidebar"], [class*="menu"], [class*="nav"], ' +
      '[class*="toc"], [class*="breadcrumb"]',
  ).remove()

  // Try to find the main article content
  let content = ''

  // Look for common content selectors
  const articleSelector = $('article')
  if (articleSelector.length > 0) {
    // Remove any remaining navigation elements inside article
    articleSelector
      .find('nav, [role="navigation"], [class*="sidebar"], [class*="menu"]')
      .remove()
    content = articleSelector.text()
  } else {
    // Fallback to body if no article found
    content = $('body').text()
  }

  // Clean up the text
  return cleanText(content)
}

/**
 * Simple HTML text extractor.
 *
 * This function extracts all text content from HTML, removing all tags
 * and cleaning up whitespace.
 *
 * @param html - HTML string or cheerio instance
 * @returns Extracted text content
 */
export function simpleExtractor(html: string | cheerio.CheerioAPI): string {
  const $ = typeof html === 'string' ? cheerio.load(html) : html

  // 1. Define the "Kill List"
  // We added specific selectors for pagination and "skip" links
  const selectorsToRemove = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg', // Non-text
    'nav',
    'header',
    'footer',
    'aside', // Semantic layout
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]', // ARIA roles
    '[class*="sidebar"]',
    '[class*="menu"]',
    '[class*="toc"]', // Common layout classes
    '.pagination',
    '[class*="pagination"]', // <--- Kills "Previous/Next" links
    'a[href^="#"]', // <--- Kills "Skip to content" anchor links
    '.skip-link',
    'button',
    'form',
  ]

  // Remove these elements globally to be safe
  $(selectorsToRemove.join(', ')).remove()

  // 2. Intelligent Selection Strategy
  let contentObject = null

  // Priority 1: Article (Most specific)
  if ($('article').length > 0) {
    contentObject = $('article')
  }
  // Priority 2: Main (Standard semantic HTML5)
  else if ($('main').length > 0) {
    contentObject = $('main')
  }
  // Priority 3: Specific Content Divs (Common in Docusaurus/Nextra)
  else if ($('.content').length > 0) {
    contentObject = $('.content')
  }
  // Fallback: Body
  else {
    contentObject = $('body')
  }

  // 3. Deep Cleaning within the selected content
  // Sometimes navs/sidebars are nested DEEP inside <main> (e.g., mobile views)
  contentObject.find(selectorsToRemove.join(', ')).remove()

  // 4. Text Extraction
  return cleanText(contentObject.text())
}

/**
 * React.dev specific HTML text extractor.
 *
 * This function extracts content from React.dev pages, which use a specific
 * structure with main content areas. Optimized for React documentation sites.
 *
 * @param html - HTML string or cheerio instance
 * @returns Extracted text content
 */
export function reactDevExtractor(html: string | cheerio.CheerioAPI): string {
  const $ = typeof html === 'string' ? cheerio.load(html) : html

  // Remove unwanted elements
  const selectorsToRemove = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '[class*="sidebar"]',
    '[class*="menu"]',
    '[class*="nav"]',
    '[class*="toc"]',
    '[class*="breadcrumb"]',
    '.pagination',
    '[class*="pagination"]',
    'a[href^="#"]',
    '.skip-link',
    'button',
    'form',
    '[class*="search"]',
    '[class*="header"]',
    '[class*="footer"]',
  ]

  // Remove these elements globally
  $(selectorsToRemove.join(', ')).remove()

  // React.dev specific content selectors
  // React.dev typically uses main content in specific containers
  let contentObject = null

  // Priority 1: Look for React.dev specific content containers
  if ($('main').length > 0) {
    contentObject = $('main')
  }
  // Priority 2: Look for article tag
  else if ($('article').length > 0) {
    contentObject = $('article')
  }
  // Priority 3: Look for content divs (React.dev uses various content wrappers)
  else if ($('[class*="content"]').length > 0) {
    // Find the main content div (usually the largest one)
    const contentDivs = $('[class*="content"]')
    let maxLength = 0
    contentDivs.each((_, el) => {
      const text = $(el).text().length
      if (text > maxLength) {
        maxLength = text
        contentObject = $(el)
      }
    })
    if (!contentObject) {
      contentObject = contentDivs.first()
    }
  }
  // Priority 4: Look for React component root divs
  else if ($('#root').length > 0) {
    contentObject = $('#root')
  }
  // Fallback: Body
  else {
    contentObject = $('body')
  }

  // Deep clean within selected content
  contentObject.find(selectorsToRemove.join(', ')).remove()

  // Extract text and clean
  return cleanText(contentObject.text())
}

/**
 * Clean extracted text by normalizing whitespace.
 *
 * @param text - Raw text to clean
 * @returns Cleaned text
 */
function cleanText(text: string): string {
  return (
    text
      // Replace multiple newlines with double newline
      .replace(/\n\n+/g, '\n\n')
      // Replace multiple spaces with single space
      .replace(/[ \t]+/g, ' ')
      // Trim whitespace from each line
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Remove empty lines at start and end
      .trim()
  )
}

/**
 * Extract metadata from HTML page.
 *
 * @param html - HTML string or cheerio instance
 * @param titleSuffix - Optional suffix to append to title
 * @returns Metadata object with title, description, and language
 */
export function extractMetadata(
  html: string | cheerio.CheerioAPI,
  titleSuffix?: string,
): Record<string, string> {
  const $ = typeof html === 'string' ? cheerio.load(html) : html

  let title = $('title').text() || ''
  if (titleSuffix) {
    title += titleSuffix
  }

  const description = $('meta[name="description"]').attr('content') || ''
  const language = $('html').attr('lang') || ''

  return {
    title,
    description,
    language,
  }
}
