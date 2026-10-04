# Roundtable — Create Room, Waiting Room & Live Room UI/UX Redesign + Live Caption Fix

Repository:
https://github.com/Rare21ism/SemicolonSena_maharashtra_round

## Objective

Redesign and properly integrate the three core meeting states/pages:

1. **Create Room**
2. **Waiting Room**
3. **Live Room**

The current problem is NOT simply the color/theme.

The existing pages leave a large amount of unused white space and the component composition does not make good use of the available viewport.

The **Live Room is the highest priority** because its captioning UI currently feels broken and visually disconnected.

Keep the existing Roundtable color theme and visual identity.

Do NOT replace the established color palette with a completely different theme.

The goal is to improve:

- information hierarchy
- layout composition
- useful use of whitespace
- caption readability
- speaker separation
- meeting-state clarity
- controls
- responsive behavior
- visual polish
- accessibility

Do NOT rewrite working backend/audio/ML functionality just for UI changes.

---

# 1. DESIGN INSPIRATION

You may browse and study modern meeting-room, waiting-room, accessibility, live-caption and editorial product interfaces before implementing.

Useful references/patterns include:

- Google Meet-style waiting room and participant states
- Microsoft Teams speaker-aware captions
- transcript-first interfaces
- accessibility-focused live caption interfaces
- modern editorial/product layouts
- premium asymmetric layouts
- clean meeting-room interfaces

Useful research references:

Google Meet waiting-room behavior:
https://support.google.com/meet/answer/16523457

Microsoft Teams closed captions / intelligent speakers:
https://www.microsoft.com/en-in/microsoft-teams/accessibility-closed-captions-transcriptions

Accessible live-caption presentation:
https://github.com/kellylford/LiveCaptionsWithAccessibility

Realtime captioning product inspiration:
https://waavoo.com/

Meeting-room/product composition inspiration:
https://wbroom.com/en/

These are inspiration only.

DO NOT copy their branding, exact layouts, colors, or components.

The final interface must remain distinctly Roundtable.

The important design principles are:

- strong visual hierarchy
- purposeful use of space
- readable captions
- clear speaker identity
- compact controls
- intentional composition
- restrained visual language
- accessibility
- real-time state visibility

---

# 2. IMPORTANT — USE THE EXISTING COLOR THEME

Do NOT redesign the entire color system.

Preserve the current Roundtable theme.

You may refine:

- contrast
- shades
- borders
- backgrounds
- active states
- muted states

But the application should still clearly look like the same Roundtable product.

The redesign is primarily about:

LAYOUT
+
COMPONENTS
+
HIERARCHY
+
SPACING
+
CAPTION PRESENTATION
+
INTERACTION

Not about replacing the theme.

---

# 3. FIRST INSPECT THE CURRENT CODE

Before changing anything:

Inspect the actual current `main` branch.

Identify:

- Create Room page/component
- Waiting page/component
- Live Room page/component
- meeting state management
- participant state
- microphone state
- caption state
- speaker state
- loading indicators
- connection state
- mute behavior
- existing responsive styles
- existing reusable components

Understand the actual state transitions:

Create Room
→ Waiting
→ Live Room

Do not assume the routes or component names.

Reuse real application state.

Do not hardcode fake participants or captions into the actual meeting.

---

# 4. MAJOR RULE — DO NOT JUST RESTYLE

Do NOT simply:

- change colors
- increase font sizes
- change border radius
- add shadows
- change background
- adjust one or two margins

The component composition itself should improve.

You may:

- remove unnecessary components
- create new components
- reorganize layouts
- combine related elements
- move controls
- introduce useful visual modules
- change the caption structure
- change the page grid

The result should look like a deliberate product redesign.

---

# 5. CREATE ROOM PAGE

## Current problem

The Create Room page has too much unused white space.

Do not simply center the existing form in the middle of the screen.

Use the available space intelligently.

## Desired structure

Create a strong two-part composition.

### LEFT / PRIMARY AREA

Large editorial heading such as:

CREATE A ROOM

or a better Roundtable-specific phrase.

