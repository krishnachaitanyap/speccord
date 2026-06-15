#!/usr/bin/env python3
"""Generate the speccord overview deck as SVG slides (rendered inline by GitHub).

Single source of truth: edit SLIDES below and re-run `python3 build_slides.py`.
A companion script (build_pptx.py) builds a downloadable .pptx from the same data.
No third-party dependencies."""
import html
import os

W, H = 1280, 720
BG = "#1d1411"        # slate-900
PANEL = "#2b1d18"     # slate-800
PANEL2 = "#241712"    # darker panel
TEXT = "#f7e9e3"      # slate-200
MUTED = "#bb9a8d"     # slate-400
SKY = "#ff7a5c"
EMERALD = "#ffa886"
VIOLET = "#e85a63"
AMBER = "#ffc89e"
FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"

ACCENTS = [SKY, EMERALD, VIOLET, AMBER]


def esc(s):
    return html.escape(str(s), quote=True)


def t(x, y, s, size=28, fill=TEXT, weight="normal", font=FONT, anchor="start", opacity=1.0):
    return (f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" '
            f'opacity="{opacity}">{esc(s)}</text>')


def rect(x, y, w, h, fill, rx=16, opacity=1.0, stroke=None, sw=0):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" opacity="{opacity}"{s}/>'


def chip(x, y, label, color):
    w = 16 + len(label) * 11
    return (rect(x, y, w, 40, "none", rx=20, stroke=color, sw=2)
            + t(x + w / 2, y + 26, label, size=19, fill=color, weight="bold", anchor="middle"))


def header(title, kicker, accent):
    out = [rect(0, 0, W, H, BG, rx=0)]
    out.append(rect(0, 0, 12, H, accent, rx=0))
    out.append(t(80, 92, kicker, size=22, fill=accent, weight="bold"))
    out.append(t(80, 150, title, size=52, fill=TEXT, weight="bold"))
    out.append(rect(80, 178, 120, 5, accent, rx=2))
    return out


def footer(n, total):
    return [
        t(80, H - 40, "speccord", size=20, fill=MUTED, weight="bold"),
        t(W - 80, H - 40, f"{n} / {total}", size=20, fill=MUTED, anchor="end"),
    ]


# ---- Slide builders ---------------------------------------------------------

def slide_title(n, total):
    out = [rect(0, 0, W, H, BG, rx=0)]
    # accent bars
    for i, c in enumerate([SKY, EMERALD, VIOLET]):
        out.append(rect(0, 250 + i * 6, W, 3, c, rx=0, opacity=0.5))
    out.append(t(W / 2, 250, "speccord", size=120, fill=TEXT, weight="bold", anchor="middle"))
    out.append(t(W / 2, 320, "the spec is the contract your code is checked against",
                 size=30, fill=SKY, anchor="middle"))
    out.append(t(W / 2, 430, "A spec-driven development CLI — keep code and spec in sync, both ways",
                 size=24, fill=MUTED, anchor="middle"))
    y = 480
    out.append(chip(W / 2 - 235, y, "Extract", SKY))
    out.append(chip(W / 2 - 55, y, "Generate", EMERALD))
    out.append(chip(W / 2 + 140, y, "Enforce", VIOLET))
    out += footer(n, total)
    return out


def slide_problem(n, total):
    out = header("Specs drift from code. Then they lie.", "THE PROBLEM", SKY)
    cards = [
        ("Docs rot", "Hand-written specs go stale the moment code changes. Nobody trusts them."),
        ("Pure-LLM specs hallucinate", "Generate-everything tools invent endpoints, tables, and scopes."),
        ("No enforcement", "Nothing fails the build when the contract and the code disagree."),
    ]
    x = 80
    for i, (h, b) in enumerate(cards):
        cx = x + i * 380
        out.append(rect(cx, 230, 350, 300, PANEL))
        out.append(rect(cx, 230, 350, 8, ACCENTS[i], rx=4))
        out.append(t(cx + 30, 300, h, size=28, fill=ACCENTS[i], weight="bold"))
        out += wrap(cx + 30, 350, b, 290, size=21, fill=MUTED)
    out.append(t(80, 600, "speccord's answer: facts are deterministic — only prose is model-written.",
                 size=24, fill=TEXT, weight="bold"))
    out += footer(n, total)
    return out


