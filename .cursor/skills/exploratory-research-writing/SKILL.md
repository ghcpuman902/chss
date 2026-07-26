---
name: exploratory-research-writing
description: Structure and edit technical research articles so readers build intuition, test assumptions, follow evidence, and arrive at the conclusion through guided discovery. Use for engineering write-ups, benchmark reports, technical explainers, product research, experimental findings, and interactive educational articles.
---

# Exploratory Research Writing

## Purpose

Write technical research as a guided investigation rather than a formal report or a catalogue of facts.

The reader should feel that they:

1. understand the original problem;
2. see why the obvious solution is insufficient;
3. discover the important distinction;
4. predict what the evidence might show;
5. understand the result before being asked to trust it;
6. leave with both an answer and a better mental model.

The writing should remain technically credible, but it should not sound like a journal paper, corporate report, documentation dump, or imitation of a science presenter.

The target style is:

- intuitive before formal;
- concrete before abstract;
- curious without being childish;
- conversational without being imprecise;
- confident without overstating evidence;
- playful where it clarifies;
- concise where the mechanism is already visible;
- rigorous at the exact point where precision matters.

---

# 1. Core narrative structure

Use the following sequence as the default architecture.

## 1. Start with the apparent answer

Begin with a simple situation, visual, object, or assumption the reader can immediately understand.

Good openings often take this form:

> This looks simple.  
> Surely the obvious solution is enough.  
> How difficult could this be?

The opening should establish:

- what someone is trying to do;
- why it appears straightforward;
- the practical constraint that makes it interesting.

Do not begin with:

- a methodology summary;
- a definition;
- historical background;
- a list of findings;
- an abstract;
- “In this article, we will…”

### Example

Weak:

> This article evaluates multiple encoding strategies for chess positions.

Better:

> You make a move and send the board to a friend. The link has to carry the position with it. How much information can one chess board really need?

---

## 2. Reveal the hidden complication

Once the reader accepts the simple framing, expose the first thing the obvious model misses.

This should create productive tension:

> The picture looks complete. Except it is hiding something.

The complication should not feel artificially dramatic. It should be a real conceptual omission, implementation constraint, contradiction, or edge case.

Use one strong example before generalising.

### Preferred sequence

1. show the intuitive model;
2. demonstrate one failure;
3. name the missing concept;
4. only then define the broader category.

Do not front-load every exception before the reader understands why exceptions matter.

---

## 3. Try the naïve solution honestly

Present the obvious approach as reasonable, not foolish.

The reader should be allowed to think:

> Yes, that is exactly what I would try.

Explain:

- why it is attractive;
- what it solves;
- where it begins to fail;
- what new question the failure creates.

Do not mock standard approaches merely to create drama.

Avoid language such as:

- “Obviously this does not work.”
- “A naïve developer might…”
- “This simplistic method…”

Prefer:

- “This gets us surprisingly far.”
- “It solves one problem and creates another.”
- “That sounds efficient, until…”
- “The idea is reasonable. The fixed overhead is not.”

---

## 4. Introduce the structural pivot

The strongest technical articles usually contain one distinction that reorganises the entire problem.

Examples:

- state versus history;
- latency versus throughput;
- average case versus worst case;
- representation versus transport;
- local optimisation versus system cost;
- description of the destination versus description of the journey.

Treat this as the intellectual centre of the article.

The pivot should:

- explain earlier failures;
- organise later methods;
- help the reader predict results;
- remain useful beyond the specific benchmark.

State it in plain language before introducing specialised terminology.

### Pattern

> We have been treating these as the same problem. They are actually two different problems.

Then explain each side with a concrete metaphor or example.

---

## 5. Build candidate solutions in causal order

Do not list every method at once.

Each method should arise naturally from a limitation in the previous one.

A strong sequence often looks like:

1. literal representation;
2. remove unnecessary information;
3. exploit obvious structure;
4. exploit domain knowledge;
5. exploit frequency;
6. combine methods adaptively.

Each section should answer:

- What problem from the previous section are we fixing?
- What information are we storing instead?
- What cost are we introducing?
- Under what conditions should this method win?

The reader should understand the trade-off before seeing the benchmark.

---

## 6. Invite a prediction before showing evidence

Before a chart, result table, or benchmark reveal, ask the reader to form an expectation.

Useful prompts:

- Which method should win early?
- What happens as the input grows?
- Where should the crossover occur?
- Which method has fixed overhead?
- What happens when the common case stops being common?

This transforms data from passive evidence into resolution of a question.

Do not present a large table and then explain what the reader was meant to notice.

Preferred order:

1. state the competing intuitions;
2. invite a prediction;
3. show the smallest useful chart or table;
4. describe the visible pattern;
5. explain why it happened;
6. only then show the full detailed results.

