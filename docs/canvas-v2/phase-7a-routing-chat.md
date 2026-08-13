# Canvas V2 Phase 7A — interaction routing and chat

Phase 7A gives Canvas V2 one polished conversational entry point without
changing the 6E revision engine. Every submitted message is classified by a
model into one of five semantic routes:

- `conversation`: answer in chat without reading or changing the artboard;
- `inspect`: answer from the committed source and rendered artboard without a
  mutation;
- `transform`: begin the observed design loop without account research;
- `research-design`: visibly retrieve evidence and then design;
- `selection-transform`: transform the exact selected stable node.

Production routing contains no keyword table or benchmark identity. Mentioning
an app, canvas, or screenshot is not itself permission to mutate. The router
must interpret what the user is asking North Star to do.

Conversation and inspection decisions terminate inside chat and cannot create
a candidate revision. The three mutating routes delegate a self-contained
instruction to the existing `source -> render -> observe -> commit` loop. A
selection route includes the exact selected node identity and measured bounds.

The chat transcript persists independently of the committed artboard and keeps
prior user messages, routed response types, visible research steps, design
revisions, completion summaries, stops, and truthful failures. Reloaded active
turns become stopped rather than falsely continuing.

The visual treatment follows the North Star product language: a quiet live
artboard header, compact user messages, direct assistant prose, restrained
route labels, and an inline activity timeline instead of nested status cards.
The composer supports Enter to send and Shift+Enter for a new line. Attachment
UI is visibly unavailable until a real attachment pipeline exists rather than
pretending to accept files.