Supporting copy should explain the purpose in one or two short sentences.

Example concept:

"Bring everyone into the same conversation."

Do not use technical terminology.

### RIGHT / ACTION AREA

A clearly structured creation panel containing only the information actually required to create the room.

For example:

Room name

Your name

Create room

Keep the actual form compact.

Do not make the form unnecessarily tall.

### SUPPORTING VISUAL

Use the remaining space for a meaningful Roundtable visual.

Possible concept:

A small conversation-orbit visualization showing several people converging around a shared conversation.

Or a subtle representation of:

PEOPLE
→
ROOM
→
CONVERSATION

Do NOT use a generic stock illustration.

Do NOT use an AI robot.

Do NOT fill space with random decorative blobs.

The visual must belong to Roundtable.

## Bottom / secondary information

Use a subtle lower section for useful information such as:

- how joining works
- meeting link sharing
- microphone requirement

Only if it is actually useful.

Do not add unnecessary feature cards.

---

# 6. CREATE ROOM — RESPONSIVE

Desktop:

Use the full viewport.

Example composition:

------------------------------------------------
| navigation                                     |
|                                                |
| CREATE A ROOM          [ creation panel ]      |
|                                                |
| large heading           room name              |
| short explanation       your name              |
| conversation visual     CREATE ROOM            |
|                                                |
------------------------------------------------

Do NOT make this a strict centered card.

Mobile:

Stack intelligently.

Heading first.

Form second.

Visual/supporting information after it.

Do not create excessive vertical gaps.

---

# 7. WAITING PAGE / WAITING ROOM

The waiting state should feel intentional rather than like an empty loading screen.

The user should immediately understand:

- the room exists
- they are connected
- who is here
- what they are waiting for
- what they can do next

## Main composition

Use a strong split or asymmetric layout.

### PRIMARY AREA

Large message:

YOU'RE IN.

or:

WAITING FOR THE CONVERSATION TO BEGIN

Choose wording that fits the actual state.

Show:

Room name

Meeting code / shareable identifier if available

A subtle connection state.

### PARTICIPANT AREA

Create a compact participant presence section.

Example:

IN THE ROOM

● Jemish
● Priya
○ Rahul

Do NOT make huge profile cards.

Use small, elegant presence indicators.

If the host/creator is known, make that clear without excessive badges.

### ROOM VISUAL

Use a meaningful visual representation of the waiting state.

For example:

A conversation orbit with participants waiting around an inactive center.

When another participant joins:

the visual changes subtly.

This gives the waiting page a purpose.

---

# 8. WAITING PAGE — DO NOT MAKE IT A SPINNER

Do NOT make the entire waiting page:

large spinner
+
"Waiting..."

That is too generic.

The waiting page should have useful information.

Possible layout:

ROOM 7H2K

WAITING FOR EVERYONE

2 PEOPLE HERE

[ participant presence ]

Share this room:

[ room link / copy ]

[ Leave room ]

Keep controls minimal.

---

# 9. WAITING PAGE — REAL-TIME STATES

The page should respond to actual state.

When a participant joins:

Update participant presence.

When enough participants are ready:

Show the appropriate next state.

When the room becomes live:

Transition naturally into the Live Room.

Do not use fake animation to imply that something happened if the backend state did not change.

---

# 10. LIVE ROOM — HIGHEST PRIORITY

The Live Room needs a serious redesign.

The current caption UI is visually broken.

Specifically:

### CURRENT PROBLEM 1

The speaker's name and their caption have WAY too much white space between them.

Fix this.

Speaker identity and their caption should feel like ONE unit.

Example:

PRIYA

We should probably test this
before we deploy it.

The name should be visually close to the caption.

Do not create a huge vertical gap.

---

# 11. LIVE ROOM — SPEAKER/CAPTION CONTAINER

Each speaker's caption should have a clear visual container/grouping.

This is REQUIRED.

The user specifically needs to distinguish one speaker's caption from another speaker's caption.

Do NOT simply place:

speaker name

caption

speaker name

caption

on a completely blank page.

Create a subtle container system.

Possible approaches:

