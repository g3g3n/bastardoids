# Personal Context

## Identity
- Name: Sven
- Profession / background:
  - Software developer
  - Works across web development, data engineering, analytics, SEO, and ecommerce operations

## Response Preferences
- Prefers direct, plain answers without fluff
- Wants weak reasoning, blind spots, or faulty assumptions pointed out rather than glossed over
- Wants AI to challenge him when the premise looks weak
- Values skeptical, questioning analysis over agreeable hand-waving
- Likes concrete examples and practical next steps

## Technical Profile
- Uses VSCode and Notepad++ for code/file editing
- Comfortable with:
  - Python
  - PHP
  - JavaScript
  - SQL
  - BigQuery / GCP
  - dbt
  - Prefect
  - GTM
- Works on:
  - WooCommerce
  - Magento 2
  - SEO / technical SEO
  - tracking / analytics implementations
  - ETL / ELT pipelines
  - browser automation and scraping
- Understands production tradeoffs and infra constraints, not just code in isolation

## Working Style
- Prefers controlled, explicit systems over opaque automation
- Tends to favor file-based, inspectable, reviewable workflows
- Values backward compatibility and minimal, targeted changes over broad rewrites
- Thinks carefully about operational details, packaging, deployment, permissions, scheduling, and edge cases
- Often works through implementation details deeply and iteratively rather than accepting surface-level advice

## Ongoing / Recurrent Project Themes

### 1. Google Ads / SERP crawler
- Building and maintaining a Google Ads / SERP scraping system
- Architecture includes:
  - Firefox extension
  - Python Native Messaging host
  - CSV / BigQuery / Google Sheets output
- Has worked through:
  - DOM instability
  - consent banner handling
  - URL encoding issues
  - logging / identity tracking
  - packaging with PyInstaller
  - launch scheduling on Windows and macOS
  - Google Sheets source / bookkeeping logic

### 2. Ecommerce data pipelines
- Works with Magento data extraction into BigQuery
- Uses staging + merge patterns
- Cares about incremental loading correctness, schema stability, and operational safety
- Has dealt with:
  - updated_at incrementals
  - type mismatches
  - nested / awkward API payloads
  - schema design decisions for analytics use

### 3. Tracking / analytics implementations
- Works with GTM and Bloomreach / Exponea-style payloads
- Cares about field correctness, data type consistency, and practical debugging
- Often debugging not just code, but tool behavior, environment issues, and ownership / account structure

### 4. Technical SEO / ecommerce SEO
- Works on category pages, canonicals, redirects, crawl/indexation issues, PSI / CWV, Cloudflare interactions
- Interested in cause-and-effect rather than superstition
- Likely to want practical SEO advice tied to technical implementation rather than generic “best practices”

## Decision / Advice Preferences
- Wants practical recommendations, not fashionable abstractions
- Responds well to:
  - blunt tradeoff analysis
  - “this is the likely cause / this is not the likely cause”
  - prioritization of what matters most
- Dislikes:
  - overconfident vagueness
  - needless abstraction
  - “agent magic” without inspectable mechanics

## Communication Notes
- Comfortable with technical depth
- Does not need beginner-level hand-holding on code or systems topics
- Still benefits from concise structure and clear distinctions when topics become abstract
- Often asks follow-up questions that test whether an explanation actually holds up under scrutiny

## Domain / Business Context
- Works with ecommerce clients, including WooCommerce stores
- Has discussed clients in adult products / lingerie retail
- Cares about real business impact:
  - traffic drops
  - tracking correctness
  - feed behavior
  - category performance
  - deployment safety

## Entertainment / Taste Notes
- Strong preference for character-driven shows and films
- Likes historical, philosophical, and psychologically rich material
- Favorites / strong likes discussed:
  - The Crown
  - Mad Men
  - The Gilded Age
  - Battlestar Galactica (2003 remake)
  - Dune
  - Deadwood
  - Boardwalk Empire
  - The Expanse (especially earlier seasons)
- Tends to value depth of character, moral complexity, and atmosphere

## Useful Interaction Defaults
When helping Sven:
- Start with the most likely explanation, not a laundry list
- Be explicit about uncertainty
- Distinguish signal from noise
- Prefer minimal viable fixes before large redesigns
- Point out when a theory is weak, speculative, or contradicted by the evidence
- Use numbered structure for multi-part answers
- Avoid patronizing tone and avoid decorative language

## Known Constraints / Habits
- Often works in real production environments with messy legacy constraints
- Frequently needs solutions that are:
  - practical
  - reviewable
  - low-risk
  - compatible with existing systems and teammates
- Likely to reject solutions that are elegant on paper but brittle in practice

## Open Questions / Context Worth Capturing Later
- Preferred operating systems for daily work
- Preferred testing philosophy
- Tolerance for dependencies / frameworks
- Preferred code style conventions
- Long-term career direction
- Preferred collaboration style with AI tools