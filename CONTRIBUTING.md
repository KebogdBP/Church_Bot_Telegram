# Contributing

## Working Style

This project should remain easy for the next developer to continue. Prefer small, understandable changes with updated documentation and checklist state.

## Before Starting Work

1. Read `PROJECT_VISION.md`.
2. Read `ROADMAP.md`.
3. Check `TASKS.md` for the current phase and active tasks.
4. Check `DECISIONS.md` for existing technical decisions.

## During Work

- Keep commits focused.
- Update `TASKS.md` when task status changes.
- Add or update tests for important behavior.
- Keep user-facing bot messages warm, clear, and concise.
- Avoid hardcoding church-specific data in source code.

## Pull Request Checklist

- [ ] The change matches the current roadmap phase or explains why it does not.
- [ ] Relevant docs were updated.
- [ ] Environment variables are documented in `.env.example`.
- [ ] Tests or manual verification steps are included.
- [ ] No secrets or private data are committed.

## Handoff Format

When pausing work, leave a short note with:

- what changed;
- what was tested;
- what remains;
- any blockers or open decisions.