### OPTION A — Editorial caption blocks

-----------------------------------------
PRIYA

We should probably test this
before we deploy it.
-----------------------------------------

-----------------------------------------
RAHUL

Yeah, let's try it with a smaller group.
-----------------------------------------

### OPTION B — Speaker rail

PRIYA   |  We should probably test this
        |  before we deploy it.

RAHUL   |  Yeah, let's try it with
        |  a smaller group.

### OPTION C — Timeline blocks

A subtle left speaker marker
+
speaker name
+
caption
+
timestamp

Choose whichever looks best.

Do NOT blindly implement these examples.

Create a polished Roundtable-specific solution.

---

# 12. CAPTION CONTAINERS MUST NOT LOOK LIKE CHAT BUBBLES

Important.

We need separation.

But do NOT turn every caption into a WhatsApp/Discord message bubble.

The visual should feel like:

LIVE TRANSCRIPT

not:

CHAT.

Use:

- subtle background shifts
- thin borders
- speaker markers
- spacing
- vertical rails
- accent lines
- typography

to distinguish speakers.

Keep the containers relatively open and editorial.

---

# 13. CURRENT SPEAKER SHOULD BE SPECIAL

The person who is currently speaking should have a stronger visual state.

For example:

- accent line
- active speaker marker
- subtle background
- stronger name
- subtle voice activity indicator

Do NOT use:

- neon glow
- huge pulsing ring
- rainbow effect
- generic AI orb

The active state should be elegant.

---

# 14. LIVE CAPTION HIERARCHY

The caption text itself should be the most important content.

Hierarchy:

1. Caption text
2. Speaker name
3. Timestamp / metadata

NOT:

1. giant speaker card
2. huge avatar
3. tiny caption

The words are the product.

Make them easy to read from a glance.

---

# 15. FIX THE EXCESSIVE WHITE SPACE

Do a complete audit of the Live Room.

Look for:

- excessive top padding
- excessive bottom padding
- huge gaps between speaker and caption
- huge gaps between caption blocks
- empty side columns
- oversized empty cards
- unnecessary wrapper containers

Use the available viewport intelligently.

Desktop should feel balanced.

Do NOT simply make everything smaller.

Instead create a clear visual composition.

Possible structure:

---------------------------------------------------------
TOP BAR
Room name       participants        connection
---------------------------------------------------------

                    LIVE

        PRIYA
        We should probably test this
        before we deploy it.

        ---------------------------------

        RAHUL
        Yeah, let's try it with
        a smaller group.

---------------------------------------------------------
participant presence / controls
---------------------------------------------------------

The actual implementation can differ.

The key is:

NO GIANT EMPTY GAPS.

---

# 16. LIVE ROOM — 3-DOT LOADER BUG

There is currently a serious UI issue:

The three-dot loading indicator appears:

- twice
- sometimes three times
- in multiple locations on the Live Room

This MUST be fixed.

Do NOT simply hide it with CSS.

Find the actual cause.

Investigate:

- duplicate loader components
- duplicate loading state
- multiple renders
- nested loading indicators
- caption loading state
- microphone loading state
- connection loading state
- parent + child loading UI
- duplicated conditional rendering
- repeated state subscriptions

There should be a clear rule for when the three-dot indicator appears.

---

# 17. THREE-DOT LOADER — SINGLE SOURCE OF TRUTH

There should NOT be multiple independent three-dot loading indicators representing the same state.

Determine what the loader actually means.

Possible meanings:

- waiting for caption
- connecting
- processing
- listening

Choose the correct user-facing meaning based on the existing functionality.

Then make the UI show ONE appropriate indicator.

If the application does not need a loader:

remove it.

Do not display a loader just because some state is temporarily undefined.

---

# 18. MUTE BUTTON — CRITICAL BUG

Current issue:

When the user presses the MUTE button:

the three-dot loader still appears.

This is WRONG.

Mute/unmute is a direct control.

It should NOT trigger a generic loading state unless the underlying implementation genuinely requires asynchronous processing.

Investigate the state flow:

