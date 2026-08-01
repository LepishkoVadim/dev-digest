# Onion Architecture — references

Annotated sources behind this skill. Grouped by what they inform.

## The pattern & the dependency rule

- **Onion Architecture: Going Beyond Layers** — NDepend blog.
  https://blog.ndepend.com/onion-architecture-layers/
  Clearest statement of the four rings (domain → domain services → application services →
  infrastructure) and the inward-only dependency rule.
- **Onion Architecture explained — Building maintainable software** — Marco Schaefer, Medium.
  https://marcoatschaefer.medium.com/onion-architecture-explained-building-maintainable-software-54996ff8e464
  Why the core stays framework-free and how DI inverts the dependency at the edges.
- **Onion Architecture in Domain-Driven Design (DDD)** — DEV.
  https://dev.to/yasmine_ddec94f4d4/onion-architecture-in-domain-driven-design-ddd-35gn
  Ties the rings to DDD building blocks (entities, domain services, application services).

## TypeScript / Node.js implementation

- **Clean Node.js Architecture** — Khalil Stemmler.
  https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
  Ports = interfaces, adapters = implementations; primary (HTTP) vs secondary (repository)
  adapters — the vocabulary this skill uses.
- **Domain-Driven Hexagon** — DEV (TypeScript/NestJS examples).
  https://dev.to/sairyss/domain-driven-hexagon-18g5
  Comprehensive, opinionated folder-structure reference for DDD + Hexagonal in TS.
- **Clean Architecture with TypeScript: DDD, Onion** — André Bazaglia.
  https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- **Implementing SOLID and the Onion architecture in Node.js with TypeScript** — Remo Jansen, DEV.
  https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- **Onion Architecture in Node.js with TypeScript** — Sankhadip Samanta, Medium.
  https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391

## Repository pattern & Drizzle (our infrastructure ring)

- **The Repository Pattern** — Cosmic Python, chapter 2.
  https://www.cosmicpython.com/book/chapter_02_repository
  The canonical argument for why the repository enforces the Dependency Rule and returns
  domain objects, not rows.
- **Repository Pattern with Drizzle ORM** — Medium.
  https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
  Applying the pattern specifically to Drizzle — keep `drizzle-orm` inside the repository.
- **Drizzle ORM Best Practices** — Paul Serban.
  https://www.paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/

## Enforcement tooling

- **dependency-cruiser** — the tool `arch:check` runs (already a dependency at `^17.4.3`).
  https://github.com/sverweij/dependency-cruiser
  `forbidden` rules with `from`/`to` path matchers and `$1` backreferences drive the
  `.dependency-cruiser.cjs` ruleset.