def slide_hybrid(n, total):
    out = header("Hybrid by construction", "THE IDEA", EMERALD)
    out.append(rect(80, 220, 540, 320, PANEL))
    out.append(t(110, 280, "Deterministic (code)", size=26, fill=EMERALD, weight="bold"))
    for i, s in enumerate(["Parse OpenAPI/GraphQL/proto · SQL · events · security",
                           "Diff the contract surface (drift)",
                           "Lifecycle state machine + entry gates",
                           "Capability resolution from scale"]):
        out.append(t(110, 330 + i * 46, "• " + s, size=21, fill=TEXT))
    out.append(rect(660, 220, 540, 320, PANEL))
    out.append(t(690, 280, "Model-written (prose only)", size=26, fill=VIOLET, weight="bold"))
    for i, s in enumerate(["Draft narrative around established facts",
                           "Plans, PRDs, stories, reviews",
                           "Never invents endpoints/tables/scopes",
                           "Grounded in spec + constitution"]):
        out.append(t(690, 330 + i * 46, "• " + s, size=21, fill=TEXT))
    out.append(t(W / 2, 600, "Pass/fail is always code. The model only writes the words.",
                 size=24, fill=TEXT, weight="bold", anchor="middle"))
    out += footer(n, total)
    return out


def slide_overview(n, total):
    out = header("What speccord does", "ONE TOOL, BOTH WAYS", VIOLET)
    rows = [
        ("Extract", SKY, "code → spec", "discover the as-is contract: API · data · events · security"),
        ("Generate", EMERALD, "spec → code", "constitution → spec → plan → tasks → story → implement"),
        ("Enforce", VIOLET, "keep them in sync", "lifecycle gates · CI drift gate · runtime conformance"),
    ]
    y = 230
    for name, c, role, detail in rows:
        out.append(rect(80, y, 1120, 110, PANEL))
        out.append(rect(80, y, 8, 110, c, rx=4))
        out.append(t(120, y + 50, name, size=30, fill=c, weight="bold"))
        out.append(t(120, y + 88, role, size=20, fill=MUTED))
        out.append(t(480, y + 68, detail, size=21, fill=TEXT, font=MONO))
        y += 130
    out += footer(n, total)
    return out


def slide_scale(n, total):
    out = header("One knob: scale (0–4)", "CONFIGURABLE", AMBER)
    out.append(t(80, 205, "Scale sets active phases, enabled roles, and default capabilities — all overridable.",
                 size=22, fill=MUTED))
    levels = [
        ("0", "prototype", "implement only"),
        ("1", "small", "+ plan, stories, gate"),
        ("2", "medium", "+ solutioning, PRD, QA"),
        ("3", "large", "+ analysis, UX"),
        ("4", "enterprise", "+ PO, compliance gates"),
    ]
    x = 80
    wdt = 214
    for i, (lv, nm, add) in enumerate(levels):
        cx = x + i * (wdt + 10)
        c = ACCENTS[i % len(ACCENTS)]
        out.append(rect(cx, 250, wdt, 240, PANEL))
        out.append(t(cx + wdt / 2, 330, lv, size=64, fill=c, weight="bold", anchor="middle"))
        out.append(t(cx + wdt / 2, 375, nm, size=24, fill=TEXT, weight="bold", anchor="middle"))
        out += wrap(cx + 18, 420, add, wdt - 36, size=19, fill=MUTED, center=True, cx=cx + wdt / 2)
    out.append(t(80, 575, "speccord capabilities", size=24, fill=EMERALD, weight="bold", font=MONO))
    out.append(t(80, 612, "shows what's on, which command each unlocks, and how to change it.",
                 size=21, fill=MUTED))
    out += footer(n, total)
    return out


def slide_phases(n, total):
    out = header("Four phases → commands", "THE WORKFLOW", SKY)
    cols = [
        ("ANALYSIS", SKY, ["brief  (analyst)", "discover", "research"]),
        ("PLANNING", EMERALD, ["prd  (pm)", "base draft | new", "feature new · clarify"]),
        ("SOLUTIONING", VIOLET, ["plan  (architect)", "agent architect", "epics & stories"]),
        ("IMPLEMENTATION", AMBER, ["story new (sm)", "implement (dev)", "review (qa)"]),
    ]
    x = 80
    cw = 270
    for i, (ph, c, cmds) in enumerate(cols):
        cx = x + i * (cw + 17)
        out.append(rect(cx, 230, cw, 320, PANEL))
        out.append(rect(cx, 230, cw, 56, PANEL2, rx=16))
        out.append(t(cx + cw / 2, 267, ph, size=20, fill=c, weight="bold", anchor="middle"))
        for j, cmd in enumerate(cmds):
            out.append(t(cx + 22, 330 + j * 54, cmd, size=20, fill=TEXT, font=MONO))
        if i < 3:
            out.append(t(cx + cw + 2, 395, "→", size=34, fill=MUTED, anchor="middle"))
    out.append(t(80, 612, "Always-on: constitution · analyze · checklist · lint · status · advance · gate · agent",
                 size=20, fill=MUTED))
    out += footer(n, total)
    return out