Mute button
→ microphone state
→ audio capture state
→ UI state
→ loading state

Find why mute causes the three-dot loader.

Fix the root cause.

Expected behavior:

### UNMUTED

Microphone active.

### CLICK MUTE

Microphone becomes muted.

Button immediately reflects:

Muted

No unrelated loader.

### CLICK UNMUTE

Microphone becomes active again.

No unrelated loader.

Do not make the entire caption area enter a loading state when mute changes.

---

# 19. SEPARATE UI STATES

Do not use one generic `loading` state for unrelated operations.

If the code currently does something like:

loading = true

for:

- microphone
- connection
- caption
- participant
- room state

separate these states where necessary.

Possible conceptual states:

isConnecting
isMicStarting
isCaptionProcessing
isJoining

But do not create unnecessary state variables if existing state can be modeled cleanly.

The important requirement:

A microphone mute action must not accidentally activate the caption loader.

---

# 20. LIVE ROOM HEADER

Keep the header compact.

Possible:

ROUNDTABLE

Room Name

● Connected

5 people

Do not expose:

- WebSocket
- ASR
- VAD
- model
- pipeline
- latency
- device ID
- protocol version

Those are developer concerns.

---

# 21. PARTICIPANTS IN LIVE ROOM

Create a compact participant presence component.

Example:

● Jemish
● Priya
○ Rahul
○ Aarav

Active speaker should be visually distinguishable.

Do not use giant participant cards.

Do not waste half the screen on avatars.

The captions remain the priority.

---

# 22. LIVE ROOM CONTROLS

Keep controls compact and intentional.

Likely:

Microphone

Participants

Leave

Potentially:

Caption settings

ONLY if actually implemented and useful.

Do not create a huge toolbar.

Do not put five unrelated buttons at the bottom.

---

# 23. CAPTION SCROLLING

The caption area should behave like a real live transcript.

Requirements:

- newest caption visible
- previous captions remain readable
- automatic scroll when appropriate
- user can inspect recent history
- no jumping layout
- no duplicated lines
- revisions update existing captions
- speaker grouping remains intact

Do not make every caption independently animated.

Use subtle transitions.

---

# 24. DRAFT / FINAL CAPTIONS

Do not expose technical terminology like:

DRAFT
FINAL
ASR
VAD

Instead visually distinguish:

current speech

from:

confirmed speech.

For example:

Current speech:
slightly lighter

Confirmed:
normal/high contrast

Older:
slightly quieter

Do not make this distinction so subtle that users cannot read the current caption.

---

# 25. LIVE ROOM EMPTY STATE

Before anyone speaks:

Do not show multiple loaders.

Do not show a giant empty page.

Use a purposeful state:

LISTENING FOR THE CONVERSATION

Speak naturally and the conversation will appear here.

Then show a subtle Roundtable visual.

When speech begins:

transition into the caption stream.

---

# 26. LIVE ROOM RESPONSIVE DESIGN

Desktop:

Use the wide viewport.

Possible layout:

caption area:
~65–75%

participant/control area:
~25–35%

But do not rigidly follow those numbers.

Mobile:

Caption area should dominate.

Participants can become a compact horizontal strip or expandable section.

Controls should remain reachable.

No horizontal scrolling.

No tiny caption text.

No excessive vertical gaps.

---

# 27. ACCESSIBILITY

This product is fundamentally about accessible conversation.

Therefore:

- caption contrast must be excellent
- text must be readable
- speaker distinction must not rely only on color
- touch targets must be large enough
- keyboard focus must be visible
- screen readers should understand speaker + caption relationships
- reduced motion should be respected

Do not sacrifice caption readability for visual effects.

---

# 28. NO TECHNICAL JARGON

User-facing UI should not contain:

WebSocket
ASR
VAD
pipeline
PCM
inference
model
audio frames
backend
device index
speaker attribution

Use:

Listening
Speaking
Connected
Your microphone
People
Captions
Reconnecting

etc.

---

# 29. NO FAKE CONTENT

Do not introduce:

- fake participants
- fake captions
- fake meetings
- fake loading states
- fake activity

