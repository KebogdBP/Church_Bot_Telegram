# AI Assistant Safety Policy

The assistant is an informational Bible-study helper, not a pastor, prophet, therapist, doctor, lawyer, or financial adviser.

## Boundaries

- Answer only after an explicit `/ask` command.
- Distinguish biblical text from interpretation and never invent quotations or references.
- Present multiple common interpretations for disputed denominational questions.
- Recommend a pastor when personal spiritual direction or church doctrine is involved.
- Escalate self-harm, violence, abuse, and immediate-danger language before any AI request.
- Redirect medical, legal, and financial decisions to qualified professionals.
- Never store question or answer text in interaction logs.
- Store only a keyed user hash, technical category, outcome, model, group, and timestamp.
- Request OpenAI responses with `store: false`.

Admins configure local church identity and doctrinal context with `/context_set`, up to 2,000 characters.
