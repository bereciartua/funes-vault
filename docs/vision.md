# Vision

## Summary

Funes Vault is a personal memory layer for AI. It stores durable context about a person, lets them control what is remembered, and safely exposes selected information to LLMs, agents, tools, and applications.

The service should work whether the user is interacting with a hosted chatbot, a local model, an IDE assistant, a voice agent, an email assistant, or a future AI surface that does not exist yet.

## Problem

LLM products are currently fragmented. Each assistant may have its own memory, profile, chat history, preference system, and account silo. Users repeat themselves constantly:

- "Here is my background."
- "Here is my project."
- "Here is how I like responses."
- "Here is what you should not mention."
- "Here are my constraints."

This creates inconvenience, but the deeper problem is control. If personal context lives inside each AI product, users cannot easily inspect it, correct it, move it, revoke it, encrypt it, or selectively share it.

## Desired Future

A user has one trusted personal memory vault. AI systems can request context from it, but the vault mediates what gets shared. The user can define policies such as:

- Share my coding preferences with developer tools.
- Share my dietary restrictions with travel and restaurant agents.
- Never share my medical information unless I approve each request.
- Share work history only with career tools.
- Exclude sensitive classes from third-party provider processing.
- Let this specific assistant remember our conversation for 30 days.

The vault becomes part profile, part memory database, part consent engine, and part interoperability layer.

## Target Users

- AI power users who move between many LLM tools.
- Developers using coding agents across projects.
- Professionals who want assistants to understand their working style without surrendering all context to every vendor.
- Privacy-conscious users who want personal AI memory but reject opaque hosted memory.
- Organizations that want employee-controlled memory with enterprise guardrails.
- Researchers and builders experimenting with user-owned AI identity.

## Product Promise

Funes Vault should make a first interaction with a new LLM feel like it already has the right amount of context, without giving it more than the user intended.

## Principles

1. User sovereignty: memory belongs to the user, not to any model or client app.
2. Minimum necessary disclosure: share only what is relevant to the current task and policy.
3. Inspectability: users can see what is stored, why it exists, and when it was shared.
4. Reversibility: users can edit, expire, revoke, delete, or export memory.
5. Portability: memory is accessible through open formats and APIs.
6. Server portability: users can choose who operates their vault and export their memories.
7. Security by design: encryption, auth, audit logs, and consent boundaries are foundational.

## Early Success Criteria

- A user can create and manage structured personal memories.
- A user can define sharing policies by category, client, purpose, and sensitivity.
- An LLM client can request relevant memory through an API.
- An MCP-compatible agent can request relevant memory through approved tools.
- A user can create useful first memories through guided questions and memory chat.
- The user can preview or audit what was shared.
- The same core service can run on a user-operated server or hosted infrastructure.
- Memory export/import is available from the beginning.

## Core user stories

- Capture, edit, search, archive and delete useful facts, preferences and constraints.
- Understand a memory's origin and every reviewed change through provenance.
- Use chat or guided questions to identify useful context without treating all conversation as durable memory.
- Approve exact selected text for one request, or define bounded ongoing client access.
- Revoke future access and inspect when, why and to whom memory was disclosed.
- Export and import vault JSON, including filtered exports and review-first restoration.
- Connect an AI tool through documented HTTP or MCP contracts with policy-filtered bundles.
- Use the same server from a browser and installed PWA, with an explicit offline capture queue.

## Scope and non-goals

The first release is a self-hostable, multi-user server with web/PWA and MCP access.
It is not a managed SaaS, an end-to-end encrypted store, an offline inference engine,
or an autonomous assistant that can override its owner's policies. Native desktop
hosting, organization administration and automatic account linking are out of scope.
Future product aspirations above are not claims that every provider or client
integration is implemented. See the README's current features and limitations.
