CLASSIFICATION_PROMPT = """Classify this memory into exactly one fact-type category.

Memory: {content}

Categories:
- job_title: A person's role, position, or employment status
- pricing: Cost, fee, subscription, or pricing information
- address: Physical location or address
- company_info: Company details (founding, size, structure, status)
- preference: User or entity preferences, habits, tendencies
- technical_fact: Software versions, API details, technical specifications
- policy: Rules, regulations, compliance requirements
- relationship: Relationships between people, companies, or entities
- temporal: Deadlines, schedules, expiration dates
- quantitative: Numbers, metrics, counts, percentages
- other: Doesn't fit above categories

Respond with JSON: {{"fact_type": str, "confidence": float, "reasoning": str}}"""


SEMANTIC_DRIFT_PROMPT = """You are a memory validation system. Determine whether a stored memory \
is likely still accurate given recent context.

STORED MEMORY (recorded {days_ago} days ago):
{memory_content}

RECENT AGENT CONTEXT (last {n_sessions} sessions):
{recent_context_summary}

Assess:
1. Does any recent context directly contradict this memory? (yes/no)
2. Does recent context suggest circumstances have changed enough that \
this memory may be outdated? (yes/no)
3. Confidence that this memory is STILL ACCURATE (0.0 to 1.0)
4. Brief reasoning (1-2 sentences)

Respond in JSON:
{{"contradicted": bool, "likely_stale": bool, "confidence": float, "reasoning": str}}"""


SOURCE_COMPARISON_PROMPT = """Compare the stored memory value with the current source value \
and determine if they represent the same fact.

STORED MEMORY: {stored_value}
CURRENT SOURCE VALUE: {source_value}

Consider:
- Minor formatting differences (capitalization, whitespace) are NOT meaningful changes
- Semantic equivalence matters more than exact string match
- A change in title, role, amount, or status IS a meaningful change

Respond in JSON:
{{"match": bool, "confidence": float, "reasoning": str}}"""


DEPENDENCY_PROMPT = """Given these two memories, determine if Memory B depends on Memory A \
being true. A "depends" relationship means that if Memory A becomes false, \
Memory B would also likely be incorrect or invalid.

Memory A: {memory_a}
Memory B: {memory_b}

Respond in JSON:
{{"depends": bool, "relationship": str, "strength": float}}"""