---

## 7. Separate the immediate result from the deeper result

Every strong conclusion should contain two layers.

### Immediate result

What won, by how much, under what conditions?

This must be scoped accurately:

- “the shortest method tested”;
- “on this held-out sample”;
- “at the sampled checkpoints”;
- “among the standalone codecs”;
- “in this benchmark”.

### Deeper result

What new model should the reader retain?

Examples:

> The result is not one universally superior representation. The winning system chooses the cheapest truthful description for each case.

The deeper result should survive even if the exact benchmark numbers change.

---

## 8. End by opening the next question

Future work should follow naturally from the limitation that remains.

Do not end with a generic list of ideas.

Group future directions by the unresolved mechanism:

- smarter representation;
- smarter probability model;
- smarter transport alphabet;
- broader datasets;
- operational constraints;
- variants or edge cases.

The final sentence should either:

- restate the durable insight; or
- leave the reader with a precise next question.

Do not end with administrative material unless reproduction instructions are the explicit purpose of the page.

---

# 2. Sequence of information

## Concrete before abstract

Introduce the thing before the term.

Weak:

> Entropy coding can reduce expected code length.

Better:

> Some moves happen far more often than others. If common moves receive shorter codes, the average shrinks. That is the basic idea behind entropy coding.

When introducing specialised language:

1. explain it plainly;
2. give the technical name;
3. continue using the technical name once established.

---

## Mechanism before metric

Before showing that something is faster, smaller, or more accurate, explain why it might be.

The reader should be able to predict the direction of the result.

Weak:

> Occupancy encoding averages 54 characters.

Better:

> Occupancy pays once for a map of filled squares, then stores pieces only where something exists. Its size depends on how many pieces remain, not how long the game has lasted. That should make it weak in the opening and increasingly competitive after captures.

Then show the number.

---

## Intuition before implementation detail

Explain the idea before listing:

- bit widths;
- configuration values;
- training split names;
- model parameters;
- library names;
- file formats;
- internal prefixes.

Implementation detail should confirm the concept, not replace it.

Weak opening:

> We trained K = 1024 dictionaries at depths 2, 4, 6, 8, 10, and 12.

Better:

> Human openings repeat. Instead of spelling out a familiar prefix, the payload can point to one the decoder already knows. The benchmark tests this using separate 1,024-entry dictionaries at several opening depths.

---

## Claim before caveat, but caveat before overclaim

Do not begin every paragraph defensively.

State the useful result clearly, then bound it nearby.

Good:

> The hybrid averages about 39 URL characters in this benchmark. That is not proof of the shortest possible chess encoding; it is the best result among the practical methods tested here.

Avoid:

> Although there are many limitations and this cannot prove optimality, the hybrid may under certain assumptions…

---

## Main narrative before reference detail

Keep the central article readable without requiring every technical detail.

Use layered presentation:

1. narrative explanation;
2. focused comparison;
3. detailed scoreboard;
4. expandable implementation cards;
5. reproduction appendix.

Do not force the reader to consume all layers to understand the conclusion.

---

# 3. Heading rules

## Use questions only for genuine uncertainty

A question heading should represent something the reader might naturally ask or predict.

Good:

- Isn’t this just 64 squares?
- Should we store the board or the moves?
- Surely gzip can make it smaller?
- Where does history stop winning?
- Can Unicode cheat the scoreboard?

Avoid question headings that merely restate the previous sentence:

- What is the hidden state?
- What are the results?
- What is the methodology?
- So what does this mean?

Use statement headings once the article has discovered the answer:

- The board has invisible state
- Fewer bits can still make a longer link
- The hybrid keeps the cheapest explanation
- One position, several truthful descriptions
- Reproduce the benchmark

## Heading rhythm

Avoid making every heading a question. A healthy sequence alternates:

- question;
- discovery;
- question;
- mechanism;
- question;
- result;
- synthesis.

Headings should tell the story when read alone.

---

# 4. Paragraph and sentence construction

## One paragraph, one job

Each paragraph should primarily do one of the following:

- establish a scene;
- explain a mechanism;
- introduce a limitation;
- interpret evidence;
- qualify a claim;
- transition to the next idea.

If a paragraph explains byte padding, URL alphabets, Unicode normalisation, and product routing at once, split it.

---

## Keep causal links explicit

Use words that show why the next sentence follows:

- because;
- so;
- which means;
- but;
- therefore;
- once;
- while;
- instead;
- that is why.

Technical prose often becomes difficult not because the ideas are advanced, but because relationships are left implicit.

---

## Vary sentence length deliberately

Use short sentences for:

- reveals;
- contrasts;
- conclusions;
- tension.

Example:

> The picture looks complete. It is not.