Use real application state.

For empty states, show a proper empty-state design.

---

# 30. PRESERVE FUNCTIONALITY

Do NOT break:

- room creation
- joining
- waiting state
- microphone capture
- mute/unmute
- voice enrollment
- WebSocket connection
- real ML pipeline
- real ASR
- speaker identification
- caption updates
- reconnect
- leaving the room

This is primarily a frontend/UI/UX fix.

Only change underlying logic when necessary to fix an actual bug such as the duplicate loader or incorrect mute/loading state.

---

# 31. COMPONENT RESTRUCTURE

Create or redesign components where useful.

Potential components:

CreateRoomLayout
RoomCreationPanel
ConversationPreview
WaitingRoomLayout
RoomPresence
RoomShare
WaitingVisual
LiveRoomLayout
LiveRoomHeader
CaptionStream
CaptionBlock
SpeakerCaption
ActiveSpeaker
ParticipantPresence
VoiceActivityIndicator
MeetingControls
ConnectionStatus
CaptionEmptyState

These are suggestions.

Use the project's existing architecture and naming conventions where appropriate.

Do not create unnecessary abstractions.

---

# 32. IMPORTANT — THE LIVE ROOM CAPTION COMPONENT

This component deserves special attention.

It should have a clean conceptual structure:

CaptionStream
    ├── CaptionBlock
    │      ├── SpeakerIdentity
    │      ├── CaptionText
    │      └── Timestamp
    │
    ├── CaptionBlock
    │      ├── SpeakerIdentity
    │      ├── CaptionText
    │      └── Timestamp
    │
    └── CaptionBlock
           ├── SpeakerIdentity
           ├── CaptionText
           └── Timestamp

Do not necessarily use these exact component names.

But the visual relationship should be:

SPEAKER
+
THEIR WORDS

as one cohesive unit.

There should be clear separation between different speakers.

There should NOT be a giant blank gap between speaker name and caption.

---

# 33. LOADER ARCHITECTURE AUDIT

Search the entire Live Room implementation for:

- Loader
- Loading
- loading
- isLoading
- pending
- processing
- waiting
- dots
- animated dots

Determine every place where the three-dot loader is rendered.

Create a small map:

Component → Why loader exists → What state triggers it

Then remove duplicate/redundant loaders.

The final Live Room should have at most one intentional caption/processing indicator in the relevant location.

If the indicator is not necessary, remove it.

---

# 34. MUTE STATE AUDIT

Search for all code related to:

- mute
- unmute
- microphone
- audio enabled
- audio disabled
- loading
- pending

Trace the exact state change when clicking mute.

Verify that:

mute → mic disabled

and NOT:

mute → generic loading state

If a shared state is causing the bug:

refactor the state relationship.

Do not patch it with:

display: none

or:

opacity: 0

The state logic must be correct.

---

# 35. BROWSER TESTING

Actually run the application.

Open:

Create Room
Waiting Room
Live Room

Test:

### CREATE ROOM

- desktop
- mobile
- create room
- validation
- button state

### WAITING

- participant appears
- participant leaves
- room information
- transition to live

### LIVE

- microphone starts
- mute
- unmute
- captions
- speaker changes
- multiple speakers
- caption scrolling
- connection state
- leave

Do not stop after checking the source code.

Visually inspect the browser.

---

# 36. SPECIFIC LIVE ROOM TEST SCENARIO

Perform this exact sequence:

1. Enter a room.
2. Wait for Live Room.
3. Verify there is NOT more than one three-dot loader.
4. Verify there is no unnecessary loader before speech.
5. Speak.
6. Verify caption appears.
7. Verify speaker name is close to caption.
8. Verify caption is inside a clear speaker grouping/container.
9. Have another speaker speak.
10. Verify their caption is visually separated.
11. Return to first speaker.
12. Verify the grouping remains clear.
13. Press Mute.
14. Verify microphone becomes muted.
15. Verify NO three-dot loader appears because of mute.
16. Press Unmute.
17. Verify microphone becomes active.
18. Verify NO unrelated loader appears.
19. Continue speaking.
20. Verify captions continue normally.
21. Leave room.
22. Verify cleanup.

