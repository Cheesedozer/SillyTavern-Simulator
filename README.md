# SillyTavern-Simulator

A Claude Code skill that lets Claude spin up a **real, live SillyTavern instance**, install a
third-party extension straight from its git URL (the same way a human would, through
SillyTavern's own "Install extension" dialog), click around and send messages through a real
browser, and report back what broke -- with screenshots and real log excerpts, not guesses.

It exists to speed up extension development for people who use AI to write SillyTavern
extensions but aren't coders themselves: instead of manually reloading SillyTavern and clicking
through it after every change, you can just ask Claude to test it.

## Why "real" instead of "simulated"

Despite the repo's name, this does not reimplement or simulate SillyTavern. It clones the actual
project fresh from [the official upstream repo](https://github.com/SillyTavern/SillyTavern) and
drives the real thing with a real headless browser. That's what makes the results trustworthy --
an extension that passes here behaves exactly as it would for a human tester, because it's the
same SillyTavern.

## How to use it

This only works inside [Claude Code](https://code.claude.com) (CLI, desktop, or web), since it
needs real code execution (to run SillyTavern's server and drive a browser) -- it won't work from
a plain chat-only conversation.

Just ask, in plain English, something like:

> Install this extension: `https://github.com/someone/their-extension` and test the new
> `/roll` command it adds. Let me know if anything's broken.

Claude will confirm the URL with you, then handle the rest: booting SillyTavern, installing the
extension, exercising it, and writing up a report with screenshots.

See [`.claude/skills/sillytavern-tester/SKILL.md`](.claude/skills/sillytavern-tester/SKILL.md)
for the full details of what it does and how, including the safety rules around installing
third-party code and testing against a scripted (deterministic, free) LLM backend by default
instead of a real, paid one.

## What's in this repo

Only original orchestration code -- SillyTavern itself (AGPL-3.0) is never vendored here; it's
cloned fresh into a gitignored working directory at run time. See
[`.claude/skills/sillytavern-tester/`](.claude/skills/sillytavern-tester/) for the actual
implementation (bootstrap scripts, the Playwright driver, a scripted mock LLM backend, test
fixtures, and example test plans).
