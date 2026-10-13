# Conversational Autonomy

[AI interpretation](ai-interpretation.md) · [AI data processing](../security/ai-data-processing.md) · [Corporate agent](../domains/corporate-agent.md) · [ADR-0035](../adr/0035-compose-conversations-over-authorized-evidence-and-semantic-tools.md)

This page owns the conversational loop and its implemented limits. Business meaning stays in [sales](../domains/sales-chat.md) and [semantic product resolution](semantic-product-resolution.md). The execution evidence and remaining work belong to [PJ-42–46](../project/implementation-plan.md#conversational-autonomy-implementation).

## Conversation and evidence

`IA_MNS_AGENT_MODE=conversational` selects the general model/tool port. `legacy` selects the existing router, without bypassing new history/replay authorization. Tool-planned capabilities remain registered for protected history reads, but `legacyRouting:false` excludes them from the legacy catalog and dispatch. Their pending context remains stored for return to conversational mode. The model receives bounded authorized recent context and up to three recent result projections. It can respond in natural prose, explain general concepts, rewrite or translate, or invoke a registered tool. It does not need an intent for each phrasing.

The server loads twelve completed owned turns. `read_history` retrieves a bounded older page of the same conversation, subject to source and current actor permissions. `read_evidence` expands a known result to at most one hundred projected rows for a stated analytical purpose without reading the ERP. Old snapshots remain observations at their original time, not current truth. Unknown or inaccessible evidence is not reconstructed.

The model sees allowed values and chooses wording. Numerical ERP claims use validated fact identifiers that the server renders with exact decimal/date representations. Unknown references, raw digits in evidence-backed responses, external links and unsafe content trigger one repair without new tools, then a protected deterministic fallback where available. General qualitative conclusions still require evaluation; a valid number can be described incorrectly, and a trend does not establish causation.

Derived replies inherit the union of all transmitted data permissions, even if the model omits citations. Up to six nonrecursive original evidence snapshots preserve multi-result follow-ups. History, turn acceptance replay and model context all enforce these dependencies. Revocation uses the permissions of the authenticated request; the feature does not introduce instantaneous mid-turn invalidation of already issued tokens.

## Planning and analytical composition

`query_sales` accepts only a typed plan: up to three distinct reviewed metrics, month/product dimensions (including their combination), bounded explicit dates, an existing comparison, and all/literal/resolved/reused product scope. Server input fixes the ERP and actor; neither appears as a model-controlled authority. SQL is compiled by reviewed adapters with bindings. Oracle/PostgreSQL batches share one read-only snapshot per source. Cross-source totals and mixed-unit totals are never combined.

Semantic product scope reuses the Product Resolver, current catalog version, confirmed selection and complete-membership bound subquery. Ambiguity, unsupported relationships, stale catalogs or missing permissions cannot become an unfiltered query. Domain clarification is returned verbatim so numbered choices keep their meaning. Social conversation preserves pending state.

The loop allows at most eight conversational steps, six tool calls, ten total provider calls including nested interpreters and a conservative reserved token allowance of 120,000. The existing ninety-second turn deadline, source limits and concurrency limit still apply. Each provider call has its own deadline, no automatic retries and bounded payload/output. Repeated identical calls stop further tools. Cancellation propagates to provider and database adapters. Metadata records counts, policy/version and safe outcomes, never evidence content or reasoning.

The OpenAI adapter omits the unsupported `uniqueItems` keyword only from its outbound schema; the original local schema still rejects repeated measures/dimensions before execution. Conversational turns cap a configured `content` trace level at `metadata`, including nested domain interpreters. The retained legacy path has its separate existing content-trace policy.

## Attachments and presentation preferences

Attachments belong to one actor-owned conversation and selected ERP scope. Upload is explicit, limited to four immutable operational documents, and does not itself transmit them to OpenAI. The caller must classify the material as authorized operational data without restricted content. A classification assertion is not a universal content detector: prohibited personal/credential documents must not be uploaded. Text/CSV is UTF-8 up to 48,000 bytes and recognizable secrets/identifiers are rejected. PNG/JPEG is at most 98,304 bytes, each dimension at most 2,048 and total pixels at most 1,048,576; metadata is stripped and structural envelopes are checked. No local document interpreter, macro, external URL or arbitrary path is executed. PDF, office and archive formats are not accepted.

The model initially receives metadata only. `read_attachment` requires a purpose and sends bounded text or an inline operational image through the same foreground `store:false` request; no provider file/vector store is created. Text facts retain exact occurrences and document provenance. Image output is qualitative; numerical extraction requires a text/CSV source. File contents are untrusted and not ERP-reconciled; partial extraction is not a whole-file financial calculation. There is no spreadsheet formula execution or document search index.

Deleting an attachment invalidates all dependent reply snapshots, including summaries of summaries, before it can enter another turn. Conversation deletion removes the attachment contexts and all turns. Provider abuse-monitoring retention and backups have separate lifecycles. There is no cross-chat attachment access.

Users explicitly save language, verbosity and format in conversation preferences. They persist across reload/restart, reset through `auto`, and are deleted with the conversation. A current request may override presentation. The model has no preference-writing tool and cannot turn a choice into a global product synonym, permission or business definition. Shared semantic candidates remain subject to the existing catalog review and synthetic-evaluation workflow.

## Evaluation and rollout

The separate synthetic conversational corpus uses the real orchestrator and evidence path. `pnpm -C apps/api exec tsx scripts/local-runner.ts evals/conversation.ts` runs scripted trajectories; `--subject model` uses the configured OpenAI key and synthetic data only. Reports contain case ids, checks, calls, reads and token counts, not response content. Legacy curated interpreter evaluations remain independent.

Local unit, PostgreSQL, HTTP, browser and full repository gates must pass before completion. Synthetic provider results do not prove real ERP reconciliation, a held-out 95% success rate, corporate contract readiness, remote CI or production deployment. Rollout can select legacy routing within the new binary; it must preserve permission-aware readers and compatible versioned payloads.