def slide_enforce(n, total):
    out = header("Enforcement is code, not vibes", "THE SPINE", EMERALD)
    cards = [
        ("Lifecycle", SKY, "Draft → In Review → Approved → In Implementation → Implemented",
         "Entry gates: lint, base ref, ACs↔tests, plan+tasks."),
        ("CI drift gate", VIOLET, "speccord gate --base origin/main",
         "Contract file changed but no spec updated → build fails."),
        ("Runtime conform", AMBER, "speccord conform",
         "Re-discovers the live surface, diffs the baseline → fails on drift."),
    ]
    y = 225
    for h, c, code, body in cards:
        out.append(rect(80, y, 1120, 120, PANEL))
        out.append(rect(80, y, 8, 120, c, rx=4))
        out.append(t(120, y + 48, h, size=27, fill=c, weight="bold"))
        out.append(t(120, y + 90, body, size=20, fill=MUTED))
        out.append(t(700, y + 70, code, size=20, fill=TEXT, font=MONO))
        y += 138
    out += footer(n, total)
    return out


def slide_agents(n, total):
    out = header("Plugs into your AI agent", "INTEGRATION", EMERALD)
    out.append(t(80, 205, "speccord agent-rules  wires up MCP + a spec-as-contract ruleset for each tool.",
                 size=21, fill=MUTED, font=MONO))
    cards = [("Claude Code", SKY, ".mcp.json", "CLAUDE.md"),
             ("Cursor", VIOLET, ".cursor/mcp.json", ".cursor/rules/*.mdc"),
             ("Copilot / VS Code", AMBER, ".vscode/mcp.json", "copilot-instructions.md")]
    for i, (nm, c, a, b) in enumerate(cards):
        cx = 80 + i * 380
        out.append(rect(cx, 245, 350, 150, PANEL))
        out.append(rect(cx, 245, 350, 8, c, rx=4))
        out.append(t(cx + 26, 300, nm, size=24, fill=c, weight="bold"))
        out.append(t(cx + 26, 340, a, size=18, fill=TEXT, font=MONO))
        out.append(t(cx + 26, 372, b, size=18, fill=MUTED, font=MONO))
    out.append(rect(80, 430, 1120, 130, PANEL2))
    out.append(t(110, 472, "MCP tools (speccord mcp):", size=21, fill=EMERALD, weight="bold"))
    out.append(t(110, 510, "read  → get_base_spec · get_constitution · story_next", size=20, fill=TEXT, font=MONO))
    out.append(t(110, 540, "verify→ analyze · lint · gate · conform     transition→ advance", size=20, fill=TEXT, font=MONO))
    out.append(t(80, 600, "The agent reads the spec, writes code, runs the gates, fixes, then advances. Loop.",
                 size=22, fill=TEXT, weight="bold"))
    out += footer(n, total)
    return out


def slide_start(n, total):
    out = header("Get started", "TWO MINUTES", VIOLET)
    out.append(rect(80, 220, 1120, 330, PANEL2))
    lines = [
        ("# existing service", MUTED),
        ("speccord init --service orders", EMERALD),
        ("speccord discover   &&   speccord base draft", TEXT),
        ("", TEXT),
        ("# new service", MUTED),
        ("speccord init --service giftcards --greenfield", EMERALD),
        ("speccord base new --intent \"...\"", TEXT),
        ("", TEXT),
        ("# product workflow", MUTED),
        ("speccord init --pack product   &&   speccord capabilities", EMERALD),
    ]
    y = 275
    for s, c in lines:
        if s:
            out.append(t(120, y, s, size=23, fill=c, font=MONO))
        y += 30
    out.append(t(80, 605, "Read USAGE.md for full tutorials  ·  every pass/fail decision is deterministic.",
                 size=22, fill=MUTED))
    out += footer(n, total)
    return out


# ---- text wrapping ----------------------------------------------------------

def wrap(x, y, text, width_px, size=21, fill=TEXT, lh=30, center=False, cx=0):
    # crude char-based wrap (~0.55*size px per char)
    cpl = max(8, int(width_px / (size * 0.55)))
    words, line, lines = text.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 <= cpl:
            line = (line + " " + w).strip()
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    out = []
    for i, ln in enumerate(lines):
        if center:
            out.append(t(cx, y + i * lh, ln, size=size, fill=fill, anchor="middle"))
        else:
            out.append(t(x, y + i * lh, ln, size=size, fill=fill))
    return out


SLIDES = [
    ("01-title", slide_title),
    ("02-problem", slide_problem),
    ("03-hybrid", slide_hybrid),
    ("04-overview", slide_overview),
    ("05-scale", slide_scale),
    ("06-phases", slide_phases),
    ("07-enforce", slide_enforce),
    ("08-agents", slide_agents),
    ("09-start", slide_start),
]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    total = len(SLIDES)
    for i, (name, fn) in enumerate(SLIDES, 1):
        body = "\n  ".join(fn(i, total))
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
               f'width="{W}" height="{H}" role="img">\n  {body}\n</svg>\n')
        with open(os.path.join(here, f"{name}.svg"), "w") as f:
            f.write(svg)
    print(f"wrote {total} slides to {here}")


if __name__ == "__main__":
    main()