This sequence is mandatory.

---

# 37. VISUAL QUALITY TEST

After implementation, take a hard look at the pages.

Ask:

### Create Room

Does it feel like a complete product screen?

Or is it just a form floating in a huge empty page?

### Waiting Room

Does it communicate the room state?

Or is it just a spinner?

### Live Room

Does it feel like a professional live-caption product?

Or does it look like text dumped into a page?

### Caption

Can I immediately tell:

WHO is speaking?

WHAT they said?

WHERE one speaker's text ends?

WHEN another speaker starts?

If not:

REDESIGN THE CAPTION COMPONENT.

---

# 38. DO NOT OVERDESIGN

Do NOT add:

- giant gradients
- neon effects
- AI sparkles
- excessive animations
- decorative blobs
- generic AI illustrations
- excessive cards
- unnecessary statistics

Keep the existing Roundtable visual identity.

The improvement should come from:

- composition
- typography
- spacing
- hierarchy
- useful components
- caption clarity
- interaction quality

---

# 39. FINAL ACCEPTANCE CHECKLIST

## Create Room

[ ] Uses available viewport intelligently

[ ] No excessive empty white space

[ ] Clear hierarchy

[ ] Form is easy to use

[ ] Meaningful supporting visual/content

[ ] Responsive

[ ] Existing theme preserved

## Waiting Room

[ ] Clear waiting state

[ ] Participant presence visible

[ ] Room information visible

[ ] Useful sharing/join information where appropriate

[ ] No giant empty area

[ ] No generic full-page spinner

[ ] Responsive

## Live Room

[ ] Caption is the visual priority

[ ] Speaker name is close to caption

[ ] Speaker + caption form one cohesive unit

[ ] Different speakers are visually separated

[ ] Caption containers are clear

[ ] Caption containers do not look like chat bubbles

[ ] Active speaker is clearly indicated

[ ] Caption text is highly readable

[ ] No excessive whitespace between caption elements

[ ] No duplicate three-dot loaders

[ ] No unnecessary three-dot loader

[ ] Mute does NOT trigger the loader

[ ] Unmute does NOT trigger the loader

[ ] Microphone state is accurate

[ ] Captions continue after mute/unmute

[ ] Scrolling works

[ ] Multiple speakers work

[ ] Responsive

[ ] Accessible

[ ] No technical jargon

---

# 40. FINAL REPORT

After implementation, provide:

## Pages Redesigned

- Create Room
- Waiting Room
- Live Room

## Components Changed

List the important components.

## Components Added

List new product-specific components.

## Caption Fix

Explain:

- what caused the excessive speaker/caption spacing
- how speaker grouping was redesigned
- how different speakers are visually separated

## Loader Fix

Explain:

- why the three-dot loader appeared multiple times
- which duplicate/redundant render paths were removed
- why mute was incorrectly triggering it
- how the state logic was corrected

## Responsive Improvements

Summarize desktop/mobile changes.

## Tests Performed

List the actual browser tests.

## Remaining Issues

Be honest.

Do not claim something was tested if it was not.

---

# FINAL INSTRUCTION

DO NOT JUST MAKE THESE THREE PAGES "PRETTIER."

REDESIGN THEIR COMPOSITION.

Use the available screen space intelligently.

Most importantly:

FIX THE LIVE ROOM.

The Live Room must make it immediately obvious:

WHO IS SPEAKING
+
WHAT THEY ARE SAYING
+
WHICH CAPTION BELONGS TO WHICH SPEAKER

There must be a clear visual grouping between each speaker's identity and their words.

There must NOT be huge whitespace between speaker name and caption.

There must NOT be duplicate three-dot loaders.

Pressing MUTE must NOT cause the unrelated caption/processing loader to appear.

The mute state must work independently from caption loading/processing state.

Keep the existing Roundtable color theme.

Preserve real application functionality.

Use real state.

Do not introduce fake users or fake captions.

Make these three pages feel like one cohesive, polished Roundtable product.