Use longer sentences for:

- mechanisms;
- qualification;
- comparison.

Avoid several short fragments in succession unless used intentionally.

---

## Prefer active constructions

Weak:

> A reduction in URL length is achieved by the hybrid method.

Better:

> The hybrid shortens the URL by choosing the cheapest representation for each position.

Use passive voice only when the actor is irrelevant.

---

## Use fragments sparingly

Fragments can create pace:

> Pasteable. Self-contained. No database required.

But too many fragments make technical prose feel like marketing copy.

Use them mainly in:

- openings;
- transitions;
- short conclusions.

Return to complete sentences for explanation.

---

# 5. Wording choices

## Prefer mechanisms over abstractions

Weak:

- introduces overhead;
- improves efficiency;
- increases complexity;
- offers optimisation;
- demonstrates performance;
- enables compression.

Better:

- adds a 10-byte header;
- removes repeated fields;
- grows by four characters per move;
- requires the decoder to ship a frozen codebook;
- replaces a familiar prefix with a short index;
- chooses occupancy once replaying the path becomes longer.

Name what physically happens.

---

## Prefer specific verbs

Use:

- stores;
- replays;
- ranks;
- pads;
- emits;
- expands;
- drops;
- reconstructs;
- selects;
- escapes;
- serialises;
- freezes;
- diverges;
- carries.

Avoid relying on:

- handles;
- supports;
- leverages;
- utilises;
- facilitates;
- optimises;
- processes.

---

## Avoid corporate language

Do not use:

- robust;
- scalable;
- seamless;
- best-in-class;
- highly performant;
- innovative;
- comprehensive;
- future-proof;
- solution;
- unlock;
- leverage.

Replace with observable facts.

---

## Avoid academic filler

Remove phrases such as:

- It is important to note that…
- It should be noted that…
- In order to…
- In terms of…
- With regard to…
- As previously mentioned…
- The results demonstrate that…
- This suggests that it may be possible…

Prefer direct statements.

---

## Avoid inflated drama

Do not manufacture surprise.

Avoid:

- shocking;
- unbelievable;
- revolutionary;
- completely unexpected;
- changes everything;
- impossible;
- destroys the competition.

Use tension grounded in the mechanism:

> gzip compresses most large text well. Here, its header is larger than the opening moves.

The fact should create the surprise.

---

## Avoid premature superlatives

Use:

- shortest method tested;
- best result in this benchmark;
- smallest observed mean;
- strongest standalone codec;
- lowest at the sampled checkpoints.

Avoid:

- optimal;
- theoretically minimal;
- shortest possible;
- universally best;
- definitive winner;

unless formally proven.

---

## Use metaphors that preserve the mechanism

Good metaphors compress understanding:

- destination versus journey;
- gzip arrives carrying its own suitcase;
- the board forgets how long the journey was;
- moving information from the URL into the decoder;
- choosing the cheapest truthful explanation.

Bad metaphors are decorative or inaccurate.

A metaphor should help the reader predict behaviour. Remove it if the technical explanation must immediately correct it.

---

## Preserve technical distinctions

Do not casually merge terms that differ materially.

Examples:

- bits versus bytes versus characters;
- glyphs versus code points;
- position versus FEN versus game history;
- sample mean versus per-game mean;
- fixed-size versus bounded versus history-independent;
- exact path versus playable snapshot;
- URL display versus serialised URL;
- average length versus worst-case length.

When two terms are close enough to confuse, explicitly contrast them once.

---

# 6. Tone

## Speak with the reader, not at them

Use inclusive language when discovering:

- “Let us try the obvious version.”
- “Now the empty squares become noticeable.”
- “Before seeing the numbers, make a prediction.”
- “The crossover is now visible.”

Do not overuse “we”. Alternate with direct description.

---

## Assume intelligence, not prior domain knowledge

Do not oversimplify the idea. Simplify the route into it.

A technically sophisticated reader should not feel patronised, while a new reader should not be blocked by unexplained terminology.

Explain specialised terms only when first introduced.

---

## Be lightly playful at transition points

Good:

> Surely gzip can make it smaller?

> If characters are the score, Unicode looks like a cheat code.

> The hybrid wins because it refuses one permanent answer.

Avoid jokes inside dense definitions or correctness-critical passages.

---

## Let confidence follow evidence

Use confident language after a mechanism or result has been established.

Before evidence:

> This should favour paths early and snapshots later.

After evidence:

> At ply 32, the crossover is clear.

Do not present expectations as findings.

---

# 7. Tables, charts, and interactive elements

## Every visual needs a narrative purpose

Before a visual, tell the reader what question it answers.

After it, state the pattern worth noticing.

Do not merely say:

> The results are shown below.

Use:

> At ply 2, should we replay two moves or carry an entire board? By ply 64, should that answer reverse?

Then show the chart.

---

## Use focused visuals in the main story

The primary chart should contain only the methods needed to show the central relationship.

Move:

- baselines;
- controls;
- distribution overlays;
- all-method comparisons;

into secondary scoreboards or expandable detail.

A reader should understand the main result in a few seconds.

---

## Label aggregates honestly

Use labels such as:

- Mean across sampled checkpoint positions
- Mean of per-game means
- Median URL length
- Observed maximum in this sample
- Held-out validation split

Avoid labels that imply broader population meaning than the sampling design supports.

---

## Distinguish format properties from benchmark averages

A fixed 265-bit grid is a format property.

A 235-bit packed-path mean is a corpus statistic.

Make this explicit in tables:

- Fixed logical bits
- Mean logical bits
- Mean payload characters
- Mean full URL characters

---

## Interactive elements should perform a discovery

An interaction should reveal something the prose alone cannot show as effectively.

Good uses:

- changing a hidden state field while the board looks identical;
- scrubbing a game and watching path length grow;
- selecting a Unicode symbol and seeing bytes expand;
- comparing codec lengths for the same position.

Do not add interaction merely to decorate the article.

---

# 8. Limitations and scope

## Place each limitation beside the relevant claim

Examples:

- codebook dependency beside dictionary coding;
- repetition history beside snapshot state;
- byte padding beside Base64URL;
- sampled plies beside the crossover table;
- finite codec family beside the winning result.

Avoid one large defensive limitations section unless required.

---

## Distinguish deliberate scope from oversight

When something is intentionally excluded, state it once and move on.

Example:

> The fixed route and codec prefixes provide a consistent product scoreboard and decoder dispatch. Changing them is outside this experiment.

Do not repeatedly defend the same decision.

---

## Avoid hypothetical data sources that do not exist

Do not recommend:

- product telemetry;
- database analysis;
- user-event weighting;
- server logs;

unless the system actually collects them and the research scope permits their use.

When no database exists, preserve the self-contained design as a product constraint rather than treating it as missing instrumentation.

---

# 9. Editing workflow

When revising an existing article, work in this order.

## Pass 1: correctness

Check:

- claims match the implementation;
- examples decode correctly;
- tables use current data;
- labels distinguish means from constants;
- terminology is technically accurate;
- observed maxima are not described as formal bounds;
- production and research formats are clearly separated.

Do not polish prose around an incorrect result.

## Pass 2: structure

Check:

- the opening establishes the concrete problem;
- each section creates the next;
- the conceptual pivot appears early enough;
- evidence arrives after intuition;
- conclusions are not repeated;
- reference material does not interrupt the main narrative.

## Pass 3: language

Remove:

- repetition;
- filler;
- implementation-first explanations;
- unnecessary caveats;
- concatenated UI labels;
- awkward internal terminology;
- exaggerated claims.

Strengthen:

- causal transitions;
- concrete verbs;
- question quality;
- paragraph focus;
- conceptual ending.

## Pass 4: visual reading

Review the rendered page, not only source text.

Check:

- heading rhythm;
- text density;
- table scanability;
- card length;
- spacing between labels and values;
- whether interactive controls explain themselves;
- whether code and prose wrap cleanly;
- whether long URLs dominate the page;
- whether repeated tables feel redundant.

---

# 10. Final quality checklist

Before completing an article, confirm:

- [ ] The first paragraph presents a concrete problem, not an abstract.
- [ ] The reader encounters one intuitive assumption before its limitation.
- [ ] The central conceptual distinction is stated plainly.
- [ ] Each method appears because the previous method exposed a problem.
- [ ] Technical terminology follows a plain-language explanation.
- [ ] Major evidence is preceded by a prediction or question.
- [ ] The main visual shows only the relationship needed for the argument.
- [ ] Full technical detail remains available without blocking the narrative.
- [ ] Claims are bounded by the actual dataset and methods.
- [ ] Question headings represent genuine reader questions.
- [ ] Statement headings are used for established findings.
- [ ] No conclusion is repeated in multiple sections.
- [ ] Mechanisms are described with concrete verbs.
- [ ] Corporate and academic filler has been removed.
- [ ] Metaphors clarify rather than decorate.
- [ ] Examples, captions, links, and generated visuals agree.
- [ ] Production behaviour and experimental behaviour are distinguished.
- [ ] The final section gives a durable mental model, not only a number.
- [ ] Future work follows from unresolved mechanisms.
- [ ] The article remains approachable without sacrificing technical accuracy.

# Guiding principle

The reader should never be asked to accept a result before they can see why it might be true.

Build the intuition, expose the trade-off, invite the prediction, show the evidence, then name the lesson.