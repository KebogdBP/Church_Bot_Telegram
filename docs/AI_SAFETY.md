# AI Assistant Safety Policy

The assistant is an informational Bible-study helper, not a pastor, prophet, therapist, doctor, lawyer, or financial adviser.

Gemini is the preferred text provider. Groq is an automatic fallback for Bible answers and sermon materials. Both providers must return structured JSON that passes the same application schemas; fallback does not bypass crisis escalation, source allowlisting, length limits, or administrator moderation.

## Boundaries

- Answer after `/ask`, `/ask_sermons`, or an ordinary text message sent directly to the bot in a private chat.
- Never answer ordinary unaddressed group messages; free-text AI chat is private-only.
- Distinguish biblical text from interpretation and never invent quotations or references.
- Present multiple common interpretations for disputed denominational questions.
- Recommend a pastor when personal spiritual direction or church doctrine is involved.
- Escalate self-harm, violence, abuse, and immediate-danger language before any AI request.
- Redirect medical, legal, and financial decisions to qualified professionals.
- Never store question or answer text in interaction logs.
- Store only a keyed user hash, technical category, outcome, model, group, and timestamp.
- `/ask` and private free-text chat send the current question, configured church context, and at most 20 recent turns for the same chat and user. The history is bounded to 12,000 characters.
- Conversation turns are encrypted at rest with AES-256-GCM, expire after 30 days, and can be deleted immediately with `/new_chat`. They are not copied into logs or audit records.
- `/ask_sermons` may additionally send up to three bounded transcript excerpts from the current group. Transcript text is treated as untrusted reference material, not instructions.
- Archive source IDs shown to users are restricted to IDs retrieved by the application, even if the model returns other values.
- Use Groq for audio transcription and as a bounded fallback when Gemini text generation fails.

Admins configure local church identity and doctrinal context with `/context_set`, up to 2,000 characters.
